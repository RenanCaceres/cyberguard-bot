const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const db = require('./db');
const { iniciarOnboarding } = require('./onboarding');
const { handleAprovacaoInteraction } = require('./approval');
const { handleMensagemDM } = require('./recepcaoTermo');
const { iniciarLembretes, handleResolverLembrete } = require('./reminders');
const { processarMembrosPendentes, processarSaidasPerdidas } = require('./catchUp');
const { postarCartao } = require('./cartaoServidor');
const reuniaoCommand = require('../commands/reuniao/reuniaoCommand');
const advertenciaCommand = require('../commands/advertir/advertirCommand');
const painelAdvertenciasCommand = require('../commands/painel-advertencias/painelAdvertenciasCommand');
const minhasAdvertenciasCommand = require('../commands/minhas-advertencias/minhasAdvertenciasCommand');
const advertenciasCommand = require('../commands/advertencias/advertenciasCommand');
const { handleAdvertenciaInteraction, iniciarCronAdvertencias } = require('./advertencias');
const hierarquia = require('./hierarquia');
const { popularCacheDeMembros } = require('./popularCache');
const ponto = require('./ponto');
const kovLogs = require('./kovLogs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', async () => {
  await db.initSchema();
  iniciarLembretes(client);
  iniciarCronAdvertencias(client);
  ponto.init(client)
    .then(() => kovLogs.init(client))
    .catch((e) => console.error('[ponto] init:', e));
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

client.on('guildMemberAdd', (member) => {
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

  handleAdvertenciaInteraction(interaction)
    .then((tratado) => {
      if (tratado) return;
      handleResolverLembrete(interaction).then((tratado2) => {
        if (tratado2) return;
        handleAprovacaoInteraction(interaction).catch((err) =>
          console.error('Erro na interação de aprovação:', err)
        );
      });
    })
    .catch((err) => console.error('Erro na interação de advertência:', err));
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
        await db.removerMembro(member.id);
      } catch (errArquivo) {
        console.error('Erro ao arquivar abandono ao sair do servidor:', errArquivo);
      }
    }

    try {
      const nomesRelevantes = new Set([
        'Social Media & Copy',
        'Recursos Humanos',
        'Design',
        'Observatório',
        'Hardware Hacking',
        'Hacking Ético',
        'Red Team',
        'Blue Team',
        config.roleLiderNome,
      ]);
      const tinhaCargoRelevante =
        member.roles && member.roles.cache.some((r) => nomesRelevantes.has(r.name));

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
