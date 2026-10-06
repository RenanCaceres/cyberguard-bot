'use strict';
// Sistema de ponto do CyberGuard: painel com botões, tarefas do Notion, logs, resumo (Líderes) e ranking semanal.
// Ponto de entrada para o index.js: handlePontoInteraction(interaction) -> boolean (tratado) e init(client).

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const notion = require('./notion');
const pdb = require('./pontoDb');

const EPH = MessageFlags.Ephemeral;
const POR_PAGINA_SELECT = 25; // limite do Discord para opções de um select
const POR_PAGINA_HIST = 6;

const cfg = () => ({
  lideres: process.env.PONTO_ROLE_LIDERES_ID,
  logs: process.env.PONTO_LOG_CHANNEL_ID,
  ranking: process.env.PONTO_RANKING_CHANNEL_ID,
  maxHoras: Number(process.env.PONTO_MAX_HORAS ?? 8), // 0 desativa o fechamento automático
});

// ---------- utilitários ----------
const trunc = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const unix = (d) => Math.floor(new Date(d).getTime() / 1000);
const ts = (d, f = 'f') => `<t:${unix(d)}:${f}>`; // o Discord mostra no fuso de quem lê
const fmtDur = (seg) => {
  const min = Math.round(seg / 60);
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};
const nomeDe = (i) => i.member?.displayName ?? i.user.globalName ?? i.user.username;
const umaLinha = (s) => String(s ?? '').replace(/\s*\n+\s*/g, ' ').trim();

// Mensagens efêmeras se apagam sozinhas (evita acumular lixo no canal do ponto).
const expirar = (interaction, ms) => {
  const t = setTimeout(() => interaction.deleteReply().catch(() => {}), ms);
  t.unref?.();
};

function isLider(interaction) {
  const roleId = cfg().lideres;
  const roles = interaction.member?.roles;
  if (!roleId || !roles) return false;
  return Array.isArray(roles) ? roles.includes(roleId) : roles.cache.has(roleId);
}

const btn = (id, label, style, emoji) => {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
};

async function logar(client, embed) {
  const id = cfg().logs;
  if (!id) return;
  try {
    const canal = await client.channels.fetch(id);
    await canal.send({ embeds: [embed] });
  } catch (e) {
    console.error('[ponto] falha ao enviar log:', e.message);
  }
}

// ---------- painel ----------
async function enviarPainel(canal) {
  const embed = new EmbedBuilder()
    .setColor(0x1f6feb)
    .setTitle('⏱️ Controle de Ponto — CyberGuard')
    .setDescription(
      'Para abrir ou fechar o seu ponto, clique nos botões abaixo.\n' +
      'Ao **abrir**, você escolhe a tarefa do Notion em que vai trabalhar. ' +
      'Ao **fechar**, informa o progresso e descreve o que fez e o que falta.\n' +
      'Você também pode ver quem está em serviço e o ranking da semana.',
    );
  const linha = new ActionRowBuilder().addComponents(
    btn('ponto:abrir', 'Abrir ponto', ButtonStyle.Success, '🟢'),
    btn('ponto:fechar', 'Fechar ponto', ButtonStyle.Danger, '🔴'),
    btn('ponto:lista', 'Lista', ButtonStyle.Secondary, '📋'),
    btn('ponto:ranking', 'Ranking', ButtonStyle.Secondary, '🏆'),
    btn('ponto:resumo', 'Resumo', ButtonStyle.Primary, '📊'),
  );
  await canal.send({ embeds: [embed], components: [linha] });
}

// ---------- abrir ponto ----------
function montarSelecaoTarefas(tarefas, pagina) {
  const totalPag = Math.max(1, Math.ceil(tarefas.length / POR_PAGINA_SELECT));
  pagina = Math.min(Math.max(pagina, 0), totalPag - 1);
  const fatia = tarefas.slice(pagina * POR_PAGINA_SELECT, (pagina + 1) * POR_PAGINA_SELECT);

  const select = new StringSelectMenuBuilder()
    .setCustomId('ponto:tarefa')
    .setPlaceholder('Escolha a tarefa em que vai trabalhar')
    .addOptions(
      fatia.map((t) => ({
        label: trunc(t.titulo, 100),
        value: t.id,
        description: trunc([t.status ?? 'sem status', t.responsavel].filter(Boolean).join(' · '), 100),
      })),
    );

  const linhas = [new ActionRowBuilder().addComponents(select)];
  if (totalPag > 1) {
    linhas.push(
      new ActionRowBuilder().addComponents(
        btn(`ponto:pag:${pagina - 1}`, '◀', ButtonStyle.Secondary).setDisabled(pagina === 0),
        btn('ponto:pag_info', `${pagina + 1}/${totalPag}`, ButtonStyle.Secondary).setDisabled(true),
        btn(`ponto:pag:${pagina + 1}`, '▶', ButtonStyle.Secondary).setDisabled(pagina >= totalPag - 1),
      ),
    );
  }
  return { content: `Selecione a tarefa (${tarefas.length} em aberto):`, components: linhas };
}

async function abrirFluxo(interaction) {
  const aberto = await pdb.getAberto(interaction.user.id);
  if (aberto) {
    await interaction.reply({
      content: `⚠️ Você já tem um ponto aberto desde ${ts(aberto.aberto_em)} em **${aberto.tarefa_titulo}**. Feche-o antes de abrir outro.`,
      flags: EPH,
    });
    return expirar(interaction, 10_000);
  }
  await interaction.deferReply({ flags: EPH });
  let tarefas;
  try {
    tarefas = await notion.listarTarefasAbertas();
  } catch (e) {
    console.error('[ponto] notion (listar):', e.message);
    await interaction.editReply('❌ Não consegui consultar as tarefas no Notion agora. Tente de novo em instantes.');
    return expirar(interaction, 10_000);
  }
  if (!tarefas.length) {
    await interaction.editReply('Nenhuma tarefa em aberto no Notion.');
    return expirar(interaction, 10_000);
  }
  await interaction.editReply(montarSelecaoTarefas(tarefas, 0));
  return expirar(interaction, 120_000); // some sozinho se a pessoa desistir de escolher
}

async function paginaTarefas(interaction, pagina) {
  await interaction.deferUpdate();
  let tarefas;
  try {
    tarefas = await notion.listarTarefasAbertas();
  } catch (e) {
    console.error('[ponto] notion (listar):', e.message);
    return interaction.editReply({ content: '❌ Falha ao consultar o Notion. Clique em Abrir ponto de novo.', components: [] });
  }
  return interaction.editReply(montarSelecaoTarefas(tarefas, pagina));
}

async function escolherTarefa(interaction) {
  const tarefaId = interaction.values[0];
  const titulo = interaction.component?.options?.find((o) => o.value === tarefaId)?.label ?? 'Tarefa';
  const row = await pdb.abrir({
    discordId: interaction.user.id,
    nome: nomeDe(interaction),
    usuario: interaction.user.username,
    tarefaId,
    tarefaTitulo: titulo,
  });
  if (!row) {
    await interaction.update({ content: '⚠️ Você já tem um ponto aberto.', components: [] });
    return expirar(interaction, 10_000);
  }
  await interaction.update({
    content: `🟢 Ponto aberto às ${ts(row.aberto_em, 't')} para **${titulo}**.\nQuando terminar, clique em **Fechar ponto**.`,
    components: [],
  });
  expirar(interaction, 12_000);
  await logar(
    interaction.client,
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🟢 Ponto aberto')
      .addFields(
        { name: 'Membro', value: `<@${row.discord_id}> (${row.nome})`, inline: true },
        { name: 'Tarefa', value: trunc(row.tarefa_titulo, 256), inline: true },
        { name: 'Horário', value: ts(row.aberto_em), inline: true },
      ),
  );
}

// ---------- fechar ponto ----------
async function fecharFluxo(interaction) {
  const aberto = await pdb.getAberto(interaction.user.id);
  if (!aberto) {
    await interaction.reply({ content: '⚠️ Você não tem ponto aberto.', flags: EPH });
    return expirar(interaction, 10_000);
  }
  const campo = (id, label, estilo, obrigatorio, placeholder, max) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(id).setLabel(label).setStyle(estilo)
        .setRequired(obrigatorio).setPlaceholder(placeholder).setMaxLength(max),
    );
  const modal = new ModalBuilder()
    .setCustomId('ponto:fechar_modal')
    .setTitle('Fechar ponto')
    .addComponents(
      campo('progresso', 'Progresso da tarefa (0 a 100)', TextInputStyle.Short, true, 'Ex.: 60', 4),
      campo('feito', 'O que você fez', TextInputStyle.Paragraph, true, 'Resumo breve do que foi feito neste ponto', 800),
      campo('falta', 'O que falta (obrigatório se < 100%)', TextInputStyle.Paragraph, false, 'O que ainda precisa ser feito', 800),
    );
  return interaction.showModal(modal);
}

async function fecharModal(interaction) {
  const bruto = interaction.fields.getTextInputValue('progresso').replace('%', '').trim();
  const feito = interaction.fields.getTextInputValue('feito').trim();
  const falta = interaction.fields.getTextInputValue('falta').trim();
  const progresso = /^\d{1,3}$/.test(bruto) ? Number(bruto) : NaN;

  const devolver = (motivo) =>
    interaction.reply({
      content: `⚠️ ${motivo}\nSeu ponto continua aberto. Seu texto, pra copiar:\n\`\`\`\n${trunc(feito, 700)}\n---\n${trunc(falta, 700)}\n\`\`\``,
      flags: EPH,
    });

  if (!(progresso >= 0 && progresso <= 100)) return devolver(`Progresso inválido ("${trunc(bruto, 10)}"). Use um número de 0 a 100.`).then(() => expirar(interaction, 60_000));
  if (progresso < 100 && !falta) return devolver('Com progresso abaixo de 100%, descreva o que falta.').then(() => expirar(interaction, 60_000));

  await interaction.deferReply({ flags: EPH });
  const row = await pdb.fechar(interaction.user.id, { progresso, feito, falta });
  if (!row) {
    await interaction.editReply('⚠️ Nenhum ponto aberto (ele pode ter sido encerrado automaticamente).');
    return expirar(interaction, 10_000);
  }
  const seg = (new Date(row.fechado_em) - new Date(row.aberto_em)) / 1000;

  // As horas já estão salvas no Postgres; o Notion é "best effort".
  let notionOk = true;
  try {
    await notion.atualizarTarefa(row.tarefa_id, progresso);
  } catch (e) {
    notionOk = false;
    console.error('[ponto] notion (atualizar):', e.message);
  }
  try {
    await notion.comentar(
      row.tarefa_id,
      `⏱ Ponto de ${row.nome} (@${row.usuario}) — ${fmtDur(seg)} — progresso: ${progresso}%\n` +
      `O que foi feito: ${feito}\nO que falta: ${falta || '—'}`,
    );
  } catch (e) {
    notionOk = false;
    console.error('[ponto] notion (comentar):', e.message);
  }
  await pdb.marcarNotion(row.id, notionOk);

  const destino = progresso >= 100 ? '**Concluída** ✅' : `**Em andamento** (${progresso}%)`;
  await interaction.editReply(
    `🔴 Ponto fechado. Duração: **${fmtDur(seg)}** em **${row.tarefa_titulo}** → ${destino}` +
    (notionOk ? '' : '\n⚠️ Suas horas foram salvas, mas não consegui atualizar o Notion. Avise um Líder.'),
  );
  expirar(interaction, notionOk ? 20_000 : 60_000);

  await logar(
    interaction.client,
    new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🔴 Ponto fechado')
      .addFields(
        { name: 'Membro', value: `<@${row.discord_id}> (${row.nome})`, inline: true },
        { name: 'Tarefa', value: trunc(row.tarefa_titulo, 256), inline: true },
        { name: 'Duração', value: fmtDur(seg), inline: true },
        { name: 'Progresso', value: `${progresso}%`, inline: true },
        { name: 'Notion', value: notionOk ? 'sincronizado' : '⚠️ falhou', inline: true },
        { name: 'O que fez', value: trunc(feito, 1024) },
        { name: 'O que falta', value: trunc(falta || '—', 1024) },
      ),
  );
}

// ---------- lista / ranking ----------
async function lista(interaction) {
  const abertos = await pdb.listarAbertos();
  const desc = abertos.length
    ? abertos
        .map((p) => `🟢 **${p.nome}** — ${trunc(p.tarefa_titulo, 80)}\n⠀desde ${ts(p.aberto_em, 't')} (${ts(p.aberto_em, 'R')})`)
        .join('\n')
    : 'Ninguém em serviço agora.';
  const embed = new EmbedBuilder().setColor(0x2ecc71).setTitle('📋 Em serviço agora').setDescription(trunc(desc, 4000));
  await interaction.reply({ embeds: [embed], flags: EPH });
  return expirar(interaction, 60_000);
}

async function embedRanking(semanasAtras) {
  const rows = await pdb.ranking(semanasAtras);
  const medalhas = ['🥇', '🥈', '🥉'];
  const desc = rows.length
    ? rows.map((r, i) => `${medalhas[i] ?? `**${i + 1}.**`} ${r.nome} — **${fmtDur(r.seg)}**`).join('\n')
    : 'Sem pontos registrados nessa semana.';
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(semanasAtras === 0 ? '🏆 Ranking da semana (parcial)' : '🏆 Ranking da semana passada')
    .setDescription(desc)
    .setFooter({ text: 'Semana de segunda a domingo (horário de Brasília)' });
}

async function rankingBotao(interaction) {
  await interaction.reply({ embeds: [await embedRanking(0)], flags: EPH });
  return expirar(interaction, 60_000);
}

// ---------- resumo (só Líderes) ----------
async function resumo(interaction, pagina, atualizar) {
  const alunos = await pdb.resumoPorAluno();
  if (!alunos.length) {
    const msg = { content: 'Ainda não há pontos registrados.', flags: EPH };
    return atualizar ? interaction.update({ content: msg.content, embeds: [], components: [] }) : interaction.reply(msg);
  }
  const totalPag = Math.ceil(alunos.length / POR_PAGINA_SELECT);
  pagina = Math.min(Math.max(pagina, 0), totalPag - 1);
  const fatia = alunos.slice(pagina * POR_PAGINA_SELECT, (pagina + 1) * POR_PAGINA_SELECT);
  const geral = alunos.reduce((s, a) => s + a.seg, 0);

  const linhas = fatia.map(
    (a, i) =>
      `${pagina * POR_PAGINA_SELECT + i + 1}. ${a.em_servico ? '🟢 ' : ''}**${a.nome}** (@${a.usuario}) — **${fmtDur(a.seg)}** · ${a.pontos} ponto(s)`,
  );
  const embed = new EmbedBuilder()
    .setColor(0x1f6feb)
    .setTitle('📊 Resumo de horas')
    .setDescription(trunc(linhas.join('\n'), 4000))
    .setFooter({ text: `Página ${pagina + 1}/${totalPag} · ${alunos.length} membro(s) · total geral: ${fmtDur(geral)}` });

  const select = new StringSelectMenuBuilder()
    .setCustomId('ponto:aluno')
    .setPlaceholder('Ver o histórico detalhado de um membro')
    .addOptions(
      fatia.map((a) => ({
        label: trunc(a.nome, 100),
        value: a.discord_id,
        description: trunc(`@${a.usuario} · ${fmtDur(a.seg)}`, 100),
      })),
    );
  const componentes = [new ActionRowBuilder().addComponents(select)];
  if (totalPag > 1) {
    componentes.push(
      new ActionRowBuilder().addComponents(
        btn(`ponto:resumo_pag:${pagina - 1}`, '◀', ButtonStyle.Secondary).setDisabled(pagina === 0),
        btn(`ponto:resumo_pag:${pagina + 1}`, '▶', ButtonStyle.Secondary).setDisabled(pagina >= totalPag - 1),
      ),
    );
  }
  const payload = { embeds: [embed], components: componentes };
  if (atualizar) return interaction.update(payload);
  await interaction.reply({ ...payload, flags: EPH });
  return expirar(interaction, 300_000);
}

async function detalhe(interaction, discordId, pagina) {
  const tot = await pdb.totalAluno(discordId);
  if (!tot || !tot.pontos) {
    return interaction.update({ content: 'Esse membro não tem pontos registrados.', embeds: [], components: [] });
  }
  const totalPag = Math.ceil(tot.pontos / POR_PAGINA_HIST);
  pagina = Math.min(Math.max(pagina, 0), totalPag - 1);
  const hist = await pdb.historicoAluno(discordId, POR_PAGINA_HIST, pagina * POR_PAGINA_HIST);

  const blocos = hist.map((p, i) => {
    const n = pagina * POR_PAGINA_HIST + i + 1;
    const quando = p.fechado_em
      ? `${ts(p.aberto_em, 'd')} ${ts(p.aberto_em, 't')}–${ts(p.fechado_em, 't')} (${fmtDur((new Date(p.fechado_em) - new Date(p.aberto_em)) / 1000)})`
      : `${ts(p.aberto_em)} — 🟢 em serviço`;
    const prog = p.progresso == null ? (p.auto_fechado ? '⚠️ fechado automaticamente' : '—') : `${p.progresso}%`;
    let t = `**${n}.** ${quando}\n**${trunc(p.tarefa_titulo, 80)}** · ${prog}`;
    if (p.feito) t += `\n> **Fez:** ${trunc(umaLinha(p.feito), 220)}`;
    if (p.falta) t += `\n> **Falta:** ${trunc(umaLinha(p.falta), 220)}`;
    return t;
  });

  const embed = new EmbedBuilder()
    .setColor(0x1f6feb)
    .setTitle(`📊 ${tot.nome} (@${tot.usuario})`)
    .setDescription(trunc(`Total: **${fmtDur(tot.seg)}** em **${tot.pontos}** ponto(s)\n\n${blocos.join('\n\n')}`, 4000))
    .setFooter({ text: `Página ${pagina + 1}/${totalPag}` });

  const linha = new ActionRowBuilder().addComponents(
    btn(`ponto:det:${discordId}:${pagina - 1}`, '◀', ButtonStyle.Secondary).setDisabled(pagina === 0),
    btn(`ponto:det:${discordId}:${pagina + 1}`, '▶', ButtonStyle.Secondary).setDisabled(pagina >= totalPag - 1),
    btn('ponto:resumo_pag:0', 'Voltar ao resumo', ButtonStyle.Primary),
  );
  return interaction.update({ content: '', embeds: [embed], components: [linha] });
}

// ---------- roteador ----------
async function handlePontoInteraction(interaction) {
  try {
    // Slash: /painel-ponto (posta o painel no canal atual)
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'painel-ponto') {
      if (!interaction.inGuild() || !interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({ content: '🔒 Apenas administradores podem enviar o painel.', flags: EPH });
        return true;
      }
      const canal = interaction.channel ?? (await interaction.client.channels.fetch(interaction.channelId));
      await enviarPainel(canal);
      await interaction.reply({ content: '✅ Painel enviado neste canal.', flags: EPH });
      expirar(interaction, 10_000);
      return true;
    }

    const id = interaction.customId;
    if (typeof id !== 'string' || !id.startsWith('ponto:')) return false;

    // Tudo do resumo é restrito a Líderes
    const restrito = id === 'ponto:resumo' || id.startsWith('ponto:resumo_pag:') || id === 'ponto:aluno' || id.startsWith('ponto:det:');
    if (restrito && !isLider(interaction)) {
      await interaction.reply({ content: '🔒 Apenas Líderes podem ver o resumo.', flags: EPH });
      expirar(interaction, 10_000);
      return true;
    }

    if (interaction.isButton()) {
      if (id === 'ponto:abrir') await abrirFluxo(interaction);
      else if (id.startsWith('ponto:pag:')) await paginaTarefas(interaction, Number(id.split(':')[2]));
      else if (id === 'ponto:fechar') await fecharFluxo(interaction);
      else if (id === 'ponto:lista') await lista(interaction);
      else if (id === 'ponto:ranking') await rankingBotao(interaction);
      else if (id === 'ponto:resumo') await resumo(interaction, 0, false);
      else if (id.startsWith('ponto:resumo_pag:')) await resumo(interaction, Number(id.split(':')[2]), true);
      else if (id.startsWith('ponto:det:')) {
        const [, , alvo, pag] = id.split(':');
        await detalhe(interaction, alvo, Number(pag));
      }
    } else if (interaction.isStringSelectMenu()) {
      if (id === 'ponto:tarefa') await escolherTarefa(interaction);
      else if (id === 'ponto:aluno') await detalhe(interaction, interaction.values[0], 0);
    } else if (interaction.isModalSubmit()) {
      if (id === 'ponto:fechar_modal') await fecharModal(interaction);
    }
    return true;
  } catch (e) {
    console.error('[ponto] erro:', e);
    const msg = { content: '❌ Erro ao processar o ponto. Tente de novo.', flags: EPH };
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch { /* interação expirada */ }
    return true;
  }
}

// ---------- agendador (fechamento automático + ranking semanal) ----------
async function tick(client) {
  const { maxHoras, ranking } = cfg();

  if (maxHoras > 0) {
    const fechados = await pdb.autoFecharExpirados(maxHoras);
    for (const p of fechados) {
      await logar(
        client,
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle('⚠️ Ponto encerrado automaticamente')
          .setDescription(`<@${p.discord_id}> (${p.nome}) esqueceu o ponto aberto em **${trunc(p.tarefa_titulo, 200)}**. Contaram apenas ${maxHoras}h.`),
      );
      client.users
        .fetch(p.discord_id)
        .then((u) =>
          u.send(
            `⏱️ Seu ponto em **${p.tarefa_titulo}** ficou aberto por mais de ${maxHoras}h e foi encerrado automaticamente (contaram ${maxHoras}h). ` +
            'O Notion não foi atualizado. Se trabalhou mais tempo, avise um Líder.',
          ),
        )
        .catch(() => {});
    }
  }

  // Ranking da semana anterior, postado uma vez quando a semana vira.
  const semana = await pdb.semanaAtual();
  const ultima = await pdb.getMeta('ultima_semana_ranking');
  if (!ultima) return pdb.setMeta('ultima_semana_ranking', semana); // primeira execução: só marca
  if (ultima !== semana) {
    if (ranking) {
      try {
        const canal = await client.channels.fetch(ranking);
        await canal.send({ embeds: [await embedRanking(1)] });
      } catch (e) {
        console.error('[ponto] falha ao postar ranking semanal:', e.message);
      }
    }
    await pdb.setMeta('ultima_semana_ranking', semana);
  }
}

let iniciado = false;
async function init(client) {
  if (iniciado) return;
  iniciado = true;
  await pdb.init();
  const rodar = () => tick(client).catch((e) => console.error('[ponto] agendador:', e));
  setTimeout(rodar, 20_000);
  setInterval(rodar, 10 * 60 * 1000).unref();
  console.log('[ponto] pronto.');
}

module.exports = { init, handlePontoInteraction, enviarPainel };
