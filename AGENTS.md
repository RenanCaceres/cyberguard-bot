# Regras Obrigatórias do Repositório — CyberGuard Bot (LGPD & Auto-Deploy PM2)

Toda tarefa, comando ou alteração executada neste repositório **DEVE** cumprir obrigatoriamente os três requisitos abaixo antes de encerrar a resposta ao usuário:

## 1. Conformidade Estrita com a LGPD (Lei nº 13.709/2018)
- **Jamais** exponha em código-fonte, comentários, `README.md`, `.env.example` ou scripts geradores de PDF (`scripts/gerar*.js` e `docs/**/*.pdf`):
  - CPFs reais, RAs reais de alunos (em exemplos de protocolos use exclusivamente `#DECL-0000000-1234` ou `#TERMO-0000000-1234`), telefones, endereços ou datas de nascimento;
  - E-mails pessoais ou institucionais reais (utilize variáveis do `.env` como `EMAIL_TERMOS_DESTINATARIO`, `EMAIL_TERMOS_CC`, `EMAIL_PROFESSOR_COORDENADOR`);
  - Discord Snowflake IDs (`17–20` dígitos), UUIDs reais de databases/páginas do Notion ou IDs de pastas/planilhas do Google Drive/Sheets hardcoded (leia sempre de `process.env.*` com fallback vazio `''`);
  - Chaves de API, tokens ou cookies (`NOTION_TOKEN`, `NOTION_TOKEN_V2`, `DISCORD_TOKEN`, `DATA_ENCRYPTION_KEY`).
- **Preserve sempre os controles estruturais de proteção de dados**:
  - Criptografia `AES-256-GCM` em repouso (`src/cryptoUtils.js` e `src/db.js`) para todos os campos sensíveis de `membros`, mantendo os registros arquivados e criptografados (sem deletar ou zerar dados na saída/expulsão).
  - Termo de Ciência e Privacidade obrigatório no onboarding (`src/onboarding.js` — finalidade exclusiva para registros e fins acadêmicos) e mascaramento de CPF (`mascararCPF`).
  - Sanitização dos cartões do RH após aprovação/reprovação (`construirEmbedResumidoRH`) e exclusão imediata de PDFs temporários em `./temp/`.
  - Aviso ativo e botão de opt-out individual (`reuniao_optout`) em gravações de voz (`/reuniao`) e comando `/meus-dados` ativo.
  - Nunca utilize `ChannelType.PublicThread` como fallback para coleta de anexos/documentos de membros (use `PrivateThread` ou DM privada).
  - Scripts internos de migração/manutenção avulsa devem ficar apenas em `scripts-privados/` (ignorado pelo Git).
- Sempre valide com:
  ```bash
  npm run lgpd
  ```

## 2. Commit Automático + Atualização do Servidor + Restart no PM2
- Ao concluir qualquer modificação em arquivos do projeto (ou quando houver alterações locais/commits pendentes), execute **sempre**:
  ```bash
  bash scripts/auto-deploy.sh "<tipo>(<escopo>): <descrição clara da mudança>"
  ```
- Esse comando executa atomicamente:
  1. `node scripts/lgpd-guard.js` (bloqueia imediatamente se houver qualquer violação LGPD ou erro de sintaxe);
  2. `git add -A && git commit` + `git push origin main`;
  3. `node deploy-commands.js` (automaticamente sempre que `deploy-commands.js` ou `commands/**` forem alterados);
  4. Sincronização segura de novas chaves do `.env`, atualização do Git (`origin/main`) no servidor de produção (`~/cyberguard-bot`) e `pm2 restart cyberguard-bot --update-env`.

## 3. Sincronização de Fluxos, Documentação em PDF & Tutoriais de Novos Módulos (Doc & Flow Guardian)
- **Formato Obrigatório em PDF**:
  - Toda documentação e tutorial gerado para os módulos em `docs/manuais/` **DEVE ser produzido em formato PDF** (`Tutorial_<Modulo>.pdf`, `Manual_*.pdf`, `Documentacao_Completa_CyberGuard_Bot.pdf`).
  - Nunca deixe arquivos `.md` sem compilação em `docs/manuais/` nem referencie arquivos `.md` em `pdfPrincipal` dentro de `commands/documentacao/documentacaoCommand.js`.
  - Sempre que redigir ou alterar um tutorial em Markdown, converta-o imediatamente para PDF com `node scripts/doc-flow-guardian.js --pdf` (ou `npm run docs:pdf`) ou gere diretamente via `node scripts/doc-flow-guardian.js --tutorial <modulo>`.
- **Alteração de Fluxo da Aplicação**:
  - Sempre que qualquer fluxo de interação (comandos slash, botões, modais, seletores, coletores) ou regras de negócio em `commands/` ou `src/` forem alterados, mantenha a documentação estritamente sincronizada:
    - Atualize a tabela de comandos, permissões e passos operacionais no `README.md`;
    - Atualize o objeto `MODULOS` em `commands/documentacao/documentacaoCommand.js` (regras, subtítulo e lista de comandos);
    - Atualize os manuais **em PDF** correspondentes em `docs/manuais/` (e `scripts/gerarDocumentacaoCompleta.js` quando aplicável).
- **Criação de Novo Módulo**:
  - Sempre que um novo módulo funcional for criado (ex: novo diretório em `commands/` ou novo serviço em `src/`):
    - Crie o tutorial completo **em PDF** em `docs/manuais/Tutorial_<Modulo>.pdf` (utilize `node scripts/doc-flow-guardian.js --tutorial <modulo>` ou `--from-md <arquivo.md>`);
    - Registre o módulo no catálogo interativo do `/documentacao` (`commands/documentacao/documentacaoCommand.js`) apontando `pdfPrincipal` para `'Tutorial_<Modulo>.pdf'`;
    - Adicione a seção correspondente com comandos, matriz de permissões e fluxos no `README.md`.
- **Validação de Documentação**:
  - Valide a cobertura e o formato PDF com:
    ```bash
    node scripts/doc-flow-guardian.js --check
    ```
