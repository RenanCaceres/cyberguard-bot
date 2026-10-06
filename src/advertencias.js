const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const cron = require('node-cron');
const db = require('./db');

// Ajuste aqui se os prazos, o canal ou os autores autorizados mudarem
const DIAS_PARA_EXPIRAR = 90;
const DIAS_PARA_RESPONDER = 7;
const CANAL_ADVERTENCIAS_ID = '1549583670011101376';
const AUTORES_PERMITIDOS = [
  '371773713101619201', // <- seu ID
  '736695528494202921', // André (Presidente)
];

// Guarda o rascunho da advertência entre a escolha (slash ou painel) e o modal
const pendentes = new Map();

function podeAbrirAdvertencia(userId) {
  return AUTORES_PERMITIDOS.includes(userId);
}

// ---------- núcleo compartilhado (usado pelo /advertir e pelo painel) ----------

async function finalizarAbertura(interaction, { membroId, nomeReal, categoriaDeclaradaId, reincidencia, referenciaId, titulo, evidencias }) {
  const categorias = await db.getCategoriasAdvertencia();
  const declarada = categorias.find((c) => c.id === categoriaDeclaradaId);
  let efetiva = declarada;

  if (reincidencia) {
    efetiva = categorias.find((c) => c.ordem === declarada.ordem + 1) || categorias.find((c) => c.ordem === 3);
  }

  const advertencia = await db.criarAdvertencia({
    discordId: membroId,
    nomeReal,
    titulo,
    evidencias,
    autorId: interaction.user.id,
    categoriaDeclaradaId: declarada.id,
    categoriaEfetivaId: efetiva.id,
    reincidencia,
    advertenciaReferenciaId: referenciaId,
  });

  await enviarNotificacaoAdvertido(interaction.client, advertencia);

  if (reincidencia && declarada.ordem === 3) {
    const canal = await interaction.client.channels.fetch(CANAL_ADVERTENCIAS_ID);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`advertencia_expulsar_sim_${advertencia.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`advertencia_expulsar_nao_${advertencia.id}`).setLabel('Não expulsar').setStyle(ButtonStyle.Secondary)
    );
    await canal.send({
      content: `⚠️ ${nomeReal} já teve advertência **Grave** e reincidiu novamente (advertência #${advertencia.id}). Decisão:`,
      components: [row],
    });
  }

  return advertencia;
}

function botoesAdvertido(advertenciaId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`advertencia_ciente_${advertenciaId}`).setLabel('Ciente').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`advertencia_naoconcordo_${advertenciaId}`).setLabel('Não concordo').setStyle(ButtonStyle.Danger)
  );
}

// Tenta DM; se o advertido tiver DM fechada, cai no canal de advertências
async function enviarAoAdvertido(client, advertencia, embed) {
  const row = botoesAdvertido(advertencia.id);
  try {
    const usuario = await client.users.fetch(advertencia.discord_id);
    await usuario.send({ embeds: [embed], components: [row] });
  } catch {
    const canal = await client.channels.fetch(CANAL_ADVERTENCIAS_ID);
    await canal.send({ content: `<@${advertencia.discord_id}>`, embeds: [embed], components: [row] });
  }
}

async function enviarNotificacaoAdvertido(client, advertencia) {
  const embed = new EmbedBuilder()
    .setTitle('Você recebeu uma advertência formal')
    .setDescription(
      `**Título:** ${advertencia.titulo}\n\nSe você não responder em ${DIAS_PARA_RESPONDER} dias, a advertência será marcada como \"Sem Resposta\".`
    )
    .setColor(0xd85a30);

  await enviarAoAdvertido(client, advertencia, embed);
}

async function enviarContraArgumentoAoAdvertido(client, advertencia, texto) {
  const embed = new EmbedBuilder()
    .setTitle(`Contra-argumento — advertência #${advertencia.id}`)
    .setDescription(
      `**Título:** ${advertencia.titulo}\n\n**Contra-argumento de quem abriu a advertência:**\n${texto}\n\n` +
        `Se você não responder em ${DIAS_PARA_RESPONDER} dias, a advertência será marcada como \"Sem Resposta\".`
    )
    .setColor(0xef9f27);

  await enviarAoAdvertido(client, advertencia, embed);
}

// Mensagem de decisão para quem abriu a advertência: Contra-Argumentar / Prosseguir / Perdoar
async function enviarDecisaoAoAutor(client, advertencia, justificativa) {
  const argumentos = await db.listarArgumentos(advertencia.id);
  const rodada = argumentos.filter((a) => a.tipo === 'replica').length;

  const canal = await client.channels.fetch(CANAL_ADVERTENCIAS_ID);
  const embed = new EmbedBuilder()
    .setTitle(`Réplica recebida — advertência #${advertencia.id} (rodada ${rodada})`)
    .setDescription(`**Justificativa do advertido:**\n${justificativa}`)
    .setColor(0xef9f27);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`advertencia_contra_${advertencia.id}`).setLabel('Contra-Argumentar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`advertencia_prosseguir_${advertencia.id}`).setLabel('Prosseguir').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`advertencia_perdoar_${advertencia.id}`).setLabel('Perdoar').setStyle(ButtonStyle.Success)
  );

  await canal.send({ content: `<@${advertencia.autor_id}>`, embeds: [embed], components: [row] });
}

// ---------- fluxo via /advertir (slash command, pede nome_real na mão) ----------

async function iniciarFluxoAdvertencia(interaction) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    return interaction.reply({ content: 'Você não tem permissão para abrir advertências.', ephemeral: true });
  }

  const membro = interaction.options.getUser('membro');
  const nomeReal = interaction.options.getString('nome_real');
  const categoriaNome = interaction.options.getString('categoria');
  const reincidente = interaction.options.getBoolean('reincidente');

  const categorias = await db.getCategoriasAdvertencia();
  const declarada = categorias.find((c) => c.nome === categoriaNome);
  let referenciaId = null;

  if (reincidente) {
    const emVigencia = await db.getAdvertenciasEmVigencia(membro.id, declarada.id);
    if (emVigencia.length === 0) {
      return interaction.reply({
        content: `Nenhuma advertência "${categoriaNome}" em vigência para ${membro.tag} — não é reincidência válida nessa categoria.`,
        ephemeral: true,
      });
    }
    referenciaId = emVigencia[0].id;
    await interaction.reply({
      content: `Reincidência confirmada com base em:\n${emVigencia.map((a) => `#${a.id} — ${a.titulo}`).join('\n')}`,
      ephemeral: true,
    });
  }

  pendentes.set(interaction.user.id, {
    membroId: membro.id,
    nomeReal,
    categoriaDeclaradaId: declarada.id,
    reincidencia: reincidente,
    referenciaId,
  });

  await abrirModalDetalhes(interaction, 'advertencia_modal');
}

function abrirModalDetalhes(interaction, customId) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle('Detalhes da advertência');
  const titulo = new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true);
  const evidencias = new TextInputBuilder()
    .setCustomId('evidencias')
    .setLabel('Evidências (um link por linha)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(titulo), new ActionRowBuilder().addComponents(evidencias));
  return interaction.showModal(modal);
}

async function handleModalAbertura(interaction) {
  const pendente = pendentes.get(interaction.user.id);
  if (!pendente) {
    await interaction.reply({ content: 'Sessão expirada, use /advertir novamente.', ephemeral: true });
    return;
  }
  pendentes.delete(interaction.user.id);

  const titulo = interaction.fields.getTextInputValue('titulo');
  const evidencias = interaction.fields
    .getTextInputValue('evidencias')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((link) => ({ tipo: 'link', path: link }));

  const advertencia = await finalizarAbertura(interaction, {
    membroId: pendente.membroId,
    nomeReal: pendente.nomeReal,
    categoriaDeclaradaId: pendente.categoriaDeclaradaId,
    reincidencia: pendente.reincidencia,
    referenciaId: pendente.referenciaId,
    titulo,
    evidencias,
  });

  await interaction.reply({ content: `Advertência #${advertencia.id} registrada para ${pendente.nomeReal}.`, ephemeral: true });
}

// ---------- painel (botões + select menus, sem digitar slash command) ----------

function montarPainel() {
  const embed = new EmbedBuilder()
    .setTitle('📋 Sistema de Advertências')
    .setDescription('Use os botões abaixo para abrir uma advertência, ver as suas ou consultar o histórico completo.')
    .setColor(0xd85a30);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('advertencia_painel_abrir').setLabel('Abrir Advertência').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
    new ButtonBuilder().setCustomId('advertencia_painel_minhas').setLabel('Minhas Advertências').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    new ButtonBuilder().setCustomId('advertencia_painel_historico').setLabel('Ver Histórico').setStyle(ButtonStyle.Primary).setEmoji('📚')
  );

  return { embeds: [embed], components: [row] };
}

async function iniciarPainelAbrirAdvertencia(interaction) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    return interaction.reply({ content: 'Você não tem permissão para abrir advertências.', ephemeral: true });
  }

  const select = new UserSelectMenuBuilder().setCustomId('advertencia_painel_select_membro').setPlaceholder('Selecione o membro a ser advertido');

  await interaction.reply({
    content: 'Quem você vai advertir?',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}

async function handleSelecaoMembro(interaction) {
  const membro = interaction.users.first();
  const registro = await db.getMembro(membro.id);
  const nomeReal = (registro && registro.nome) || membro.tag;
  const categorias = await db.getCategoriasAdvertencia();

  const select = new StringSelectMenuBuilder()
    .setCustomId(`advertencia_painel_select_categoria_${membro.id}`)
    .setPlaceholder('Selecione a categoria')
    .addOptions(categorias.map((c) => ({ label: c.nome, value: String(c.id), description: c.comportamento.slice(0, 100) })));

  await interaction.update({
    content: `Advertindo **${nomeReal}** (@${membro.tag}). Selecione a categoria:`,
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function handleSelecaoCategoria(interaction, membroId) {
  const categoriaId = interaction.values[0];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`advertencia_painel_reincidencia_sim_${membroId}_${categoriaId}`)
      .setLabel('É reincidência')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`advertencia_painel_reincidencia_nao_${membroId}_${categoriaId}`)
      .setLabel('Não é reincidência')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ content: 'É reincidência de uma advertência em vigência na mesma categoria?', components: [row] });
}

async function handleReincidenciaPainel(interaction, resposta, membroId, categoriaId) {
  let referenciaId = null;

  if (resposta === 'sim') {
    const emVigencia = await db.getAdvertenciasEmVigencia(membroId, categoriaId);
    if (emVigencia.length === 0) {
      await interaction.update({
        content: 'Nenhuma advertência em vigência nessa categoria — não é reincidência válida. Fluxo cancelado.',
        components: [],
      });
      return;
    }
    referenciaId = emVigencia[0].id;
  }

  pendentes.set(interaction.user.id, {
    membroId,
    categoriaDeclaradaId: Number(categoriaId),
    reincidencia: resposta === 'sim',
    referenciaId,
  });

  await abrirModalDetalhes(interaction, 'advertencia_painel_modal');
}

async function handleModalPainel(interaction) {
  const pendente = pendentes.get(interaction.user.id);
  if (!pendente) {
    await interaction.reply({ content: 'Sessão expirada, clique em "Abrir Advertência" novamente.', ephemeral: true });
    return;
  }
  pendentes.delete(interaction.user.id);

  const titulo = interaction.fields.getTextInputValue('titulo');
  const evidencias = interaction.fields
    .getTextInputValue('evidencias')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((link) => ({ tipo: 'link', path: link }));

  const registro = await db.getMembro(pendente.membroId);
  let nomeReal = registro && registro.nome;
  if (!nomeReal) {
    const usuario = await interaction.client.users.fetch(pendente.membroId);
    nomeReal = usuario.tag;
  }

  const advertencia = await finalizarAbertura(interaction, {
    membroId: pendente.membroId,
    nomeReal,
    categoriaDeclaradaId: pendente.categoriaDeclaradaId,
    reincidencia: pendente.reincidencia,
    referenciaId: pendente.referenciaId,
    titulo,
    evidencias,
  });

  await interaction.reply({ content: `Advertência #${advertencia.id} registrada para ${nomeReal}.`, ephemeral: true });
}

async function handlePainelMinhasAdvertencias(interaction) {
  const [advertencias, categorias] = await Promise.all([
    db.listarAdvertenciasDoUsuario(interaction.user.id),
    db.getCategoriasAdvertencia(),
  ]);

  if (advertencias.length === 0) {
    return interaction.reply({ content: 'Você não possui advertências registradas.', ephemeral: true });
  }

  const nomeCategoria = (id) => categorias.find((c) => c.id === id)?.nome || '—';
  const embed = new EmbedBuilder().setTitle('Suas advertências').setColor(0x5865f2);

  for (const adv of advertencias.slice(0, 25)) {
    embed.addFields({
      name: `#${adv.id} — ${adv.titulo}`,
      value: `Categoria: ${nomeCategoria(adv.categoria_efetiva_id)}\nStatus: ${adv.status}\nAberta em: ${new Date(
        adv.data_abertura
      ).toLocaleDateString('pt-BR')}`,
    });
  }

  if (advertencias.length > 25) {
    embed.setFooter({ text: `Mostrando as 25 mais recentes de ${advertencias.length} no total.` });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePainelHistorico(interaction) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    return interaction.reply({ content: 'Você não tem permissão para ver esse histórico.', ephemeral: true });
  }

  const [advertencias, categorias] = await Promise.all([db.listarTodasAdvertencias(), db.getCategoriasAdvertencia()]);

  if (advertencias.length === 0) {
    return interaction.reply({ content: 'Nenhuma advertência encontrada.', ephemeral: true });
  }

  const nomeCategoria = (id) => categorias.find((c) => c.id === id)?.nome || '—';
  const embed = new EmbedBuilder().setTitle('Todas as advertências').setColor(0x5865f2);

  for (const adv of advertencias.slice(0, 25)) {
    embed.addFields({
      name: `#${adv.id} — ${adv.titulo}`,
      value:
        `Advertido: ${adv.nome_real} (<@${adv.discord_id}>)\n` +
        `Aberta por: <@${adv.autor_id}>\n` +
        `Categoria: ${nomeCategoria(adv.categoria_efetiva_id)}${adv.reincidencia ? ' (reincidência)' : ''}\n` +
        `Status: ${adv.status}\n` +
        `Aberta em: ${new Date(adv.data_abertura).toLocaleDateString('pt-BR')}`,
    });
  }

  if (advertencias.length > 25) {
    embed.setFooter({ text: `Mostrando as 25 mais recentes de ${advertencias.length} no total.` });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ---------- ciclo de vida pós-abertura (aceite, réplica, expulsão, prazos) ----------

// Confere se o clique é do advertido e se a advertência ainda espera a resposta dele
// (evita botões antigos reabrirem uma advertência já decidida)
async function validarRespostaAdvertido(interaction, id) {
  const advertencia = await db.getAdvertencia(id);
  if (!advertencia) {
    await interaction.reply({ content: 'Advertência não encontrada.', ephemeral: true });
    return null;
  }
  if (interaction.user.id !== advertencia.discord_id) {
    await interaction.reply({ content: 'Só o advertido pode responder a esta advertência.', ephemeral: true });
    return null;
  }
  if (advertencia.status !== 'aguardando_aceitacao') {
    await interaction.reply({ content: 'Esta advertência não está mais aguardando a sua resposta.', ephemeral: true });
    return null;
  }
  return advertencia;
}

// Confere permissão e se a advertência está aguardando decisão de quem abriu (status em_analise)
async function validarDecisaoAutor(interaction, id) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    await interaction.reply({ content: 'Só quem abriu a advertência ou o Presidente pode decidir isso.', ephemeral: true });
    return null;
  }
  const advertencia = await db.getAdvertencia(id);
  if (!advertencia) {
    await interaction.reply({ content: 'Advertência não encontrada.', ephemeral: true });
    return null;
  }
  if (advertencia.status !== 'em_analise') {
    await interaction.reply({ content: 'Esta advertência não está mais aguardando a sua decisão.', ephemeral: true });
    return null;
  }
  return advertencia;
}

async function handleBotaoCienteOuNaoConcordo(interaction, acao, id) {
  const advertencia = await validarRespostaAdvertido(interaction, id);
  if (!advertencia) return;

  if (acao === 'ciente') {
    await db.atualizarStatusAdvertencia(id, 'aguardando_aceitacao', 'em_vigencia', interaction.user.id, 'Ciência dada pelo advertido', DIAS_PARA_EXPIRAR);
    await interaction.update({
      content: 'Você deu ciência a esta advertência e se compromete a não repetir a situação.',
      embeds: [],
      components: [],
    });

    // Se houve troca de argumentos, avisa quem abriu que o advertido aceitou
    try {
      const argumentos = await db.listarArgumentos(id);
      if (argumentos.length > 0) {
        const canal = await interaction.client.channels.fetch(CANAL_ADVERTENCIAS_ID);
        await canal.send(`<@${advertencia.autor_id}> o advertido deu ciência à advertência #${id} após a troca de argumentos. Ela entrou em vigência.`);
      }
    } catch (err) {
      console.error('Erro ao avisar autor sobre ciência da advertência:', err);
    }
    return;
  }

  const modal = new ModalBuilder().setCustomId(`advertencia_replica_${id}`).setTitle('Justifique sua discordância');
  const justificativa = new TextInputBuilder()
    .setCustomId('justificativa')
    .setLabel('Por que você não concorda?')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1500)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(justificativa));
  await interaction.showModal(modal);
}

async function handleModalReplica(interaction, id) {
  const advertencia = await validarRespostaAdvertido(interaction, id);
  if (!advertencia) return;

  const justificativa = interaction.fields.getTextInputValue('justificativa');

  await db.registrarReplicaAdvertencia(id, justificativa, interaction.user.id);
  await db.atualizarStatusAdvertencia(id, 'aguardando_aceitacao', 'em_analise', interaction.user.id);
  await enviarDecisaoAoAutor(interaction.client, advertencia, justificativa);

  const resposta = { content: 'Sua justificativa foi enviada para análise.', embeds: [], components: [] };
  if (interaction.isFromMessage()) {
    await interaction.update(resposta); // tira os botões da mensagem original
  } else {
    await interaction.reply({ ...resposta, ephemeral: true });
  }
}

async function handleDecisaoReplica(interaction, decisao, id) {
  const advertencia = await validarDecisaoAutor(interaction, id);
  if (!advertencia) return;

  if (decisao === 'perdoar') {
    await db.atualizarStatusAdvertencia(id, 'em_analise', 'perdoada', interaction.user.id);
    await interaction.update({ content: `Advertência #${id} perdoada.`, embeds: [], components: [] });
    return;
  }

  await db.atualizarStatusAdvertencia(
    id,
    'em_analise',
    'em_vigencia',
    interaction.user.id,
    'Réplica não aceita — advertência mantida',
    DIAS_PARA_EXPIRAR
  );
  await interaction.update({ content: `Advertência #${id} mantida em vigência.`, embeds: [], components: [] });
}

// Botão "Contra-Argumentar": abre o modal para quem abriu a advertência escrever o argumento
async function handleBotaoContraArgumentar(interaction, id) {
  const advertencia = await validarDecisaoAutor(interaction, id);
  if (!advertencia) return;

  const modal = new ModalBuilder().setCustomId(`advertencia_contra_modal_${id}`).setTitle('Contra-argumento');
  const argumento = new TextInputBuilder()
    .setCustomId('argumento')
    .setLabel('Seu contra-argumento ao advertido')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1500)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(argumento));
  await interaction.showModal(modal);
}

// Envia o contra-argumento ao advertido e volta a advertência para "aguardando_aceitacao"
async function handleModalContraArgumento(interaction, id) {
  const advertencia = await validarDecisaoAutor(interaction, id);
  if (!advertencia) return;

  const texto = interaction.fields.getTextInputValue('argumento');

  // Envia primeiro: se falhar, nada é gravado e dá pra tentar de novo
  await enviarContraArgumentoAoAdvertido(interaction.client, advertencia, texto);
  await db.registrarArgumento(id, 'contra_argumento', interaction.user.id, texto);
  await db.atualizarStatusAdvertencia(id, 'em_analise', 'aguardando_aceitacao', interaction.user.id, 'Contra-argumento enviado ao advertido');

  const resposta = {
    content: `Contra-argumento enviado ao advertido (advertência #${id}). Aguardando a resposta dele.`,
    embeds: [],
    components: [],
  };
  if (interaction.isFromMessage()) {
    await interaction.update(resposta);
  } else {
    await interaction.reply({ ...resposta, ephemeral: true });
  }
}

async function handleDecisaoExpulsao(interaction, decisao, id) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    await interaction.reply({ content: 'Só quem abriu a advertência ou o Presidente pode decidir isso.', ephemeral: true });
    return;
  }

  await db.registrarDecisaoExpulsao(id, decisao === 'sim');
  await interaction.update({
    content:
      decisao === 'sim'
        ? 'Registrado: decisão de expulsar. A remoção do servidor precisa ser feita manualmente.'
        : 'Registrado: decisão de não expulsar. A ocorrência permanece em vigor.',
    components: [],
  });
}

async function handleReenviarOuCancelar(interaction, acao, id) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    await interaction.reply({ content: 'Só quem abriu a advertência ou o Presidente pode decidir isso.', ephemeral: true });
    return;
  }

  if (acao === 'cancelar') {
    await db.atualizarStatusAdvertencia(id, 'sem_resposta', 'cancelada', interaction.user.id, 'Cancelada após falta de resposta');
    await interaction.update({ content: `Advertência #${id} cancelada.`, components: [] });
    return;
  }

  const advertencia = await db.getAdvertencia(id);
  const argumentos = await db.listarArgumentos(id);
  const ultimo = argumentos[argumentos.length - 1];
  if (ultimo && ultimo.tipo === 'contra_argumento') {
    await enviarContraArgumentoAoAdvertido(interaction.client, advertencia, ultimo.texto);
  } else {
    await enviarNotificacaoAdvertido(interaction.client, advertencia);
  }
  await db.atualizarStatusAdvertencia(id, 'sem_resposta', 'aguardando_aceitacao', interaction.user.id, 'Reenviada após falta de resposta');
  await interaction.update({ content: `Advertência #${id} reenviada ao advertido.`, components: [] });
}

/**
 * Roteador do sistema de advertências. Retorna true se tratou a interação —
 * mesmo padrão de handleResolverLembrete, pra entrar na cadeia do interactionCreate.
 */
async function handleAdvertenciaInteraction(interaction) {
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'advertencia_modal') {
      await handleModalAbertura(interaction);
      return true;
    }
    if (interaction.customId === 'advertencia_painel_modal') {
      await handleModalPainel(interaction);
      return true;
    }
    const contraMatch = interaction.customId.match(/^advertencia_contra_modal_(\d+)$/);
    if (contraMatch) {
      await handleModalContraArgumento(interaction, contraMatch[1]);
      return true;
    }
    const replicaMatch = interaction.customId.match(/^advertencia_replica_(\d+)$/);
    if (replicaMatch) {
      await handleModalReplica(interaction, replicaMatch[1]);
      return true;
    }
    return false;
  }

  if (interaction.isUserSelectMenu() && interaction.customId === 'advertencia_painel_select_membro') {
    await handleSelecaoMembro(interaction);
    return true;
  }

  if (interaction.isStringSelectMenu()) {
    const catMatch = interaction.customId.match(/^advertencia_painel_select_categoria_(\d+)$/);
    if (catMatch) {
      await handleSelecaoCategoria(interaction, catMatch[1]);
      return true;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'advertencia_painel_abrir') {
      await iniciarPainelAbrirAdvertencia(interaction);
      return true;
    }
    if (interaction.customId === 'advertencia_painel_minhas') {
      await handlePainelMinhasAdvertencias(interaction);
      return true;
    }
    if (interaction.customId === 'advertencia_painel_historico') {
      await handlePainelHistorico(interaction);
      return true;
    }

    let match = interaction.customId.match(/^advertencia_painel_reincidencia_(sim|nao)_(\d+)_(\d+)$/);
    if (match) {
      await handleReincidenciaPainel(interaction, match[1], match[2], match[3]);
      return true;
    }

    match = interaction.customId.match(/^advertencia_(ciente|naoconcordo)_(\d+)$/);
    if (match) {
      await handleBotaoCienteOuNaoConcordo(interaction, match[1], match[2]);
      return true;
    }

    match = interaction.customId.match(/^advertencia_contra_(\d+)$/);
    if (match) {
      await handleBotaoContraArgumentar(interaction, match[1]);
      return true;
    }

    match = interaction.customId.match(/^advertencia_(perdoar|prosseguir)_(\d+)$/);
    if (match) {
      await handleDecisaoReplica(interaction, match[1], match[2]);
      return true;
    }

    match = interaction.customId.match(/^advertencia_expulsar_(sim|nao)_(\d+)$/);
    if (match) {
      await handleDecisaoExpulsao(interaction, match[1], match[2]);
      return true;
    }

    match = interaction.customId.match(/^advertencia_(reenviar|cancelar)_(\d+)$/);
    if (match) {
      await handleReenviarOuCancelar(interaction, match[1], match[2]);
      return true;
    }
  }

  return false;
}

function iniciarCronAdvertencias(client) {
  cron.schedule('0 6 * * *', async () => {
    try {
      const semResposta = await db.listarAdvertenciasSemRespostaVencidas(DIAS_PARA_RESPONDER);
      const canal = await client.channels.fetch(CANAL_ADVERTENCIAS_ID);

      for (const adv of semResposta) {
        await db.atualizarStatusAdvertencia(adv.id, 'aguardando_aceitacao', 'sem_resposta', 'sistema');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`advertencia_reenviar_${adv.id}`).setLabel('Reenviar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`advertencia_cancelar_${adv.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );
        await canal.send({
          content: `<@${adv.autor_id}> a advertência #${adv.id} (${adv.nome_real}) passou de ${DIAS_PARA_RESPONDER} dias sem resposta.`,
          components: [row],
        });
      }

      await db.expirarAdvertenciasVencidas();
    } catch (err) {
      console.error('Erro no cron de advertências:', err);
    }
  });
}

module.exports = {
  iniciarFluxoAdvertencia,
  handleAdvertenciaInteraction,
  iniciarCronAdvertencias,
  podeAbrirAdvertencia,
  montarPainel,
};
