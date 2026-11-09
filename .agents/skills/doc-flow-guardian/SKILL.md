---
name: doc-flow-guardian
description: >-
  Use this skill whenever application flows change (Discord commands, parameters, buttons,
  modals, collectors, business logic) or whenever a new module is created in CyberGuard Bot.
  It guides the agent in updating README.md, commands/documentacao/documentacaoCommand.js,
  generating comprehensive tutorials for new modules, and ensuring 100% LGPD compliance.
---

# 🛡️ Doc & Flow Guardian Skill — CyberGuard Bot

Este skill estabelece o fluxo de trabalho obrigatório para manter a documentação da aplicação sempre sincronizada com o código-fonte e garantir que **qualquer novo módulo** receba automaticamente um **tutorial completo**, didático e padronizado.

---

## ⚡ Quando Ativar este Skill

Ative este skill sempre que:
1. **Um fluxo da aplicação for alterado:**
   - Modificação em comandos slash (novas opções, subcomandos, parâmetros ou permissões).
   - Alteração em botões interativos, menus de seleção (`StringSelectMenu`), modais (`ModalBuilder`) ou coletores (`createMessageComponentCollector`).
   - Alteração em fluxos de negócios (prazos de defesa, regras de ponto, renovação de termos, chamados de suporte, opt-out, etc.).
   - Alteração em integrações externas (Notion, Google Sheets, Google Calendar, Google Drive, PostgreSQL, IMAP/SMTP).
2. **Um novo módulo for criado:**
   - Criação de nova pasta em `commands/<novo-modulo>/`.
   - Adição de novos serviços em `src/<novo-modulo>.js`.
   - Criação de novas tabelas em `migrations/` ou novas funcionalidades operacionais.

---

## 📋 Procedimento 1: Atualização por Mudança de Fluxo

Quando um fluxo existente for alterado:

### Passo 1: Identificar o Impacto do Fluxo
Examine o `git status` e `git diff` para entender exatamente o que mudou:
- Quem pode acionar a ação?
- Quais são os novos botões ou campos de formulário?
- Houve alteração em prazos, mensagens efêmeras ou notificações na DM?

### Passo 2: Atualizar o Catálogo Interativo do Discord
Abra [commands/documentacao/documentacaoCommand.js](file:///home/renan/Documentos/GitHub/cyberguard-bot/commands/documentacao/documentacaoCommand.js):
- Localize o módulo em `const MODULOS = { ... }`.
- Atualize a lista de `comandos`, `subtitulo` e os bullet points de `regras`.
- Se houver novos comandos de suporte, atualize [commands/ajuda/ajudaCommand.js](file:///home/renan/Documentos/GitHub/cyberguard-bot/commands/ajuda/ajudaCommand.js) ou [commands/help/helpCommand.js](file:///home/renan/Documentos/GitHub/cyberguard-bot/commands/help/helpCommand.js).

### Passo 3: Atualizar o README do Projeto
Abra [README.md](file:///home/renan/Documentos/GitHub/cyberguard-bot/README.md):
- Localize a seção correspondente em `### ⚡ Funcionalidades Principais`.
- Atualize a tabela de comandos, o passo a passo operacional e as regras de negócio.

### Passo 4: Atualizar Manuais e Scripts de Documentação
Se a mudança for substancial:
- Atualize os scripts geradores de manuais correspondentes em `scripts/` (ex: `gerarManuais.js`, `gerarManualAvisos.js`, etc.).
- Se necessário, atualize diagramas em `scripts/fluxosCanvas.js` ou simulações em `scripts/simulacoesCanvas.js`.

---

## 🚀 Procedimento 2: Criação de Tutorial para Novo Módulo

Quando um novo módulo for implementado:

### Passo 1: Executar o Gerador de Tutorial
Execute o utilitário do Guardian:
```bash
node scripts/doc-flow-guardian.js --tutorial <id_do_modulo> --titulo "<Título do Módulo>" --subtitulo "<Descrição curta>" --comandos "/cmd1,/cmd2"
```
Isso gerará o scaffold completo em `docs/manuais/Tutorial_<id_do_modulo>.md`.

### Passo 2: Detalhar o Tutorial
Abra o arquivo gerado em `docs/manuais/Tutorial_<id_do_modulo>.md` e complemente com:
1. **Visão Geral e Objetivos:** Contexto e relevância para o projeto.
2. **Matriz de Permissões:** Quem tem acesso (Voluntário, Líder, RH, Presidência).
3. **Fluxograma Operacional Mermaid:** Representação visual do fluxo de interação.
4. **Passo a Passo Detalhado:** Instruções claras com prints ou exemplos de mensagens do Discord.
5. **Comandos e Parâmetros:** Tabela completa com tipos, opções e obrigatoriedade.
6. **Salvaguardas LGPD e Segurança:** Princípios de minimização, retenção, efemeridade e criptografia AES-256-GCM.

### Passo 3: Registrar no Catálogo `/documentacao`
Insira o novo objeto em `MODULOS` dentro de [commands/documentacao/documentacaoCommand.js](file:///home/renan/Documentos/GitHub/cyberguard-bot/commands/documentacao/documentacaoCommand.js):
```javascript
  novoModulo: {
    id: 'novoModulo',
    titulo: '✨ Título do Módulo',
    subtitulo: 'Descrição sucinta para exibição no menu select.',
    cor: 0x3b82f6,
    pdfPrincipal: 'Tutorial_novoModulo.md',
    comandos: ['/comando1', '/comando2'],
    regras: [
      '• Regra de acesso e permissão.',
      '• Interação por botões e modais.',
      '• Privacidade e conformidade LGPD.',
    ],
  },
```

### Passo 4: Adicionar ao README.md
No [README.md](file:///home/renan/Documentos/GitHub/cyberguard-bot/README.md):
- Adicione o link e resumo na seção de funcionalidades principais.
- Adicione a tabela de comandos do novo módulo e o fluxo passo a passo.

---

## 🔍 Validação e Auditoria

Antes de concluir qualquer tarefa:
1. Verifique a cobertura com:
   ```bash
   node scripts/doc-flow-guardian.js --check
   ```
2. Audite a conformidade estrita com a LGPD:
   ```bash
   npm run lgpd
   ```
3. Realize o deploy e commit seguro:
   ```bash
   bash scripts/auto-deploy.sh "docs(<modulo>): atualizar fluxos e tutorial do módulo"
   ```
