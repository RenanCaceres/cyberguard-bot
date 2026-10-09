'use strict';
// Sistema de ponto do CyberGuard (v2): painel com botões, tarefas do Notion, logs, resumo (Líderes),
// ranking semanal, ponto automático pela call de voz, ajuste de ponto e importação de saldo (RH).
// Entrada para o index.js: handlePontoInteraction(interaction) -> boolean (tratado) e init(client).

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const notion = require('./notion');
const pdb = require('./pontoDb');
const { gerarRanking } = require('./rankingRender');

// Planilha (Google Sheets): opcional. Se src/pontoSheets.js não existir, o ponto funciona sem ela.
let sheets = null;
try {
  sheets = require('./pontoSheets');
} catch (e) {
  console.warn('[ponto] planilha desativada:', e.code === 'MODULE_NOT_FOUND' ? 'src/pontoSheets.js não instalado' : e.message);
}

const EPH = MessageFlags.Ephemeral;
const TZ = 'America/Sao_Paulo';
const POR_PAGINA_SELECT = 25; // limite do Discord para opções de um select
const POR_PAGINA_HIST = 6;
const GRACE_SAIDA_MS = 60_000; // tolerância para queda de conexão na call
const LEMBRETE_REPORTE_HORAS = 3;

const cfg = () => ({
  lideres: process.env.PONTO_ROLE_LIDERES_ID,
  rh: process.env.PONTO_ROLE_RH_ID,
  logs: process.env.PONTO_LOG_CHANNEL_ID,
  ranking: process.env.PONTO_RANKING_CHANNEL_ID,
  canalVoz: process.env.PONTO_VOICE_CHANNEL_ID,
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
  const min = Math.floor(seg / 60); // trunca (igual ao KOv): 46h22min30s -> 46h22
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};
const segDe = (row) => (new Date(row.fechado_em) - new Date(row.aberto_em)) / 1000;
const fmtDataHora = (d) =>
  new Date(d)
    .toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .replace(',', '');
const fmtHora = (d) =>
  new Date(d).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const nomeDe = (i) => i.member?.displayName ?? i.user.globalName ?? i.user.username;
const umaLinha = (s) => String(s ?? '').replace(/\s*\n+\s*/g, ' ').trim();
const ICONE_ORIGEM = { voz: '🎙️', importado: '📥', kov: '⏰', manual: '' };

// Em servidor a resposta é efêmera; em DM não existe efêmero.
const efemero = (i, obj) => (i.inGuild() ? { ...obj, flags: EPH } : obj);

// Mensagens efêmeras se apagam sozinhas (evita acumular lixo no canal do ponto).
const expirar = (interaction, ms) => {
  if (!interaction.inGuild()) return;
  const t = setTimeout(() => interaction.deleteReply().catch(() => {}), ms);
  t.unref?.();
};

function temCargo(interaction, roleId) {
  const roles = interaction.member?.roles;
  if (!roleId || !roles) return false;
  return Array.isArray(roles) ? roles.includes(roleId) : roles.cache.has(roleId);
}
const isLider = (i) => temCargo(i, cfg().lideres);
const isRH = (i) => temCargo(i, cfg().rh);

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

async function enviarDM(client, userId, payload) {
  try {
    const user = await client.users.fetch(userId);
    return await user.send(payload);
  } catch (e) {
    console.error(`[ponto] DM falhou para ${userId}:`, e.message);
    await logar(
      client,
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle('⚠️ Não consegui enviar DM')
        .setDescription(`<@${userId}> está com as DMs fechadas. Peça para usar os botões do painel (**Abrir/Fechar ponto**).`),
    );
    return null;
  }
}

// Espelha o ponto na planilha do Google (best effort; nunca bloqueia o fluxo).
async function sincronizarPlanilha(row) {
  if (!sheets) return;
  try {
    await sheets.upsertPonto(row);
    await pdb.marcarPlanilha(row.id, true);
  } catch (e) {
    console.error('[ponto] planilha:', e.message);
    await pdb.marcarPlanilha(row.id, false).catch(() => {});
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
      'Entrar na call de ponto abre o ponto automaticamente; sair da call fecha.\n' +
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

// ---------- seleção de tarefa ----------
// O value da opção carrega "<id da página>|<progresso atual no Notion>" (cabe nos 100 caracteres).
const valorTarefa = (t) => `${t.id}|${t.progresso ?? ''}`;
const lerValor = (v) => {
  const [id, p] = String(v).split('|');
  return { id, progresso: p === undefined || p === '' ? null : Number(p) };
};

// modo 'm' = fluxo manual (cria o ponto); modo 'v' = ponto vindo da call (só define a tarefa).
function montarSelecaoTarefas(tarefas, pagina, modo = 'm', conteudo) {
  const totalPag = Math.max(1, Math.ceil(tarefas.length / POR_PAGINA_SELECT));
  pagina = Math.min(Math.max(pagina, 0), totalPag - 1);
  const fatia = tarefas.slice(pagina * POR_PAGINA_SELECT, (pagina + 1) * POR_PAGINA_SELECT);

  const select = new StringSelectMenuBuilder()
    .setCustomId(modo === 'v' ? 'ponto:tarefa_voz' : 'ponto:tarefa')
    .setPlaceholder('Escolha a tarefa')
    .addOptions(
      fatia.map((t) => ({
        label: trunc(t.titulo, 100),
        value: valorTarefa(t),
        description: trunc(
          [t.status ?? 'sem status', t.progresso != null ? `${t.progresso}%` : null, t.responsavel].filter(Boolean).join(' · '),
          100,
        ),
      })),
    );

  const linhas = [new ActionRowBuilder().addComponents(select)];
  if (totalPag > 1) {
    linhas.push(
      new ActionRowBuilder().addComponents(
        btn(`ponto:pag:${modo}:${pagina - 1}`, '◀', ButtonStyle.Secondary).setDisabled(pagina === 0),
        btn('ponto:pag_info', `${pagina + 1}/${totalPag}`, ButtonStyle.Secondary).setDisabled(true),
        btn(`ponto:pag:${modo}:${pagina + 1}`, '▶', ButtonStyle.Secondary).setDisabled(pagina >= totalPag - 1),
      ),
    );
  }
  return { content: conteudo ?? `Selecione a tarefa (${tarefas.length} em aberto):`, components: linhas };
}

const tituloEscolhido = (interaction) =>
  interaction.component?.options?.find((o) => o.value === interaction.values[0])?.label ?? 'Tarefa';

// ---------- abrir ponto (manual) ----------
async function ofertarTarefaPendente(interaction, aberto) {
  await interaction.deferReply({ flags: EPH });
  let tarefas;
  try {
    tarefas = await notion.listarTarefasAbertas();
  } catch (e) {
    console.error('[ponto] notion (listar):', e.message);
    await interaction.editReply('❌ Não consegui consultar as tarefas no Notion agora. Tente de novo em instantes.');
    return expirar(interaction, 10_000);
  }
  await interaction.editReply(
    montarSelecaoTarefas(tarefas, 0, 'v', `🎙️ Seu ponto da call (aberto às ${ts(aberto.aberto_em, 't')}) ainda não tem tarefa. Escolha:`),
  );
  return expirar(interaction, 120_000);
}

async function abrirFluxo(interaction) {
  const aberto = await pdb.getAberto(interaction.user.id);
  if (aberto) {
    if (aberto.tarefa_id === pdb.PENDENTE) return ofertarTarefaPendente(interaction, aberto);
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
  await interaction.editReply(montarSelecaoTarefas(tarefas, 0, 'm'));
  return expirar(interaction, 120_000); // some sozinho se a pessoa desistir de escolher
}

async function paginaTarefas(interaction, modo, pagina) {
  await interaction.deferUpdate();
  let tarefas;
  try {
    tarefas = await notion.listarTarefasAbertas();
  } catch (e) {
    console.error('[ponto] notion (listar):', e.message);
    return interaction.editReply({ content: '❌ Falha ao consultar o Notion. Tente de novo.', components: [] });
  }
  return interaction.editReply(montarSelecaoTarefas(tarefas, pagina, modo));
}

async function escolherTarefa(interaction) {
  const { id: tarefaId, progresso } = lerValor(interaction.values[0]);
  const titulo = tituloEscolhido(interaction);
  const row = await pdb.abrir({
    discordId: interaction.user.id,
    nome: nomeDe(interaction),
    usuario: interaction.user.username,
    tarefaId,
    tarefaTitulo: titulo,
    progressoInicial: progresso,
    origem: 'manual',
  });
  if (!row) {
    await interaction.update({ content: '⚠️ Você já tem um ponto aberto.', components: [] });
    return expirar(interaction, 10_000);
  }
  await interaction.update({
    content:
      `🟢 Ponto aberto às ${ts(row.aberto_em, 't')} para **${titulo}**` +
      (progresso != null ? ` (progresso atual: ${progresso}%)` : '') +
      '.\nQuando terminar, clique em **Fechar ponto**.',
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

// ---------- reporte de progresso (fechar manual e reporte pós-call) ----------
function modalReporte(customId, titulo, progressoPrefill) {
  const campo = (id, label, estilo, obrigatorio, placeholder, max, valor) => {
    const t = new TextInputBuilder()
      .setCustomId(id).setLabel(label).setStyle(estilo)
      .setRequired(obrigatorio).setPlaceholder(placeholder).setMaxLength(max);
    if (valor != null) t.setValue(String(valor));
    return new ActionRowBuilder().addComponents(t);
  };
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(titulo)
    .addComponents(
      campo('progresso', 'Progresso da tarefa (0 a 100)', TextInputStyle.Short, true, 'Ex.: 60', 4, progressoPrefill),
      campo('feito', 'O que você fez', TextInputStyle.Paragraph, true, 'Resumo breve do que foi feito', 800),
      campo('falta', 'O que falta (obrigatório se < 100%)', TextInputStyle.Paragraph, false, 'O que ainda precisa ser feito', 800),
    );
}

// Lê e valida os 3 campos. Em caso de erro responde ao usuário e retorna null.
async function lerCamposReporte(interaction) {
  const bruto = interaction.fields.getTextInputValue('progresso').replace('%', '').trim();
  const feito = interaction.fields.getTextInputValue('feito').trim();
  const falta = interaction.fields.getTextInputValue('falta').trim();
  const progresso = /^\d{1,3}$/.test(bruto) ? Number(bruto) : NaN;

  const devolver = async (motivo) => {
    await interaction.reply(
      efemero(interaction, {
        content: `⚠️ ${motivo}\nNada foi registrado ainda. Seu texto, pra copiar:\n\`\`\`\n${trunc(feito, 700)}\n---\n${trunc(falta, 700)}\n\`\`\``,
      }),
    );
    expirar(interaction, 60_000);
    return null;
  };
  if (!(progresso >= 0 && progresso <= 100)) return devolver(`Progresso inválido ("${trunc(bruto, 10)}"). Use um número de 0 a 100.`);
  if (progresso < 100 && !falta) return devolver('Com progresso abaixo de 100%, descreva o que falta.');
  return { progresso, feito, falta };
}

// Notion + planilha + log do fechamento/reporte. Retorna { notionOk, seg }.
async function finalizarSessao(client, row, { progresso, feito, falta }, titulo) {
  const seg = segDe(row);
  let notionOk = true;
  if (row.tarefa_id !== pdb.PENDENTE) {
    try {
      await notion.atualizarTarefa(row.tarefa_id, progresso);
    } catch (e) {
      notionOk = false;
      console.error('[ponto] notion (atualizar):', e.message);
    }
    try {
      await notion.comentar(
        row.tarefa_id,
        `⏱ Ponto de ${row.nome} (@${row.usuario})${row.origem === 'voz' ? ' [call de voz]' : ''} — ${fmtDur(seg)} — progresso: ${progresso}%\n` +
        `O que foi feito: ${feito}\nO que falta: ${falta || '—'}`,
      );
    } catch (e) {
      notionOk = false;
      console.error('[ponto] notion (comentar):', e.message);
    }
  }
  await pdb.marcarNotion(row.id, notionOk);
  await sincronizarPlanilha({ ...row, progresso, feito, falta });
  await logar(
    client,
    new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(titulo)
      .addFields(
        { name: 'Membro', value: `<@${row.discord_id}> (${row.nome})`, inline: true },
        { name: 'Tarefa', value: trunc(row.tarefa_titulo, 256), inline: true },
        { name: 'Duração', value: fmtDur(seg), inline: true },
        { name: 'Progresso', value: `${progresso}%`, inline: true },
        { name: 'Origem', value: `${ICONE_ORIGEM[row.origem] ?? ''} ${row.origem}`.trim(), inline: true },
        { name: 'Notion', value: notionOk ? 'sincronizado' : '⚠️ falhou', inline: true },
        { name: 'O que fez', value: trunc(feito, 1024) },
        { name: 'O que falta', value: trunc(falta || '—', 1024) },
      ),
  );
  return { notionOk, seg };
}

// ---------- fechar ponto (manual) ----------
async function fecharFluxo(interaction) {
  const aberto = await pdb.getAberto(interaction.user.id);
  if (!aberto) {
    await interaction.reply({ content: '⚠️ Você não tem ponto aberto.', flags: EPH });
    return expirar(interaction, 10_000);
  }
  if (aberto.tarefa_id === pdb.PENDENTE) return ofertarTarefaPendente(interaction, aberto); // escolhe a tarefa antes de fechar
  return interaction.showModal(modalReporte('ponto:fechar_modal', 'Fechar ponto', aberto.progresso_inicial));
}

async function fecharModal(interaction) {
  const dados = await lerCamposReporte(interaction);
  if (!dados) return;
  await interaction.deferReply({ flags: EPH });
  const row = await pdb.fechar(interaction.user.id, dados);
  if (!row) {
    await interaction.editReply('⚠️ Nenhum ponto aberto (ele pode ter sido encerrado automaticamente).');
    return expirar(interaction, 10_000);
  }
  const { notionOk, seg } = await finalizarSessao(interaction.client, row, dados, '🔴 Ponto fechado');
  const destino = dados.progresso >= 100 ? '**Concluída** ✅' : `**Em andamento** (${dados.progresso}%)`;
  await interaction.editReply(
    `🔴 Ponto fechado. Duração: **${fmtDur(seg)}** em **${row.tarefa_titulo}** → ${destino}` +
    (notionOk ? '' : '\n⚠️ Suas horas foram salvas, mas não consegui atualizar o Notion. Avise um Líder.'),
  );
  expirar(interaction, notionOk ? 20_000 : 60_000);
}

// ---------- ponto automático pela call de voz ----------
const saidasPendentes = new Map(); // discordId -> timer da tolerância de saída

async function abrirPorEntrada(client, member) {
  const row = await pdb.abrir({
    discordId: member.id,
    nome: member.displayName ?? member.user.username,
    usuario: member.user.username,
    tarefaId: pdb.PENDENTE,
    tarefaTitulo: '(aguardando escolha da tarefa)',
    origem: 'voz',
  });
  if (!row) return;
  await logar(
    client,
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🟢 Ponto aberto (entrou na call)')
      .addFields(
        { name: 'Membro', value: `<@${row.discord_id}> (${row.nome})`, inline: true },
        { name: 'Horário', value: ts(row.aberto_em), inline: true },
      ),
  );
  let tarefas = [];
  try {
    tarefas = await notion.listarTarefasAbertas();
  } catch (e) {
    console.error('[ponto] notion (listar):', e.message);
  }
  const intro = `🎙️ Você entrou na call e seu ponto foi **aberto às ${ts(row.aberto_em, 't')}**.\nEm qual tarefa você vai trabalhar?`;
  await enviarDM(
    client,
    member.id,
    tarefas.length
      ? montarSelecaoTarefas(tarefas, 0, 'v', intro)
      : { content: `🎙️ Seu ponto foi aberto às ${ts(row.aberto_em, 't')}, mas não consegui carregar as tarefas. Clique em **Abrir ponto** no painel para escolher a tarefa.` },
  );
}

// DM de reporte: pede a tarefa (se ainda pendente) ou o botão de reportar progresso.
async function dmReporte(client, row, intro) {
  if (row.tarefa_id === pdb.PENDENTE) {
    let tarefas = [];
    try {
      tarefas = await notion.listarTarefasAbertas();
    } catch (e) {
      console.error('[ponto] notion (listar):', e.message);
    }
    if (tarefas.length) {
      return enviarDM(client, row.discord_id, montarSelecaoTarefas(tarefas, 0, 'v', `${intro}\nEm qual tarefa você trabalhou?`));
    }
    return enviarDM(client, row.discord_id, { content: `${intro}\nNão consegui carregar as tarefas agora; fale com um Líder para registrar o progresso.` });
  }
  return enviarDM(client, row.discord_id, {
    content: `${intro}\nReporte o progresso de **${row.tarefa_titulo}**:`,
    components: [new ActionRowBuilder().addComponents(btn(`ponto:reportar:${row.id}`, 'Reportar progresso', ButtonStyle.Primary, '📝'))],
  });
}

async function fecharPorSaida(client, userId, saiuEm) {
  saidasPendentes.delete(userId);
  const row = await pdb.fecharPorSaida(userId, saiuEm);
  if (!row) return;
  const seg = segDe(row);
  await logar(
    client,
    new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🔴 Ponto fechado (saiu da call)')
      .addFields(
        { name: 'Membro', value: `<@${row.discord_id}> (${row.nome})`, inline: true },
        { name: 'Tarefa', value: trunc(row.tarefa_titulo, 256), inline: true },
        { name: 'Duração', value: fmtDur(seg), inline: true },
        { name: 'Progresso', value: 'aguardando reporte', inline: true },
      ),
  );
  await sincronizarPlanilha(row);
  await dmReporte(client, row, `🔴 Você saiu da call. Sessão de **${fmtDur(seg)}**.`);
}

async function aoMudarVoz(client, antigo, novo) {
  const alvo = cfg().canalVoz;
  if (!alvo) return;
  const member = novo.member ?? antigo.member;
  if (!member || member.user?.bot) return;
  const id = member.id;
  const entrou = novo.channelId === alvo && antigo.channelId !== alvo;
  const saiu = antigo.channelId === alvo && novo.channelId !== alvo;

  if (entrou) {
    const timer = saidasPendentes.get(id);
    if (timer) { // voltou dentro da tolerância: segue o mesmo ponto
      clearTimeout(timer);
      saidasPendentes.delete(id);
      return;
    }
    if (await pdb.getAberto(id)) return; // já tem ponto (manual ou da call)
    return abrirPorEntrada(client, member);
  }
  if (saiu) {
    const aberto = await pdb.getAberto(id);
    if (!aberto || aberto.origem !== 'voz') return; // ponto manual não fecha por sair da call
    const saiuEm = new Date();
    const t = setTimeout(() => fecharPorSaida(client, id, saiuEm).catch((e) => console.error('[ponto] saída:', e)), GRACE_SAIDA_MS);
    t.unref?.();
    saidasPendentes.set(id, t);
  }
}

// Ao subir o bot: ajusta pontos da call que ficaram dessincronizados enquanto ele estava fora.
async function reconciliarVoz(client) {
  const alvo = cfg().canalVoz;
  if (!alvo) return;
  const inicio = new Date(); // só fecha pontos abertos antes do bot subir (não corre contra eventos novos)
  const canal = await client.channels.fetch(alvo).catch(() => null);
  if (!canal?.isVoiceBased?.()) return;
  const presentes = new Set([...canal.members.values()].filter((m) => !m.user.bot).map((m) => m.id));
  for (const p of await pdb.listarAbertos()) {
    if (p.origem === 'voz' && !presentes.has(p.discord_id) && new Date(p.aberto_em) < inicio) {
      await fecharPorSaida(client, p.discord_id, inicio);
    }
  }
  for (const m of canal.members.values()) {
    if (m.user.bot || (await pdb.getAberto(m.id))) continue;
    await abrirPorEntrada(client, m);
  }
}

// Escolha de tarefa pelo select "voz": define a tarefa do ponto aberto, ou da sessão já fechada sem reporte.
async function escolherTarefaVoz(interaction) {
  const { id: tarefaId, progresso } = lerValor(interaction.values[0]);
  const titulo = tituloEscolhido(interaction);
  const userId = interaction.user.id;
  const dados = { tarefaId, tarefaTitulo: titulo, progressoInicial: progresso };

  const aberto = await pdb.getAberto(userId);
  if (aberto && aberto.tarefa_id === pdb.PENDENTE) {
    await pdb.definirTarefa(aberto.id, dados);
    await interaction.update({
      content: `✅ Tarefa definida: **${titulo}**` + (progresso != null ? ` (progresso atual: ${progresso}%)` : '') + `.\nSeu tempo está contando desde ${ts(aberto.aberto_em, 't')}.`,
      components: [],
    });
    return expirar(interaction, 12_000);
  }
  const pend = await pdb.getPendenteReporte(userId);
  if (pend && pend.tarefa_id === pdb.PENDENTE) {
    await pdb.definirTarefa(pend.id, dados);
    return interaction.update({
      content: `✅ Tarefa: **${titulo}**. Agora reporte o progresso desta sessão.`,
      components: [new ActionRowBuilder().addComponents(btn(`ponto:reportar:${pend.id}`, 'Reportar progresso', ButtonStyle.Primary, '📝'))],
    });
  }
  await interaction.update({ content: 'Não há nenhum ponto aguardando tarefa.', components: [] });
  return expirar(interaction, 10_000);
}

async function abrirModalReporte(interaction, pontoId) {
  const p = await pdb.getPorId(pontoId);
  if (!p || p.discord_id !== interaction.user.id || p.reportado) {
    await interaction.update({ content: 'Esse ponto já foi reportado (ou não é seu).', components: [] });
    return expirar(interaction, 10_000);
  }
  return interaction.showModal(modalReporte(`ponto:rep_modal:${p.id}`, 'Reportar progresso', p.progresso_inicial));
}

async function reporteModal(interaction, pontoId) {
  const dados = await lerCamposReporte(interaction);
  if (!dados) return;
  if (interaction.isFromMessage?.()) await interaction.deferUpdate();
  else await interaction.deferReply(efemero(interaction, {}));
  const row = await pdb.registrarReporte(pontoId, interaction.user.id, dados);
  if (!row) return interaction.editReply({ content: 'Esse ponto já foi reportado (ou não é seu).', components: [] });
  const { notionOk, seg } = await finalizarSessao(interaction.client, row, dados, '📝 Progresso reportado (call)');
  const destino = dados.progresso >= 100 ? '**Concluída** ✅' : `**Em andamento** (${dados.progresso}%)`;
  return interaction.editReply({
    content:
      `📝 Registrado: **${fmtDur(seg)}** em **${row.tarefa_titulo}** → ${destino}` +
      (notionOk ? '' : '\n⚠️ Suas horas foram salvas, mas não consegui atualizar o Notion. Avise um Líder.'),
    components: [],
  });
}

// ---------- lista / ranking ----------
async function lista(interaction) {
  const abertos = await pdb.listarAbertos();
  const desc = abertos.length
    ? abertos
        .map((p) => `🟢 ${ICONE_ORIGEM[p.origem] ?? ''} **${p.nome}** — ${trunc(p.tarefa_titulo, 80)}\n⠀desde ${ts(p.aberto_em, 't')} (${ts(p.aberto_em, 'R')})`)
        .join('\n')
    : 'Ninguém em serviço agora.';
  const embed = new EmbedBuilder().setColor(0x2ecc71).setTitle('📋 Em serviço agora').setDescription(trunc(desc, 4000));
  await interaction.reply({ embeds: [embed], flags: EPH });
  return expirar(interaction, 60_000);
}

// Ranking ilustrado: imagem (pódio + barras) e, abaixo, duração e último registro de cada membro.
async function embedRanking(client, semanasAtras) {
  const rows = await pdb.ranking(semanasAtras);
  const per = await pdb.periodoSemana(semanasAtras);
  const titulo = semanasAtras === 0 ? 'Ranking da semana (parcial)' : 'Ranking da semana passada';
  const subtitulo = `${per.ini} a ${per.fim}`;

  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  const itens = await Promise.all(
    rows.map(async (r) => {
      const m = guild ? await guild.members.fetch(r.discord_id).catch(() => null) : null;
      return {
        nome: m?.displayName ?? r.nome,
        seg: r.seg,
        ultimo: r.ultimo,
        avatarUrl: m?.displayAvatarURL({ extension: 'png', size: 256 }) ?? null,
        discordId: r.discord_id,
      };
    }),
  );

  const medalhas = ['🥇', '🥈', '🥉'];
  const desc = itens.length
    ? itens
        .map(
          (r, i) =>
            `${medalhas[i] ?? `**${i + 1}º**`} <@${r.discordId}> — **${fmtDur(r.seg)}**\n` +
            `⠀⠀🕒 último registro: ${ts(r.ultimo, 'f')}`,
        )
        .join('\n')
    : 'Sem pontos registrados nessa semana.';

  const imagem = await gerarRanking({ titulo, subtitulo, itens });
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🏆 ${titulo}`)
    .setDescription(trunc(`📅 **Período:** ${per.ini} a ${per.fim}\n\n${desc}`, 4000))
    .setImage('attachment://ranking.png')
    .setFooter({ text: 'Semana de segunda a domingo (horário de Brasília) • inclui horas do KoV Ponto' });
  return { embeds: [embed], files: [{ attachment: imagem, name: 'ranking.png' }] };
}

async function rankingBotao(interaction) {
  await interaction.deferReply({ flags: EPH });
  await interaction.editReply(await embedRanking(interaction.client, 0));
  return expirar(interaction, 120_000);
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
  if (!tot || !tot.linhas) {
    return interaction.update({ content: 'Esse membro não tem pontos registrados.', embeds: [], components: [] });
  }
  const totalPag = Math.ceil(tot.linhas / POR_PAGINA_HIST);
  pagina = Math.min(Math.max(pagina, 0), totalPag - 1);
  const hist = await pdb.historicoAluno(discordId, POR_PAGINA_HIST, pagina * POR_PAGINA_HIST);

  const blocos = hist.map((p, i) => {
    const n = pagina * POR_PAGINA_HIST + i + 1;
    if (p.origem === 'importado') {
      let t = `**${n}.** 📥 **Saldo importado do KOv Ponto:** ${fmtDur(segDe(p))} (registrado em ${ts(p.fechado_em, 'd')})`;
      if (p.feito) t += `\n> ${trunc(umaLinha(p.feito), 220)}`;
      return t;
    }
    const marca = `${ICONE_ORIGEM[p.origem] ?? ''}${p.ajustado_por ? ' ✏️' : ''}`.trim();
    const quando = p.fechado_em
      ? `${ts(p.aberto_em, 'd')} ${ts(p.aberto_em, 't')}–${ts(p.fechado_em, 't')} (${fmtDur(segDe(p))})`
      : `${ts(p.aberto_em)} — 🟢 em serviço`;
    const prog = p.progresso == null ? (p.auto_fechado ? '⚠️ fechado automaticamente' : p.reportado ? '—' : '⏳ aguardando reporte') : `${p.progresso}%`;
    let t = `**${n}.** ${marca ? marca + ' ' : ''}${quando}\n**${trunc(p.tarefa_titulo, 80)}** · ${prog}`;
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

// ---------- RH: ajustar ponto ----------
async function ajustarComando(interaction) {
  if (!isRH(interaction)) {
    await interaction.reply({ content: '🔒 Apenas o RH pode ajustar pontos.', flags: EPH });
    return expirar(interaction, 10_000);
  }
  const alvo = interaction.options.getUser('membro', true);
  const pontos = await pdb.ultimosPontos(alvo.id, 25);
  if (!pontos.length) {
    await interaction.reply({ content: `Nenhum ponto fechado encontrado para <@${alvo.id}>.`, flags: EPH });
    return expirar(interaction, 10_000);
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId('ponto:adj_sel')
    .setPlaceholder('Escolha o ponto a ajustar')
    .addOptions(
      pontos.map((p) => ({
        label: trunc(
          `${fmtDataHora(p.aberto_em)} → ${fmtHora(p.fechado_em)} (${fmtDur(segDe(p))})${p.auto_fechado ? ' ⚠️auto' : ''}${p.ajustado_por ? ' ✏️' : ''}`,
          100,
        ),
        value: String(p.id),
        description: trunc(p.tarefa_titulo, 100),
      })),
    );
  await interaction.reply({
    content: `Pontos de <@${alvo.id}> (últimos ${pontos.length}). ⚠️auto = fechado automaticamente · ✏️ = já ajustado.`,
    components: [new ActionRowBuilder().addComponents(select)],
    flags: EPH,
  });
  return expirar(interaction, 300_000);
}

async function ajustarSelecionar(interaction) {
  const p = await pdb.getPorId(Number(interaction.values[0]));
  if (!p || !p.fechado_em) {
    return interaction.update({ content: 'Ponto não encontrado.', components: [] });
  }
  const campo = (id, label, estilo, obrigatorio, placeholder, max, valor) => {
    const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(estilo).setRequired(obrigatorio).setPlaceholder(placeholder).setMaxLength(max);
    if (valor) t.setValue(valor);
    return new ActionRowBuilder().addComponents(t);
  };
  return interaction.showModal(
    new ModalBuilder()
      .setCustomId(`ponto:adj_modal:${p.id}`)
      .setTitle('Ajustar fechamento')
      .addComponents(
        campo('novo', 'Novo fechamento (dd/mm/aaaa hh:mm)', TextInputStyle.Short, true, '06/10/2026 18:30', 16, fmtDataHora(p.fechado_em)),
        campo('motivo', 'Motivo do ajuste', TextInputStyle.Paragraph, false, 'Ex.: esqueceu de fechar o ponto', 300),
      ),
  );
}

async function ajustarModal(interaction, pontoId) {
  const bruto = interaction.fields.getTextInputValue('novo').trim();
  const motivo = interaction.fields.getTextInputValue('motivo').trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(bruto);
  const recusar = async (msg) => {
    await interaction.reply({ content: `⚠️ ${msg}`, flags: EPH });
    return expirar(interaction, 15_000);
  };
  if (!m) return recusar('Formato inválido. Use dd/mm/aaaa hh:mm (horário de Brasília).');
  const local = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${m[4].padStart(2, '0')}:${m[5]}`;

  let row;
  try {
    row = await pdb.ajustarFechamento(pontoId, local, interaction.user.id, motivo);
  } catch (e) {
    if (['22007', '22008', '22P02'].includes(e.code)) return recusar('Data ou hora inexistente.');
    throw e;
  }
  if (!row) {
    return recusar('Não foi possível: o novo fechamento precisa ser **depois da abertura**, **no passado** e **até 24h** depois de aberto.');
  }
  await interaction.deferUpdate();
  await sincronizarPlanilha(row);
  await logar(
    interaction.client,
    new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('✏️ Ponto ajustado pelo RH')
      .addFields(
        { name: 'Membro', value: `<@${row.discord_id}> (${row.nome})`, inline: true },
        { name: 'Tarefa', value: trunc(row.tarefa_titulo, 256), inline: true },
        { name: 'Ajustado por', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Fechamento', value: `${fmtDataHora(row.fechado_em_antes)} → **${fmtDataHora(row.fechado_em)}**`, inline: true },
        { name: 'Duração', value: `${fmtDur((new Date(row.fechado_em_antes) - new Date(row.aberto_em)) / 1000)} → **${fmtDur(segDe(row))}**`, inline: true },
        { name: 'Motivo', value: trunc(motivo || '—', 1024) },
      ),
  );
  return interaction.editReply({
    content: `✅ Ponto ajustado: fechamento em **${fmtDataHora(row.fechado_em)}** (duração ${fmtDur(segDe(row))}).`,
    components: [],
  });
}

// ---------- RH: importar saldo de horas (ex.: KOv Ponto) ----------
async function importarComando(interaction) {
  if (!isRH(interaction)) {
    await interaction.reply({ content: '🔒 Apenas o RH pode importar horas.', flags: EPH });
    return expirar(interaction, 10_000);
  }
  const alvo = interaction.options.getUser('membro', true);
  const n = (nome) => interaction.options.getInteger(nome) ?? 0;
  const segundos = n('dias') * 86400 + n('horas') * 3600 + n('minutos') * 60 + n('segundos');
  if (segundos <= 0) {
    await interaction.reply({ content: '⚠️ Informe pelo menos um valor (dias, horas, minutos ou segundos).', flags: EPH });
    return expirar(interaction, 10_000);
  }
  await interaction.deferReply({ flags: EPH });
  const membro = interaction.options.getMember('membro');
  const row = await pdb.importarSaldo({
    discordId: alvo.id,
    nome: membro?.displayName ?? alvo.globalName ?? alvo.username,
    usuario: alvo.username,
    segundos,
    obs: interaction.options.getString('observacao'),
    porDiscordId: interaction.user.id,
  });
  await sincronizarPlanilha(row);
  await logar(
    interaction.client,
    new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(row.substituiu ? '📥 Saldo importado (substituído)' : '📥 Saldo importado')
      .addFields(
        { name: 'Membro', value: `<@${alvo.id}> (${row.nome})`, inline: true },
        { name: 'Horas', value: fmtDur(segundos), inline: true },
        { name: 'Por', value: `<@${interaction.user.id}>`, inline: true },
      ),
  );
  await interaction.editReply(
    `📥 Saldo ${row.substituiu ? 'substituído' : 'importado'} para <@${alvo.id}>: **${fmtDur(segundos)}**. ` +
    'Ele aparece no resumo e na planilha, e não entra no ranking semanal.',
  );
  return expirar(interaction, 30_000);
}

// ---------- roteador ----------
async function handlePontoInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand?.()) {
      const nome = interaction.commandName;
      if (nome === 'painel-ponto') {
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
      if (nome === 'ajustar-ponto') { await ajustarComando(interaction); return true; }
      if (nome === 'importar-horas') { await importarComando(interaction); return true; }
      return false;
    }

    const id = interaction.customId;
    if (typeof id !== 'string' || !id.startsWith('ponto:')) return false;

    // Resumo: só Líderes. Ajustes: só RH.
    const restritoLider = id === 'ponto:resumo' || id.startsWith('ponto:resumo_pag:') || id === 'ponto:aluno' || id.startsWith('ponto:det:');
    if (restritoLider && !isLider(interaction)) {
      await interaction.reply({ content: '🔒 Apenas Líderes podem ver o resumo.', flags: EPH });
      expirar(interaction, 10_000);
      return true;
    }
    if (id.startsWith('ponto:adj_') && !isRH(interaction)) {
      await interaction.reply({ content: '🔒 Apenas o RH pode ajustar pontos.', flags: EPH });
      expirar(interaction, 10_000);
      return true;
    }

    if (interaction.isButton()) {
      if (id === 'ponto:abrir') await abrirFluxo(interaction);
      else if (id.startsWith('ponto:pag:')) {
        const p = id.split(':'); // ponto:pag:<modo>:<n>  (ou o formato antigo ponto:pag:<n>)
        await paginaTarefas(interaction, p.length === 3 ? 'm' : p[2], Number(p[p.length - 1]));
      } else if (id === 'ponto:fechar') await fecharFluxo(interaction);
      else if (id === 'ponto:lista') await lista(interaction);
      else if (id === 'ponto:ranking') await rankingBotao(interaction);
      else if (id === 'ponto:resumo') await resumo(interaction, 0, false);
      else if (id.startsWith('ponto:resumo_pag:')) await resumo(interaction, Number(id.split(':')[2]), true);
      else if (id.startsWith('ponto:det:')) {
        const [, , alvo, pag] = id.split(':');
        await detalhe(interaction, alvo, Number(pag));
      } else if (id.startsWith('ponto:reportar:')) await abrirModalReporte(interaction, Number(id.split(':')[2]));
    } else if (interaction.isStringSelectMenu()) {
      if (id === 'ponto:tarefa') await escolherTarefa(interaction);
      else if (id === 'ponto:tarefa_voz') await escolherTarefaVoz(interaction);
      else if (id === 'ponto:aluno') await detalhe(interaction, interaction.values[0], 0);
      else if (id === 'ponto:adj_sel') await ajustarSelecionar(interaction);
    } else if (interaction.isModalSubmit()) {
      if (id === 'ponto:fechar_modal') await fecharModal(interaction);
      else if (id.startsWith('ponto:rep_modal:')) await reporteModal(interaction, Number(id.split(':')[2]));
      else if (id.startsWith('ponto:adj_modal:')) await ajustarModal(interaction, Number(id.split(':')[2]));
    }
    return true;
  } catch (e) {
    console.error('[ponto] erro:', e);
    const msg = efemero(interaction, { content: '❌ Erro ao processar o ponto. Tente de novo.' });
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch { /* interação expirada */ }
    return true;
  }
}

// ---------- ranking ao vivo: uma mensagem fixa no canal, editada a cada ciclo do agendador ----------
async function atualizarRankingAoVivo(client, canalId) {
  const canal = await client.channels.fetch(canalId);
  const payload = await embedRanking(client, 0);
  const idAnterior = await pdb.getMeta('ranking_ao_vivo_msg');
  if (idAnterior) {
    const msg = await canal.messages.fetch(idAnterior).catch(() => null);
    if (msg) {
      await msg.edit({ ...payload, attachments: [] });
      return;
    }
  }
  const nova = await canal.send(payload);
  await pdb.setMeta('ranking_ao_vivo_msg', nova.id);
}

// ---------- agendador (fechamento automático, lembretes e ranking semanal) ----------
async function tick(client) {
  const { maxHoras, ranking } = cfg();

  if (maxHoras > 0) {
    const fechados = await pdb.autoFecharExpirados(maxHoras);
    for (const p of fechados) {
      await sincronizarPlanilha(p);
      await logar(
        client,
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle('⚠️ Ponto encerrado automaticamente')
          .setDescription(`<@${p.discord_id}> (${p.nome}) esqueceu o ponto aberto em **${trunc(p.tarefa_titulo, 200)}**. Contaram apenas ${maxHoras}h. O RH pode corrigir com **/ajustar-ponto**.`),
      );
      client.users
        .fetch(p.discord_id)
        .then((u) =>
          u.send(
            `⏱️ Seu ponto em **${p.tarefa_titulo}** ficou aberto por mais de ${maxHoras}h e foi encerrado automaticamente (contaram ${maxHoras}h). ` +
            'O Notion não foi atualizado. Se trabalhou mais tempo, peça ao RH para ajustar.',
          ),
        )
        .catch(() => {});
    }
  }

  // Lembrete único para quem saiu da call e não reportou o progresso.
  for (const p of await pdb.reportesPendentesAntigos(LEMBRETE_REPORTE_HORAS)) {
    await pdb.marcarLembrete(p.id);
    await dmReporte(client, p, `⏰ Lembrete: você ainda não reportou o progresso da sessão de call de ${fmtDataHora(p.aberto_em)}.`);
  }

  // Ranking ao vivo (semana atual) no canal de ranking.
  if (ranking) {
    await atualizarRankingAoVivo(client, ranking).catch((e) => console.error('[ponto] ranking ao vivo:', e.message));
  }

  // Ranking da semana anterior, postado uma vez quando a semana vira.
  const semana = await pdb.semanaAtual();
  const ultima = await pdb.getMeta('ultima_semana_ranking');
  if (!ultima) return pdb.setMeta('ultima_semana_ranking', semana); // primeira execução: só marca
  if (ultima !== semana) {
    if (ranking) {
      try {
        const canal = await client.channels.fetch(ranking);
        await canal.send(await embedRanking(client, 1));
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
  // Exige o intent GuildVoiceStates no Client (index.js).
  client.on('voiceStateUpdate', (o, n) => aoMudarVoz(client, o, n).catch((e) => console.error('[ponto] voz:', e)));
  reconciliarVoz(client).catch((e) => console.error('[ponto] reconciliar voz:', e));
  const rodar = () => tick(client).catch((e) => console.error('[ponto] agendador:', e));
  setTimeout(rodar, 20_000);
  setInterval(rodar, 10 * 60 * 1000).unref();
  console.log('[ponto] pronto.');
}

module.exports = { init, handlePontoInteraction, enviarPainel };
