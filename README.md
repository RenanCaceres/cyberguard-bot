# CyberGuard - Bot de Onboarding e Termo de Voluntariado

## Setup

```bash
npm install
cp .env.example .env
# preencher .env
```

Precisa do **LibreOffice** instalado no servidor (usa `soffice` pra converter o
termo de .docx pra .pdf):

```bash
sudo apt install libreoffice --no-install-recommends
```

Criar o banco (pode ser um DB separado no mesmo Postgres que você já roda):

```bash
sudo -u postgres createdb cyberguard_bot
```

O schema é criado automaticamente no primeiro start (`db.initSchema()`).

## Template do termo

`./templates/termo_voluntariado.docx` já é o seu termo original com os campos
em vermelho substituídos pelos placeholders do docxtemplater:

```
{nome}  {data_nascimento}  {nacionalidade}  {cpf}  {curso}  {periodo}  {ra}
{endereco}  {cidade}  {estado}  {telefone}  {email}  {data_assinatura}
```

Todos são preenchidos automaticamente pelo bot quando o RH aprova — **exceto**
`{data_assinatura}`, que fica em branco de propósito.

## Configuração no Discord

1. Criar a role "Recursos Humanos" no servidor (ou o nome que você usar em `ROLE_RH_NOME`)
2. Criar um canal privado só pro RH e pegar o ID (`CHANNEL_RH_ID`)
3. Habilitar a intent `SERVER MEMBERS INTENT` e `MESSAGE CONTENT INTENT` no Developer Portal
4. Convidar o bot com permissões: Ver Canais, Enviar Mensagens, Anexar Arquivos,
   Gerenciar Mensagens, **Gerenciar Cargos** (necessária pra atribuir
   `ROLE_APROVADO_NOME` e os cargos de área de interesse)

⚠️ **O cargo definido em `ROLE_RH_NOME` não pode ser autoatribuível** (por
reação, menu de cargo, ou qualquer outro bot). Ele controla quem consegue
clicar em Aprovar/Rejeitar — se qualquer membro puder se autoconceder esse
cargo, qualquer membro vira "RH". Atribua manualmente, só pra quem realmente
faz parte da diretoria de RH.

⚠️ **Hierarquia de cargos**: o cargo do bot precisa estar ACIMA, na lista de
cargos do servidor, de qualquer cargo que ele for atribuir (`ROLE_APROVADO_NOME`
e os cargos de `AREAS_INTERESSE`). O Discord não deixa um bot atribuir um cargo
que esteja acima do cargo dele na hierarquia.

## Rodando

```bash
node src/index.js
```

## Deploy no seu servidor (Xubuntu + PM2)

```bash
pm2 start src/index.js --name cyberguard-bot
pm2 save
```

## Fluxo resumido

1. Membro entra → bot manda DM com perguntas sequenciais (12 campos do termo) +
   um menu de seleção pra escolher a **área de interesse**
2. Dados salvos com status `pendente_aprovacao` → card postado no canal do RH
   (já mostrando a área escolhida)
3. RH (role "Recursos Humanos") aprova ou rejeita via botão
4. Se aprovado: o bot atribui automaticamente o cargo `ROLE_APROVADO_NOME`
   (libera o servidor geral) **e** o cargo da área de interesse escolhida (ex:
   "Blue Team"), gera o termo em PDF, envia por DM + link do WhatsApp, status
   vira `aguardando_assinatura`
5. Aluno preenche o campo "Data:" no PDF, assina pelo **gov.br**, e manda o PDF
   assinado de volta por DM
6. Bot valida (ver seção abaixo) → se ok, encaminha por e-mail e marca `concluido`;
   se não conseguir validar automaticamente, encaminha pro RH revisar manualmente
7. Cron diário (`CRON_LEMBRETE`) cobra quem ainda está em `aguardando_assinatura`;
   avisa o RH se o prazo vencer

## Áreas de interesse

Configuradas em `AREAS_INTERESSE` no `.env`, separadas por vírgula. Os nomes
precisam bater **exatamente** com os nomes dos cargos já existentes no
servidor, senão o bot loga um aviso e não consegue atribuir o cargo na hora da
aprovação.

⚠️ **Se você já tinha um menu de auto-atribuição de cargo (reação/bot tipo
Carlinhos) pras mesmas áreas, desative ou apague esse menu.** Ele deixa
qualquer membro se auto-atribuir cargos de área (inclusive coisas sensíveis
tipo "Recursos Humanos") sem passar pela aprovação do RH — o que abre uma
brecha de acesso e derruba todo o controle que esse bot foi feito pra impor.
A escolha de área agora deve acontecer **só** pelo onboarding do bot.

## Como o campo de data funciona

O termo é gerado assim:

1. `docxtemplater` preenche todos os campos no `.docx`, deixando `data_assinatura` em branco
2. `soffice` (LibreOffice headless) converte esse `.docx` pra `.pdf`
3. O bot usa `pdfjs-dist` pra localizar a posição exata do rótulo "Data:" no PDF
   gerado (a posição pode variar de página dependendo do tamanho dos outros
   campos, tipo um endereço longo — por isso a busca é dinâmica, não uma
   coordenada fixa)
4. `pdf-lib` adiciona ali um campo de formulário (AcroForm) preenchível, com uma
   borda visível, pro aluno clicar e digitar a data em qualquer leitor de PDF

O aluno preenche esse campo e sobe o PDF pro assinador do gov.br. Como a
assinatura do gov.br normalmente só adiciona um bloco de assinatura sem alterar
o restante do conteúdo, o campo de formulário deve continuar intacto e legível
no arquivo final.

## Validação do termo devolvido

Quando o aluno manda o PDF assinado de volta por DM:

1. **Só aceita `.pdf`** — não Word, não foto.
2. Confere se existe uma **assinatura digital embutida** no arquivo (checagem
   básica: procura os marcadores padrão `/Type /Sig` e `/ByteRange` no PDF).
   ⚠️ **Importante**: isso só confirma que existe um bloco de assinatura no
   arquivo. Não valida a cadeia de certificados, o carimbo de tempo, nem a
   integridade criptográfica da assinatura ICP-Brasil — isso exigiria uma
   biblioteca própria de validação de assinatura digital (ou consultar o
   verificador oficial do gov.br). Se quiser esse nível de garantia, é um
   próximo passo que dá pra construir separadamente.
3. Lê o valor do campo de formulário `data_assinatura` **diretamente do PDF**
   (não por regex em cima do texto extraído — isso importa: se algum editor
   "achatar" o formulário ao preencher, o texto acaba reordenado no arquivo e
   comparar por proximidade a "Data:" vira arriscado, porque o termo já tem
   outras datas soltas nele, como a vigência do projeto).
4. Se o campo não puder ser lido (formulário achatado por algum motivo), o bot
   **não tenta adivinhar** — encaminha o PDF pro canal do RH revisar manualmente
   e avisa o aluno que está aguardando confirmação.
5. Se o campo for lido: confere se é uma data válida e se é **exatamente o dia
   de hoje** no fuso `America/Sao_Paulo`. Se não bater, rejeita e explica o
   motivo — o aluno continua recebendo lembretes até corrigir e reenviar.
6. Só quando tudo bate é que o bot encaminha por e-mail e marca `concluido`.

## Validações no onboarding

Cada pergunta tem retry: se o formato estiver errado, o bot explica o formato
esperado e pergunta de novo (não avança pra próxima pergunta até acertar).

| Campo | Regra |
|---|---|
| CPF | `111.222.333-44` (com pontos e traço) |
| Data de nascimento | `dd/mm/aaaa`, e precisa ser uma data de calendário válida |
| RA | somente números |
| Endereço | `Rua/Avenida Nome, N° - Bairro` |

Não há checagem de dígito verificador do CPF, só formato — se quiser esse
rigor a mais, é uma função pequena pra adicionar em `validators.js`.

## Observações

- O link do WhatsApp é fixo (`WHATSAPP_LINK`), não usa a API oficial do WhatsApp
  Business — é só o link de convite do grupo enviado como texto.
- O e-mail usa SMTP simples (nodemailer). Com Gmail, precisa gerar uma "senha de
  app", a senha normal da conta não funciona com SMTP externo.
- A comparação de data usa o fuso de Cornélio Procópio (`America/Sao_Paulo`)
  como referência institucional, independente de onde o aluno estiver assinando.
- Vale testar o fluxo completo com um PDF real assinado pelo gov.br antes de
  colocar em produção, pra confirmar que o gov.br realmente preserva o campo de
  formulário (o comportamento pode variar). Se o gov.br achatar o formulário na
  prática, todo mundo vai cair no caminho de revisão manual do RH — não quebra
  o fluxo, só tira a automação total nesse ponto.
