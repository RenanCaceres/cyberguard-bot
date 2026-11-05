# Política de Segurança & LGPD — CyberGuard Bot 🛡️

A segurança da informação e a privacidade dos integrantes da iniciativa **CyberGuard UTFPR** são pilares fundamentais deste projeto.

---

## 🔒 1. Versões Suportadas

O suporte ativo e as atualizações de segurança são fornecidos exclusivamente para a versão em produção na branch principal:

| Versão / Branch | Suportada | Observações |
| :--- | :--- | :--- |
| `main` (Produção) | :white_check_mark: Sim | Ambiente auditado continuamente com LGPD Guard e PM2 |
| Versões Legadas / Forks | :x: Não | Recomendada a sincronização imediata com a branch `main` |

---

## 🛡️ 2. Práticas de Segurança e Conformidade com a LGPD

O CyberGuard Bot implementa salvaguardas técnicas e operacionais em conformidade com a **Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais)**:

1. **Criptografia em Repouso**: Dados sensíveis (CPF, data de nascimento, endereços e telefones) são armazenados no PostgreSQL com cifragem simétrica autenticada **AES-256-GCM**, garantindo confidencialidade e integridade.
2. **Minimização e Finalidade**: Nenhum dado é coletado sem o consentimento prévio do titular via Termo de Ciência na DM. A utilização é estritamente restrita à emissão de termos institucionais e comprovação de horas acadêmicas perante a UTFPR.
3. **Anonimização e Sanitização no Chat**: Mensagens deliberativas do canal de Recursos Humanos exibem CPFs mascarados (`***.222.333-**`) e são automaticamente sanitizadas após a aprovação ou rejeição, expurgando dados sensíveis do histórico de mensagens.
4. **Remoção de Arquivos Temporários**: Arquivos intermediários de geração de documentos na pasta `temp/` são imediatamente destruídos após o envio ou validação.
5. **Direito de Opt-out em Chamadas de Voz**: Participantes de reuniões têm direito assegurado de oposição com um clique (`reuniao_optout`), suspendendo a captura de seu fluxo de áudio pelo bot.
6. **Portal do Titular (`/meus-dados`)**: Acesso facilitado aos direitos previstos no Artigo 18 da LGPD (confirmação da existência de tratamento, consulta facilitada e correção de dados incompletos ou inexatos).

---

## 🚨 3. Como Reportar Vulnerabilidades ou Incidentes de Privacidade

Se você identificou uma falha de segurança, suspeita de vulnerabilidade ou inconsistência no tratamento de dados pessoais:

1. **Não abra uma Issue pública** para relatar problemas de segurança ou dados expostos.
2. Envie um e-mail diretamente para o desenvolvedor e coordenador do projeto:
   - **Desenvolvedor:** `renancanselmo@gmail.com`
   - **Coordenação do Projeto:** `coordenacao@utfpr.edu.br`
3. Inclua no relato:
   - Descrição técnica detalhada da vulnerabilidade;
   - Passos reproduzíveis (utilizando dados fictícios, jamais dados reais de terceiros);
   - Possível impacto identificado.

Todas as notificações serão analisadas com prioridade máxima e receberão retorno técnico com as medidas corretivas aplicadas.
