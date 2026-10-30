const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const db = require('./db');
const { iniciarOnboarding } = require('./onboarding');
const { handleAprovacaoInteraction } = require('./approval');
const { handleMensagemDM, handleRevisaoTermoInteraction } = require('./recepcaoTermo');
const { iniciarLembretes, handleResolverLembrete } = require('./reminders');
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
  iniciarCronAdvertencias(client);
  iniciarCronDeclaracoes(client);
  iniciarLimpezaBackups();
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

  try {
    if (await meusDadosCommand.handleMeusDadosInteraction(interaction)) return;
    if (await reuniaoCommand.handleReuniaoInteraction(interaction)) return;
    if (await handleAdvertenciaInteraction(interaction)) return;
    if (await handleResolverLembrete(interaction)) return;
    if (await handleRevisaoTermoInteraction(interaction)) return;
    await handleAprovacaoInteraction(interaction);
  } catch (err) {
    console.error('Erro na interação do bot:', err);
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  reuniaoCommand.handleVoiceStateUpdate(oldState, newState);
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
  try {
    if (hierarquia.cargosRelevantesMudaram(oldMember, newMember)) {
      hierarquia.agendarAtualizacaoHierarquia(newMember.guild);
    }
  } catch (err) {
    console.error('Erro ao verificar mudança de cargos para a hierarquia:', err);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    const registro = await db.getMembro(member.id);
    const nome = registro && registro.nome ? registro.nome : member.user.username;

    if (registro && registro.status !== 'concluido') {
      try {
        await db.registrarRecusa({
          discordId: member.id,
          nome: registro.nome,
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

    try {
      const { registrarSaidaMembro } = require('./notionMembros');
      await registrarSaidaMembro(member.id, {
        nome: registro?.nome || nome,
        ra: registro?.ra || null,
        email: registro?.email || null,
        expulso: foiExpulso,
      });
    } catch (errNotion) {
      console.error('Erro ao atualizar saída no Notion:', errNotion.message);
    }

    let statusRevogacaoWs = '';
    if (registro && registro.email) {
      try {
        const { removerMembroWorkspace } = require('./notionWorkspace');
        const resWs = await removerMembroWorkspace(registro.email);
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
        const emailInfo = registro && registro.email ? `\`${registro.email}\`` : 'não registrado';
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

client.on('messageCreate', (message) => {
  kovLogs.handleMessage(client, message);
  handleMensagemDM(message).catch((err) => console.error('Erro ao processar DM:', err));
});

client.login(config.discordToken);
