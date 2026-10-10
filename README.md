<div align="center">

<a href="https://github.com/RenanCaceres/cyberguard-bot">
  <img
    src="https://capsule-render.vercel.app/api?type=waving&height=220&section=header&text=CyberGuard%20Bot&fontSize=46&fontColor=ffffff&fontAlignY=38&desc=Automação%20Institucional%20%7C%20Ponto%20Eletrônico%20%7C%20Onboarding%20%7C%20IA&descAlignY=58&descSize=16&animation=fadeIn&color=0:0d0b1f,50:21134f,100:4c1d95"
    width="100%"
  />
</a>

<img
  src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=19&duration=3000&pause=1000&color=A78BFA&center=true&vCenter=true&width=800&lines=Sistema+Integrado+de+Gest%C3%A3o+e+Automa%C3%A7%C3%A3o+Discord;Ponto+Eletr%C3%B4nico+Inteligente+com+Notion+%26+Sheets;Onboarding+Automatizado+com+Assinatura+Gov.br;Atas+de+Reuni%C3%A3o+com+Transcri%C3%A7%C3%A3o+Gemini+AI;Sistema+Disciplinar+Completo+com+Contradit%C3%B3rio"
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

Projetado para operar de ponta a ponta no servidor do Discord, o bot unifica a gestão de recursos humanos, controle de presença e horas, conformidade jurídica com termos de voluntariado institucional, aplicação transparente de processos disciplinares e geração autônoma de atas de reunião através de Inteligência Artificial Generativa.

---

# ⚡ Funcionalidades Principais

### 🕒 1. Sistema de Ponto Eletrônico v2 & Gestão de Horas
- **Painel Interativo (`/painel-ponto`)**: Interface com botões intuitivos para **Entrada**, **Saída**, visualização de **Meus Registros** e acesso rápido às ferramentas de gestão.
- **Detecção Automática em Canal de Voz**: Conectar-se à sala de voz dedicada inicia o expediente automaticamente; desconectar-se encerra o registro calculando com precisão o tempo trabalhado.
- **Checagem Ativa de Ociosidade**: Disparo de DMs periódicas (a cada 1 hora) questionando se o membro segue em atividade (`Sim` / `Não`). No 3º aviso consecutivo sem resposta (ou ao clicar em `Não`), o ponto é encerrado automaticamente com aviso de segurança.
- **Ajuste de Horários pelo RH (`/ajustar-ponto`)**: Painel restrito à diretoria de RH para selecionar membro, data e corrigir horários através de modais nativos, com trilha de auditoria e notificação imediata enviada por DM ao colaborador.
- **Integração em Nuvem Multiplataforma**:
  - **Notion API**: Sincronização em tempo real das horas computadas e progresso das tarefas de cada integrante.
  - **Google Sheets API**: Espelhamento e persistência de logs brutos de auditoria em planilhas institucionais.
  - **Histórico KoV**: Módulo integrado para ler histórico legado de canais e sincronizar centenas de registros retroativos.
- **Ranking Visual Ilustrado com Pódio**: Geração dinâmica de banners com `@napi-rs/canvas` destacando Top 3 em pódio 3D estilizado com avatares, barras de progresso proporcionais, horas computadas e classificação geral.

---

### 📝 2. Onboarding Automatizado & Assinatura Gov.br
- **Coleta Guiada via DM**: Formulário interativo com validação estrita campo a campo (CPF com máscara, data de nascimento, RA, curso, endereço completo, contatos e seleção de área de interesse).
- **Aprovação do RH**: Cards interativos no canal privado do RH com botões de aprovação/rejeição (incluindo captura obrigatória de justificativa).
- **Geração Dinâmica de Documentos**:
  - Injeção automática dos dados cadastrais no modelo oficial `.docx` via `docxtemplater`.
  - Conversão headless de `.docx` para `.pdf` via LibreOffice (`soffice`).
  - Posicionamento dinâmico e injeção de campo AcroForm preenchível (`pdf-lib`) para a data de assinatura.
- **Validação de Assinatura Digital ICP-Brasil / Gov.br**:
  - Inspeção de integridade do arquivo devolvido por DM (`/Type /Sig`, `/ByteRange`).
  - Extração do valor da data preenchida e conferência com o fuso institucional (`America/Sao_Paulo`).
  - Encaminhamento automático do termo validado para arquivamento via e-mail corporativo (SMTP).
  - Cron diário (`CRON_LEMBRETE`) para cobrança de prazos e notificação ao RH de pendências.

---

### ⚖️ 3. Sistema Disciplinar & Advertências com Contraditório
- **Gestão de Infrações (`/advertir`, `/painel-advertencias`)**: Abertura de advertências categorizadas por severidade (*Leve*, *Média*, *Grave*), com descrição, evidências anexadas e histórico associado.
- **Fila de Advertências Automática**: Caso o membro já possua uma advertência aguardando ciência/análise, novas advertências aplicadas entram automaticamente na **fila (`na_fila`)** e são disparadas sozinhas assim que a anterior é concluída (com opção de gerenciamento manual pelo painel `⏳ Fila de Advertências`).
- **Progressão e Reincidência Automática**: Cálculo automático do agravamento da categoria em caso de reincidência (inclusive validando advertências em andamento/fila e revalidando antes do disparo).
- **Garantia de Contraditório e Ampla Defesa**:
  - Envio imediato da notificação ao membro com formulário para manifestação de justificativa/defesa no prazo regulamentar de **7 dias**.
  - Expiração automática de registros ativos após **90 dias** de conduta regular.
- **Consulta Transparente (`/minhas-advertencias`)**: Permite que qualquer membro consulte o status, justificativas e prazos de suas próprias advertências de forma privada.

---

### 🎙️ 4. Atas de Reunião com Inteligência Artificial (Gemini)
- **Gravação de Áudio Integrada (`/reuniao`)**: Captura áudio de salas de voz via Discord/OBS com suporte a múltiplos participantes simultâneos.
- **Transcrição e Resumo via Gemini AI**: Processamento do áudio com a API do Google Gemini (`gemini-2.5-flash`), sintetizando:
  - Resumo executivo da pauta.
  - Principais deliberações e discussões levantadas.
  - Matriz de decisões e *action items* com responsáveis atribuídos.
- **Exportação em PDF e Histórico SQL**: Geração de documento formal de Ata em PDF e arquivamento indexado no PostgreSQL.

---

### 👥 5. Hierarquia Visual & Identidade do Servidor
- **Organograma Dinâmico Renderizado**: Geração de imagem gráfica com `@napi-rs/canvas` refletindo a estrutura viva do servidor (Presidente, Purple Team, Líderes e membros dos times setoriais).
- **Cartões de Boas-Vindas e Despedida**: Geração automática de cards ilustrados com avatar e nome dos membros em eventos de entrada e saída.

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
        Onboarding[Onboarding & Gov.br Engine]
        Ponto[Ponto Eletrônico v2 & Idle Checker]
        Disciplinar[Módulo de Advertências & Contraditório]
        Reuniao[Áudio Recorder & Gemini Engine]
        CanvasRender[Renderizador Gráfico Canvas]
    end

    subgraph Integracoes [" Serviços & Nuvem "]
        Postgres[(PostgreSQL)]
        Notion[(Notion API)]
        Sheets[(Google Sheets API)]
        Gemini[(Google Gemini AI)]
        SMTP[(Serviço de E-mail SMTP)]
        LibreOffice[LibreOffice Headless]
    end

    User -->|DMs & Slash Commands| Core
    Voice -->|Conexão / Desconexão| Ponto
    RH -->|Painéis de Controle & Modais| Core

    Onboarding --> LibreOffice
    Onboarding --> SMTP
    Onboarding --> Sheets
    Ponto --> Notion
    Ponto --> Sheets
    Ponto --> CanvasRender
    Disciplinar --> Postgres
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
| **Discord Engine** | `discord.js (v14)` & `@discordjs/voice` | Gateway de eventos, componentes interativos, modais e voz |
| **Banco de Dados** | `PostgreSQL` & `pg` | Armazenamento relacional de membros, pontos, advertências e atas |
| **Inteligência Artificial** | `@google/generative-ai` | Transcrição e estruturação inteligente de atas com Gemini 2.5 |
| **Integração em Nuvem** | `Google APIs` & `Notion Client` | Sincronização contínua com Google Sheets e banco de dados do Notion |
| **Processamento de Docs** | `docxtemplater`, `pizzip`, `pdf-lib` | Automação e manipulação de arquivos DOCX e PDF com AcroForms |
| **Renderização Gráfica** | `@napi-rs/canvas` | Criação server-side de rankings, organogramas e cartões comemorativos |
| **Serviços de Sistema** | `node-cron`, `nodemailer`, `LibreOffice` | Agendamentos periódicos, disparo de e-mails corporativos e conversão PDF |

---

# 📋 Slash Commands & Painéis

| Comando | Acesso | Descrição |
| :--- | :--- | :--- |
| `/painel-ponto` | Membros & RH | Abre o painel interativo de registro de ponto e consulta de horas |
| `/ajustar-ponto` | Exclusivo RH | Permite ajustar horários de registros passados com notificação em DM |
| `/importar-horas` | Exclusivo RH | Importa e recalcula históricos consolidados de membros |
| `/painel-advertencias` | Liderança & RH | Painel administrativo para emissão e gestão do processo disciplinar |
| `/advertir` | Liderança & RH | Registra uma advertência formal contra um membro |
| `/minhas-advertencias` | Qualquer Membro | Consulta privada via DM/Ephemerous do histórico de advertências do usuário |
| `/advertencias` | Liderança & RH | Exibe o resumo geral de ocorrências disciplinares ativas |
| `/reuniao` | Líderes de Reunião | Inicia a gravação e transcrição inteligente de reuniões em canal de voz |

---

# 🚀 Instalação e Execução

### 1. Pré-requisitos
- **Node.js** v18 ou superior instalado.
- Servidor **PostgreSQL** ativo.
- **LibreOffice** (para conversão headless de `.docx` para `.pdf`):
  ```bash
  sudo apt update && sudo apt install -y libreoffice --no-install-recommends
  ```

### 2. Clonar o Repositório e Instalar Dependências
```bash
git clone https://github.com/RenanCaceres/cyberguard-bot.git
cd cyberguard-bot
npm install
```

### 3. Configurar as Variáveis de Ambiente
Copie o modelo de variáveis de ambiente e preencha as configurações do seu servidor e integrações:
```bash
cp .env.example .env
nano .env # ou seu editor preferido
```

### 4. Criar o Banco de Dados
```bash
sudo -u postgres createdb cyberguard_bot
```
> O bot inicializa as tabelas e schemas automaticamente no primeiro start (`db.initSchema()`).

### 5. Registrar os Slash Commands no Discord
```bash
node deploy-commands.js
```

### 6. Iniciar a Aplicação
**Modo Desenvolvimento:**
```bash
npm run dev
```

**Modo Produção (PM2):**
```bash
pm2 start src/index.js --name cyberguard-bot
pm2 save
```

---

# ⚙️ Guia de Variáveis de Ambiente (`.env`)

| Variável | Exemplo | Descrição |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | `MTE...` | Token do bot gerado no Discord Developer Portal |
| `DISCORD_CLIENT_ID` | `123456789...` | Application Client ID do bot |
| `GUILD_ID` | `987654321...` | ID do servidor do Discord |
| `DATABASE_URL` | `postgresql://usr:pwd@localhost:5432/cyberguard_bot` | URL de conexão com o PostgreSQL |
| `CHANNEL_RH_ID` | `154...` | ID do canal privado para avisos e aprovações do RH |
| `ROLE_RH_NOME` | `Recursos Humanos` | Nome exato do cargo de RH com privilégios administrativos |
| `ROLE_APROVADO_NOME` | `Membro` | Cargo atribuído automaticamente após aprovação do onboarding |
| `AREAS_INTERESSE` | `Design,Hacking Ético,Social Media...` | Lista de cargos das áreas de atuação disponíveis |
| `PONTO_VOICE_CHANNEL_ID`| `151...` | ID da sala de voz para bater ponto automático |
| `PONTO_ROLE_RH_ID` | `154...` | ID do cargo de RH autorizado a ajustar registros de ponto |
| `PONTO_SHEET_ID` | `1AbC...` | ID da planilha do Google para registro de horas |
| `NOTION_TOKEN` | `secret_...` | Token de integração da API do Notion |
| `NOTION_DATA_SOURCE_ID`| `3e5c7...` | ID da database/tabela de membros no Notion |
| `GEMINI_API_KEY` | `AIza...` | Chave de API do Google Gemini para transcrição de atas |
| `CANAL_ADVERTENCIAS_ID` | `154...` | Canal restrito onde ocorrem as notificações de moderação |
| `AUTORES_ADVERTENCIA_IDS`| `3717...,7366...` | IDs dos membros autorizados a emitir advertências |

---

# 📄 Manuais Operacionais em PDF

A pasta `docs/manuais/` conta com documentações e manuais completos gerados para o projeto:
- 📘 **`Manual_Membro_Ponto.pdf`**: Guia para membros sobre o ponto manual, registro por voz e confirmação de presença.
- 📕 **`Manual_Membro_Advertencias.pdf`**: Direitos, prazos e fluxo de contraditório para membros advertidos.
- 📗 **`Manual_Lider_RH_Ponto.pdf`**: Manual administrativo de ajuste de ponto, regras do RH e auditoria de horas.
- 📙 **`Manual_Lider_Advertencias_Atualizado.pdf`**: Procedimentos operacionais para abertura de advertências e expulsão.

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
