'use strict';
// Espelha os pontos numa planilha do Google, na aba "Raw Logs do Bot" (layout da planilha antiga).
// Mantém as 13 colunas originais (A–M) e acrescenta colunas extras à direita. Cada ponto tem um
// id_ponto ("p<id>"), então fechar, reportar ou ajustar o mesmo ponto atualiza a MESMA linha.
// Usa a mesma conta de serviço do sheetsService.js (config.googleSheets) e a API REST do Google,
// sem dependência nova (google-auth-library já vem com o google-spreadsheet).
const { JWT } = require('google-auth-library');
const config = require('./config');

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const sheetId = () => process.env.PONTO_SHEET_ID;
const aba = () => process.env.PONTO_SHEET_TAB || 'Raw Logs do Bot';

// Colunas originais (A–M), na ordem que o "Painel Transparente (Horas)" espera.
const BASE = [
  'user_id', 'membro', 'horario_inicio', 'notion_link', 'horario_fim', 'link_entrega', 'total_horas',
  'status', 'nome_tarefa', 'pontos_produtividade', 'id_tarefa_notion', 'ultimo_horario_pausa', 'segundos_em_pausa',
];
// Colunas novas, à direita (o painel não olha para elas).
const EXTRAS = ['id_ponto', 'progresso', 'feito', 'falta', 'origem', 'ajustado_por'];

let auth;
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
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Sheets ${res.status} ${method} ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const enc = (range) => encodeURIComponent(`'${aba()}'!${range}`);
const colLetra = (n) => { // 1 -> A, 27 -> AA
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

// Cabeçalho da aba (cacheado). Acrescenta, à direita, só os cabeçalhos que ainda não existem.
let cabCache = null;
async function cabecalhos() {
  if (cabCache && Date.now() - cabCache.em < 10 * 60 * 1000) return cabCache.lista;
  const r = await api('GET', `/values/${enc('1:1')}`);
  let lista = (r.values?.[0] ?? []).map((v) => String(v).trim());
  while (lista.length && lista[lista.length - 1] === '') lista.pop();
  const faltam = [...BASE, ...EXTRAS].filter((h) => !lista.includes(h));
  if (faltam.length) {
    const ini = lista.length + 1;
    await api('PUT', `/values/${enc(`${colLetra(ini)}1:${colLetra(ini + faltam.length - 1)}1`)}?valueInputOption=RAW`, { values: [faltam] });
    lista = lista.concat(faltam);
  }
  cabCache = { lista, em: Date.now() };
  return lista;
}

const isoUtc = (d) => (d ? new Date(d).toISOString().replace(/\.\d{3}Z$/, '+00:00') : ''); // igual ao da planilha antiga

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
    total_horas: seg == null ? '' : (seg / 3600).toFixed(2), // texto com ponto, como na planilha antiga
    status: row.fechado_em ? 'Fechado' : 'Aberto',
    nome_tarefa: row.tarefa_id === 'pendente' ? '' : (row.tarefa_titulo ?? ''),
    pontos_produtividade: '',
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

// Cria a linha do ponto ou atualiza a que já existe (procura pelo id_ponto).
function upsertPonto(row) {
  if (!sheetId()) return Promise.reject(new Error('PONTO_SHEET_ID não configurado'));
  return enfileirar(() => gravar(row));
}

module.exports = { upsertPonto, valoresDe, BASE, EXTRAS };
