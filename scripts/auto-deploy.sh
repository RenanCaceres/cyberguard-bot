#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# CyberGuard Bot — Pipeline Automático: Auditoria LGPD + Git Commit/Push + Deploy PM2
# ==============================================================================
# Uso:
#   bash scripts/auto-deploy.sh "feat(modulo): descricao"
#   bash scripts/auto-deploy.sh --post-commit
#   bash scripts/auto-deploy.sh --if-quiet-seconds 90
#   bash scripts/auto-deploy.sh --force-restart
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE_POST_COMMIT=0
FORCE_RESTART=0
QUIET_SECONDS=0
CUSTOM_MSG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --post-commit)
      MODE_POST_COMMIT=1
      shift
      ;;
    --force-restart)
      FORCE_RESTART=1
      shift
      ;;
    --if-quiet-seconds)
      QUIET_SECONDS="${2:-90}"
      shift 2
      ;;
    *)
      CUSTOM_MSG="$1"
      shift
      ;;
  esac
done

LOCK_FILE="/tmp/cyberguard-auto-deploy.lock"
exec 9>"$LOCK_FILE"
if [[ "$QUIET_SECONDS" -gt 0 ]]; then
  # Modo daemon em background: se já houver deploy/commit rodando, sai silenciosamente
  flock -n 9 || exit 0
else
  flock -w 60 9 || {
    echo "⚠️ [AUTO-DEPLOY] Outro processo de deploy já está em execução."
    exit 1
  }
fi

# Se invocado pelo daemon de background (--if-quiet-seconds), aguarda janela de inatividade
if [[ "$QUIET_SECONDS" -gt 0 ]]; then
  if [[ -f ".git/index.lock" ]]; then
    exit 0
  fi

  NOW_EPOCH="$(date +%s)"
  LATEST_MTIME="$(node -e '
    const fs = require("fs");
    const path = require("path");
    const { execFileSync } = require("child_process");
    let files = [];
    try {
      const a = execFileSync("git", ["status", "--porcelain", "-uall"], { encoding: "utf8" });
      files = a.split("\n").filter(Boolean).map(l => l.slice(3).trim().replace(/^.* -> /, ""));
    } catch {}
    let max = 0;
    for (const f of files) {
      try {
        const st = fs.statSync(f);
        const m = Math.floor(st.mtimeMs / 1000);
        if (m > max) max = m;
      } catch {}
    }
    console.log(max);
  ')"

  if [[ "$LATEST_MTIME" -gt 0 ]] && (( NOW_EPOCH - LATEST_MTIME < QUIET_SECONDS )); then
    # Edição recente ainda em andamento; aguarda próximo ciclo
    exit 0
  fi
fi

# Carrega configurações opcionais de SSH do .env sem expor segredos
SSH_USER="${DEPLOY_SSH_USER:-renan}"
SSH_HOSTS="${DEPLOY_SSH_HOSTS:-192.168.1.8 10.8.0.1}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-~/cyberguard-bot}"
PM2_APP="${DEPLOY_PM2_APP:-cyberguard-bot}"

resolver_host_ssh() {
  for h in $SSH_HOSTS; do
    if ssh -o BatchMode=yes -o ConnectTimeout=3 "${SSH_USER}@${h}" "true" 2>/dev/null; then
      echo "$h"
      return 0
    fi
  done
  return 1
}

STATUS_PORCELAIN="$(git status --porcelain)"
LOCAL_HEAD_BEFORE="$(git rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git rev-parse origin/main 2>/dev/null || echo "")"

# No modo daemon silencioso, se não há mudanças locais e origin/main == HEAD, checa rapidamente o servidor
if [[ "$QUIET_SECONDS" -gt 0 && -z "$STATUS_PORCELAIN" && "$LOCAL_HEAD_BEFORE" == "$ORIGIN_MAIN_SHA" && "$FORCE_RESTART" -eq 0 ]]; then
  ACTIVE_HOST="$(resolver_host_ssh || true)"
  if [[ -z "$ACTIVE_HOST" ]]; then
    exit 0
  fi
  REMOTE_SHA="$(ssh -o BatchMode=yes -o ConnectTimeout=3 "${SSH_USER}@${ACTIVE_HOST}" "cd ${REMOTE_DIR} && git rev-parse HEAD" 2>/dev/null || echo "")"
  if [[ "$REMOTE_SHA" == "$LOCAL_HEAD_BEFORE" ]]; then
    exit 0
  fi
fi

echo "🛡️  [1/4] Executando auditoria de conformidade LGPD (scripts/lgpd-guard.js)..."
node scripts/lgpd-guard.js

# Etapa 2: Git Commit (se houver alterações não commitadas)
COMMIT_CRIADO=0
if [[ "$MODE_POST_COMMIT" -eq 0 && -n "$(git status --porcelain)" ]]; then
  if [[ -z "$CUSTOM_MSG" ]]; then
    CHANGED_SUMMARY="$(git status --porcelain | awk '{print $2}' | head -n 4 | paste -sd ', ' -)"
    TOTAL_CHANGED="$(git status --porcelain | wc -l | tr -d ' ')"
    if [[ "$TOTAL_CHANGED" -gt 4 ]]; then
      CUSTOM_MSG="chore(auto): atualizacao auditada LGPD (${CHANGED_SUMMARY} e +$((TOTAL_CHANGED - 4)))"
    else
      CUSTOM_MSG="chore(auto): atualizacao auditada LGPD (${CHANGED_SUMMARY})"
    fi
  fi

  echo "📦 [2/4] Criando commit Git: ${CUSTOM_MSG}"
  git add -A
  SKIP_POST_COMMIT_DEPLOY=1 git commit -m "$CUSTOM_MSG"
  COMMIT_CRIADO=1
else
  echo "📦 [2/4] Nenhuma alteração pendente de commit local."
fi

LOCAL_HEAD="$(git rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git rev-parse origin/main 2>/dev/null || echo "")"

# Etapa 3: Git Push para origin/main
if [[ "$LOCAL_HEAD" != "$ORIGIN_MAIN_SHA" ]]; then
  echo "🚀 [3/4] Enviando commits para origin/main..."
  git push origin main
else
  echo "🚀 [3/4] Repositório remoto (origin/main) já está sincronizado em ${LOCAL_HEAD:0:7}."
fi

# Etapa 4: Atualização no servidor de produção + Restart PM2
echo "🖥️  [4/4] Conectando ao servidor de produção para atualizar Git e reiniciar PM2 (${PM2_APP})..."
ACTIVE_HOST="$(resolver_host_ssh || true)"
if [[ -z "$ACTIVE_HOST" ]]; then
  echo "⚠️  [AUTO-DEPLOY] Servidor SSH inacessível no momento (${SSH_HOSTS}). Commit e push concluídos; o servidor será atualizado assim que a rede/VPN estiver ativa."
  exit 0
fi

REMOTE_SHA_BEFORE="$(ssh -o BatchMode=yes -o ConnectTimeout=5 "${SSH_USER}@${ACTIVE_HOST}" "cd ${REMOTE_DIR} && git rev-parse HEAD" 2>/dev/null || echo "")"

# Sincroniza de forma segura apenas NOVAS chaves do .env local que ainda não existam no .env do servidor
# (Jamais sobrescreve chaves já existentes no servidor, preservando DATABASE_URL local do host)
ENV_SYNC_ADDED=0
if [[ -f ".env" ]]; then
  REMOTE_KEYS="$(ssh -o BatchMode=yes -o ConnectTimeout=5 "${SSH_USER}@${ACTIVE_HOST}" "cd ${REMOTE_DIR} && node -e 'const fs=require(\"fs\"),d=require(\"dotenv\");console.log(Object.keys(d.parse(fs.readFileSync(\".env\",\"utf8\"))).join(\"\\n\"))'" 2>/dev/null || echo "")"
  NEW_ENV_LINES="$(REMOTE_KEYS_ENV="$REMOTE_KEYS" node -e '
    const fs = require("fs");
    const dotenv = require("dotenv");
    const local = dotenv.parse(fs.readFileSync(".env", "utf8"));
    const remoteSet = new Set((process.env.REMOTE_KEYS_ENV || "").split("\n").map(s => s.trim()).filter(Boolean));
    const skip = new Set(["DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"]);
    const lines = [];
    for (const [k, v] of Object.entries(local)) {
      if (!skip.has(k) && !remoteSet.has(k) && String(v).trim() !== "") {
        const safeVal = /\s|#|"/.test(v) ? JSON.stringify(v) : v;
        lines.push(`${k}=${safeVal}`);
      }
    }
    if (lines.length) process.stdout.write(lines.join("\n") + "\n");
  ')"

  if [[ -n "$NEW_ENV_LINES" ]]; then
    ADDED_NAMES="$(echo "$NEW_ENV_LINES" | cut -d= -f1 | paste -sd ', ' -)"
    echo "🔑 Sincronizando novas variáveis no .env do servidor: ${ADDED_NAMES}"
    printf "\n# Sincronizado automaticamente pelo auto-deploy\n%s" "$NEW_ENV_LINES" | \
      ssh -o BatchMode=yes -o ConnectTimeout=5 "${SSH_USER}@${ACTIVE_HOST}" "cat >> ${REMOTE_DIR}/.env"
    ENV_SYNC_ADDED=1
  fi
fi

# Verifica se comandos slash ou dependências mudaram entre o commit do servidor e o novo HEAD
PRECISA_DEPLOY_COMMANDS=0
PRECISA_NPM_INSTALL=0
if [[ -n "$REMOTE_SHA_BEFORE" && "$REMOTE_SHA_BEFORE" != "$LOCAL_HEAD" ]]; then
  DIFF_FILES="$(git diff --name-only "$REMOTE_SHA_BEFORE" "$LOCAL_HEAD" 2>/dev/null || echo "")"
  if echo "$DIFF_FILES" | grep -qE '^(deploy-commands\.js|commands/)'; then
    PRECISA_DEPLOY_COMMANDS=1
  fi
  if echo "$DIFF_FILES" | grep -qE '^package(-lock)?\.json$'; then
    PRECISA_NPM_INSTALL=1
  fi
elif [[ "$COMMIT_CRIADO" -eq 1 ]]; then
  DIFF_FILES="$(git show --name-only --pretty="" HEAD 2>/dev/null || echo "")"
  if echo "$DIFF_FILES" | grep -qE '^(deploy-commands\.js|commands/)'; then
    PRECISA_DEPLOY_COMMANDS=1
  fi
fi

if [[ "$PRECISA_DEPLOY_COMMANDS" -eq 1 ]]; then
  echo "⚡ Alteração em Slash Commands detectada — registrando comandos na API do Discord..."
  node deploy-commands.js
fi

if [[ "$REMOTE_SHA_BEFORE" != "$LOCAL_HEAD" || "$ENV_SYNC_ADDED" -eq 1 || "$FORCE_RESTART" -eq 1 || "$COMMIT_CRIADO" -eq 1 ]]; then
  ssh -o BatchMode=yes -o ConnectTimeout=8 "${SSH_USER}@${ACTIVE_HOST}" "
    set -euo pipefail
    cd ${REMOTE_DIR}
    git fetch origin main
    git reset --hard origin/main
    if [[ '${PRECISA_NPM_INSTALL}' -eq 1 ]]; then
      npm install --omit=dev
    fi
    pm2 restart ${PM2_APP} --update-env
    sleep 2
    node -e '
      const { execSync } = require(\"child_process\");
      const list = JSON.parse(execSync(\"pm2 jlist\", { encoding: \"utf8\" }));
      const app = list.find(p => p.name === \"${PM2_APP}\");
      if (!app || app.pm2_env.status !== \"online\") {
        console.error(\"❌ PM2 status inválido:\", app ? app.pm2_env.status : \"não encontrado\");
        process.exit(1);
      }
      console.log(\"✅ Servidor atualizado em\", execSync(\"git rev-parse --short HEAD\", { encoding: \"utf8\" }).trim(), \"| PM2:\", app.name, app.pm2_env.status, \"(restarts:\", app.pm2_env.restart_time + \")\");
    '
  "
else
  echo "✅ Servidor (${ACTIVE_HOST}) já está no commit ${LOCAL_HEAD:0:7} com PM2 sincronizado."
fi
