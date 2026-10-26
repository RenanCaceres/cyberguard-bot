<div align="center">

<a href="https://github.com/RenanCaceres/cyberguard-bot">
  <img
    src="https://capsule-render.vercel.app/api?type=waving&height=220&section=header&text=CyberGuard%20Bot&fontSize=46&fontColor=ffffff&fontAlignY=38&desc=Automação%20Institucional%20%7C%20Ponto%20Eletrônico%20%7C%20Onboarding%20%7C%20IA&descAlignY=58&descSize=16&animation=fadeIn&color=0:0d0b1f,50:21134f,100:4c1d95"
    width="100%"
  />
</a>

<img
  src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=19&duration=3000&pause=1000&color=A78BFA&center=true&vCenter=true&width=800&lines=Sistema+Integrado+de+Gest%C3%A3o+e+Automa%C3%A7%C3%A3o+Discord;Ponto+Eletr%C3%B4nico+Inteligente+com+Notion+%26+Sheets;Onboarding+Automatizado+com+Assinatura+Gov.br;Declara%C3%A7%C3%A3o+de+Voluntariado+com+Assinatura+Digital;Atas+de+Reuni%C3%A3o+com+Transcri%C3%A7%C3%A3o+Gemini+AI;Sistema+Disciplinar+Completo+com+Contradit%C3%B3rio"
  alt="Typing SVG"
/>

<br>

<img src="https://img.shields.io/badge/UTFPR-Campus%20Cornélio%20Procópio-5B21B6?style=for-the-badge" />
<img src="https://img.shields.io/badge/Node.js-v18%2B-312E81?style=for-the-badge&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" />
<img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/Google%20Gemini-AI%20Transcription-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white" />
<img src="https://img.shields.io/badge/Notion-API%20Sync-000000?style=for-the-badge&logo=notion&logoColor=white" />

<br><br>

<a href="https://github.com/RenanCaceres">
  <img src="https://img.shields.io/badge/GitHub-RenanCaceres-181717?style=for-the-badge&logo=github" />
</a>
<a href="https://www.linkedin.com/in/renan-caceres/">
  <img src="https://img.shields.io/badge/LinkedIn-Renan%20Cáceres-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" />
</a>
<a href="mailto:renancanselmo@gmail.com">
  <img src="https://img.shields.io/badge/Email-renancanselmo%40gmail.com-6D28D9?style=for-the-badge&logo=gmail&logoColor=white" />
</a>

</div>

---

# 🛡️ Sobre o CyberGuard Bot

O **CyberGuard Bot** é uma plataforma abrangente de automação e governança para a iniciativa de cibersegurança e extensão universitária **CyberGuard UTFPR** (*Inteligência de Ameaças, Observatório de Segurança Cibernética e Educação Digital* - Câmpus Cornélio Procópio).

Projetado para operar de ponta a ponta no servidor do Discord, o bot unifica a gestão de recursos humanos, controle de presença e horas, conformidade jurídica com termos de voluntariado e declarações institucionais assinadas via Gov.br, aplicação transparente de processos disciplinares com amplo contraditório e geração autônoma de atas de reunião através de Inteligência Artificial Generativa.

---

# ⚡ Funcionalidades Principais

### 🕒 1. Sistema de Ponto Eletrônico v2 & Gestão de Horas
- **Painel Interativo (`/painel-ponto`)**: Interface com botões intuitivos para **Abrir ponto**, **Fechar ponto**, visualização da **Lista em serviço**, **Ranking**, **Resumo gerencial (Líderes)** e **Ajuste de ponto (RH)**.
- **Criação de Tarefas no Notion pelo Discord**: Permite que o integrante selecione demandas em aberto ou crie uma nova tarefa diretamente no Notion (`➕ Criar tarefa no Notion` via modal com título e progresso inicial) no momento de abrir ou vincular seu ponto.
- **Detecção Automática em Canal de Voz**: Conectar-se à sala de voz dedicada inicia o expediente automaticamente; desconectar-se conta com *grace period* de **60 segundos** contra quedas de conexão e encerra o registro solicitando o relato de entregas via DM.
- **Checagem Ativa de Ociosidade (1 em 1 hora)**: Disparo de DMs periódicas questionando se o membro segue em atividade (`Sim, continuo trabalhando` / `Não, já encerrei`). Clicar em `Não` abre imediatamente o modal de relato para encerramento; ignorar 3 avisos consecutivos encerra o ponto automaticamente por inatividade (além do teto de segurança de **8 horas**).
- **Ajuste de Horários e Importação pelo RH (`/ajustar-ponto`, `/importar-horas`)**: Painel e comandos restritos ao RH para corrigir horários (com travas de validação de até 24h, preservação do horário original e notificação imediata por DM) e importar saldos legados sem inflar o ranking semanal.
- **Integração em Nuvem Multiplataforma**:
  - **Notion API (Tarefas & Membros)**: Atualização automática de status (`Em andamento` / `Concluído`), barra de progresso numérica, comentários de sessão e sincronização da base histórica de membros (`Ativo`, `Inativo`, `Expulso`).
  - **Google Sheets API (3 Abas)**: Sincronização serializada com as abas `Raw Logs do Bot` (logs brutos com upsert), `Painel Transparente` (consolidado geral) e `Painel Transparente (Bot)` (exclusivo de horas do bot), utilizando resolução automática do **Nome Completo Real** do integrante.
  - **Histórico KoV**: Módulo integrado para backfill retroativo e captura em tempo real de registros do bot legado KoV Ponto.
- **Ranking Visual Ilustrado com Pódio**: Geração dinâmica de banners com `@napi-rs/canvas` destacando Top 3 em pódio estilizado com coroa, avatares, barras proporcionais e fechamento automático na virada de semana (segunda-feira 00:00).

---

### 📝 2. Onboarding Automatizado, Privacidade (LGPD) & Assinatura Digital Gov.br
- **Termo de Ciência e Privacidade (LGPD — Lei nº 13.709/2018)**: Etapa inicial obrigatória na DM com aceite explícito (`Concordo` / `Não concordo`), informando que os dados coletados são utilizados **exclusivamente para fins de registros e acadêmicos** junto ao projeto CyberGuard e à UTFPR (vedando qualquer outro uso), com registro da data/hora do aceite (`termo_ciencia_aceito_em`).
- **Criptografia de Dados em Repouso (`AES-256-GCM`)**: Campos sensíveis (`cpf`, `data_nascimento`, `nacionalidade`, `endereco`, `cidade`, `estado` e `telefone`) são criptografados com chave dedicada de 256 bits e IV aleatório antes de serem persistidos no PostgreSQL, permanecendo arquivados de forma segura para histórico institucional mesmo após eventual saída ou desligamento.
- **Coleta Guiada via DM**: Formulário interativo de 13 etapas com validação estrita por expressões regulares (CPF com máscara, data de nascimento com validação de calendário real, RA numérico, endereço padronizado, contatos e seleção de área de interesse) e menu de retificação campo a campo antes do envio.
- **Deliberação do RH, Mascaramento e Sanitização**: Cards no canal privado do RH com CPF mascarado (`***.222.333-**`), alerta automático caso o candidato já possua passagens anteriores na tabela `historico_recusas` e sanitização automática do card após a decisão do RH (ocultando endereço, telefone e CPF do histórico do chat).
- **Geração Dinâmica de Documentos**:
  - Preenchimento automático do modelo oficial `.docx` via `docxtemplater`.
  - Conversão headless de `.docx` para `.pdf` via LibreOffice (`soffice`).
  - Localização dinâmica de coordenadas (`pdfjs-dist`) e injeção de campo AcroForm preenchível (`data_assinatura` via `pdf-lib`).
- **Validação Criptográfica ICP-Brasil / Gov.br 100% Assertiva**:
  - Inspeção combinada (`pdf-lib` + `pdfjs-dist`) de integridade criptográfica (`/Type /Sig`, `/ByteRange`, `/Contents`) e posição geométrica do widget exatamente sobre a linha `"Voluntário(a)"` da tabela `"ACEITE E CONCORDÂNCIA"` (filtrando pela coluna esquerda `x ∈ [50, 120]` e seção de aceite para eliminar falsos positivos com o texto corrido).
  - Extração estrita do campo `"Data:"` ao lado de `"Local: Cornélio Procópio"` (via AcroForm `data_assinatura`, anotações de texto ou linha horizontal achatada), sem confundir com o carimbo do Gov.br caso o aluno tenha esquecido de preencher a data no documento, validando calendário real, janela de **90 dias** e bloqueio de datas futuras.
  - **Diagnóstico Completo e Reprovação Direta na DM**: Avalia simultaneamente assinatura e data; se houver qualquer erro (data em branco, assinatura na página/linha errada ou PDF impresso sem assinatura criptográfica), o bot **reprova automaticamente na DM do aluno** listando todos os ajustes necessários para reenvio imediato, sem sobrecarregar o RH com revisões manuais (mantendo o fallback `revisao_manual` apenas para anomalias técnicas de PDF).
  - **Arquivamento em Nuvem e Local**: O PDF validado é copiado localmente para subpastas setoriais (`docs/Termos-Voluntarios-Assinados/<Área>`) e sincronizado automaticamente no **Google Drive** em subpastas dinâmicas por área (`HackingEtico`, `Design`, `HardwareHacking`, `Recursos Humanos`, `SocialMedia`, `Líderes`, `Observatorio`), além de despacho SMTP para a coordenação com cópias (`CC`) e cron diário (`09:00`) de lembretes com opção de silenciamento manual pelo RH.
- **Trilha de Entusiastas da Comunidade (Sem Compromisso)**: Monitoramento inteligente de convites via `GatewayIntentBits.GuildInvites`. Usuários que ingressam por links gerados em canais ou categorias de "Entusiastas" (ou códigos definidos em `INVITE_ENTUSIASTA_CODES`) recebem imediatamente o cargo **`Entusiasta`** e boas-vindas na DM, com o onboarding formal e burocrático de voluntariado totalmente dispensado.

---

### 📜 3. Emissão de Declaração de Voluntariado & Assinatura Digital Gov.br
- **Solicitação Autônoma no Discord (`/declaracao solicitar`)**: O acadêmico solicita sua declaração de participação com um único comando. O bot valida o cadastro (Nome Completo, RA, Curso e Data de Início), impede solicitações duplicadas em aberto e gera um protocolo único rastreável (`#DECL-<RA>-<4 dígitos>`).
- **Cálculo Automático de Carga Horária (4h vs. 10h)**:
  - **Membros Regulares (`4 horas semanais`)**: atribuída automaticamente aos integrantes das áreas técnicas e operacionais.
  - **Líderes e Presidência (`10 horas semanais`)**: atribuída automaticamente a quem possui o cargo de liderança (`Líderes`) ou Presidência no servidor.
- **Geração Dinâmica e Tramitação por E-mail (SMTP)**: O bot preenche o template institucional da UTFPR com a data por extenso, converte para PDF via LibreOffice e envia automaticamente ao Coordenador do Projeto (**Prof. André Luiz Przybysz**).
- **Monitoramento e Captura Autônoma (IMAP)**: Um serviço em segundo plano checa a caixa de entrada a cada 1 minuto, localiza a resposta do coordenador pelo protocolo `#DECL-...`, valida o cabeçalho binário `%PDF` do anexo assinado pelo Gov.br (Lei Federal nº 14.063/2020), arquiva em `DeclaracoesAssinadas/` e faz o upload automático para a pasta de declarações no **Google Drive**.
- **Entrega Imediata na DM e Cópia ao RH**: O PDF assinado é entregue diretamente na DM do estudante e uma cópia comprobatória é postada no canal do RH.
- **Acompanhamento com Sincronização em Tempo Real (`/declaracao status`)**: Lista as últimas 10 solicitações do aluno (status, data de início, carga horária de 4h/10h e RA) e força uma varredura IMAP imediata na caixa de entrada.

---

### ⚖️ 4. Sistema Disciplinar & Advertências com Contraditório
- **Gestão de Infrações (`/advertir`, `/painel-advertencias`)**: Abertura de advertências categorizadas por severidade (*Leve*, *Média*, *Grave*), com catálogo visual paginado de membros, descrição e evidências anexadas.
- **Fila de Advertências Automática (`na_fila`) e Revalidação Dinâmica**: Caso o membro já possua uma advertência pendente de ciência/análise, novas advertências entram automaticamente na fila e são disparadas sozinhas assim que a anterior é concluída (revalidando dinamicamente se eventual reincidência segue válida ou se deve ser revertida caso a anterior tenha sido perdoada/cancelada).
- **Progressão e Reincidência Automática**: Agravamento automático da categoria em caso de reincidência na mesma severidade (*Leve -> Média*, *Média -> Grave*, *Grave -> Votação de Expulsão*).
- **Garantia de Contraditório e Ampla Defesa**:
  - Prazo regulamentar de **7 dias** para manifestação (`Ciente` ou `Não concordo` com justificativa de até 1.500 caracteres), reiniciando o prazo a cada rodada de `Contra-Argumentar`.
  - Expiração automática de registros ativos após **90 dias** de vigência (`06:00` cron).
- **Consulta Transparente (`/minhas-advertencias`, `/advertencias`)**: Histórico individual privado para membros e visão geral de auditoria para a liderança.

---

### 🎙️ 5. Atas de Reunião com Inteligência Artificial (Gemini)
- **Gravação por Falante Individual e Controle de Acesso (`/reuniao iniciar`, `/reuniao finalizar`)**: Restrito à Liderança, RH, Presidência e Administradores. Captura streams Opus individuais por participante em chamadas de voz (corte após 1s de silêncio e filtro mínimo de 0,3s contra ruídos).
- **Aviso Ativo e Direito de Oposição / Opt-out (LGPD)**: Ao iniciar a gravação (ou quando um membro ingressa na call em andamento), o bot publica um alerta no chat do canal de voz com o botão **`🔇 Não gravar minha voz (Opt-out)`**, permitindo que qualquer participante desative imediatamente a captura da própria voz na sessão.
- **Otimização de Áudio e Transcrição via Gemini 2.5 Flash**: Downsampling automático de 48kHz Estéreo para **16kHz Mono 16-bit**, concatenação em lotes com espaçamento de 500ms de silêncio, backoff exponencial contra rate limits e síntese estruturada (Resumo, Decisões, Itens de ação e Pontos discutidos).
- **Retenção Inteligente de Backups e Reprocessamento (`/reuniao historico`, `/reuniao reprocessar`)**: Caso a cota diária da API seja atingida, os áudios e o `manifest.json` são preservados por **7 dias** (com limpeza diária automática às `04:00`), permitindo reprocessar e atualizar a ata em PDF assim que a cota normalizar.

---

### 👥 6. Hierarquia Visual, Cartões & Governança de Saídas
- **Organograma Dinâmico Renderizado (`2400px`)**: Geração de imagem gráfica com `@napi-rs/canvas` refletindo a estrutura viva do servidor (Presidente, Líderes destacados com estrela dourada e membros dos 5 times: *Social Media & Copy*, *Recursos Humanos*, *Design*, *Hardware Hacking* e *Hacking Ético* — unificando Red Team e Blue Team), com conectores ortogonais que não cruzam sobre os cards.
- **Cartões de Boas-Vindas e Despedida**: Geração automática de cards ilustrados (`1000x320px`) em eventos de aprovação e saída.
- **Reconciliação de Saídas e Integração Notion**: Detecção de saídas ocorridas até mesmo com o bot offline (`catchUp.js`), atualizando o status do integrante no banco de Membros do Notion exclusivamente para **`Inativo`** (`Ativo` / `Inativo`) e revogando imediatamente o acesso do e-mail no Workspace do Notion.

---

### 🏢 7. Gestão Integrada do Notion Workspace (API v3 Interna) & Portal LGPD (`/meus-dados`)
- **Provisionamento e Convite Automático**: Ao aprovar um voluntário no onboarding e validar seu termo assinado via Gov.br, o bot resolve sua conta por e-mail (ou provisiona o usuário via `createEmailUser`) e o adiciona como **Membro oficial** no Workspace do Notion (`addMembersToSpace`).
- **Revogação Instantânea de Acesso**: Ao detectar a saída ou expulsão de um integrante (`guildMemberRemove`), o bot remove automaticamente a conta do espaço de trabalho do Notion (`removeUsersFromSpace`), garantindo a segurança de dados e impedindo que ex-integrantes mantenham acesso a documentos internos e tarefas.
- **Portal de Direitos do Titular (`/meus-dados`)**: Comando 100% efêmero (Art. 18 da LGPD) que permite a qualquer integrante consultar seus dados armazenados (`/meus-dados visualizar`), retificar dados de contato, endereço e curso/período via Modal (`/meus-dados atualizar`) ou abrir solicitações de privacidade ao RH (`/meus-dados privacidade`).
- **Governança e Estrutura de Perfis**:
  - **Coordenação Docente (Permanente)**: Prof. Dr. André Luiz Przybysz e Profa. Dra. Natássya Barlate Floro da Silva atuam com assento permanente como professores orientadores do projeto.
  - **Administração / Workspace Owners**: Presidência e Tech Lead (Renan Cáceres Anselmo e André Queiroz) gerenciam a infraestrutura e os espaços de equipe.
  - **Membros Acadêmicos**: Integrantes ativos distribuídos entre as 5 frentes operacionais (Social Media & Copy, Recursos Humanos, Design, Hardware Hacking e Hacking Ético), com controle estrito de conformidade documental e revogação automática de contas desligadas.

---

# 🏗️ Arquitetura do Sistema

```mermaid
flowchart TD
    subgraph Discord [" Discord Workspace "]
        User[Membro / Colaborador]
        Voice[Canal de Voz Dedicado]
        RH[Diretoria de RH / Líderes]
    end

    subgraph Core [" CyberGuard Bot Core (Node.js) "]
        Onboarding[Onboarding, Validação Gov.br & Revisão RH]
        Declaracao[Declarações 4h/10h & IMAP Worker]
        Ponto[Ponto Eletrônico v2, Voz & Idle Checker]
        Disciplinar[Advertências, Fila & Contraditório]
        Reuniao[Áudio Recorder 16kHz & Gemini Engine]
        CanvasRender[Renderizador Gráfico Canvas]
    end

    subgraph Integracoes [" Serviços & Nuvem "]
        Postgres[(PostgreSQL - 12 Tabelas)]
        Notion[(Notion API - Tarefas & Membros)]
        Sheets[(Google Sheets API - 3 Abas)]
        Drive[(Google Drive API - Armazenamento de PDFs)]
        Gemini[(Google Gemini 2.5 Flash)]
        SMTP[(Serviço de E-mail SMTP)]
        IMAP[(Servidor IMAP / Leitura)]
        LibreOffice[LibreOffice Headless]
    end

    User -->|DMs, Modais & Slash Commands| Core
    Voice -->|Conexão / Desconexão / Voz| Ponto
    Voice -->|Streams Opus por Falante| Reuniao
    RH -->|Painéis, Aprovações & Ajustes| Core

    Onboarding --> LibreOffice
    Onboarding --> SMTP
    Onboarding --> Sheets
    Onboarding --> Drive
    Onboarding --> Notion
    Declaracao --> LibreOffice
    Declaracao --> SMTP
    Declaracao --> IMAP
    Declaracao --> Drive
    Declaracao --> Postgres
    Ponto --> Notion
    Ponto --> Sheets
    Ponto --> CanvasRender
    Disciplinar --> Postgres
    Disciplinar --> CanvasRender
    Reuniao --> Gemini
    Reuniao --> Postgres
    Core --> Postgres
```

---

# 🛠️ Tech Stack

<div align="center">

### 💻 Tecnologias & Bibliotecas Centrais

<p align="center">
  <img src="https://skillicons.dev/icons?i=nodejs,js,postgres,linux,git,github,docker,postman" />
</p>

</div>

| Camada | Ferramenta / Biblioteca | Descrição |
| :--- | :--- | :--- |
| **Runtime & Base** | `Node.js (v18+)` | Ambiente de execução assíncrono |
| **Discord Engine** | `discord.js (v14)`, `@discordjs/voice`, `prism-media` | Gateway de eventos, componentes interativos, modais e captura Opus |
| **Banco de Dados** | `PostgreSQL` & `pg` | Persistência relacional de 12 tabelas com índices parciais únicos |
| **Inteligência Artificial** | `@google/generative-ai` | Transcrição em lotes e estruturação de atas com Gemini 2.5 Flash |
| **Integração em Nuvem** | `google-spreadsheet`, `google-auth-library`, `Notion API` | Sincronização contínua com Google Sheets (3 abas), Google Drive API (termos e declarações) e Notion |
| **Processamento de Docs** | `docxtemplater`, `pizzip`, `pdf-lib`, `pdfjs-dist` | Automação de DOCX/PDF, injeção de AcroForms e validação de objetos `/Sig` |
| **Renderização Gráfica** | `@napi-rs/canvas` | Criação server-side de rankings, organogramas, catálogos e cartões |
| **Serviços de Sistema** | `node-cron`, `nodemailer`, `imapflow`, `LibreOffice` | Agendamentos periódicos, disparo SMTP, escuta IMAP e conversão PDF |

---

# 📋 Slash Commands & Painéis

| Comando | Acesso | Descrição |
| :--- | :--- | :--- |
| `/declaracao solicitar` | Qualquer Membro | Solicita emissão da declaração oficial (4h membro / 10h líder) com protocolo `#DECL-` |
| `/declaracao status` | Qualquer Membro | Consulta o andamento das últimas 10 declarações e sincroniza respostas IMAP na hora |
| `/painel-ponto` | Administrador | Publica o painel interativo de registro de ponto, criação de tarefas Notion e gestão |
| `/ajustar-ponto` | Exclusivo RH | Permite ajustar horários de pontos fechados (máx. 24h) com auditoria e aviso em DM |
| `/importar-horas` | Exclusivo RH | Importa ou substitui saldos consolidados de membros sem inflar o ranking semanal |
| `/painel-advertencias` | Liderança & RH | Publica o painel administrativo para abertura, fila e gestão do processo disciplinar |
| `/advertir` | Liderança & RH | Registra uma advertência formal (*Leve*, *Média* ou *Grave*) contra um membro |
| `/minhas-advertencias` | Qualquer Membro | Consulta privada (ephemeral) do histórico de advertências do próprio usuário |
| `/advertencias` | Liderança & RH | Exibe o histórico geral ou filtrado por membro de ocorrências disciplinares (incluindo fila) |
| `/meus-dados visualizar` | Qualquer Membro | Exibe de forma 100% privada (efêmera) todos os dados cadastrais armazenados pelo bot (LGPD Art. 18) |
| `/meus-dados atualizar` | Qualquer Membro | Permite retificar dados de contato, endereço, curso e período via Modal interativo |
| `/meus-dados privacidade` | Qualquer Membro | Exibe o Termo de Ciência LGPD e permite enviar solicitações formais de privacidade ao RH |
| `/reuniao iniciar` | Liderança, RH & Admin | Inicia a gravação de áudio individualizada por participante na sala de voz com botão de Opt-out |
| `/reuniao finalizar` | Liderança, RH & Admin | Encerra a gravação, transcreve em lotes via Gemini AI e gera a Ata formal em PDF |
| `/reuniao historico` | Qualquer Membro | Lista as últimas atas de reunião registradas no servidor (1 a 25 registros) |
| `/reuniao reprocessar` | Liderança, RH & Admin | Reprocessa o backup de áudio de uma ata (retido por 7 dias) em caso de falha de cota |

---

# ⚙️ Guia de Variáveis de Ambiente (`.env`)

| Variável | Exemplo | Descrição |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | `MTE...` | Token do bot gerado no Discord Developer Portal |
| `DISCORD_CLIENT_ID` | `123456789...` | Application Client ID do bot |
| `GUILD_ID` | `987654321...` | ID do servidor do Discord |
| `DATABASE_URL` | `postgresql://usr:pwd@localhost:5432/cyberguard_bot` | URL de conexão com o PostgreSQL |
| `CHANNEL_RH_ID` | `154...` | ID do canal privado para aprovações, revisões de termos e alertas do RH |
| `CHANNEL_BOASVINDAS_ID` | `150...` | ID do canal para postagem dos cartões gráficos de entrada e saída |
| `HIERARQUIA_CHANNEL_ID` | `150...` | ID do canal onde o organograma visual (`hierarquia.png`) é mantido |
| `PRESIDENTE_ID` | `3717...` | Discord ID do Presidente do projeto (topo da hierarquia e carga 10h) |
| `ROLE_RH_NOME` | `Recursos Humanos` | Nome do cargo de RH com privilégios de aprovação e revisão de termos |
| `ROLE_LIDER_NOME` | `Líderes` | Nome do cargo de liderança (destaque na hierarquia e declaração de 10h) |
| `ROLE_APROVADO_NOME` | `Membro CyberGuard` | Nome do cargo unificado atribuído aos voluntários aprovados |
| `ROLE_ENTUSIASTA_NOME` | `Entusiasta` | Nome do cargo atribuído automaticamente aos membros sem compromisso formal |
| `INVITE_ENTUSIASTA_CODES` | `xyz,abc...` | (Opcional) Lista de códigos de convite específicos de entusiastas |
| `ROLE_HACKING_ETICO_ID` | `150...` | ID do cargo unificado de Hacking Ético |
| `AREAS_INTERESSE` | `Social Media & Copy,Recursos Humanos,Design,Hardware Hacking,Hacking Ético` | Lista de áreas disponíveis no onboarding |
| `PONTO_VOICE_CHANNEL_ID`| `151...` | ID da sala de voz monitorada para abertura/fechamento automático de ponto |
| `PONTO_ROLE_RH_ID` | `154...` | ID do cargo de RH autorizado a ajustar ponto e importar horas |
| `PONTO_ROLE_LIDERES_ID` | `154...` | ID do cargo de Líderes autorizado a consultar o Resumo e Histórico |
| `PONTO_LOG_CHANNEL_ID` | `154...` | ID do canal de logs de auditoria do ponto eletrônico |
| `PONTO_RANKING_CHANNEL_ID`| `154...` | ID do canal onde o Ranking Semanal ao vivo é atualizado |
| `PONTO_SHEET_ID` | `1AbC...` | ID da planilha do Google para sincronização das 3 abas de horas |
| `NOTION_TOKEN` | `secret_...` | Token de integração da API pública oficial do Notion |
| `NOTION_TOKEN_V2` | `v03%3AeyJhbGciOi...` | Cookie de sessão com permissão de Workspace Owner para gestão de membros via API v3 |
| `NOTION_SPACE_ID` | `00000000-0000-0000-...` | ID do Workspace CyberGuard no Notion |
| `NOTION_ACTIVE_USER_ID` | `00000000-0000-0000-...` | ID do usuário administrador executor das requisições v3 |
| `NOTION_DATA_SOURCE_ID` | `00000...` | ID do Data Source de tarefas no Notion (API `2025-09-03`) |
| `NOTION_MEMBROS_DB_ID` | `00000...` | ID do Database histórico de membros no Notion (`Ativo`/`Inativo`) |
| `DATA_ENCRYPTION_KEY` | `a1b2c3... (64 hex)` | Chave de 256 bits para criptografia `AES-256-GCM` de dados sensíveis no banco |
| `GEMINI_API_KEY` | `AIza...` | Chave de API do Google Gemini para transcrição de atas |
| `CANAL_ADVERTENCIAS_ID` | `154...` | Canal restrito onde ocorrem as notificações e deliberações disciplinares |
| `AUTORES_ADVERTENCIA_IDS`| `3717...,7366...` | IDs dos líderes autorizados a emitir e julgar advertências |
| `EMAIL_TERMOS_DESTINATARIO`| `coordenacao@utfpr.edu.br` | Destinatário principal dos termos de voluntariado assinados |
| `EMAIL_TERMOS_CC` | `lider1@alunos.utfpr.edu.br,...` | Lista de e-mails em cópia (CC) no envio dos termos assinados |
| `EMAIL_PROFESSOR_COORDENADOR` | `coordenador@utfpr.edu.br` | E-mail do professor coordenador que assina as declarações |
| `GOOGLE_DRIVE_TERMOS_FOLDER_ID` | `1PastaTermosId...` | ID da pasta raiz no Google Drive para termos de voluntariado assinados |
| `GOOGLE_DRIVE_DECLARACOES_FOLDER_ID` | `1PastaDeclaracoesId...` | ID da pasta no Google Drive para declarações de voluntariado assinadas |
| `IMAP_HOST` / `IMAP_PORT` | `imap.gmail.com` / `993` | Servidor e porta IMAP TLS para leitura autônoma das declarações assinadas |
| `IMAP_USER` / `IMAP_PASS` | `bot@utfpr...`, `app-pass` | Credenciais IMAP/SMTP da conta institucional do bot |

---

# 📄 Documentação Completa & Manuais Operacionais em PDF

A pasta `docs/manuais/` (e `docs/`) conta com a documentação técnica completa do sistema e os manuais operacionais ilustrados com fluxogramas gerados automaticamente via `node scripts/gerarManuais.js`:

- 📘 **`Documentacao_Completa_CyberGuard_Bot.pdf`** *(também em `docs/Documentacao_Completa_CyberGuard_Bot.pdf`)*: Especificação técnica e operacional completa de todos os módulos, regras de negócio, expressões regulares, validações, esquemas das 12 tabelas SQL, máquinas de estado, permissões, crons e integrações do bot.
- 📜 **`Manual_Membro_Declaracao_Voluntariado.pdf`**: Guia atualizado para membros e líderes sobre emissão de declarações de voluntariado (regra automática de **4h semanais** para membros e **10h semanais** para líderes), fluxo de assinatura digital no Gov.br, sincronização instantânea (`/declaracao status`) e entrega por DM.
- 🕒 **`Manual_Membro_Ponto.pdf`**: Guia para membros sobre o ponto manual, criação de tarefas no Notion pelo Discord, registro automático por voz (com tolerância de 60s), confirmação periódica de atividade (1h) e ranking.
- 📕 **`Manual_Membro_Advertencias.pdf`**: Direitos, prazos de 7 e 90 dias e fluxo de contraditório para membros advertidos.
- 📗 **`Manual_Lider_RH_Ponto.pdf`**: Manual administrativo de ajuste de ponto pelo RH, importação de horas, painel de resumo de líderes e auditoria nas 3 abas da planilha.
- 📙 **`Manual_Lider_Advertencias_Atualizado.pdf`**: Procedimentos operacionais para abertura de advertências, fila automática, reincidência e votação de expulsão.

---

# 👨‍💻 Autor

<div align="center">

Desenvolvido por **Renan Cáceres**  
*Estudante de Análise e Desenvolvimento de Sistemas (UTFPR) \| Desenvolvedor de Software*

<a href="https://github.com/RenanCaceres">
  <img src="https://img.shields.io/badge/GitHub-RenanCaceres-181717?style=for-the-badge&logo=github" />
</a>
<a href="https://www.linkedin.com/in/renan-caceres/">
  <img src="https://img.shields.io/badge/LinkedIn-Renan%20Cáceres-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" />
</a>
<a href="mailto:renancanselmo@gmail.com">
  <img src="https://img.shields.io/badge/Email-renancanselmo%40gmail.com-6D28D9?style=for-the-badge&logo=gmail&logoColor=white" />
</a>

</div>

---

# 🔒 Licença & Direitos de Uso

Este projeto e todo o seu código-fonte são de autoria e propriedade intelectual única e exclusiva de **Renan Cáceres**.

> [!IMPORTANT]
> **Código Proprietário / Sem Licença Aberta (Todos os direitos reservados)**  
> Não é permitida a cópia, clonagem para fins de redistribuição, reprodução, modificação ou qualquer forma de uso comercial ou não autorizado deste código-fonte sem a autorização prévia e expressa por escrito do autor.
