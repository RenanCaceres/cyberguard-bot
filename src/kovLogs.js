'use strict';
// Importa as horas do bot "KoV Ponto" a partir do canal de logs dele.
// - Lê o histórico do canal na inicialização (recupera o que passou com o bot offline) e novas mensagens em tempo real.
// - Só as mensagens "terminou o seu expediente" geram registro (têm entrada, saída e duração).
// - Grava em `pontos` (entra no ranking/resumo) e envia à planilha, acima dos dados existentes, do mais antigo ao mais recente.
const config = require('./config');
const pdb = require('./pontoDb');
let sheets = null;
try { sheets = require('./pontoSheets'); } catch { /* planilha opcional */ }

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// "11/09/2026 às 13:27:43" (horário de Brasília, UTC-3 sem horário de verão) -> Date
function parseDataHora(m) {
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`);
}

const RE_DH = '(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s*(?:as|às)?\\s*(\\d{2}):(\\d{2}):(\\d{2})';

function textoDaMensagem(message) {
  const partes = [message.content];
  for (const e of message.embeds ?? []) {
    partes.push(e.title, e.description);
    for (const f of e.fields ?? []) partes.push(f.name, f.value);
  }
  return partes.filter(Boolean).join('\n');
}

// Retorna { discordId, entrada, saida } ou null se não for um "fim de expediente".
function parsearMensagem(message) {
  if (!message.author?.bot) return null;
  if (config.kov.botId && message.author.id !== config.kov.botId) return null;
  const texto = textoDaMensagem(message);
  if (!/terminou o seu expediente/.test(norm(texto))) return null;

  const id = texto.match(/<@!?(\d{17,20})>/)?.[1];
  const entrada = texto.match(new RegExp(`entrada:\\s*${RE_DH}`, 'i'));
  const saida = texto.match(new RegExp(`sa[ií]da:\\s*${RE_DH}`, 'i'));
  if (!id || !entrada || !saida) return null;

  const e = parseDataHora(entrada);
  const s = parseDataHora(saida);
  if (isNaN(e) || isNaN(s) || s <= e) return null;
  return { discordId: id, entrada: e, saida: s };
}

async function dadosDoMembro(client, discordId) {
  try {
    const guild = await client.guilds.fetch(config.guildId);
    const m = await guild.members.fetch(discordId);
    return { nome: m.displayName, usuario: m.user.username };
  } catch {
    try {
      const u = await client.users.fetch(discordId);
      return { nome: u.globalName ?? u.username, usuario: u.username };
    } catch {
      return { nome: `Usuário ${discordId}`, usuario: discordId };
    }
  }
}

async function importarMensagem(client, message) {
  const r = parsearMensagem(message);
  if (!r) return false;
  if (await pdb.kovJaImportado(message.id)) return false;
  const { nome, usuario } = await dadosDoMembro(client, r.discordId);
  const row = await pdb.importarKov({ msgId: message.id, discordId: r.discordId, nome, usuario, entrada: r.entrada, saida: r.saida });
  return Boolean(row);
}

// Envia à planilha o que ainda não foi (sempre um lote por vez, do mais antigo ao mais recente).
let fila = Promise.resolve();
function sincronizarPlanilha() {
  fila = fila.then(async () => {
    if (!sheets || !process.env.PONTO_SHEET_ID) return;
    try {
      const pend = await pdb.kovPendentesPlanilha();
      if (!pend.length) return;
      await sheets.inserirNoTopo(pend);
      for (const p of pend) await pdb.marcarPlanilha(p.id, true);
      console.log(`[kov] ${pend.length} registro(s) enviados à planilha.`);
    } catch (e) {
      console.error('[kov] falha ao enviar à planilha (tenta de novo no próximo ciclo):', e.message);
    }
  });
  return fila;
}

let timer = null;
function agendarSync() {
  clearTimeout(timer);
  timer = setTimeout(sincronizarPlanilha, 5000); // agrupa mensagens que chegam juntas
  timer.unref?.();
}

async function backfill(client) {
  const canal = await client.channels.fetch(config.kov.logChannelId);
  const todas = [];
  let antes;
  for (;;) {
    const lote = await canal.messages.fetch({ limit: 100, ...(antes ? { before: antes } : {}) });
    if (!lote.size) break;
    todas.push(...lote.values());
    antes = lote.last().id;
    if (lote.size < 100) break;
  }
  todas.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let novos = 0;
  for (const m of todas) if (await importarMensagem(client, m)) novos++;
  console.log(`[kov] histórico lido: ${todas.length} mensagem(ns), ${novos} novo(s) registro(s).`);
}

function handleMessage(client, message) {
  if (message.channelId !== config.kov.logChannelId) return;
  importarMensagem(client, message)
    .then((novo) => novo && agendarSync())
    .catch((e) => console.error('[kov] erro ao importar mensagem:', e));
}

async function init(client) {
  if (!config.kov.logChannelId) return;
  try {
    await backfill(client);
  } catch (e) {
    console.error('[kov] backfill falhou (o bot enxerga o canal de logs?):', e.message);
  }
  await sincronizarPlanilha();
  setInterval(() => sincronizarPlanilha(), 15 * 60 * 1000).unref(); // reenvia o que falhou
}

module.exports = { init, handleMessage, parsearMensagem };
