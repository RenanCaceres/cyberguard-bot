'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { responderDuvidaComGemini } = require('./geminiHelp');

// Catálogo completo de módulos e suas respectivas documentações
const MODULOS = {
  ponto: {
    id: 'ponto',
    titulo: '🕒 Ponto Eletrônico & Gestão de Horas',
    subtitulo: 'Registro manual e por voz, demandas no Notion, checagem horária e ranking.',
    cor: 0x10b981,
    pdfPrincipal: 'Manual_Membro_Ponto.pdf',
    pdfSecundario: 'Manual_Lider_RH_Ponto.pdf',
    simulacao: 'simulacao_ponto.png',
    comandos: ['/painel-ponto', '/ajustar-ponto', '/importar-horas'],
    regras: [
      '• **Abertura:** Botão no painel ou conexão na sala de voz dedicada.',
      '• **Tarefas no Notion:** Selecione uma demanda existente ou crie uma nova diretamente pelo Discord.',
      '• **Tolerância de Conexão:** 60 segundos de grace period caso sua internet caia.',
      '• **Checagem Horária:** A cada 1 hora o bot questiona sua atividade na DM; 3 avisos sem resposta encerram por inatividade.',
      '• **Teto Máximo:** 8 horas contínuas de limite de segurança.',
      '• **Encerramento:** Preenchimento obrigatório de progresso (0-100%), entregas e thread opcional de comprovantes.',
    ],
  },
  declaracao: {
    id: 'declaracao',
    titulo: '📜 Declaração de Voluntariado',
    subtitulo: 'Emissão oficial de horas para AC, assinatura Gov.br e entrega por DM.',
    cor: 0x2f6fed,
    pdfPrincipal: 'Manual_Membro_Declaracao_Voluntariado.pdf',
    simulacao: 'simulacao_declaracao.png',
    comandos: ['/declaracao solicitar', '/declaracao status'],
    regras: [
      '• **Carga Horária Semanal:** Membros = 4h | Vice-Líderes = 8h | Líderes / Presidência = 10h semanais.',
      '• **Protocolo Único:** Cada solicitação gera um protocolo rastreável `#DECL-<RA>-<4 dígitos>`.',
      '• **Trâmite por E-mail:** Envio automatizado ao Coordenador Prof. André Luiz Przybysz.',
      '• **Captura IMAP Autônoma:** Bot escuta a caixa postal a cada 1 minuto e localiza o retorno assinado.',
      '• **Entrega Direta:** O PDF assinado via Gov.br (ICP-Brasil) é entregue na sua DM e arquivado no Google Drive.',
    ],
  },
  advertencias: {
    id: 'advertencias',
    titulo: '⚖️ Processo Disciplinar & Advertências',
    subtitulo: 'Regras de conduta, ampla defesa, prazos de 7 e 90 dias e contraditório.',
    cor: 0xdc2626,
    pdfPrincipal: 'Manual_Membro_Advertencias.pdf',
    pdfSecundario: 'Manual_Lider_Advertencias_Atualizado.pdf',
    simulacao: 'simulacao_advertencias.png',
    comandos: ['/advertir', '/painel-advertencias', '/minhas-advertencias', '/advertencias'],
    regras: [
      '• **Severidades:** Leve, Média e Grave.',
      '• **Reincidência Automática:** Reincidir na mesma gravidade eleva o nível (Leve -> Média -> Grave -> Votação de Expulsão).',
      '• **Garantia de Defesa:** Prazo de 7 dias corridos para clicar em "Ciente" ou "Não concordo" (até 1.500 caracteres).',
      '• **Diálogo Continuado:** Se o líder contra-argumentar, reinicia-se o prazo de 7 dias para nova réplica.',
      '• **Expiração:** Registros vigentes expiram automaticamente após 90 dias.',
      '• **Fila Automática:** Novas ocorrências aguardam a resolução da advertência anterior em aberto.',
    ],
  },
  onboarding: {
    id: 'onboarding',
    titulo: '📝 Onboarding & Assinatura Gov.br',
    subtitulo: 'Regularização jurídica, 13 etapas guiadas, validação ICP-Brasil e LGPD.',
    cor: 0x3b82f6,
    pdfPrincipal: 'Manual_Membro_Onboarding_GovBr.pdf',
    pdfSecundario: 'Fluxo_Otimizacao_Termos_Assinados_Onboarding.pdf',
    simulacao: 'simulacao_onboarding.png',
    comandos: ['Direct Message Guiada', 'Aprovação pelo RH'],
    regras: [
      '• **Termo de Ciência LGPD:** Consentimento obrigatório antes da coleta de dados.',
      '• **13 Etapas na DM:** Nome, CPF mascarado, RA, Curso, Endereço, Contatos e Seleção de Área.',
      '• **Geração Headless:** Preenchimento automático do modelo UTFPR com LibreOffice e AcroForm.',
      '• **Assinatura Gov.br:** Obrigatória sobre a linha "Voluntário(a)" da tabela de aceite.',
      '• **Validação Criptográfica:** Inspeção de `/Type /Sig`, data em Cornélio Procópio e janela de 90 dias.',
      '• **Trilha de Entusiastas:** Usuários que entram por convites de comunidade recebem cargo direto sem termo.',
    ],
  },
  reuniao: {
    id: 'reuniao',
    titulo: '🎙️ Atas de Reunião com IA Gemini',
    subtitulo: 'Gravação em voz por participante, direito de Opt-out e atas em PDF.',
    cor: 0xf97316,
    pdfPrincipal: 'Manual_Lider_Reunioes_IA.pdf',
    simulacao: 'simulacao_reuniao.png',
    comandos: ['/reuniao iniciar', '/reuniao finalizar', '/reuniao historico', '/reuniao reprocessar'],
    regras: [
      '• **Permissão:** Exclusivo para Liderança, RH, Presidência e Administradores.',
      '• **Opt-out LGPD:** Botão "Não gravar minha voz" disponível no chat de voz para qualquer participante.',
      '• **Áudio 16kHz Mono:** Streams Opus capturados por falante e concatenados em lotes.',
      '• **Síntese Gemini 2.5 Flash:** Geração autônoma de Resumo Executivo, Decisões e Plano de Ação.',
      '• **Retenção de Backups:** Áudios brutos mantidos por 7 dias para reprocessamento em caso de limite de cota.',
    ],
  },
  meusdados: {
    id: 'meusdados',
    titulo: '🔒 Portal LGPD & Meus Dados',
    subtitulo: 'Consulta efêmera de dados pessoais, retificação cadastral e direitos do titular.',
    cor: 0x8b5cf6,
    pdfPrincipal: 'Manual_Membro_LGPD_MeusDados.pdf',
    simulacao: 'simulacao_meusdados.png',
    comandos: ['/meus-dados visualizar', '/meus-dados atualizar', '/meus-dados privacidade'],
    regras: [
      '• **Art. 18 da LGPD:** Transparência total e acesso facilitado aos dados mantidos pelo projeto.',
      '• **Mensagem 100% Efêmera:** Somente o titular consegue visualizar seus dados cadastrais.',
      '• **Criptografia AES-256-GCM:** Dados sensíveis protegidos com chave de 256 bits e IV único.',
      '• **Retificação via Modal:** Atualização imediata de contatos, endereço residencial, curso e período.',
      '• **Canal do RH:** Disparo de logs auditáveis para qualquer alteração cadastral.',
    ],
  },
  completa: {
    id: 'completa',
    titulo: '📘 Documentação Técnica e Operacional Completa',
    subtitulo: 'Compêndio integral com arquitetura, tabelas SQL, regras de negócio e crons.',
    cor: 0xf59e0b,
    pdfPrincipal: 'Documentacao_Completa_CyberGuard_Bot.pdf',
    simulacao: 'simulacao_completa.png',
    comandos: ['Todos os comandos e serviços do sistema'],
    regras: [
      '• **Stack:** Node.js v18+, Discord.js v14, PostgreSQL (12 tabelas), Gemini 2.5 Flash, LibreOffice.',
      '• **Integrações Cloud:** Notion API (tarefas/membros), Google Sheets (3 abas) e Google Drive.',
      '• **Automação Contínua:** Crons às 06:00 (advertências), 09:00 (lembretes) e 1 min (declarações).',
      '• **Governança:** Organograma renderizado em 2400px, cartões gráficos e scanner LGPD-Guard.',
    ],
  },
};

function construirMenuSelecao() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('doc_select_modulo')
    .setPlaceholder('📂 Escolha o módulo para visualizar a documentação e PDF...');

  for (const [key, mod] of Object.entries(MODULOS)) {
    select.addOptions({
      label: mod.titulo.replace(/^[^\w\s]+\s*/, ''), // remove emojis do rótulo do select
      description: mod.subtitulo.slice(0, 100),
      value: key,
      emoji: mod.titulo.split(' ')[0],
    });
  }

  return new ActionRowBuilder().addComponents(select);
}

function construirBotoesMenuPrincipal() {
  const btnIA = new ButtonBuilder()
    .setCustomId('doc_btn_perguntar_geral')
    .setLabel('Tirar Dúvida com IA (Gemini)')
    .setStyle(ButtonStyle.Success)
    .setEmoji('💬');

  const btnCompleta = new ButtonBuilder()
    .setCustomId('doc_btn_ver_completa')
    .setLabel('Documentação Completa')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('📘');

  return new ActionRowBuilder().addComponents(btnIA, btnCompleta);
}

function construirPainelModulo(moduloKey) {
  const mod = MODULOS[moduloKey] || MODULOS.completa;

  const embed = new EmbedBuilder()
    .setColor(mod.cor)
    .setTitle(mod.titulo)
    .setDescription(`${mod.subtitulo}\n\n**Comandos Relacionados:**\n${mod.comandos.map((c) => `\`${c}\``).join(' • ')}`)
    .addFields({
      name: '📋 Diretrizes e Regras Operacionais',
      value: mod.regras.join('\n'),
    })
    .setFooter({
      text: 'CyberGuard UTFPR • Selecione outro módulo ou tire dúvidas com a IA abaixo.',
    });

  const attachments = [];

  // Anexo de Imagem de Simulação de Uso
  const caminhoSimulacao = path.resolve(__dirname, '../../docs/simulacoes', mod.simulacao);
  if (fs.existsSync(caminhoSimulacao)) {
    attachments.push(new AttachmentBuilder(caminhoSimulacao, { name: mod.simulacao }));
    embed.setImage(`attachment://${mod.simulacao}`);
  }

  // Anexo do Manual em PDF
  const caminhoPdf = path.resolve(__dirname, '../../docs/manuais', mod.pdfPrincipal);
  if (fs.existsSync(caminhoPdf)) {
    attachments.push(new AttachmentBuilder(caminhoPdf, { name: mod.pdfPrincipal }));
    embed.addFields({
      name: '📄 Manual Oficial Anexado',
      value: `O arquivo **${mod.pdfPrincipal}** foi anexado diretamente a esta mensagem para download e consulta off-line.`,
    });
  }

  // Botões de Ação
  const rowAcoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`doc_btn_duvida_${mod.id}`)
      .setLabel('Tirar Dúvida com IA (Gemini)')
      .setStyle(ButtonStyle.Success)
      .setEmoji('💬'),
    new ButtonBuilder()
      .setCustomId('doc_btn_voltar_menu')
      .setLabel('Escolher Outro Módulo')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄')
  );

  return { embed, attachments, rowAcoes, selectRow: construirMenuSelecao() };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('documentacao')
    .setDescription('Central de Documentação, Manuais em PDF com Simulações e Assistente IA CyberGuard')
    .addStringOption((opt) =>
      opt
        .setName('modulo')
        .setDescription('Módulo específico que você deseja consultar')
        .setRequired(false)
        .addChoices(
          { name: '🕒 Ponto Eletrônico & Gestão de Horas', value: 'ponto' },
          { name: '📜 Declaração de Voluntariado', value: 'declaracao' },
          { name: '⚖️ Processo Disciplinar & Advertências', value: 'advertencias' },
          { name: '📝 Onboarding & Assinatura Gov.br', value: 'onboarding' },
          { name: '🎙️ Atas de Reunião com IA Gemini', value: 'reuniao' },
          { name: '🔒 Portal LGPD & Meus Dados', value: 'meusdados' },
          { name: '📘 Documentação Completa do Sistema (v2.0)', value: 'completa' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('duvida')
        .setDescription('Envie sua dúvida diretamente para a IA do Gemini responder com base nas regras do bot')
        .setRequired(false)
    ),

  async execute(interaction) {
    const moduloEscolhido = interaction.options.getString('modulo');
    const duvida = interaction.options.getString('duvida');

    // Se o usuário já enviou uma dúvida direta no comando slash
    if (duvida) {
      await interaction.deferReply();
      const respostaIA = await responderDuvidaComGemini(duvida, {
        modulo: moduloEscolhido,
        nomeUsuario: interaction.user.displayName || interaction.user.username,
      });

      const embedResposta = new EmbedBuilder()
        .setColor(0x2f6fed)
        .setTitle('🤖 CyberGuard Assist • Resposta da IA (Gemini)')
        .setDescription(`**Sua Dúvida:**\n> *${duvida}*\n\n**Orientações Oficiais:**\n${respostaIA}`)
        .setFooter({ text: 'Baseado na documentação oficial e regras regimentais do CyberGuard Bot.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(moduloEscolhido ? `doc_btn_modulo_${moduloEscolhido}` : 'doc_btn_voltar_menu')
          .setLabel('Ver Manual em PDF e Simulação')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📄')
      );

      return interaction.editReply({ embeds: [embedResposta], components: [row] });
    }

    // Se um módulo específico foi selecionado no comando
    if (moduloEscolhido && MODULOS[moduloEscolhido]) {
      await interaction.deferReply();
      const painel = construirPainelModulo(moduloEscolhido);
      return interaction.editReply({
        embeds: [painel.embed],
        files: painel.attachments,
        components: [painel.selectRow, painel.rowAcoes],
      });
    }

    // Menu Geral Inicial
    const embedGeral = new EmbedBuilder()
      .setColor(0x2f6fed)
      .setTitle('🛡️ Central de Documentação e Manuais • CyberGuard Bot')
      .setDescription(
        'Bem-vindo(a) à **Central de Documentação Interativa do CyberGuard UTFPR**!\n\n' +
          'Selecione no menu abaixo o módulo que deseja aprender a utilizar. Você terá acesso ao **resumo operacional**, ' +
          '**simulações visuais da interface no Discord** e poderá baixar o **PDF oficial completo** compilado em alta resolução.\n\n' +
          'Caso continue com dúvidas, você pode perguntar diretamente ao **Gemini AI** clicando no botão verde!'
      )
      .addFields(
        {
          name: '🕒 Ponto Eletrônico & Gestão de Horas',
          value: 'Ponto manual e por voz (tolerância 60s), tarefas no Notion, checagem horária e ranking.',
          inline: true,
        },
        {
          name: '📜 Declaração de Voluntariado',
          value: 'Solicitação autônoma (4h/8h/10h), trâmite por e-mail com Prof. André e captura IMAP.',
          inline: true,
        },
        {
          name: '⚖️ Processo Disciplinar',
          value: 'Advertências (Leve/Média/Grave), prazo de 7 dias de defesa, fila automática e vigência 90d.',
          inline: true,
        },
        {
          name: '📝 Onboarding & Gov.br',
          value: '13 etapas na DM, AcroForm data, validação ICP-Brasil e integração com Google Drive/Notion.',
          inline: true,
        },
        {
          name: '🎙️ Atas com IA Gemini',
          value: 'Gravação em canais de voz, botão LGPD de Opt-out, transcrição e geração de atas em PDF.',
          inline: true,
        },
        {
          name: '🔒 Portal LGPD & Meus Dados',
          value: 'Acesso privativo (Art. 18 LGPD), criptografia AES-256-GCM e retificação de contatos.',
          inline: true,
        }
      )
      .setFooter({ text: 'Selecione um módulo abaixo para abrir a documentação detalhada com PDF.' });

    return interaction.reply({
      embeds: [embedGeral],
      components: [construirMenuSelecao(), construirBotoesMenuPrincipal()],
    });
  },

  async handleDocumentacaoInteraction(interaction) {
    // 1. Seleção no Menu Dropdown
    if (interaction.isStringSelectMenu() && interaction.customId === 'doc_select_modulo') {
      const moduloKey = interaction.values[0];
      await interaction.deferUpdate();
      const painel = construirPainelModulo(moduloKey);
      return interaction.editReply({
        embeds: [painel.embed],
        files: painel.attachments,
        components: [painel.selectRow, painel.rowAcoes],
      });
    }

    // 2. Botão Voltar ao Menu
    if (interaction.isButton() && interaction.customId === 'doc_btn_voltar_menu') {
      await interaction.deferUpdate();
      const embedGeral = new EmbedBuilder()
        .setColor(0x2f6fed)
        .setTitle('🛡️ Central de Documentação e Manuais • CyberGuard Bot')
        .setDescription(
          'Selecione no menu abaixo o módulo que deseja aprender a utilizar para acessar a prévia, ' +
            'a simulação da interface e o PDF oficial completo.'
        )
        .setFooter({ text: 'CyberGuard UTFPR • Documentação e Manuais Oficiais' });

      return interaction.editReply({
        embeds: [embedGeral],
        files: [],
        components: [construirMenuSelecao(), construirBotoesMenuPrincipal()],
      });
    }

    // 3. Botão Ver Documentação Completa
    if (interaction.isButton() && interaction.customId === 'doc_btn_ver_completa') {
      await interaction.deferUpdate();
      const painel = construirPainelModulo('completa');
      return interaction.editReply({
        embeds: [painel.embed],
        files: painel.attachments,
        components: [painel.selectRow, painel.rowAcoes],
      });
    }

    // 4. Botão Direto para Módulo Específico
    if (interaction.isButton() && interaction.customId.startsWith('doc_btn_modulo_')) {
      const modKey = interaction.customId.replace('doc_btn_modulo_', '');
      await interaction.deferUpdate();
      const painel = construirPainelModulo(modKey);
      return interaction.editReply({
        embeds: [painel.embed],
        files: painel.attachments,
        components: [painel.selectRow, painel.rowAcoes],
      });
    }

    // 5. Botão Abrir Modal de Dúvida com IA
    if (interaction.isButton() && (interaction.customId.startsWith('doc_btn_duvida_') || interaction.customId === 'doc_btn_perguntar_geral')) {
      const modKey = interaction.customId.startsWith('doc_btn_duvida_')
        ? interaction.customId.replace('doc_btn_duvida_', '')
        : 'geral';

      const modal = new ModalBuilder()
        .setCustomId(`modal_doc_duvida_${modKey}`)
        .setTitle('Tirar Dúvida com Gemini IA');

      const inputDuvida = new TextInputBuilder()
        .setCustomId('input_texto_duvida')
        .setLabel('Qual é a sua dúvida sobre o CyberGuard Bot?')
        .setPlaceholder('Ex.: Como funciona a checagem horária do ponto? Ou como assino no Gov.br?')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(5)
        .setMaxLength(1000)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(inputDuvida));
      return interaction.showModal(modal);
    }

    // 6. Submissão do Modal de Dúvida
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_doc_duvida_')) {
      const modKey = interaction.customId.replace('modal_doc_duvida_', '');
      const pergunta = interaction.fields.getTextInputValue('input_texto_duvida');

      await interaction.deferReply({ ephemeral: true });

      const respostaIA = await responderDuvidaComGemini(pergunta, {
        modulo: modKey !== 'geral' ? MODULOS[modKey]?.titulo : null,
        nomeUsuario: interaction.user.displayName || interaction.user.username,
      });

      const embedResposta = new EmbedBuilder()
        .setColor(0x2f6fed)
        .setTitle('🤖 CyberGuard Assist • Resposta da IA (Gemini)')
        .setDescription(`**Sua Pergunta:**\n> *${pergunta}*\n\n**Orientações Oficiais:**\n${respostaIA}`)
        .setFooter({ text: 'Precisa de mais detalhes? Consulte o PDF oficial do módulo correspondente.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(modKey !== 'geral' && MODULOS[modKey] ? `doc_btn_modulo_${modKey}` : 'doc_btn_ver_completa')
          .setLabel('Visualizar PDF e Simulação Deste Módulo')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📄')
      );

      return interaction.editReply({ embeds: [embedResposta], components: [row] });
    }

    return false;
  },
};
