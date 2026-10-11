'use strict';
// Espelha os pontos numa planilha do Google:
// 1) Aba "Raw Logs do Bot": linhas brutas de cada ponto (sem pontos_produtividade).
// 2) Aba "Painel Transparente": resumo consolidado por integrante contendo:
//    [Nome do Discord | Nome Real | Soma Total] (usando a mesma resolução de nome real da hierarquia).
const { JWT } = require('google-auth-library');
const config = require('./config');
const db = require('./db');
const pdb = require('./pontoDb');

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const sheetId = () => process.env.PONTO_SHEET_ID;
const aba = () => process.env.PONTO_SHEET_TAB || 'Raw Logs do Bot';

// Colunas de log (sem pontos_produtividade).
const BASE = [
  'user_id', 'membro', 'horario_inicio', 'notion_link', 'horario_fim', 'link_entrega', 'total_horas',
  'status', 'nome_tarefa', 'id_tarefa_notion', 'ultimo_horario_pausa', 'segundos_em_pausa',
];
const EXTRAS = ['id_ponto', 'progresso', 'feito', 'falta', 'origem', 'ajustado_por'];

let auth;
let discordClient = null;

function setDiscordClient(client) {
  discordClient = client;
}

async function token() {
  const g = config.googleSheets || {};
  if (!auth) {
    auth = new JWT({ email: g.serviceAccountEmail, key: g.privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  }
  const t = await auth.getAccessToken();
  return typeof t === 'string' ? t : t?.token;
}

async function api(method, path, body) {
  const res = await fetch(`${API}/${sheetId()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Sheets ${res.status} ${method} ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const encAba = (nomeAba, range) => encodeURIComponent(`'${nomeAba}'!${range}`);
const enc = (range) => encAba(aba(), range);
const colLetra = (n) => { // 1 -> A, 27 -> AA
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

// Cabeçalho da aba de logs (cacheado). Remove a coluna legada `pontos_produtividade` se existir.
let cabCache = null;
async function cabecalhos() {
  if (cabCache && Date.now() - cabCache.em < 10 * 60 * 1000) return cabCache.lista;
  const r = await api('GET', `/values/${enc('1:1')}`);
  let lista = (r.values?.[0] ?? []).map((v) => String(v).trim());
  while (lista.length && lista[lista.length - 1] === '') lista.pop();

  // Se a planilha ainda tiver a coluna legada pontos_produtividade, remove a coluna física
  const idxProd = lista.indexOf('pontos_produtividade');
  if (idxProd >= 0) {
    try {
      const meta = await api('GET', '?fields=sheets.properties(sheetId,title)');
      const gid = meta.sheets.find((sh) => sh.properties.title === aba())?.properties.sheetId;
      if (gid != null) {
        await api('POST', ':batchUpdate', {
          requests: [{
            deleteDimension: {
              range: { sheetId: gid, dimension: 'COLUMNS', startIndex: idxProd, endIndex: idxProd + 1 },
            },
          }],
        });
        lista.splice(idxProd, 1);
      }
    } catch (e) {
      console.warn('[pontoSheets] aviso ao remover coluna pontos_produtividade:', e.message);
    }
  }

  const faltam = [...BASE, ...EXTRAS].filter((h) => !lista.includes(h));
  if (faltam.length) {
    const ini = lista.length + 1;
    await api('PUT', `/values/${enc(`${colLetra(ini)}1:${colLetra(ini + faltam.length - 1)}1`)}?valueInputOption=RAW`, { values: [faltam] });
    lista = lista.concat(faltam);
  }
  cabCache = { lista, em: Date.now() };
  return lista;
}

const isoUtc = (d) => (d ? new Date(d).toISOString().replace(/\.\d{3}Z$/, '+00:00') : '');

// Converte uma linha da tabela `pontos` nos valores da planilha (por nome de coluna).
function valoresDe(row) {
  const real = row.tarefa_id && !['pendente', 'importado'].includes(row.tarefa_id);
  const seg = row.fechado_em ? (new Date(row.fechado_em) - new Date(row.aberto_em)) / 1000 : null;
  return {
    user_id: String(row.discord_id),
    membro: row.nome ?? '',
    horario_inicio: isoUtc(row.aberto_em),
    notion_link: real ? `https://www.notion.so/${String(row.tarefa_id).replace(/-/g, '')}` : '',
    horario_fim: isoUtc(row.fechado_em),
    link_entrega: '',
    total_horas: seg == null ? '' : (seg / 3600).toFixed(2),
    status: row.fechado_em ? 'Fechado' : 'Aberto',
    nome_tarefa: row.tarefa_id === 'pendente' ? '' : (row.tarefa_titulo ?? ''),
    id_tarefa_notion: real ? String(row.tarefa_id) : '',
    ultimo_horario_pausa: '',
    segundos_em_pausa: '0',
    id_ponto: `p${row.id}`,
    progresso: row.progresso ?? '',
    feito: row.feito ?? '',
    falta: row.falta ?? '',
    origem: row.origem ?? 'manual',
    ajustado_por: row.ajustado_por ?? '',
  };
}

// Localiza ou cria a aba "Painel Transparente" na planilha
async function obterOuCriarAbaPainel() {
  const meta = await api('GET', '?fields=sheets.properties(sheetId,title)');
  const preferida = process.env.PONTO_PAINEL_TAB;
  let sh = meta.sheets.find((s) =>
    preferida
      ? s.properties.title === preferida
      : /painel\s*transparente/i.test(s.properties.title)
  );
  if (sh) return { sheetId: sh.properties.sheetId, title: sh.properties.title };

  const novoTitulo = preferida || 'Painel Transparente';
  const criado = await api('POST', ':batchUpdate', {
    requests: [{ addSheet: { properties: { title: novoTitulo } } }],
  });
  const prop = criado.replies?.[0]?.addSheet?.properties;
  return { sheetId: prop?.sheetId, title: prop?.title || novoTitulo };
}

/**
 * Configura e atualiza a aba "Painel Transparente" com:
 * [Nome do Discord | Nome Real | Soma Total]
 * trazendo o verdadeiro nome dos integrantes (membros / cadastro_legado, igual na hierarquia)
 * e sem níveis de pontos_produtividade.
 */
async function atualizarPainelTransparenteInterno() {
  if (!sheetId()) return;

  const listaCab = await cabecalhos();
  const rLogs = await api('GET', `/values/${enc('A1:Z')}`);
  const todasLinhas = rLogs.values ?? [];

  const idxUserId = listaCab.indexOf('user_id');
  const idxMembro = listaCab.indexOf('membro');
  const idxInicio = listaCab.indexOf('horario_inicio');
  const idxFim = listaCab.indexOf('horario_fim');
  const idxTotal = listaCab.indexOf('total_horas');

  // Se houver lixo no fim da aba Raw Logs do Bot (ex: tabelas antigas coladas abaixo dos logs), limpa da aba de logs
  let primeiraLinhaInvalida = -1;
  for (let i = 1; i < todasLinhas.length; i++) {
    const uid = String(todasLinhas[i]?.[idxUserId] ?? '').trim();
    if (!/^\d{15,21}$/.test(uid)) {
      primeiraLinhaInvalida = i + 1; // 1-indexed
      break;
    }
  }
  if (primeiraLinhaInvalida > 1) {
    // Verifica se todas as linhas a partir dali também não são snowflakes válidos
    const restoValido = todasLinhas.slice(primeiraLinhaInvalida - 1).some((row) =>
      /^\d{15,21}$/.test(String(row?.[idxUserId] ?? '').trim())
    );
    if (!restoValido) {
      await api('POST', `/values/${enc(`A${primeiraLinhaInvalida}:Z${todasLinhas.length}`)}:clear`, {});
    }
  }

  // Soma horas por user_id a partir dos logs da planilha
  const porUsuario = new Map();
  for (let i = 1; i < todasLinhas.length; i++) {
    const row = todasLinhas[i] ?? [];
    const uid = String(row[idxUserId] ?? '').trim();
    if (!/^\d{15,21}$/.test(uid)) continue;

    let horas = parseFloat(String(row[idxTotal] ?? '').replace(',', '.'));
    if (Number.isNaN(horas)) {
      const ini = row[idxInicio] ? new Date(row[idxInicio]) : null;
      const fim = row[idxFim] ? new Date(row[idxFim]) : null;
      if (ini && fim && !Number.isNaN(ini.getTime()) && !Number.isNaN(fim.getTime()) && fim > ini) {
        horas = (fim - ini) / 3600000;
      } else {
        horas = 0;
      }
    }
    if (horas < 0 || Number.isNaN(horas)) horas = 0;

    const nomeLog = String(row[idxMembro] ?? '').trim();
    const atual = porUsuario.get(uid) || { totalHoras: 0, nomeDiscord: '' };
    atual.totalHoras += horas;
    if (nomeLog) atual.nomeDiscord = nomeLog;
    porUsuario.set(uid, atual);
  }

  // Complementa com dados de nomes do banco (pontos, membros e cadastro_legado — mesma base da hierarquia)
  const [mapaReais, resumoDb] = await Promise.all([
    db.obterMapaNomesReais().catch(() => new Map()),
    pdb.resumoPorAluno().catch(() => []),
  ]);

  for (const r of resumoDb) {
    const uid = String(r.discord_id).trim();
    if (!porUsuario.has(uid)) {
      porUsuario.set(uid, {
        totalHoras: (r.seg || 0) / 3600,
        nomeDiscord: r.nome || r.usuario || uid,
      });
    } else {
      const entry = porUsuario.get(uid);
      if (!entry.nomeDiscord && (r.nome || r.usuario)) {
        entry.nomeDiscord = r.nome || r.usuario;
      }
    }
  }

  // Se o client do Discord estiver disponível, busca o nome do usuário no Discord atualizado
  let guild = null;
  if (discordClient) {
    guild = await discordClient.guilds.fetch(config.guildId || process.env.GUILD_ID).catch(() => null);
  }

  const participantes = [];
  for (const [uid, info] of porUsuario.entries()) {
    let nomeDiscord = info.nomeDiscord;
    if (guild) {
      const member = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
      if (member) {
        nomeDiscord = member.displayName || member.user.globalName || member.user.username || nomeDiscord;
      }
    }
    if (!nomeDiscord) nomeDiscord = uid;

    const nomeReal = mapaReais.get(uid) || nomeDiscord;
    participantes.push({
      userId: uid,
      nomeDiscord,
      nomeReal,
      totalHoras: Number(info.totalHoras.toFixed(2)),
    });
  }

  participantes.sort((a, b) => {
    if (b.totalHoras !== a.totalHoras) return b.totalHoras - a.totalHoras;
    return a.nomeReal.localeCompare(b.nomeReal, 'pt-BR');
  });

  const painel = await obterOuCriarAbaPainel();
  const valoresPainel = [
    ['Nome do Discord', 'Nome Real', 'Soma Total (Horas)'],
    ...participantes.map((p) => [p.nomeDiscord, p.nomeReal, p.totalHoras]),
  ];

  // Limpa toda a aba Painel Transparente (removendo Nível 0..5, IDs científicos e fórmulas antigas)
  await api('POST', `/values/${encAba(painel.title, 'A1:Z1000')}:clear`, {});
  await api(
    'PUT',
    `/values/${encAba(painel.title, `A1:C${valoresPainel.length}`)}?valueInputOption=USER_ENTERED`,
    { values: valoresPainel }
  );

  if (painel.sheetId != null) {
    try {
      await api('POST', ':batchUpdate', {
        requests: [
          {
            repeatCell: {
              range: { sheetId: painel.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.13, green: 0.07, blue: 0.31 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId: painel.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 3 },
            },
          },
        ],
      });
    } catch (e) {
      console.warn('[pontoSheets] aviso ao formatar aba Painel Transparente:', e.message);
    }
  }
}

// Serializa as gravações para dois eventos simultâneos não duplicarem a mesma linha.
let fila = Promise.resolve();
const enfileirar = (fn) => { const p = fila.then(fn, fn); fila = p.catch(() => {}); return p; };

async function gravar(row) {
  const lista = await cabecalhos();
  const v = valoresDe(row);
  const linha = lista.map((h) => v[h] ?? '');
  const colId = colLetra(lista.indexOf('id_ponto') + 1);
  const ultima = colLetra(lista.length);

  const r = await api('GET', `/values/${enc(`${colId}:${colId}`)}`);
  const idx = (r.values ?? []).findIndex((c) => c[0] === v.id_ponto);
  if (idx >= 0) {
    const n = idx + 1;
    await api('PUT', `/values/${enc(`A${n}:${ultima}${n}`)}?valueInputOption=RAW`, { values: [linha] });
    return 'atualizada';
  }
  await api('POST', `/values/${enc('A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: [linha] });
  return 'adicionada';
}

// Cria a linha do ponto ou atualiza a que já existe (procura pelo id_ponto) e sincroniza o Painel Transparente.
function upsertPonto(row, opts = {}) {
  if (!sheetId()) return Promise.reject(new Error('PONTO_SHEET_ID não configurado'));
  return enfileirar(async () => {
    const res = await gravar(row);
    if (!opts.pularPainel) {
      await atualizarPainelTransparenteInterno().catch((e) =>
        console.error('[pontoSheets] erro ao atualizar Painel Transparente:', e.message)
      );
    }
    return res;
  });
}

// Insere vários pontos de uma vez no TOPO da aba (logo abaixo do cabeçalho), na ordem recebida
// (use do mais antigo ao mais recente). Pontos que já existem na aba (mesmo id_ponto) são só atualizados.
async function inserirNoTopo(rows) {
  if (!sheetId()) throw new Error('PONTO_SHEET_ID não configurado');
  return enfileirar(async () => {
    const lista = await cabecalhos();
    const colId = colLetra(lista.indexOf('id_ponto') + 1);
    const ultima = colLetra(lista.length);
    const r = await api('GET', `/values/${enc(`${colId}:${colId}`)}`);
    const existentes = new Set((r.values ?? []).map((c) => c[0]));

    const novos = rows.filter((x) => !existentes.has(`p${x.id}`));
    for (const x of rows.filter((x) => existentes.has(`p${x.id}`))) await gravar(x);
    if (novos.length) {
      const meta = await api('GET', '?fields=sheets.properties(sheetId,title)');
      const gid = meta.sheets.find((sh) => sh.properties.title === aba())?.properties.sheetId;
      if (gid == null) throw new Error(`aba "${aba()}" não encontrada`);
      await api('POST', ':batchUpdate', {
        requests: [{
          insertDimension: {
            range: { sheetId: gid, dimension: 'ROWS', startIndex: 1, endIndex: 1 + novos.length },
            inheritFromBefore: false,
          },
        }],
      });
      const valores = novos.map((x) => { const v = valoresDe(x); return lista.map((h) => v[h] ?? ''); });
      await api('PUT', `/values/${enc(`A2:${ultima}${1 + novos.length}`)}?valueInputOption=RAW`, { values: valores });
    }
    await atualizarPainelTransparenteInterno().catch((e) =>
      console.error('[pontoSheets] erro ao atualizar Painel Transparente:', e.message)
    );
  });
}

function atualizarPainelTransparente() {
  if (!sheetId()) return Promise.resolve();
  return enfileirar(() => atualizarPainelTransparenteInterno());
}

module.exports = {
  upsertPonto,
  inserirNoTopo,
  atualizarPainelTransparente,
  setDiscordClient,
  valoresDe,
  BASE,
  EXTRAS,
};
