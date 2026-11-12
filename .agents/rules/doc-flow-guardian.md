# Regra Obrigatória — Guardião de Fluxos, Documentação PDF & Tutoriais de Novos Módulos

Toda tarefa executada no repositório **CyberGuard Bot** deve cumprir os seguintes critérios de sincronização de documentação:

1. **Formato Obrigatório em PDF (`docs/manuais/*.pdf`):**
   - Toda documentação operacional, manual ou tutorial de módulo gerado ou atualizado **DEVE ser produzido em formato PDF** (`docs/manuais/Tutorial_<Modulo>.pdf`, `Manual_*.pdf`, `Documentacao_Completa_CyberGuard_Bot.pdf`).
   - O campo `pdfPrincipal` (e `pdfSecundario`) em `commands/documentacao/documentacaoCommand.js` **NUNCA** pode apontar para `.md` — deve sempre referenciar um arquivo `.pdf` válido.
   - Se redigir conteúdo em Markdown, converta imediatamente para PDF usando `npm run docs:pdf` (ou `node scripts/doc-flow-guardian.js --tutorial <modulo> --from-md <arquivo.md>`).

2. **Alteração de Fluxo da Aplicação:**
   - Sempre que qualquer fluxo de interação (Discord commands, botões, modais, coletores) ou regra de negócio em `commands/` ou `src/` for modificado, a documentação **DEVE** ser atualizada imediatamente:
     * `README.md`: Atualizar tabela de comandos, passos do fluxo e permissões.
     * `commands/documentacao/documentacaoCommand.js`: Atualizar `MODULOS` (subtítulo, regras e comandos).
     * `docs/manuais/*.pdf`: Atualizar/regerar os manuais em PDF correspondentes (`scripts/gerar*.js` ou `--pdf`).

3. **Criação de Novo Módulo:**
   - Sempre que um novo módulo funcional for criado (ex: novo diretório em `commands/` ou novo serviço em `src/`):
     * **Tutorial Obrigatório em PDF:** Deve ser criado um tutorial completo em `docs/manuais/Tutorial_<Modulo>.pdf` (utilize `node scripts/doc-flow-guardian.js --tutorial <modulo>` ou `--from-md <arquivo.md>`).
     * **Registro em `/documentacao`:** O novo módulo deve ser registrado no objeto `MODULOS` em `commands/documentacao/documentacaoCommand.js` com `pdfPrincipal: 'Tutorial_<Modulo>.pdf'`.
     * **Inclusão no `README.md`:** Deve ser adicionada uma seção dedicada com tabela de comandos, fluxo de uso e permissões.

4. **Validação Automática:**
   - Execute sempre:
     ```bash
     node scripts/doc-flow-guardian.js --check
     ```
   - E audite a conformidade com a LGPD (que também inspeciona o texto dos PDFs):
     ```bash
     npm run lgpd
     ```
