const {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const path = require('path');
const os = require('os');
const fs = require('fs');
const config = require('../../src/config');
const MeetingRecorder = require('./recorder');
const { transcreverLote, gerarAta, esperar, ehCotaDiariaEsgotada } = require('./gemini');
const { salvarAta, listarAtas, buscarAtaPorId, atualizarAtaReprocessada } = require('./db');
const { gerarPdfAta } = require('./pdfGenerator');
const { PASTA_BACKUPS, DIAS_RETENCAO } = require('./limpezaBackup');

const gravacoesAtivas = new Map();

function usuarioTemPermissaoReuniao(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === config.presidenteId || member.id === config.vicePresidenteId) return true;

  const roleLiderId = process.env.PONTO_ROLE_LIDERES_ID;
  const roleRhId = process.env.PONTO_ROLE_RH_ID;

  return member.roles?.cache?.some(
    (r) =>
      r.name === config.roleLiderNome ||
      r.name === 'Líderes' ||
      r.name === 'Lideres' ||
      r.name === config.roleRhNome ||
      (roleLiderId && r.id === roleLiderId) ||
      (roleRhId && r.id === roleRhId)
  );
}

function construirComponentesOptOut() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('reuniao_optout')
        .setLabel('🔇 Não gravar minha voz (Opt-out)')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('reuniao_optin')
        .setLabel('🔊 Permitir gravação')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function construirEmbedAvisoGravacao(canalVozNome, titulo) {
  return new EmbedBuilder()
    .setTitle(`🔴 Gravação de Reunião Ativa — ${titulo}`)
    .setDescription(
      `O áudio do canal de voz **${canalVozNome}** está sendo capturado neste momento com a **finalidade exclusiva** de transcrição automatizada e geração de ata acadêmica/institucional via Inteligência Artificial (Google Gemini).\n\n` +
        `🔒 **Privacidade e Retenção (LGPD):**\n` +
        `• Os arquivos de áudio são temporários e descartados imediatamente após a transcrição (ou em até ${DIAS_RETENCAO} dias em caso de falha de cota da API).\n` +
        `• **Direito de Oposição (Opt-out):** Caso não deseje que sua voz seja capturada ou transcrita nesta sessão, clique no botão **🔇 Não gravar minha voz** abaixo a qualquer momento.`
    )
    .setColor(0xed4245)
    .setTimestamp();
}

const data = new SlashCommandBuilder()
  .setName('reuniao')
  .setDescription('Gravação e transcrição de reuniões por voz')
  .addSubcommand((sub) =>
    sub
      .setName('iniciar')
      .setDescription('Entra no seu canal de voz e começa a gravar a reunião')
      .addStringOption((opt) =>
        opt.setName('titulo').setDescription('Título da reunião').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('finalizar').setDescription('Encerra a gravação e gera a ata com Gemini')
  )
  .addSubcommand((sub) =>
    sub
      .setName('historico')
      .setDescription('Lista as últimas atas de reunião salvas')
      .addIntegerOption((opt) =>
        opt
          .setName('quantidade')
          .setDescription('Quantas atas mostrar (padrão: 10, máx: 25)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('reprocessar')
      .setDescription('Tenta gerar a transcrição/ata de novo a partir do áudio salvo (até 7 dias após a reunião)')
      .addIntegerOption((opt) =>
        opt
          .setName('id')
          .setDescription('ID da ata (veja em /reuniao historico)')
          .setRequired(true)
      )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'iniciar' || sub === 'finalizar' || sub === 'reprocessar') {
    if (!usuarioTemPermissaoReuniao(interaction.member)) {
      return interaction.reply({
        content:
          '❌ **Acesso restrito:** Apenas membros da Liderança (`Líderes`), Recursos Humanos (`RH`), Presidência ou Administradores podem iniciar, encerrar ou reprocessar gravações de reuniões.',
        ephemeral: true,
      });
    }
  }

  if (sub === 'iniciar') return iniciar(interaction, guildId);
  if (sub === 'finalizar') return finalizar(interaction, guildId);
  if (sub === 'historico') return historico(interaction, guildId);
  if (sub === 'reprocessar') return reprocessar(interaction, guildId);
}

async function iniciar(interaction, guildId) {
  const canalVoz = interaction.member?.voice?.channel;

  if (!canalVoz || canalVoz.type !== ChannelType.GuildVoice) {
    return interaction.reply({
      content: 'Você precisa estar em um canal de voz para iniciar a gravação.',
      ephemeral: true,
    });
  }

  if (gravacoesAtivas.has(guildId)) {
    return interaction.reply({
      content: 'Já existe uma reunião sendo gravada neste servidor. Use `/reuniao finalizar` primeiro.',
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  const connection = joinVoiceChannel({
    channelId: canalVoz.id,
    guildId,
    adapterCreator: canalVoz.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

  const tempDir = path.join(PASTA_BACKUPS, `${guildId}_${Date.now()}`);
  const recorder = new MeetingRecorder(connection, tempDir);
  recorder.start();

  const titulo = interaction.options.getString('titulo') || `Reunião em ${canalVoz.name}`;

  gravacoesAtivas.set(guildId, {
    recorder,
    connection,
    tempDir,
    titulo,
    canalTexto: interaction.channel,
    canalVozId: canalVoz.id,
    canalVozNome: canalVoz.name,
    iniciadoEm: new Date(),
  });

  const embedAviso = construirEmbedAvisoGravacao(canalVoz.name, titulo);
  const componentesOptOut = construirComponentesOptOut();

  // Notifica os participantes presentes no chat do próprio canal de voz (caso diferente do canal do comando)
  try {
    const mencoesParticipantes = canalVoz.members
      .filter((m) => !m.user.bot)
      .map((m) => `<@${m.id}>`)
      .join(' ');

    if (canalVoz.id !== interaction.channelId && typeof canalVoz.send === 'function') {
      await canalVoz.send({
        content: mencoesParticipantes
          ? `⚠️ **Aviso de Gravação (LGPD):** ${mencoesParticipantes}`
          : '⚠️ **Aviso de Gravação (LGPD):**',
        embeds: [embedAviso],
        components: componentesOptOut,
      });
    }
  } catch (errAvisoVoz) {
    console.warn('[reuniao] Não foi possível enviar aviso no chat do canal de voz:', errAvisoVoz.message);
  }

  return interaction.editReply({
    content: `🔴 Gravando a reunião em **${canalVoz.name}**. Quando terminar, use \`/reuniao finalizar\`.`,
    embeds: [embedAviso],
    components: componentesOptOut,
  });
}

function salvarManifest(tempDir, contexto) {
  const manifest = {
    guildId: contexto.guildId,
    titulo: contexto.titulo,
    canalVozId: contexto.canalVozId,
    canalVozNome: contexto.canalVozNome,
    canalTextoId: contexto.canalTexto.id,
    iniciadoEm: contexto.iniciadoEm.toISOString(),
    utterances: contexto.utterances.map((u) => ({
      userId: u.userId,
      startTime: u.startTime,
      arquivo: path.basename(u.filePath),
    })),
  };
  fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

async function finalizar(interaction, guildId) {
  const gravacao = gravacoesAtivas.get(guildId);
  if (!gravacao) {
    return interaction.reply({
      content: 'Não há nenhuma reunião sendo gravada neste servidor no momento.',
      ephemeral: true,
    });
  }

  await interaction.deferReply();
  gravacoesAtivas.delete(guildId);

  const { recorder, connection, tempDir, titulo, canalTexto, canalVozId, canalVozNome, iniciadoEm } =
    gravacao;
  const utterances = await recorder.stop();
  connection.destroy();

  if (utterances.length === 0) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return interaction.editReply('A gravação terminou, mas nenhuma fala foi capturada.');
  }

  fs.mkdirSync(tempDir, { recursive: true });
  salvarManifest(tempDir, { guildId, titulo, canalVozId, canalVozNome, canalTexto, iniciadoEm, utterances });

  await processarEEntregarAta(interaction, {
    utterances,
    titulo,
    guildId,
    canalTexto,
    canalVozId,
    canalVozNome,
    iniciadoEm,
    tempDir,
  });
}

async function processarEEntregarAta(interaction, contexto) {
  const { utterances, titulo, guildId, canalTexto, canalVozId, canalVozNome, iniciadoEm, tempDir, idAtaExistente } =
    contexto;

  await interaction.editReply(
    `⏳ ${idAtaExistente ? 'Reprocessando' : 'Reunião encerrada. Transcrevendo'} ${utterances.length} trecho(s) de áudio com Gemini...`
  );

  const LOTES_ALVO = 12;
  const TAMANHO_LOTE = Math.max(3, Math.ceil(utterances.length / LOTES_ALVO));
  const INTERVALO_ENTRE_LOTES_MS = 4000;

  const resultados = [];
  let cotaDiariaEsgotada = false;

  for (let i = 0; i < utterances.length; i += TAMANHO_LOTE) {
    const lote = utterances.slice(i, i + TAMANHO_LOTE);

    if (cotaDiariaEsgotada) {
      for (const u of lote) resultados.push({ ...u, texto: '[não transcrito — cota diária do Gemini esgotada]' });
      continue;
    }

    try {
      const textos = await transcreverLote(lote.map((u) => u.filePath));
      lote.forEach((u, idx) => resultados.push({ ...u, texto: textos[idx] }));
    } catch (err) {
      console.error('[reuniao] erro ao transcrever lote:', err.message);

      if (ehCotaDiariaEsgotada(err)) {
        cotaDiariaEsgotada = true;
        for (const u of lote) resultados.push({ ...u, texto: '[não transcrito — cota diária do Gemini esgotada]' });
      } else {
        for (const u of lote) resultados.push({ ...u, texto: '[erro na transcrição]' });
      }
    }

    await interaction
      .editReply(
        `⏳ Transcrevendo com Gemini... (${resultados.length}/${utterances.length} trechos processados)`
      )
      .catch(() => {});

    if (i + TAMANHO_LOTE < utterances.length) {
      await esperar(INTERVALO_ENTRE_LOTES_MS);
    }
  }

  if (cotaDiariaEsgotada) {
    await interaction
      .editReply(
        `⚠️ A cota diária gratuita do Gemini esgotou no meio do processamento — parte não pôde ser ` +
          `transcrita hoje. O áudio continua salvo (até ${DIAS_RETENCAO} dias) — use ` +
          `\`/reuniao reprocessar\` amanhã pra tentar de novo.`
      )
      .catch(() => {});
  }

  const guild = interaction.guild;
  const nomesCache = new Map();
  async function nomeDoUsuario(userId) {
    if (nomesCache.has(userId)) return nomesCache.get(userId);
    try {
      const membro = await guild.members.fetch(userId);
      nomesCache.set(userId, membro.displayName);
      return membro.displayName;
    } catch {
      return `Usuário ${userId}`;
    }
  }

  const linhas = [];
  const participantes = new Map();
  for (const r of resultados) {
    const nome = await nomeDoUsuario(r.userId);
    participantes.set(r.userId, nome);
    const horario = new Date(r.startTime).toLocaleTimeString('pt-BR');
    linhas.push(`[${horario}] ${nome}: ${r.texto}`);
  }
  const transcricaoFormatada = linhas.join('\n');
  const participantesLista = Array.from(participantes, ([userId, nome]) => ({ user_id: userId, nome }));
  const participantesNomes = participantesLista.map((p) => p.nome);

  let ata;
  try {
    ata = await gerarAta(transcricaoFormatada, titulo);
  } catch (err) {
    console.error('[reuniao] erro ao gerar ata:', err.message);
    ata = 'Não foi possível gerar a ata automaticamente. Segue apenas a transcrição bruta.';
  }

  const finalizadoEm = new Date();
  const dataFormatada = `${iniciadoEm.toLocaleDateString('pt-BR')} — ${iniciadoEm.toLocaleTimeString(
    'pt-BR'
  )} às ${finalizadoEm.toLocaleTimeString('pt-BR')}`;

  const dirPdfs = path.join(os.tmpdir(), 'atas-pdf');
  let pdfPath = null;
  try {
    pdfPath = await gerarPdfAta({
      titulo,
      dataFormatada,
      participantesNomes,
      ataMarkdown: ata,
      outputDir: dirPdfs,
    });
  } catch (err) {
    console.error('[reuniao] erro ao gerar PDF da ata:', err.message);
  }

  const transcricaoTotalmenteOk = !cotaDiariaEsgotada && !transcricaoFormatada.includes('[erro na transcrição]');

  try {
    if (idAtaExistente) {
      await atualizarAtaReprocessada(idAtaExistente, {
        transcricao: transcricaoFormatada,
        ataMarkdown: ata,
        pdfPath,
      });
    } else {
      await salvarAta({
        guildId,
        canalVozId,
        canalVozNome,
        titulo,
        transcricao: transcricaoFormatada,
        ataMarkdown: ata,
        participantes: participantesLista,
        iniciadoEm,
        pdfPath,
        pastaAudioBackup: transcricaoTotalmenteOk ? null : tempDir,
        audioExpiraEm: new Date(Date.now() + DIAS_RETENCAO * 24 * 60 * 60 * 1000),
      });
    }
  } catch (err) {
    console.error('[reuniao] erro ao salvar ata no banco:', err.message);
  }

  if (transcricaoTotalmenteOk) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(`📝 Ata — ${titulo}`)
    .setDescription(ata.length > 4000 ? ata.slice(0, 3997) + '...' : ata)
    .setColor(0x5865f2)
    .setTimestamp();

  const arquivos = [
    { attachment: Buffer.from(transcricaoFormatada, 'utf-8'), name: 'transcricao-bruta.txt' },
  ];
  if (pdfPath) {
    arquivos.push({ attachment: pdfPath, name: `Ata - ${titulo}.pdf` });
  }

  await canalTexto.send({ embeds: [embed], files: arquivos });

  if (pdfPath) {
    fs.rm(pdfPath, { force: true }, () => {});
  }
}

async function reprocessar(interaction, guildId) {
  const id = interaction.options.getInteger('id');

  await interaction.deferReply();

  const ata = await buscarAtaPorId(id).catch(() => null);
  if (!ata || ata.guild_id !== guildId) {
    return interaction.editReply(`Não encontrei nenhuma ata com o ID #${id} neste servidor.`);
  }

  if (!ata.pasta_audio_backup) {
    return interaction.editReply(
      `A ata #${id} não tem áudio salvo pra reprocessar (ou a transcrição já tinha dado certo da primeira ` +
        `vez, ou o backup já expirou/foi limpo).`
    );
  }

  const manifestPath = path.join(ata.pasta_audio_backup, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return interaction.editReply(
      `Achei a referência do backup da ata #${id}, mas os arquivos não estão mais no disco (provavelmente ` +
        `passou dos ${DIAS_RETENCAO} dias de retenção).`
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const utterances = manifest.utterances.map((u) => ({
    userId: u.userId,
    startTime: u.startTime,
    filePath: path.join(ata.pasta_audio_backup, u.arquivo),
  }));

  const canalTexto = await interaction.guild.channels.fetch(manifest.canalTextoId).catch(() => interaction.channel);

  await processarEEntregarAta(interaction, {
    utterances,
    titulo: manifest.titulo,
    guildId,
    canalTexto,
    canalVozId: manifest.canalVozId,
    canalVozNome: manifest.canalVozNome,
    iniciadoEm: new Date(manifest.iniciadoEm),
    tempDir: ata.pasta_audio_backup,
    idAtaExistente: id,
  });
}

async function historico(interaction, guildId) {
  const quantidadeSolicitada = interaction.options.getInteger('quantidade') || 10;
  const quantidade = Math.min(Math.max(quantidadeSolicitada, 1), 25);

  await interaction.deferReply();

  let atas;
  try {
    atas = await listarAtas(guildId, quantidade);
  } catch (err) {
    console.error('[reuniao] erro ao listar histórico:', err.message);
    return interaction.editReply('Não foi possível buscar o histórico de atas agora. Tenta de novo daqui a pouco.');
  }

  if (atas.length === 0) {
    return interaction.editReply('Ainda não tem nenhuma ata de reunião salva neste servidor.');
  }

  const linhas = atas.map((ata) => {
    const data = new Date(ata.finalizado_em).toLocaleDateString('pt-BR');
    const hora = new Date(ata.finalizado_em).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `**#${ata.id}** — ${ata.titulo}\n${data} às ${hora}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('📚 Histórico de reuniões')
    .setDescription(linhas.join('\n\n'))
    .setColor(0x5865f2)
    .setFooter({ text: 'Peça o PDF de uma ata específica com o ID que aparece aqui.' });

  await interaction.editReply({ embeds: [embed] });
}

async function handleReuniaoInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== 'reuniao_optout' && interaction.customId !== 'reuniao_optin') {
    return false;
  }

  const gravacao = gravacoesAtivas.get(interaction.guildId);
  if (!gravacao) {
    await interaction.reply({
      content: 'ℹ️ Não há nenhuma gravação de reunião ativa neste momento.',
      ephemeral: true,
    });
    return true;
  }

  if (interaction.customId === 'reuniao_optout') {
    gravacao.recorder.ignorarUsuario(interaction.user.id);
    await interaction.reply({
      content:
        '🔇 **Opt-out ativado (LGPD):** Sua voz **não será gravada nem transcrita** nesta reunião, e eventuais trechos já capturados nesta sessão foram removidos.',
      ephemeral: true,
    });
    return true;
  }

  if (interaction.customId === 'reuniao_optin') {
    gravacao.recorder.permitirUsuario(interaction.user.id);
    await interaction.reply({
      content: '🔊 **Gravação autorizada:** Sua voz voltará a ser incluída na transcrição desta reunião.',
      ephemeral: true,
    });
    return true;
  }

  return false;
}

async function handleVoiceStateUpdate(oldState, newState) {
  try {
    if (newState.member?.user?.bot) return;
    if (oldState.channelId === newState.channelId || !newState.channelId) return;

    const gravacao = gravacoesAtivas.get(newState.guild.id);
    if (!gravacao || gravacao.canalVozId !== newState.channelId) return;

    const canalAlvo =
      newState.channel && typeof newState.channel.send === 'function'
        ? newState.channel
        : gravacao.canalTexto;

    if (!canalAlvo) return;

    await canalAlvo.send({
      content:
        `🔴 Olá <@${newState.id}>! Este canal de voz (**${gravacao.canalVozNome}**) está com **gravação ativa** para transcrição e geração de ata via IA (Google Gemini). ` +
        `Caso não deseje que sua voz seja gravada, utilize o botão abaixo:`,
      components: construirComponentesOptOut(),
    });
  } catch (err) {
    console.warn('[reuniao] Erro ao notificar novo participante na call gravada:', err.message);
  }
}

module.exports = {
  data,
  execute,
  handleReuniaoInteraction,
  handleVoiceStateUpdate,
};
