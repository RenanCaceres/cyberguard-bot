#!/usr/bin/env node
'use strict';

/**
 * Antigravity Stop Hook — Guardião Automático de LGPD + Git Commit/Push + Deploy PM2
 *
 * Executado automaticamente ao final de cada comando/turno do agente:
 *  1. Roda scripts/lgpd-guard.js para auditar 100% da conformidade LGPD.
 *     - Se houver qualquer violação LGPD ou erro de sintaxe, bloqueia a parada
 *       ("decision": "continue") exigindo a correção imediata.
 *  2. Verifica se há alterações não commitadas, commits não enviados ao GitHub,
 *     ou se o servidor de produção está desatualizado em relação ao HEAD local.
 *     - Na 1ª tentativa, solicita que o agente execute `bash scripts/auto-deploy.sh "<mensagem>"`
 *       com mensagem de commit semântica e relate o deploy ao usuário.
 *     - Na 2ª tentativa consecutiva (fallback determinístico), executa automaticamente
 *       `bash scripts/auto-deploy.sh` para garantir que nada fique sem commit/restart no PM2.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function lerStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function responder(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exit(0);
}

function obterEstadoGit() {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    let origin = '';
    try {
      origin = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {}
    return { status, head, origin };
  } catch {
    return { status: '', head: '', origin: '' };
  }
}

function servidorPrecisaSync(localHead) {
  if (!localHead) return false;
  const user = process.env.DEPLOY_SSH_USER || 'renan';
  const hosts = (process.env.DEPLOY_SSH_HOSTS || '192.168.1.8 10.8.0.1').split(/\s+/).filter(Boolean);
  const remoteDir = process.env.DEPLOY_REMOTE_DIR || '~/cyberguard-bot';

  for (const h of hosts) {
    const res = spawnSync(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=2', `${user}@${h}`, `cd ${remoteDir} && git rev-parse HEAD`],
      { encoding: 'utf8', timeout: 3500 }
    );
    if (res.status === 0 && res.stdout) {
      const remoteHead = res.stdout.trim();
      return remoteHead !== localHead;
    }
  }
  // Servidor inacessível no momento (fora da LAN/VPN) -> não bloqueia o turno
  return false;
}

function main() {
  const payload = lerStdinJson();
  const reason = payload.terminationReason || 'NO_TOOL_CALL';

  // Só atua no encerramento normal de turno; nunca bloqueia cancelamento do usuário ou erro de limite
  if (reason !== 'NO_TOOL_CALL') {
    return responder({ decision: 'stop' });
  }

  const convId = String(payload.conversationId || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
  const stateFile = `/tmp/cyberguard-stop-hook-${convId}.json`;
  let prevState = { key: '', count: 0 };
  try {
    if (fs.existsSync(stateFile)) {
      prevState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch {}

  // 1. Auditoria obrigatória de conformidade LGPD
  const lgpd = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'lgpd-guard.js'), '--quiet'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15000,
  });

  if (lgpd.status !== 0) {
    const erroDetalhe = ((lgpd.stderr || '') + '\n' + (lgpd.stdout || '')).trim();
    const stateKey = `lgpd-fail:${erroDetalhe.slice(0, 160)}`;
    const count = prevState.key === stateKey ? prevState.count + 1 : 1;
    fs.writeFileSync(stateFile, JSON.stringify({ key: stateKey, count }), 'utf8');

    if (count <= 3) {
      return responder({
        decision: 'continue',
        reason:
          `[HOOK LGPD-GUARD] A auditoria de conformidade LGPD falhou! ` +
          `Corrija obrigatoriamente as violações abaixo antes de finalizar e depois execute \`bash scripts/auto-deploy.sh "<mensagem>"\`:\n\n${erroDetalhe}`,
      });
    }
    return responder({ decision: 'stop' });
  }

  // 2. Verifica se há mudanças não commitadas, não enviadas ou não atualizadas no PM2 do servidor
  const { status, head, origin } = obterEstadoGit();
  const temMudancaLocal = status.length > 0;
  const faltaPush = Boolean(head && origin && head !== origin);
  const faltaDeployServidor = !temMudancaLocal && !faltaPush ? servidorPrecisaSync(head) : false;

  if (!temMudancaLocal && !faltaPush && !faltaDeployServidor) {
    try {
      if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
    } catch {}
    return responder({ decision: 'stop' });
  }

  const stateKey = `deploy-pending:${head}:${status.slice(0, 120)}:${faltaPush}:${faltaDeployServidor}`;
  const count = prevState.key === stateKey ? prevState.count + 1 : 1;
  fs.writeFileSync(stateFile, JSON.stringify({ key: stateKey, count }), 'utf8');

  if (count === 1) {
    return responder({
      decision: 'continue',
      reason:
        `[HOOK AUTO-DEPLOY] A auditoria LGPD passou (100% conforme), porém há alterações pendentes de commit/push ou sincronização com o PM2 no servidor. ` +
        `Execute agora \`bash scripts/auto-deploy.sh "<mensagem de commit semântica>"\` para commitar, atualizar o Git no servidor e reiniciar o PM2 do cyberguard-bot antes de concluir sua resposta.`,
    });
  }

  // Fallback automático na 2ª passagem: executa o auto-deploy diretamente e libera o encerramento
  spawnSync('bash', [path.join(ROOT, 'scripts', 'auto-deploy.sh')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 25000,
  });

  try {
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  } catch {}
  return responder({ decision: 'stop' });
}

main();
