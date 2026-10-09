'use strict';
// Envio das horas importadas do KoV Ponto para o Google Sheets.
// Cada lote é inserido ACIMA dos registros já existentes (logo abaixo do cabeçalho),
// ordenado do mais antigo para o mais recente. Os dados antigos da planilha ficam abaixo.
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('./config');

const TZ = 'America/Sao_Paulo';
const CABECALHO_PADRAO = ['Data', 'Nome', 'Discord ID', 'Entrada', 'Saída', 'Duração'];

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const fmtData = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
const fmtDataHora = (d) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(d)).replace(',', '');
const fmtDuracao = (seg) => {
  seg = Math.max(0, Math.round(seg));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Qual valor vai em qual coluna, conforme o nome do cabeçalho (tolerante a variações).
function valorDaColuna(cabecalho, p) {
  const h = norm(cabecalho);
  if (!h) return '';
  if (h.includes('discord') && h.includes('id')) return p.discord_id;
  if (h === 'id') return p.discord_id;
  if (h.includes('entrada') || h.includes('inicio')) return fmtDataHora(p.aberto_em);
  if (h.includes('saida') || h.includes('termino') || h.includes('fim')) return fmtDataHora(p.fechado_em);
  if (h.includes('duracao') || h.includes('horas') || h.includes('total') || h.includes('tempo')) return fmtDuracao((new Date(p.fechado_em) - new Date(p.aberto_em)) / 1000);
  if (h.includes('data')) return fmtData(p.aberto_em);
  if (h.includes('nome') || h.includes('membro') || h.includes('usuario') || h.includes('voluntario')) return p.nome;
  return '';
}

function configurado() {
  const c = config.googleSheets;
  return Boolean((c.pontoSheetId || c.sheetId) && c.serviceAccountEmail && c.privateKey);
}

async function abrirAba() {
  const c = config.googleSheets;
  const auth = new JWT({
    email: c.serviceAccountEmail,
    key: c.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(c.pontoSheetId || c.sheetId, auth);
  await doc.loadInfo();
  let sheet = doc.sheetsByTitle[c.pontoAbaNome];
  if (!sheet) {
    sheet = await doc.addSheet({ title: c.pontoAbaNome, headerValues: CABECALHO_PADRAO });
    console.log(`[kov] aba "${c.pontoAbaNome}" criada na planilha.`);
  }
  return sheet;
}

// Insere os registros (já ordenados do mais antigo ao mais recente) no topo da aba.
async function inserirNoTopo(registros) {
  if (!registros.length) return;
  const sheet = await abrirAba();
  try {
    await sheet.loadHeaderRow();
  } catch {
    await sheet.setHeaderRow(CABECALHO_PADRAO); // aba vazia
    await sheet.loadHeaderRow();
  }
  const cab = sheet.headerValues;
  if (!cab.some((h) => registros.length && valorDaColuna(h, registros[0]) !== '')) {
    throw new Error(`Nenhuma coluna do cabeçalho da aba "${sheet.title}" foi reconhecida (${cab.join(' | ')}).`);
  }

  // abre espaço logo abaixo do cabeçalho (linha 2) e preenche
  await sheet.insertDimension('ROWS', { startIndex: 1, endIndex: 1 + registros.length }, false);
  await sheet.loadCells({
    startRowIndex: 1, endRowIndex: 1 + registros.length,
    startColumnIndex: 0, endColumnIndex: cab.length,
  });
  registros.forEach((p, i) => {
    cab.forEach((h, c) => {
      const v = valorDaColuna(h, p);
      if (v !== '') sheet.getCell(1 + i, c).value = v;
    });
  });
  await sheet.saveUpdatedCells();
}

module.exports = { inserirNoTopo, configurado, fmtDuracao };
