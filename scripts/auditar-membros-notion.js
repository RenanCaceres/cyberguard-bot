'use strict';
require('dotenv').config();
const { JWT } = require('google-auth-library');

const BASE_NOTION = 'https://api.notion.com/v1';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PEOPLE_DB_ID = 'd3dc798f-d407-82df-b0d8-014512d331ec';
const HISTORICO_DB_ID = process.env.NOTION_MEMBROS_DB_ID || '3f8c798f-d407-815a-9d95-eb30329ba64d';

function normalizarTexto(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function main() {
  // 1. Pessoas no Workspace do Notion (Directory)
  const resPeople = await fetch(`${BASE_NOTION}/databases/${PEOPLE_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });
  const dataPeople = await resPeople.json();
  const notionUsers = (dataPeople.results || []).map((p) => {
    const props = p.properties;
    return {
      name: props.Name?.title?.[0]?.plain_text || '',
      email: (props.Person?.people?.[0]?.person?.email || '').toLowerCase().trim(),
      userId: props.Person?.people?.[0]?.id,
      membershipType: props['Membership Type']?.select?.name,
    };
  });

  // 2. Histórico de Membros no Notion
  const resHistorico = await fetch(`${BASE_NOTION}/databases/${HISTORICO_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });
  const dataHistorico = await resHistorico.json();
  const historicoMembros = (dataHistorico.results || []).map((p) => {
    const props = p.properties;
    return {
      id: p.id,
      nome: props.Nome?.title?.[0]?.plain_text || '',
      email: (props['E-mail']?.email || '').toLowerCase().trim(),
      status: props.Status?.select?.name || '',
      setor: props.Setor?.select?.name || '',
      ra: (props.RA?.rich_text?.[0]?.plain_text || '').trim(),
    };
  });

  // 3. Planilha Google Sheets
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const token = (await auth.getAccessToken()).token;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const aba = process.env.GOOGLE_SHEET_ABA || 'Respostas ao formulário 1';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(aba + '!A1:Z100')}`;
  const resSheet = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const dataSheet = await resSheet.json();
  const sheetRows = dataSheet.values ? dataSheet.values.slice(1) : [];

  const cadastrosPlanilha = [];
  for (const r of sheetRows) {
    const nome = (r[1] || '').trim();
    const ra = (r[2] || '').trim();
    const email = (r[7] || '').trim().toLowerCase();
    const discord = (r[8] || '').trim();
    const time = (r[5] || '').trim();
    if (nome) {
      cadastrosPlanilha.push({ nome, ra, email, discord, time });
    }
  }

  // Filtrar os integrantes ATIVOS da equipe (tanto do histórico quanto da planilha)
  const ativos = historicoMembros.filter((h) => h.status === 'Ativo');

  console.log('AUDITORIA_START');
  console.log(JSON.stringify({
    totalAtivosNotion: ativos.length,
    notionUsers,
    ativos,
    cadastrosPlanilha,
  }, null, 2));
  console.log('AUDITORIA_END');
}

main().catch(console.error);
