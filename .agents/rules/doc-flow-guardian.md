# Regra Obrigatória — Guardião de Fluxos, Documentação & Tutoriais de Novos Módulos

Toda tarefa executada no repositório **CyberGuard Bot** deve cumprir os seguintes critérios de sincronização de documentação:

1. **Alteração de Fluxo da Aplicação:**
   - Sempre que qualquer fluxo de interação (Discord commands, botões, modais, coletores) ou regra de negócio em `commands/` ou `src/` for modificado, a documentação **DEVE** ser atualizada imediatamente:
     * `README.md`: Atualizar tabela de comandos, passos do fluxo e permissões.
     * `commands/documentacao/documentacaoCommand.js`: Atualizar `MODULOS` (subtítulo, regras e comandos).
     * `docs/manuais/`: Atualizar manuais correspondentes caso haja alteração substancial.

2. **Criação de Novo Módulo:**
   - Sempre que um novo módulo funcional for criado (ex: novo diretório em `commands/` ou novo serviço em `src/`):
     * **Tutorial Obrigatório:** Deve ser criado um tutorial completo em `docs/manuais/Tutorial_<Modulo>.md` (utilize `node scripts/doc-flow-guardian.js --tutorial <modulo>`).
     * **Registro em `/documentacao`:** O novo módulo deve ser registrado no objeto `MODULOS` em `commands/documentacao/documentacaoCommand.js`.
     * **Inclusão no `README.md`:** Deve ser adicionada uma seção dedicada com tabela de comandos, fluxo de uso e permissões.

3. **Validação Automática:**
   - Execute sempre:
     ```bash
     node scripts/doc-flow-guardian.js --check
     ```
   - E audite a conformidade com a LGPD:
     ```bash
     npm run lgpd
     ```
