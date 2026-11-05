# Guia de Contribuição — CyberGuard Bot 🛡️

Agradecemos o interesse em contribuir com o **CyberGuard Bot**, plataforma institucional de governança e automação para a iniciativa de cibersegurança e extensão universitária **CyberGuard UTFPR**.

Para manter a integridade operacional, a estabilidade em produção e o cumprimento irrestrito da legislação vigente, todas as contribuições devem seguir as diretrizes abaixo.

---

## 🔒 1. Conformidade Obrigatória com a LGPD (Lei nº 13.709/2018)

Este repositório adota uma política de **tolerância zero** contra vazamento de dados pessoais ou credenciais confidenciais.

Antes de abrir um Pull Request ou commitar qualquer alteração, certifique-se de que:
- **Jamais comite:**
  - CPFs reais, datas de nascimento, telefones ou endereços de voluntários;
  - RAs reais de alunos (em exemplos use exclusivamente o padrão `#DECL-0000000-1234` ou `#TERMO-0000000-1234`);
  - E-mails institucionais ou pessoais reais (utilize variáveis de ambiente como `EMAIL_TERMOS_DESTINATARIO`);
  - Discord Snowflake IDs (números de 17 a 20 dígitos), tokens de bots, chaves de API (`DISCORD_TOKEN`, `NOTION_TOKEN`, `GEMINI_API_KEY`) ou chaves de criptografia;
  - Arquivos de dados temporários, despejos de banco de dados (`.sql`), planilhas (`.csv`) ou a pasta `temp/`.
- **Preserve os Controles Estruturais:**
  - Criptografia `AES-256-GCM` em repouso (`src/cryptoUtils.js` e `src/db.js`);
  - Termo de Ciência e Privacidade obrigatório antes da coleta no onboarding (`src/onboarding.js`);
  - Mascaramento e sanitização periódica dos cards deliberativos do RH (`src/approval.js`);
  - Botão de opt-out em gravações de reuniões (`commands/reuniao/reuniaoCommand.js`);
  - Portal do Titular ativo (`/meus-dados`).
- **Validação Automatizada:**  
  Execute sempre o script de auditoria:
  ```bash
  npm run lgpd
  ```

---

## 🌿 2. Fluxo de Trabalho & Padrão de Commits

O projeto segue a especificação de [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(...)`: Nova funcionalidade implementada;
- `fix(...)`: Correção de defeito ou bug;
- `docs(...)`: Alteração em documentações, manuais ou README;
- `refactor(...)`: Refatoração estrutural sem alteração de comportamento;
- `chore(...)`: Manutenção em dependências ou infraestrutura;
- `test(...)`: Criação ou ajuste de testes automatizados.

Exemplo:
```bash
git commit -m "feat(termos): adicionar matrizes setoriais e alerta semestral de renovacao"
```

---

## 🚀 3. Deploy Automático e Atualização no Servidor

O repositório possui uma pipeline automatizada para verificação de segurança, sincronização com o GitHub e reinicialização segura no servidor de produção.

Ao finalizar alterações em arquivos do projeto:
```bash
bash scripts/auto-deploy.sh "<tipo>(<escopo>): <descrição da mudança>"
```

Esse script realiza de forma atômica:
1. Execução do `node scripts/lgpd-guard.js` (abortando em caso de erro);
2. Versionamento com `git add -A && git commit` e `git push origin main`;
3. Registro de comandos slash (`deploy-commands.js`) se `commands/` tiver sido alterado;
4. Atualização via SSH no servidor de hospedagem e `pm2 restart cyberguard-bot --update-env`.

---

## 📄 4. Atualização da Documentação e Manuais

Sempre que introduzir ou alterar regras de negócio:
1. Atualize o `README.md` com a nova especificação;
2. Se o módulo possuir comando em `/documentacao`, atualize `commands/documentacao/documentacaoCommand.js`;
3. Se a alteração afetar os manuais oficiais em PDF, atualize os geradores em `scripts/` e execute:
   ```bash
   node scripts/gerarDocumentacaoCompleta.js
   node scripts/gerarManuais.js
   ```
