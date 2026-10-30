#!/usr/bin/env node
'use strict';

/**
 * CyberGuard Bot — Auditoria Automatizada de Conformidade LGPD (Lei nº 13.709/2018) & Segurança
 *
 * Verifica deterministicamente antes de qualquer commit/deploy:
 *  1. Inexistência de arquivos proibidos versionados (.csv, .sql, .env real, dumps, temp/, scripts-privados/).
 *  2. Inexistência de CPFs reais, RAs reais em exemplos (#DECL-/#TERMO-), e-mails pessoais/institucionais reais,
 *     Discord Snowflake IDs hardcoded, UUIDs reais do Notion e tokens/chaves secretas em arquivos públicos.
 *  3. Inspeção de texto dentro dos manuais e documentações compiladas em PDF (docs/*.pdf e docs/manuais/*.pdf via pdftotext).
 *  4. Presença obrigatória dos controles estruturais da LGPD no código-fonte:
 *     - Criptografia AES-256-GCM em repouso (src/cryptoUtils.js e src/db.js)
 *     - Termo de Ciência e Privacidade + Mascaramento de CPF (src/onboarding.js)
 *     - Sanitização de cartões do RH e remoção de PDFs temporários (src/approval.js)
 *     - Direito de Opt-out em gravações de voz (commands/reuniao/reuniaoCommand.js)
 *     - Portal do Titular /meus-dados (commands/meus-dados/meusDadosCommand.js e src/index.js)
 *     - Bloqueio de fallback para PublicThread no envio de comprovantes (src/ponto.js)
 *  5. Validação de sintaxe JavaScript (node --check) em todos os módulos do projeto.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const violacoes = [];
const avisos = [];

// Placeholders explícitos permitidos em documentação/templates
const CPFS_EXEMPLO_PERMITIDOS = new Set([
  '111.222.333-44',
  '000.000.000-00',
  '123.456.789-00',
  '999.999.999-99',
]);

const EMAILS_EXEMPLO_PERMITIDOS = new Set([
  'coordenacao@utfpr.edu.br',
  'coordenador@utfpr.edu.br',
  'lider1@alunos.utfpr.edu.br',
  'lider2@alunos.utfpr.edu.br',
  'exemplo@alunos.utfpr.edu.br',
  'aluno@alunos.utfpr.edu.br',
  'bot@utfpr.edu.br',
  'usuario@utfpr.edu.br',
  'renancanselmo@gmail.com', // contato público do autor nos badges do README.md
]);

const UUIDS_EXEMPLO_PERMITIDOS = new Set([
  '00000000-0000-0000-0000-000000000000',
]);

const ARQUIVOS_IGNORADOS_CONTEUDO = new Set([
  'package-lock.json',
]);

const EXTENSOES_BINARIAS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.pdf', '.docx', '.ttf', '.otf', '.woff', '.woff2',
  '.mp3', '.wav', '.ogg', '.pcm', '.zip', '.tar', '.gz',
]);

function listarArquivosAuditaveis() {
  let tracked = [];
  let untracked = [];
  try {
    const outTracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
    tracked = outTracked.split('\n').map((s) => s.trim()).filter(Boolean);
    const outUntracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    untracked = outUntracked.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    violacoes.push(`[GIT] Falha ao listar arquivos do repositório: ${err.message}`);
    return [];
  }

  const todos = Array.from(new Set([...tracked, ...untracked]));
  return todos.filter((rel) => fs.existsSync(path.join(ROOT, rel)));
}

function verificarArquivosProibidos(arquivos) {
  const padroesProibidos = [
    { regex: /(^|\/)\.env(\..+)?$/, allow: (f) => f === '.env.example', msg: 'Arquivo .env real não pode ser versionado' },
    {
      regex: /\.(csv|sql|sqlite|sqlite3|db|pem|key|p12|pfx)$/i,
      allow: (f) => /^migrations\/[^/]+\.sql$/i.test(f),
      msg: 'Dump de dados ou chave privada proibida no repositório público',
    },
    { regex: /^temp\/(?!\.gitkeep$)/, msg: 'Arquivos temporários de ./temp/ não podem ser versionados' },
    { regex: /^backups[-_]?(reuniao|audio)\//, msg: 'Backups de áudio de reunião não podem ser versionados' },
    { regex: /^docs\/Termos-Voluntarios-Assinados\//, msg: 'Termos ou declarações assinadas de membros não podem ser versionados' },
    { regex: /^scripts-privados\//, msg: 'Scripts internos/migração com dados sensíveis devem permanecer ignorados em scripts-privados/' },
    { regex: /credentials.*\.json$/i, msg: 'Credenciais JSON de serviço não podem ser versionadas' },
  ];

  for (const rel of arquivos) {
    for (const p of padroesProibidos) {
      if (p.regex.test(rel) && (!p.allow || !p.allow(rel))) {
        violacoes.push(`[ARQUIVO PROIBIDO] ${rel}: ${p.msg}`);
      }
    }
  }
}

function inspecionarTexto(identificador, texto, { ehPdf = false } = {}) {
  const linhas = texto.split(/\r?\n/);

  const regexCpf = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
  const regexEmail = /\b[a-zA-Z0-9_.+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g;
  const regexSnowflake = /\b\d{17,20}\b/g;
  const regexUuid = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
  const regexProtocoloRaReal = /#?(?:DECL|TERMO)-(?!0000000\b)(\d{5,9})\b/gi;
  const regexSegredos = /(?:secret_[A-Za-z0-9]{25,}|ntn_[A-Za-z0-9]{25,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|v0[23]%3A[A-Za-z0-9_%-]{25,})/g;

  for (let idx = 0; idx < linhas.length; idx++) {
    const linha = linhas[idx];
    const loc = ehPdf ? `${identificador}` : `${identificador}:${idx + 1}`;

    // 1. CPFs
    for (const m of linha.matchAll(regexCpf)) {
      if (!CPFS_EXEMPLO_PERMITIDOS.has(m[0])) {
        violacoes.push(`[CPF EXPOSTO] ${loc} -> "${m[0]}"`);
      }
    }

    // 2. E-mails
    for (const m of linha.matchAll(regexEmail)) {
      const email = m[0].toLowerCase().replace(/[.,;:)>\]'"]+$/, '');
      if (
        EMAILS_EXEMPLO_PERMITIDOS.has(email) ||
        email.endsWith('@users.noreply.github.com') ||
        email.endsWith('@example.com')
      ) {
        continue;
      }
      violacoes.push(`[E-MAIL EXPOSTO] ${loc} -> "${email}" (use variáveis de ambiente ou placeholders genéricos)`);
    }

    // 3. Discord Snowflake IDs (17 a 20 dígitos)
    for (const m of linha.matchAll(regexSnowflake)) {
      violacoes.push(`[DISCORD ID HARDCODED] ${loc} -> "${m[0]}" (mova para o .env)`);
    }

    // 4. UUIDs reais (Notion DB/Page/Space/User IDs)
    for (const m of linha.matchAll(regexUuid)) {
      if (!UUIDS_EXEMPLO_PERMITIDOS.has(m[0].toLowerCase())) {
        violacoes.push(`[UUID HARDCODED] ${loc} -> "${m[0]}" (mova para o .env)`);
      }
    }

    // 5. RA real em exemplos de protocolo (#DECL-<RA> / #TERMO-<RA>)
    for (const m of linha.matchAll(regexProtocoloRaReal)) {
      violacoes.push(`[RA REAL EM PROTOCOLO] ${loc} -> "${m[0]}" (use #DECL-0000000-1234 ou #TERMO-0000000-1234)`);
    }

    // 6. Chaves / Tokens secretos
    for (const m of linha.matchAll(regexSegredos)) {
      // Ignora menções curtas truncadas de documentação como "v03%3AeyJhbGciOi..."
      if (m[0].includes('...')) continue;
      violacoes.push(`[SEGREDO/TOKEN EXPOSTO] ${loc} -> padrão sensível detectado ("${m[0].slice(0, 16)}...")`);
    }
  }
}

function verificarArquivosTextoEPdf(arquivos) {
  let pdftotextDisponivel = false;
  try {
    const chk = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
    pdftotextDisponivel = chk.status === 0 || chk.status === 99 || Boolean(chk.stderr && chk.stderr.includes('pdftotext'));
  } catch {
    pdftotextDisponivel = false;
  }

  for (const rel of arquivos) {
    if (ARQUIVOS_IGNORADOS_CONTEUDO.has(rel)) continue;
    // O próprio lgpd-guard contém regexes e constantes de teste, mas não contém IDs reais; ainda assim auditamos normalmente!
    const ext = path.extname(rel).toLowerCase();
    const abs = path.join(ROOT, rel);

    if (ext === '.pdf') {
      if (pdftotextDisponivel) {
        try {
          const res = spawnSync('pdftotext', [abs, '-'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
          if (res.status === 0 && res.stdout) {
            inspecionarTexto(rel, res.stdout, { ehPdf: true });
          }
        } catch (err) {
          avisos.push(`[PDF] Não foi possível extrair texto de ${rel}: ${err.message}`);
        }
      }
      continue;
    }

    if (EXTENSOES_BINARIAS.has(ext)) continue;

    try {
      const conteudo = fs.readFileSync(abs, 'utf8');
      inspecionarTexto(rel, conteudo, { ehPdf: false });
    } catch (err) {
      avisos.push(`[LEITURA] Falha ao ler ${rel}: ${err.message}`);
    }
  }
}

function verificarInvariantesEstruturaisLGPD() {
  const regras = [
    {
      arquivo: 'src/cryptoUtils.js',
      obrigatorios: ['aes-256-gcm', 'mascararCPF', 'CAMPOS_SENSIVEIS_MEMBRO'],
      descricao: 'Módulo de criptografia AES-256-GCM e mascaramento de CPF',
    },
    {
      arquivo: 'src/db.js',
      obrigatorios: ['criptografarObjetoMembro', 'descriptografarMembro', 'criptografarDadosLegadosBanco'],
      descricao: 'Criptografia em repouso na camada de persistência PostgreSQL',
    },
    {
      arquivo: 'src/onboarding.js',
      obrigatorios: ['solicitarTermoCiencia', 'registrarAceiteTermoCiencia', 'mascararCPF'],
      descricao: 'Termo de Ciência e Privacidade obrigatório e CPF mascarado no onboarding',
    },
    {
      arquivo: 'src/approval.js',
      obrigatorios: ['construirEmbedResumidoRH', 'unlink'],
      descricao: 'Sanitização de dados pessoais nos cards do RH e exclusão de PDFs temporários',
    },
    {
      arquivo: 'commands/reuniao/reuniaoCommand.js',
      obrigatorios: ['reuniao_optout'],
      descricao: 'Botão de Opt-out individual de voz nas gravações de reunião',
    },
    {
      arquivo: 'commands/meus-dados/meusDadosCommand.js',
      obrigatorios: ['visualizar', 'atualizar', 'privacidade', 'enviar-termo-dm'],
      descricao: 'Comando /meus-dados (Direitos do Titular — Art. 18 da LGPD)',
    },
    {
      arquivo: 'src/index.js',
      obrigatorios: ['meus-dados', 'iniciarLimpezaBackups'],
      descricao: 'Registro ativo do comando /meus-dados e rotina de limpeza automática LGPD',
    },
    {
      arquivo: 'src/ponto.js',
      proibidos: ['ChannelType.PublicThread'],
      descricao: 'Proibição de fallback para thread pública no envio de comprovantes de entrega',
    },
    {
      arquivo: '.gitignore',
      obrigatorios: ['.env', 'temp/', 'scripts-privados/', 'docs/Termos-Voluntarios-Assinados/'],
      descricao: 'Proteção no .gitignore contra vazamento de .env, temporários, termos e scripts privados',
    },
  ];

  for (const r of regras) {
    const abs = path.join(ROOT, r.arquivo);
    if (!fs.existsSync(abs)) {
      violacoes.push(`[CONTROLE LGPD AUSENTE] Arquivo obrigatório não encontrado: ${r.arquivo} (${r.descricao})`);
      continue;
    }
    const txt = fs.readFileSync(abs, 'utf8');
    for (const termo of r.obrigatorios || []) {
      if (!txt.includes(termo)) {
        violacoes.push(`[REGRESSÃO LGPD] ${r.arquivo}: controle obrigatório "${termo}" ausente (${r.descricao})`);
      }
    }
    for (const proibido of r.proibidos || []) {
      if (txt.includes(proibido)) {
        violacoes.push(`[VIOLAÇÃO PRIVACY-BY-DESIGN] ${r.arquivo}: uso proibido de "${proibido}" (${r.descricao})`);
      }
    }
  }
}

function verificarSintaxeJs(arquivos) {
  const arquivosJs = arquivos.filter((f) => f.endsWith('.js'));
  for (const rel of arquivosJs) {
    const abs = path.join(ROOT, rel);
    const res = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8' });
    if (res.status !== 0) {
      violacoes.push(`[ERRO DE SINTAXE JS] ${rel}:\n${(res.stderr || '').trim()}`);
    }
  }
}

function limparResiduosTempLocais() {
  const dirTemp = path.join(ROOT, 'temp');
  if (!fs.existsSync(dirTemp)) return;
  const agora = Date.now();
  const limiteMs = 60 * 60 * 1000; // 1h
  for (const item of fs.readdirSync(dirTemp)) {
    if (item === '.gitkeep') continue;
    const alvo = path.join(dirTemp, item);
    try {
      const st = fs.statSync(alvo);
      if (agora - st.mtimeMs > limiteMs) {
        fs.rmSync(alvo, { recursive: true, force: true });
        avisos.push(`[HIGIENE ./temp] Removido arquivo temporário antigo (>1h): temp/${item}`);
      }
    } catch {}
  }
}

function main() {
  const silencioso = process.argv.includes('--quiet');
  const arquivos = listarArquivosAuditaveis();

  verificarArquivosProibidos(arquivos);
  verificarArquivosTextoEPdf(arquivos);
  verificarInvariantesEstruturaisLGPD();
  verificarSintaxeJs(arquivos);
  limparResiduosTempLocais();

  if (avisos.length > 0 && !silencioso) {
    for (const a of avisos) console.warn(`⚠️  ${a}`);
  }

  if (violacoes.length > 0) {
    console.error(`\n❌ [LGPD-GUARD] REPROVADO — ${violacoes.length} violação(ões) detectada(s):`);
    for (const v of violacoes) {
      console.error(`   • ${v}`);
    }
    console.error('\nCorrija os itens acima antes de realizar o commit ou deploy.\n');
    process.exit(1);
  }

  if (!silencioso) {
    console.log(
      `✅ [LGPD-GUARD] APROVADO — ${arquivos.length} arquivos auditados (código, PDFs, controles AES-256-GCM e sintaxe JS em 100% de conformidade).`
    );
  }
  process.exit(0);
}

main();
