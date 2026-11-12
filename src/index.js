const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./config');
const db = require('./db');
const { iniciarOnboarding, handleOnboardingInteraction, ehComandoAjuda } = require('./onboarding');
const { handleAprovacaoInteraction } = require('./approval');
const { handleMensagemDM, handleRevisaoTermoInteraction } = require('./recepcaoTermo');
const { iniciarLembretes, handleResolverLembrete } = require('./reminders');
const { iniciarMonitoramentoRenovacao, handleRenovacaoTermoInteraction } = require('./renovacaoTermo');
const { iniciarMonitoramentoDriveTermos } = require('./driveService');
const { iniciarLembretesNotion, handleNotionPendenciasInteraction } = require('./notionPendencias');
const { processarMembrosPendentes, processarSaidasPerdidas } = require('./catchUp');
const { postarCartao } = require('./cartaoServidor');
const reuniaoCommand = require('../commands/reuniao/reuniaoCommand');
const advertenciaCommand = require('../commands/advertir/advertirCommand');
const painelAdvertenciasCommand = require('../commands/painel-advertencias/painelAdvertenciasCommand');
const minhasAdvertenciasCommand = require('../commands/minhas-advertencias/minhasAdvertenciasCommand');
const advertenciasCommand = require('../commands/advertencias/advertenciasCommand');
const declaracaoCommand = require('../commands/declaracao/declaracaoCommand');
const meusDadosCommand = require('../commands/meus-dados/meusDadosCommand');
const relatorioSemanalCommand = require('../commands/relatorio-semanal/relatorioSemanalCommand');
const documentacaoCommand = require('../commands/documentacao/documentacaoCommand');
const painelDuvidasCommand = require('../commands/painel-duvidas/painelDuvidasCommand');
const painelAvisosCommand = require('../commands/painel-avisos/painelAvisosCommand');
const helpCommand = require('../commands/help/helpCommand');
const ajudaCommand = require('../commands/ajuda/ajudaCommand');
const encurtarCommand = require('../commands/encurtar/encurtarCommand');
const suporteDuvidas = require('./suporteDuvidas');
const avisos = require('./avisos');
const encurtador = require('./encurtador');
const { iniciarLimpezaBackups } = require('../commands/reuniao/limpezaBackup');
const { handleAdvertenciaInteraction, iniciarCronAdvertencias } = require('./advertencias');
const { iniciarCronDeclaracoes } = require('./declaracaoEmail');
const hierarquia = require('./hierarquia');
const { popularCacheDeMembros } = require('./popularCache');
const ponto = require('./ponto');
const kovLogs = require('./kovLogs');
const {
  initInviteTracker,
  rastrearConviteUsado,
  atribuirCargoEntusiasta,
} = require('./inviteTracker');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', async () => {
  await db.initSchema();
  iniciarLembretes(client);
  iniciarLembretesNotion(client);
  iniciarMonitoramentoRenovacao(client);
  iniciarMonitoramentoDriveTermos();
  iniciarCronAdvertencias(client);
  iniciarCronDeclaracoes(client);
  iniciarLimpezaBackups();
  suporteDuvidas.garantirPainelDuvidas(client).catch((e) => console.error('[suporte] Erro no painel de dúvidas:', e));
  avisos.garantirPainelAvisos(client).catch((e) => console.error('[avisos] Erro no painel de avisos:', e));
  ponto.init(client)
    .then(() => kovLogs.init(client))
    .catch((e) => console.error('[ponto] init:', e));
  await initInviteTracker(client);
  console.log(`Bot online como ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(config.guildId);
    const membrosAtuais = await guild.members.fetch();

    await processarMembrosPendentes(membrosAtuais);
    await processarSaidasPerdidas(client, membrosAtuais);

    if (config.hierarquiaChannelId) {
      await popularCacheDeMembros(guild);
      hierarquia.agendarAtualizacaoHierarquia(guild);
    }
  } catch (err) {
    console.error('Erro na inicialização pós-boot (membros/saídas/hierarquia):', err);
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    const infoConvite = await rastrearConviteUsado(member);
    if (infoConvite.ehEntusiasta) {
      console.log(
        `[onboarding] Novo membro ${member.user.tag} entrou pelo convite de Entusiasta (${infoConvite.codigoConvite || 'categoria/canal'}). Dispensando onboarding de voluntário.`
      );
      await atribuirCargoEntusiasta(member);
      return;
    }
  } catch (errConvite) {
    console.error('[index] Erro ao verificar convite de novo membro:', errConvite);
  }

  iniciarOnboarding(member).catch((err) => console.error('Erro no onboarding:', err));
});

client.on('interactionCreate', async (interaction) => {
  if (await ponto.handlePontoInteraction(interaction)) return;

  if (interaction.isChatInputCommand() && interaction.commandName === 'reuniao') {
    reuniaoCommand.execute(interaction).catch((err) => console.error('Erro no comando /reuniao:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'advertir') {
    advertenciaCommand.execute(interaction).catch((err) => console.error('Erro no comando /advertir:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'painel-advertencias') {
    painelAdvertenciasCommand.execute(interaction).catch((err) => console.error('Erro no comando /painel-advertencias:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'minhas-advertencias') {
    minhasAdvertenciasCommand.execute(interaction).catch((err) =>
      console.error('Erro no comando /minhas-advertencias:', err)
    );
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'advertencias') {
    advertenciasCommand.execute(interaction).catch((err) => console.error('Erro no comando /advertencias:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'declaracao') {
    declaracaoCommand.execute(interaction).catch((err) => console.error('Erro no comando /declaracao:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'meus-dados') {
    meusDadosCommand.execute(interaction).catch((err) => console.error('Erro no comando /meus-dados:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'relatorio-semanal') {
    relatorioSemanalCommand.execute(interaction).catch((err) => console.error('Erro no comando /relatorio-semanal:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'documentacao') {
    documentacaoCommand.execute(interaction).catch((err) => console.error('Erro no comando /documentacao:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'painel-duvidas') {
    painelDuvidasCommand.execute(interaction).catch((err) => console.error('Erro no comando /painel-duvidas:', err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'painel-avisos') {
    painelAvisosCommand.execute(interaction).catch((err) => console.error('Erro no comando /painel-avisos:', err));
    return;
  }

  if (interaction.isChatInputCommand() && (interaction.commandName === 'help' || interaction.commandName === 'ajuda')) {
    const cmd = interaction.commandName === 'help' ? helpCommand : ajudaCommand;
    cmd.execute(interaction).catch((err) => console.error(`Erro no comando /${interaction.commandName}:`, err));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'encurtar') {
    encurtarCommand.execute(interaction).catch((err) => console.error('Erro no comando /encurtar:', err));
    return;
  }

  try {
    if (await avisos.handleAvisosInteraction(interaction)) return;
    if (await suporteDuvidas.handleDuvidasInteraction(interaction)) return;
    if (await documentacaoCommand.handleDocumentacaoInteraction(interaction)) return;
    if (await meusDadosCommand.handleMeusDadosInteraction(interaction)) return;
    if (await reuniaoCommand.handleReuniaoInteraction(interaction)) return;
    if (await handleAdvertenciaInteraction(interaction)) return;
    if (await handleResolverLembrete(interaction)) return;
    if (await handleRenovacaoTermoInteraction(interaction)) return;
    if (await handleRevisaoTermoInteraction(interaction)) return;
    if (await handleOnboardingInteraction(interaction)) return;
    if (await handleNotionPendenciasInteraction(interaction)) return;
    await handleAprovacaoInteraction(interaction);
  } catch (err) {
    console.error('Erro na interação do bot:', err);
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  reuniaoCommand.handleVoiceStateUpdate(oldState, newState);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    if (hierarquia.cargosRelevantesMudaram(oldMember, newMember)) {
      hierarquia.agendarAtualizacaoHierarquia(newMember.guild);
    }

    // Se o membro acabou de receber o cargo de Líderes manualmente no Discord, atualiza papel e envia novo Termo de Líder
    const nomeRoleLider = (config.roleLiderNome || 'Líderes').toLowerCase();
    const tinhaLider = oldMember.roles?.cache?.some((r) => r.name.toLowerCase() === nomeRoleLider);
    const temLiderAgora = newMember.roles?.cache?.some((r) => r.name.toLowerCase() === nomeRoleLider);

    if (!tinhaLider && temLiderAgora) {
      const registro = await db.getMembro(newMember.id);
      const jaAprovadoHaMaisDe1Min =
        registro &&
        ['concluido', 'aguardando_assinatura'].includes(registro.status) &&
        registro.papel !== 'lider' &&
        registro.nome &&
        registro.ra &&
        (!registro.data_aprovacao || Date.now() - new Date(registro.data_aprovacao).getTime() > 60_000);

      if (jaAprovadoHaMaisDe1Min) {
        const fs = require('fs');
        const path = require('path');
        const { gerarTermo } = require('./termService');
        const { normalizarNomeSetor } = require('./atividadesVoluntariado');

        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() + 7);
        await db.atualizarStatus(newMember.id, 'aguardando_assinatura', {
          data_limite_assinatura: dataLimite,
          lembrete_resolvido_manualmente: false,
          papel: 'lider',
        });

        const membroAtualizado = await db.getMembro(newMember.id);
        const caminhoPdf = await gerarTermo(membroAtualizado, { client, ehLider: true });
        const nomeExibicao = membroAtualizado.nome_social || membroAtualizado.nome;
        const setorCanonic = normalizarNomeSetor(membroAtualizado.area_interesse);
        const caminhoTutorial = path.join(__dirname, '..', 'docs', 'Como Assinar Documento Pelo Gov.pdf');

        const arquivos = [
          {
            attachment: caminhoPdf,
            name: `Termo_Voluntariado_Lider_${nomeExibicao.replace(/\s+/g, '_')}.pdf`,
          },
        ];
        if (fs.existsSync(caminhoTutorial)) {
          arquivos.push({
            attachment: caminhoTutorial,
            name: 'Como_Assinar_Documento_Pelo_Gov.pdf',
          });
        }

        await newMember.send({
          content:
            `👑 Olá, **${nomeExibicao}**! Parabéns pela liderança do setor **${setorCanonic}**!\n\n` +
            `Como o seu cargo de **Líder** foi atribuído no servidor, geramos automaticamente o seu novo **Termo de Adesão ao Voluntariado** atualizado com o plano de trabalho e cronograma de **Líder de ${setorCanonic}**.\n\n` +
            `Por gentileza, preencha a **Data** na página 3, assine digitalmente via **Gov.br** sobre a linha **"Voluntário(a)"** e envie o PDF assinado aqui mesmo na DM em até **7 dias** para substituir a versão anterior.`,
          files: arquivos,
        }).catch((errDm) => console.error('[index] Erro ao enviar termo de promoção a líder na DM:', errDm.message));

        try {
          if (fs.existsSync(caminhoPdf)) fs.unlinkSync(caminhoPdf);
        } catch {}
      }
    }
  } catch (err) {
    console.error('Erro ao verificar mudança de cargos para a hierarquia/liderança:', err);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    const registro = await db.getMembro(member.id);
    const nome =
      registro && (registro.nome_social || registro.nome)
        ? (registro.nome_social || registro.nome)
        : member.user.username;

    if (registro && registro.status !== 'concluido') {
      try {
        await db.registrarRecusa({
          discordId: member.id,
          nome: registro.nome_social || registro.nome,
          ra: registro.ra,
          tipo: 'abandonado',
          motivo: `Saiu do servidor antes de concluir o processo (status: ${registro.status})`,
        });
        // Mantém os dados arquivados (criptografados) no banco caso já tenham sido preenchidos
        if (registro.nome || registro.ra) {
          await db.atualizarStatus(member.id, 'abandonado', { saida_processada: true });
        } else {
          await db.removerMembro(member.id);
        }
      } catch (errArquivo) {
        console.error('Erro ao arquivar abandono ao sair do servidor:', errArquivo);
      }
    }

    try {
      const nomesRelevantes = new Set([
        'Social Media & Copy',
        'Recursos Humanos',
        'Design',
        'Hardware Hacking',
        'Hacking Ético',
        'Red Team',
        'Blue Team',
        'Educacional',
        'Desenvolvimento',
        config.roleLiderNome,
      ]);
      const idsRelevantes = new Set([
        config.roleHackingEticoId,
        config.roleEducacionalId,
        config.roleDesenvolvimentoId,
      ].filter(Boolean));
      const tinhaCargoRelevante =
        member.roles &&
        member.roles.cache.some(
          (r) => nomesRelevantes.has(r.name) || idsRelevantes.has(r.id)
        );

      if (tinhaCargoRelevante) {
        hierarquia.agendarAtualizacaoHierarquia(member.guild);
      }
    } catch (errHierarquia) {
      console.error('Erro ao agendar atualização da hierarquia (saída):', errHierarquia);
    }

    await postarCartao(client, config.channelBoasVindasId, {
      tipo: 'saida',
      nome,
      discordTag: member.user.tag,
      avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
    });

    let foiExpulso = false;
    try {
      const auditLogs = await member.guild.fetchAuditLogs({ limit: 5 });
      const entry = auditLogs.entries.find(
        (e) =>
          (e.action === 20 || e.action === 22) &&
          e.target?.id === member.id &&
          Date.now() - e.createdTimestamp < 30_000
      );
      if (entry) foiExpulso = true;
    } catch {}

    const emailNotion = registro?.email_notion || registro?.email || null;
    try {
      const { registrarSaidaMembro } = require('./notionMembros');
      await registrarSaidaMembro(member.id, {
        nome: registro?.nome_social || registro?.nome || nome,
        ra: registro?.ra || null,
        email: emailNotion,
        expulso: foiExpulso,
      });
    } catch (errNotion) {
      console.error('Erro ao atualizar saída no Notion:', errNotion.message);
    }

    let statusRevogacaoWs = '';
    if (emailNotion) {
      try {
        const { removerMembroWorkspace } = require('./notionWorkspace');
        const resWs = await removerMembroWorkspace(emailNotion);
        if (resWs.sucesso) {
          statusRevogacaoWs = '\n✅ *Acesso ao Workspace do Notion revogado automaticamente!*';
        } else {
          statusRevogacaoWs = `\n⚠️ *Revogação Workspace Notion:* ${resWs.mensagem}`;
        }
      } catch (errWs) {
        statusRevogacaoWs = `\n⚠️ *Não foi possível revogar automaticamente no Workspace Notion:* ${errWs.message}`;
      }
    }

    if (config.channelRhId) {
      try {
        const canalRh = await member.guild.channels.fetch(config.channelRhId);
        const emailInfo =
          registro && (registro.email || registro.email_notion)
            ? registro.email_notion && registro.email_notion !== registro.email
              ? `Oficial: \`${registro.email}\` | Notion: \`${registro.email_notion}\``
              : `\`${registro.email}\``
            : 'não registrado';
        const tipoAviso = foiExpulso ? '🚫 **Expulsão do Servidor — Revogação Notion:**' : '🚪 **Saída do Servidor — Revogação Notion:**';
        const statusTexto = 'Inativo';
        await canalRh.send({
          content: `${tipoAviso}\nO integrante **${nome}** (<@${member.id}>) ${foiExpulso ? 'foi expulso do' : 'saiu do'} servidor.\n📧 **E-mail:** ${emailInfo}\n⚠️ *O cadastro no Notion foi alterado para ${statusTexto}.*${statusRevogacaoWs}`,
        });
      } catch (errRhAviso) {
        console.error('Erro ao alertar RH sobre saída do membro:', errRhAviso.message);
      }
    }

    if (registro && registro.status === 'concluido') {
      try {
        await db.marcarSaidaProcessada(member.id);
      } catch (errMarcar) {
        console.error('Erro ao marcar saída como processada:', errMarcar);
      }
    }
  } catch (err) {
    console.error('Erro ao gerar cartão de saída:', err);
  }
});

client.on('messageCreate', async (message) => {
  kovLogs.handleMessage(client, message);
  if (message.author.bot) return;

  if (message.guild) {
    encurtador
      .handleMensagemLink(client, message)
      .catch((err) => console.error('[encurtador] Erro ao encurtar link automático:', err));
  }

  // Atendimento a pedidos de ajuda em Mensagens Diretas (DM)
  if (message.channel.type === 1) { // 1 = DM
    if (ehComandoAjuda(message.content)) {
      const { estaEnviandoPrints } = require('./suporteDuvidas');
      if (!estaEnviandoPrints(message.author.id)) {
        try {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('onboarding_abrir_suporte')
              .setLabel('🆘 Abrir Chamado de Suporte')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🆘')
          );

          const membro = await db.getMembro(message.author.id);
          if (membro && membro.status !== 'concluido') {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId('onboarding_reiniciar')
                .setLabel('🔄 Continuar Cadastro')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄')
            );
          }

          await message.reply({
            content:
              '👋 **Central de Suporte • CyberGuard**\n' +
              'Identificamos que você solicitou ajuda! Se você teve algum problema durante o processo ou o bot não respondeu normalmente, clique em **"Abrir Chamado de Suporte"** abaixo para relatar o problema e anexar prints.\n' +
              (membro && membro.status !== 'concluido' ? 'Ou se desejar retomar o seu cadastro de onde parou, clique em **"Continuar Cadastro"**.' : ''),
            components: [row],
          });
          return;
        } catch (errAjuda) {
          console.error('[index] Erro ao enviar resposta de ajuda em DM:', errAjuda);
        }
      }
    }
  }

  handleMensagemDM(message).catch((err) => console.error('Erro ao processar DM:', err));
});

client.login(config.discordToken);
