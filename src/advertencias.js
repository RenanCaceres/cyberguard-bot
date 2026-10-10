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
const CANAL_ADVERTENCIAS_ID = process.env.CANAL_ADVERTENCIAS_ID || '1549583670011101376';
const AUTORES_PERMITIDOS = process.env.AUTORES_ADVERTENCIA_IDS
  ? process.env.AUTORES_ADVERTENCIA_IDS.split(',').map((id) => id.trim()).filter(Boolean)
  : ['371773713101619201', '736695528494202921'];

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

  const pendenteAtual = await db.getAdvertenciaPendenteDoUsuario(membroId);
  const enfileirada = Boolean(pendenteAtual);
  const statusInicial = enfileirada ? 'na_fila' : 'aguardando_aceitacao';

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
    statusInicial,
  });

  if (enfileirada) {
    const filaMembro = await db.listarFilaAdvertencias(membroId);
    const posicaoFila = filaMembro.length;
    try {
      const canal = await interaction.client.channels.fetch(CANAL_ADVERTENCIAS_ID);
      await canal.send(
        `⏳ **Fila de Advertências:** Nova advertência **#${advertencia.id}** (*${titulo}*) aberta por <@${interaction.user.id}> para **${nomeReal}** (<@${membroId}>) foi colocada na **${posicaoFila}ª posição da fila**, pois a advertência **#${pendenteAtual.id}** ainda aguarda resolução.`
      );
    } catch (err) {
      console.error('Erro ao notificar canal sobre advertência na fila:', err);
    }
    return { advertencia, enfileirada: true, pendenteAtual, posicaoFila };
  }

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

  return { advertencia, enfileirada: false, pendenteAtual: null, posicaoFila: 0 };
}

/**
 * Retira uma advertência da fila, revalida se eventual reincidência continua válida
 * (caso a anterior tenha sido perdoada/cancelada) e envia ao advertido.
 */
async function ativarAdvertenciaDaFila(
  client,
  advertencia,
  alteradoPor = 'sistema',
  motivo = 'Enviada automaticamente após conclusão da advertência anterior'
) {
  let advAtualizada = advertencia;
  const categorias = await db.getCategoriasAdvertencia();
  const declarada = categorias.find((c) => c.id === advertencia.categoria_declarada_id);

  if (advertencia.reincidencia) {
    const emVigencia = await db.getAdvertenciasEstritamenteEmVigencia(
      advertencia.discord_id,
      advertencia.categoria_declarada_id
    );
    if (emVigencia.length === 0) {
      advAtualizada = await db.atualizarCategoriaAdvertencia(advertencia.id, {
        categoriaEfetivaId: advertencia.categoria_declarada_id,
        reincidencia: false,
        advertenciaReferenciaId: null,
      });
    } else if (
      !advertencia.advertencia_referencia_id ||
      !emVigencia.some((a) => a.id === advertencia.advertencia_referencia_id)
    ) {
      advAtualizada = await db.atualizarCategoriaAdvertencia(advertencia.id, {
        categoriaEfetivaId: advertencia.categoria_efetiva_id,
        reincidencia: true,
        advertenciaReferenciaId: emVigencia[0].id,
      });
    }
  }

  await db.atualizarStatusAdvertencia(advAtualizada.id, 'na_fila', 'aguardando_aceitacao', alteradoPor, motivo);
  await enviarNotificacaoAdvertido(client, advAtualizada);

  try {
    const canal = await client.channels.fetch(CANAL_ADVERTENCIAS_ID);
    await canal.send(
      `📤 **Fila de Advertências:** A advertência **#${advAtualizada.id}** (*${advAtualizada.titulo}*) para **${advAtualizada.nome_real}** (<@${advAtualizada.discord_id}>) saiu da fila e foi enviada ao membro (aberta por <@${advAtualizada.autor_id}>).`
    );

    if (advAtualizada.reincidencia && declarada && declarada.ordem === 3) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`advertencia_expulsar_sim_${advAtualizada.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`advertencia_expulsar_nao_${advAtualizada.id}`).setLabel('Não expulsar').setStyle(ButtonStyle.Secondary)
      );
      await canal.send({
        content: `⚠️ ${advAtualizada.nome_real} já teve advertência **Grave** e reincidiu novamente (advertência #${advAtualizada.id}). Decisão:`,
        components: [row],
      });
    }
  } catch (err) {
    console.error('Erro ao notificar canal sobre disparo de advertência da fila:', err);
  }

  return advAtualizada;
}

/**
 * Verifica se o membro não tem mais nenhuma advertência travando a fila e,
 * se houver alguma em 'na_fila', dispara a próxima automaticamente.
 */
async function processarFilaAdvertencias(client, discordId) {
  try {
    const pendente = await db.getAdvertenciaPendenteDoUsuario(discordId);
    if (pendente) return null;

    const proxima = await db.obterProximaAdvertenciaNaFila(discordId);
    if (!proxima) return null;

    return await ativarAdvertenciaDaFila(client, proxima);
  } catch (err) {
    console.error('Erro ao processar fila de advertências:', err);
    return null;
  }
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
        content: `Nenhuma advertência "${categoriaNome}" em vigência ou em andamento para ${membro.tag} — não é reincidência válida nessa categoria.`,
        ephemeral: true,
      });
    }
    referenciaId = emVigencia[0].id;
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

  const { advertencia, enfileirada, pendenteAtual, posicaoFila } = await finalizarAbertura(interaction, {
    membroId: pendente.membroId,
    nomeReal: pendente.nomeReal,
    categoriaDeclaradaId: pendente.categoriaDeclaradaId,
    reincidencia: pendente.reincidencia,
    referenciaId: pendente.referenciaId,
    titulo,
    evidencias,
  });

  if (enfileirada) {
    await interaction.reply({
      content: `⏳ Advertência **#${advertencia.id}** registrada na **fila** para **${pendente.nomeReal}** (${posicaoFila}ª na fila — aguardando conclusão da advertência #${pendenteAtual.id}). Assim que a atual for finalizada, esta será enviada automaticamente!`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: `✅ Advertência #${advertencia.id} registrada e enviada para ${pendente.nomeReal}.`, ephemeral: true });
}

// ---------- painel (botões + select menus, sem digitar slash command) ----------

function montarPainel() {
  const embed = new EmbedBuilder()
    .setTitle('📋 Sistema de Advertências')
    .setDescription(
      'Use os botões abaixo para abrir uma advertência (se o membro já tiver uma pendente de ciência/análise, ela entra automaticamente na **fila**), gerenciar a fila, ver as suas ou consultar o histórico completo.'
    )
    .setColor(0xd85a30);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('advertencia_painel_abrir').setLabel('Abrir Advertência').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
    new ButtonBuilder().setCustomId('advertencia_painel_fila').setLabel('Fila de Advertências').setStyle(ButtonStyle.Secondary).setEmoji('⏳'),
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
  const [categorias, pendenteAtual, filaMembro] = await Promise.all([
    db.getCategoriasAdvertencia(),
    db.getAdvertenciaPendenteDoUsuario(membro.id),
    db.listarFilaAdvertencias(membro.id),
  ]);

  const select = new StringSelectMenuBuilder()
    .setCustomId(`advertencia_painel_select_categoria_${membro.id}`)
    .setPlaceholder('Selecione a categoria')
    .addOptions(categorias.map((c) => ({ label: c.nome, value: String(c.id), description: c.comportamento.slice(0, 100) })));

  const avisoFila = pendenteAtual
    ? `\n> ⏳ **Atenção:** Este membro já possui a advertência **#${pendenteAtual.id}** pendente (${pendenteAtual.status})${
        filaMembro.length > 0 ? ` e outras **${filaMembro.length}** na fila` : ''
      }. A nova advertência será adicionada automaticamente à **fila** para envio assim que a atual for concluída.`
    : '';

  await interaction.update({
    content: `Advertindo **${nomeReal}** (@${membro.tag}).${avisoFila}\nSelecione a categoria:`,
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

  await interaction.update({ content: 'É reincidência de uma advertência em vigência (ou em andamento) na mesma categoria?', components: [row] });
}

async function handleReincidenciaPainel(interaction, resposta, membroId, categoriaId) {
  let referenciaId = null;

  if (resposta === 'sim') {
    const emVigencia = await db.getAdvertenciasEmVigencia(membroId, categoriaId);
    if (emVigencia.length === 0) {
      await interaction.update({
        content: 'Nenhuma advertência em vigência ou em andamento nessa categoria — não é reincidência válida. Fluxo cancelado.',
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

  const { advertencia, enfileirada, pendenteAtual, posicaoFila } = await finalizarAbertura(interaction, {
    membroId: pendente.membroId,
    nomeReal,
    categoriaDeclaradaId: pendente.categoriaDeclaradaId,
    reincidencia: pendente.reincidencia,
    referenciaId: pendente.referenciaId,
    titulo,
    evidencias,
  });

  if (enfileirada) {
    await interaction.reply({
      content: `⏳ Advertência **#${advertencia.id}** registrada na **fila** para **${nomeReal}** (${posicaoFila}ª na fila — aguardando conclusão da advertência #${pendenteAtual.id}). Assim que a atual for finalizada, esta será enviada automaticamente!`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: `✅ Advertência #${advertencia.id} registrada e enviada para ${nomeReal}.`, ephemeral: true });
}

async function handlePainelFila(interaction) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    return interaction.reply({ content: 'Você não tem permissão para visualizar ou gerenciar a fila de advertências.', ephemeral: true });
  }

  const [fila, categorias] = await Promise.all([db.listarFilaAdvertencias(), db.getCategoriasAdvertencia()]);

  if (fila.length === 0) {
    return interaction.reply({ content: '⏳ Nenhuma advertência na fila de espera no momento.', ephemeral: true });
  }

  const nomeCategoria = (id) => categorias.find((c) => c.id === id)?.nome || '—';
  const embed = new EmbedBuilder()
    .setTitle('⏳ Fila de Advertências Pendentes')
    .setDescription(
      'As advertências abaixo aguardam a conclusão da advertência atual de cada membro para serem enviadas automaticamente. Você também pode selecionar uma abaixo para forçar o envio imediato ou cancelá-la.'
    )
    .setColor(0xef9f27);

  const contadorPorMembro = new Map();
  for (const adv of fila.slice(0, 25)) {
    const pos = (contadorPorMembro.get(adv.discord_id) || 0) + 1;
    contadorPorMembro.set(adv.discord_id, pos);
    embed.addFields({
      name: `#${adv.id} — ${adv.titulo} (${pos}ª na fila do membro)`,
      value:
        `Advertido: **${adv.nome_real}** (<@${adv.discord_id}>)\n` +
        `Aberta por: <@${adv.autor_id}>\n` +
        `Categoria: ${nomeCategoria(adv.categoria_efetiva_id)}${adv.reincidencia ? ' (reincidência)' : ''}\n` +
        `Criada em: ${new Date(adv.data_abertura).toLocaleDateString('pt-BR')}`,
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('advertencia_fila_select')
    .setPlaceholder('Selecione uma advertência da fila para gerenciar')
    .addOptions(
      fila.slice(0, 25).map((adv) => ({
        label: `#${adv.id} — ${adv.nome_real}`.slice(0, 100),
        value: String(adv.id),
        description: `${adv.titulo} (${nomeCategoria(adv.categoria_efetiva_id)})`.slice(0, 100),
      }))
    );

  await interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}

async function handleFilaSelect(interaction) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    return interaction.reply({ content: 'Você não tem permissão para gerenciar a fila.', ephemeral: true });
  }

  const id = Number(interaction.values[0]);
  const advertencia = await db.getAdvertencia(id);
  if (!advertencia || advertencia.status !== 'na_fila') {
    return interaction.update({ content: 'Esta advertência não está mais na fila.', embeds: [], components: [] });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`advertencia_fila_enviar_${advertencia.id}`)
      .setLabel('Enviar Agora')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(`advertencia_fila_cancelar_${advertencia.id}`)
      .setLabel('Cancelar da Fila')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
  );

  await interaction.update({
    content: `Gerenciando advertência na fila **#${advertencia.id}** (*${advertencia.titulo}*) para **${advertencia.nome_real}**:`,
    embeds: [],
    components: [row],
  });
}

async function handleFilaAcao(interaction, acao, id) {
  if (!podeAbrirAdvertencia(interaction.user.id)) {
    return interaction.reply({ content: 'Você não tem permissão para gerenciar a fila.', ephemeral: true });
  }

  const advertencia = await db.getAdvertencia(id);
  if (!advertencia || advertencia.status !== 'na_fila') {
    return interaction.update({ content: 'Esta advertência não está mais na fila.', components: [] });
  }

  if (acao === 'cancelar') {
    await db.atualizarStatusAdvertencia(id, 'na_fila', 'cancelada', interaction.user.id, 'Cancelada enquanto estava na fila');
    await interaction.update({ content: `🗑️ Advertência #${id} removida da fila e cancelada.`, components: [] });
    return;
  }

  await ativarAdvertenciaDaFila(interaction.client, advertencia, interaction.user.id, 'Envio imediato forçado manualmente pela liderança');
  await interaction.update({ content: `🚀 Advertência #${id} retirada da fila e enviada agora para **${advertencia.nome_real}**.`, components: [] });
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

    await processarFilaAdvertencias(interaction.client, advertencia.discord_id);
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
    await processarFilaAdvertencias(interaction.client, advertencia.discord_id);
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
  await processarFilaAdvertencias(interaction.client, advertencia.discord_id);
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

  const advertencia = await db.getAdvertencia(id);
  if (!advertencia) {
    await interaction.reply({ content: 'Advertência não encontrada.', ephemeral: true });
    return;
  }

  if (acao === 'cancelar') {
    await db.atualizarStatusAdvertencia(id, 'sem_resposta', 'cancelada', interaction.user.id, 'Cancelada após falta de resposta');
    await interaction.update({ content: `Advertência #${id} cancelada.`, components: [] });
    await processarFilaAdvertencias(interaction.client, advertencia.discord_id);
    return;
  }

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
    if (interaction.customId === 'advertencia_fila_select') {
      await handleFilaSelect(interaction);
      return true;
    }
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
    if (interaction.customId === 'advertencia_painel_fila') {
      await handlePainelFila(interaction);
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

    let match = interaction.customId.match(/^advertencia_fila_(enviar|cancelar)_(\d+)$/);
    if (match) {
      await handleFilaAcao(interaction, match[1], Number(match[2]));
      return true;
    }

    match = interaction.customId.match(/^advertencia_painel_reincidencia_(sim|nao)_(\d+)_(\d+)$/);
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
