'use strict';
require('dotenv').config();
const { JWT } = require('google-auth-library');
const db = require('../src/db');

const BASE_NOTION = 'https://api.notion.com/v1';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const HISTORICO_DB_ID = process.env.NOTION_MEMBROS_DB_ID || '3f8c798f-d407-815a-9d95-eb30329ba64d';

function normalizarTexto(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function carregarDadosPlanilha() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const token = (await auth.getAccessToken()).token;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const aba = process.env.GOOGLE_SHEET_ABA || 'Respostas ao formulário 1';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(aba + '!A1:Z100')}`;
  
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const rows = data.values ? data.values.slice(1) : [];

  const lista = [];
  for (const r of rows) {
    const nome = (r[1] || '').trim();
    const ra = (r[2] || '').trim().replace(/\D/g, '');
    const email = (r[7] || '').trim().toLowerCase();
    const discord = (r[8] || '').trim();
    const time = (r[5] || '').trim();

    if (nome && email) {
      lista.push({ nome, ra, email, discord, time });
    }
  }
  return lista;
}

async function atualizarEmailNotion(pageId, email) {
  const res = await fetch(`${BASE_NOTION}/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        'E-mail': { email },
      },
    }),
  });
  return res.ok;
}

async function main() {
  console.log('=== SINCRONIZAÇÃO DE E-MAILS DA PLANILHA CADASTRAL ===\n');

  console.log('1. Lendo dados do Google Sheets...');
  const cadastrosPlanilha = await carregarDadosPlanilha();
  console.log(`Carregados ${cadastrosPlanilha.length} cadastros da planilha.\n`);

  // 2. Atualizar no Banco de Dados Postgres
  console.log('2. Atualizando e-mails faltantes no Banco de Dados PostgreSQL...');
  const { rows: membrosDb } = await db.pool.query(
    'SELECT id, discord_id, nome, email, ra FROM membros ORDER BY id ASC'
  );

  let atualizadosDb = 0;
  for (const m of membrosDb) {
    if (m.email && m.email.trim() !== '') continue; // Já possui e-mail

    const raDb = (m.ra || '').replace(/\D/g, '');
    const nomeNormDb = normalizarTexto(m.nome);

    let match = cadastrosPlanilha.find((p) => p.ra && raDb && p.ra === raDb);
    if (!match && nomeNormDb) {
      match = cadastrosPlanilha.find((p) => {
        const pNorm = normalizarTexto(p.nome);
        return pNorm && (nomeNormDb.includes(pNorm) || pNorm.includes(nomeNormDb));
      });
    }

    if (match && match.email) {
      await db.pool.query('UPDATE membros SET email = $1 WHERE id = $2', [match.email, m.id]);
      console.log(`✅ [DB] E-mail atualizado para ${m.nome}: ${match.email}`);
      atualizadosDb++;
    } else {
      console.log(`⚠️ [DB] Não encontrado na planilha: ${m.nome || m.discord_id}`);
    }
  }
  console.log(`\nTotal atualizados no Banco de Dados: ${atualizadosDb}`);

  // 3. Atualizar no Notion (Histórico de Membros)
  console.log('\n3. Atualizando e-mails na base "Histórico de Membros" do Notion...');
  const resNotion = await fetch(`${BASE_NOTION}/databases/${HISTORICO_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });

  const dataNotion = await resNotion.json();
  const paginas = dataNotion.results || [];
  let atualizadosNotion = 0;

  for (const p of paginas) {
    const emailAtual = p.properties['E-mail']?.email;
    if (emailAtual && emailAtual.trim() !== '') continue; // Já possui e-mail

    const nomeNotion = p.properties.Nome?.title?.[0]?.plain_text || '';
    const raNotion = (p.properties.RA?.rich_text?.[0]?.plain_text || '').replace(/\D/g, '');
    const nomeNormNotion = normalizarTexto(nomeNotion);

    let match = cadastrosPlanilha.find((s) => s.ra && raNotion && s.ra === raNotion);
    if (!match && nomeNormNotion) {
      match = cadastrosPlanilha.find((s) => {
        const sNorm = normalizarTexto(s.nome);
        return sNorm && (nomeNormNotion.includes(sNorm) || sNorm.includes(nomeNormNotion));
      });
    }

    if (match && match.email) {
      const ok = await atualizarEmailNotion(p.id, match.email);
      if (ok) {
        console.log(`✅ [Notion] E-mail atualizado para ${nomeNotion}: ${match.email}`);
        atualizadosNotion++;
      } else {
        console.error(`❌ [Notion] Falha ao atualizar ${nomeNotion}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  console.log(`\nTotal atualizados no Notion: ${atualizadosNotion}`);

  console.log('\n=== OPERAÇÃO CONCLUÍDA COM SUCESSO ===');
  await db.pool.end();
}

main().catch(console.error);
