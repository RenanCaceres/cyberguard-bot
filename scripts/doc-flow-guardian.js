#!/usr/bin/env node
'use strict';

/**
 * CyberGuard Bot — Guardião de Fluxos, Documentação & Novos Módulos
 *
 * Responsável por:
 *  1. Auditar se alterações de código em commands/ ou src/ impactaram fluxos sem
 *     a devida atualização da documentação (README.md, commands/documentacao/documentacaoCommand.js, docs/manuais/).
 *  2. Identificar novos módulos e comandos criados, verificando se possuem tutorial dedicado
 *     e inclusão no catálogo interativo do Discord (/documentacao).
 *  3. Gerar scaffolds e tutoriais completos para novos módulos (--tutorial <modulo>).
 *  4. Exibir o status de cobertura de documentação de todos os módulos (--status).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DOC_COMMAND_FILE = path.join(ROOT, 'commands', 'documentacao', 'documentacaoCommand.js');
const README_FILE = path.join(ROOT, 'README.md');
const MANUAIS_DIR = path.join(ROOT, 'docs', 'manuais');

function obterModulosRegistrados() {
  if (!fs.existsSync(DOC_COMMAND_FILE)) return {};
  try {
    const conteudo = fs.readFileSync(DOC_COMMAND_FILE, 'utf8');
    const match = conteudo.match(/const\s+MODULOS\s*=\s*(\{[\s\S]*?\n\};\n)/);
    if (!match) return {};

    // Extrai chaves e dados básicos do objeto MODULOS com segurança
    const bloco = match[1];
    const modulos = {};
    const regexModulo = /^\s*([a-zA-Z0-9_]+):\s*\{([\s\S]*?)\n\s*\},/gm;
    let m;
    while ((m = regexModulo.exec(bloco)) !== null) {
      const id = m[1];
      const corpo = m[2];
      const tituloMatch = corpo.match(/titulo:\s*['"`](.*?)['"`]/);
      const subtituloMatch = corpo.match(/subtitulo:\s*['"`](.*?)['"`]/);
      const pdfPrincipalMatch = corpo.match(/pdfPrincipal:\s*['"`](.*?)['"`]/);
      const comandosMatch = corpo.match(/comandos:\s*\[([\s\S]*?)\]/);

      let comandos = [];
      if (comandosMatch) {
        comandos = comandosMatch[1]
          .split(',')
          .map((c) => c.replace(/['"`]/g, '').trim())
          .filter(Boolean);
      }

      modulos[id] = {
        id,
        titulo: tituloMatch ? tituloMatch[1] : id,
        subtitulo: subtituloMatch ? subtituloMatch[1] : '',
        pdfPrincipal: pdfPrincipalMatch ? pdfPrincipalMatch[1] : '',
        comandos,
      };
    }
    return modulos;
  } catch (err) {
    return {};
  }
}

function listarDiretoriosComandos() {
  const dir = path.join(ROOT, 'commands');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function obterEstadoGit() {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (!status) return [];
    return status
      .split('\n')
      .map((line) => {
        const flag = line.slice(0, 2).trim();
        const file = line.slice(3).trim();
        return { flag, file };
      })
      .filter((item) => Boolean(item.file));
  } catch {
    return [];
  }
}

function verificarCoberturaModulos() {
  const modulos = obterModulosRegistrados();
  const cmds = listarDiretoriosComandos();
  const relatorio = {
    modulos,
    comandosTotal: cmds.length,
    comandosNaoMapeados: [],
    manuaisAusentes: [],
    pendenciasReadme: [],
  };

  const readmeConteudo = fs.existsSync(README_FILE) ? fs.readFileSync(README_FILE, 'utf8') : '';

  // Todos os comandos mapeados em qualquer módulo
  const todosComandosMapeados = new Set();
  Object.values(modulos).forEach((mod) => {
    mod.comandos.forEach((cmd) => {
      const normalizado = cmd.replace(/^\//, '').split(' ')[0].toLowerCase();
      todosComandosMapeados.add(normalizado);
    });
  });

  // Mapeamentos conhecidos para comandos de apoio ou atalhos
  todosComandosMapeados.add('documentacao');
  todosComandosMapeados.add('ajuda');
  todosComandosMapeados.add('help');
  todosComandosMapeados.add('relatorio-semanal');

  // Checa se algum diretório de commands/ não está associado a nenhum módulo
  cmds.forEach((cmdDir) => {
    const limpo = cmdDir.toLowerCase();
    if (!todosComandosMapeados.has(limpo)) {
      relatorio.comandosNaoMapeados.push(cmdDir);
    }
  });

  // Checa se os PDFs ou tutoriais dos módulos existem
  Object.values(modulos).forEach((mod) => {
    if (mod.pdfPrincipal) {
      const caminhoPdf = path.join(MANUAIS_DIR, mod.pdfPrincipal);
      const caminhoDocs = path.join(ROOT, 'docs', mod.pdfPrincipal);
      const caminhoTutorialMd = path.join(MANUAIS_DIR, `Tutorial_${mod.id}.md`);
      if (!fs.existsSync(caminhoPdf) && !fs.existsSync(caminhoDocs) && !fs.existsSync(caminhoTutorialMd)) {
        relatorio.manuaisAusentes.push({ modulo: mod.id, arquivo: mod.pdfPrincipal });
      }
    }

    // Checa menção no README
    if (mod.id !== 'completa' && !readmeConteudo.toLowerCase().includes(mod.id.toLowerCase())) {
      relatorio.pendenciasReadme.push(mod.id);
    }
  });

  return relatorio;
}

function auditarAlteracoesFluxo() {
  const diffs = obterEstadoGit();
  const arquivosCodigo = diffs.filter(
    (d) =>
      (d.file.startsWith('commands/') || d.file.startsWith('src/')) &&
      (d.file.endsWith('.js') || d.file.endsWith('.json'))
  );

  const docAlterada = diffs.some(
    (d) =>
      d.file === 'README.md' ||
      d.file === 'commands/documentacao/documentacaoCommand.js' ||
      d.file.startsWith('docs/manuais/') ||
      d.file.startsWith('scripts/gerar')
  );

  return {
    arquivosCodigo,
    docAlterada,
    temModificacoes: arquivosCodigo.length > 0,
  };
}

function gerarTutorialScaffold(moduloId, opcoes = {}) {
  const id = String(moduloId).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
  if (!id) {
    console.error('❌ [DOC-GUARDIAN] Nome de módulo inválido.');
    process.exit(1);
  }

  const titulo = opcoes.titulo || `Módulo ${id.charAt(0).toUpperCase() + id.slice(1)}`;
  const subtitulo = opcoes.subtitulo || `Guia e tutorial completo para utilização do módulo ${id}.`;
  const comandosStr = opcoes.comandos || `/${id}`;
  const comandos = comandosStr.split(',').map((c) => (c.startsWith('/') ? c.trim() : `/${c.trim()}`));

  if (!fs.existsSync(MANUAIS_DIR)) {
    fs.mkdirSync(MANUAIS_DIR, { recursive: true });
  }

  const tutorialPath = path.join(MANUAIS_DIR, `Tutorial_${id}.md`);
  const tutorialMd = `# 📘 Tutorial Oficial • ${titulo}
**CyberGuard Bot • Guia Operacional e Instruções de Uso**

> **Objetivo:** ${subtitulo}  
> **Público-alvo:** Membros, Líderes de Setor e Recursos Humanos  
> **Comandos Principais:** ${comandos.map((c) => `\`${c}\``).join(', ')}

---

## 🎯 1. Visão Geral do Módulo

O módulo **${titulo}** foi desenvolvido para integrar as operações do CyberGuard UTFPR, oferecendo um fluxo simplificado, confiável e em conformidade estrita com a **LGPD (Lei nº 13.709/2018)**.

### Benefícios:
- Automação de processos internos com rastreabilidade completa.
- Interface intuitiva no Discord com botões, modais e mensagens efêmeras.
- Integração segura com a base de dados PostgreSQL e serviços institucionais.

---

## 👥 2. Perfis de Acesso e Permissões

| Nível / Cargo | Permissões no Módulo | Escopo de Visibilidade |
| :--- | :--- | :--- |
| **Voluntário(a) / Membro** | Utilização padrão e autoatendimento | Pessoal / DM privada |
| **Líder de Setor** | Gestão de demandas da sua equipe | Setorial |
| **Recursos Humanos / Presidência** | Painel executivo, relatórios e auditoria | Global do projeto |

---

## 🚀 3. Fluxo Operacional Passo a Passo

\`\`\`mermaid
flowchart TD
    A["Início: Executar comando no Discord"] --> B{"Validação de Permissão e Dados"}
    B -- "Acesso Autorizado" --> C["Abertura de Interface / Modal Interativo"]
    B -- "Não Autorizado" --> D["Aviso Efêmero de Restrição"]
    C --> E["Processamento com Criptografia e Auditoria"]
    E --> F["Confirmação ao Usuário e Notificação"]
\`\`\`

### Passo 1: Disparo do Comando
O usuário aciona um dos comandos registrados (${comandos.map((c) => `\`${c}\``).join(', ')}). Caso o comando necessite de parâmetros, preencha as opções sugeridas pelo autocomplete.

### Passo 2: Interação na Interface
O bot exibirá uma resposta imediata (geralmente efêmera para preservar a privacidade do usuário) contendo botões interativos ou abrindo um formulário modal para coleta de informações.

### Passo 3: Conclusão e Registro Auditável
Após o preenchimento, as informações são validadas e salvas de forma segura. Um resumo ou comprovante é entregue via mensagem direta (DM) ou no canal correspondente.

---

## 🛠️ 4. Lista de Comandos e Parâmetros

| Comando | Parâmetros | Descrição do Fluxo |
| :--- | :--- | :--- |
${comandos.map((cmd) => `| \`${cmd}\` | N/A | Executa as ações do módulo ${titulo}. |`).join('\n')}

---

## 🔒 5. Segurança, Privacidade e LGPD

1. **Minimização de Dados:** Apenas os dados estritamente necessários para a execução da atividade são coletados.
2. **Criptografia em Repouso:** Quaisquer dados cadastrais ou sensíveis são armazenados utilizando criptografia forte (AES-256-GCM).
3. **Respostas Efêmeras:** Mensagens contendo dados individuais são configuradas como efêmeras no Discord, visíveis exclusivamente ao solicitante.
4. **Logs Sanitizados:** Os canais de auditoria nunca exibem dados desprotegidos.

---

*Documento gerado automaticamente pelo CyberGuard Doc & Flow Guardian.*
`;

  fs.writeFileSync(tutorialPath, tutorialMd, 'utf8');
  console.log(`✅ [DOC-GUARDIAN] Tutorial criado em: ${path.relative(ROOT, tutorialPath)}`);

  // Modelo de snippet para commands/documentacao/documentacaoCommand.js
  const snippetModulo = `  ${id}: {
    id: '${id}',
    titulo: '${titulo}',
    subtitulo: '${subtitulo}',
    cor: 0x3b82f6,
    pdfPrincipal: 'Tutorial_${id}.md',
    comandos: [${comandos.map((c) => `'${c}'`).join(', ')}],
    regras: [
      '• **Acesso:** Permissões segmentadas entre Integrantes, Líderes e RH.',
      '• **Interação:** Formulários com modais e botões interativos no Discord.',
      '• **Privacidade:** Mensagens efêmeras e conformidade estrita com a LGPD.',
      '• **Rastreabilidade:** Logs auditáveis de operações no canal de registro.',
    ],
  },`;

  console.log('\n📋 [DOC-GUARDIAN] Snippet sugerido para MODULOS em commands/documentacao/documentacaoCommand.js:');
  console.log(snippetModulo);

  return { tutorialPath, snippetModulo };
}

function exibirStatus() {
  const { modulos, comandosTotal, comandosNaoMapeados, manuaisAusentes, pendenciasReadme } =
    verificarCoberturaModulos();

  console.log('\n================================================================');
  console.log('🛡️  CYBERGUARD BOT — STATUS DE DOCUMENTAÇÃO E MÓDULOS');
  console.log('================================================================\n');

  console.log(`📦 Total de diretórios de comandos: ${comandosTotal}`);
  console.log(`📚 Módulos registrados em /documentacao: ${Object.keys(modulos).length}\n`);

  console.log('📋 Cobertura dos Módulos:');
  Object.values(modulos).forEach((m) => {
    const temManual = m.pdfPrincipal
      ? fs.existsSync(path.join(MANUAIS_DIR, m.pdfPrincipal)) ||
        fs.existsSync(path.join(ROOT, 'docs', m.pdfPrincipal)) ||
        fs.existsSync(path.join(MANUAIS_DIR, `Tutorial_${m.id}.md`))
      : false;
    const iconeManual = temManual ? '✅' : '⚠️ ';
    console.log(`  ${iconeManual} [${m.id}] ${m.titulo}`);
    console.log(`     Comandos: ${m.comandos.join(', ') || 'N/A'}`);
    console.log(`     Manual/Tutorial: ${m.pdfPrincipal || 'Tutorial_' + m.id + '.md'} (${temManual ? 'OK' : 'Ausente'})\n`);
  });

  if (comandosNaoMapeados.length > 0) {
    console.log('⚠️  Comandos sem módulo vinculado no catálogo /documentacao:');
    comandosNaoMapeados.forEach((c) => console.log(`   - commands/${c}`));
    console.log('   💡 Dica: Adicione o comando ao módulo correspondente ou crie um novo módulo.\n');
  } else {
    console.log('✅ Todos os comandos estão mapeados em módulos da documentação.\n');
  }

  if (manuaisAusentes.length > 0) {
    console.log('⚠️  Manuais/Tutoriais pendentes de criação em docs/manuais/:');
    manuaisAusentes.forEach((p) => console.log(`   - Módulo: ${p.modulo} -> Arquivo: ${p.arquivo}`));
    console.log('');
  }

  if (pendenciasReadme.length > 0) {
    console.log('⚠️  Módulos sem menção explícita no README.md:');
    pendenciasReadme.forEach((id) => console.log(`   - ${id}`));
    console.log('');
  }

  console.log('================================================================\n');
}

function executarCheck(modoQuiet = false) {
  const { comandosNaoMapeados, manuaisAusentes } = verificarCoberturaModulos();
  const { arquivosCodigo, docAlterada, temModificacoes } = auditarAlteracoesFluxo();

  let temProblema = false;
  const mensagensAviso = [];

  if (comandosNaoMapeados.length > 0) {
    mensagensAviso.push(
      `Novo(s) comando(s) ou módulo(s) detectado(s) sem tutorial ou registro em commands/documentacao/documentacaoCommand.js:\n` +
        comandosNaoMapeados.map((c) => `  - commands/${c}`).join('\n') +
        `\n  -> Execute: node scripts/doc-flow-guardian.js --tutorial <modulo> para gerar o tutorial.`
    );
    temProblema = true;
  }

  if (temModificacoes && !docAlterada) {
    mensagensAviso.push(
      `Alterações de código detectadas em arquivos de comandos/serviços sem atualização correspondente de documentação:\n` +
        arquivosCodigo.map((d) => `  - ${d.file}`).join('\n') +
        `\n  -> Se algum fluxo, parâmetro ou comportamento mudou, certifique-se de atualizar README.md, commands/documentacao/documentacaoCommand.js ou os manuais em docs/manuais/.`
    );
  }

  if (!modoQuiet) {
    if (mensagensAviso.length > 0) {
      console.warn('\n⚠️  [DOC-GUARDIAN] ALERTAS DE FLUXO & DOCUMENTAÇÃO:');
      mensagensAviso.forEach((msg) => console.warn(`\n${msg}`));
      console.warn('');
    } else {
      console.log('✅ [DOC-GUARDIAN] Documentação e fluxos sincronizados (100% em conformidade).');
    }
  }

  return { ok: !temProblema, avisos: mensagensAviso };
}

function main() {
  const args = process.argv.slice(2);
  const modoStatus = args.includes('--status');
  const modoCheck = args.includes('--check');
  const modoQuiet = args.includes('--quiet');
  const indexTutorial = args.indexOf('--tutorial');

  if (indexTutorial !== -1 && args[indexTutorial + 1]) {
    const moduloId = args[indexTutorial + 1];
    let titulo = '';
    let subtitulo = '';
    let comandos = '';

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--titulo' && args[i + 1]) titulo = args[i + 1];
      if (args[i] === '--subtitulo' && args[i + 1]) subtitulo = args[i + 1];
      if (args[i] === '--comandos' && args[i + 1]) comandos = args[i + 1];
    }

    gerarTutorialScaffold(moduloId, { titulo, subtitulo, comandos });
    process.exit(0);
  }

  if (modoStatus) {
    exibirStatus();
    process.exit(0);
  }

  if (modoCheck) {
    const res = executarCheck(modoQuiet);
    process.exit(res.ok ? 0 : 1);
  }

  // Padrão: exibe status e checagem
  exibirStatus();
  executarCheck(false);
}

if (require.main === module) {
  main();
}

module.exports = {
  obterModulosRegistrados,
  verificarCoberturaModulos,
  auditarAlteracoesFluxo,
  gerarTutorialScaffold,
  executarCheck,
};
