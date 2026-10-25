'use strict';
require('dotenv').config();

const SPACE_ID = process.env.NOTION_SPACE_ID || '5dec798f-d407-811a-b769-00036d789cf9';
const TOKEN_V2 = process.env.NOTION_TOKEN_V2;
const ACTIVE_USER_ID = process.env.NOTION_ACTIVE_USER_ID || 'cbb538d8-97c7-463b-bcd7-10153f8c7b3c';
const PEOPLE_DB_ID = 'd3dc798f-d407-82df-b0d8-014512d331ec';
const NOTION_TOKEN = process.env.NOTION_TOKEN;

async function promoverUsuario(userId, nome) {
  const res = await fetch('https://www.notion.so/api/v3/addMembersToSpace', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `token_v2=${TOKEN_V2};`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'x-notion-active-user-header': ACTIVE_USER_ID,
      'x-notion-space-id': SPACE_ID,
    },
    body: JSON.stringify({
      spaceId: SPACE_ID,
      userIds: [userId],
      membershipType: 'member',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }

  return res.json();
}

async function main() {
  console.log('=== PROMOÇÃO DE CONVIDADOS PARA MEMBROS DO WORKSPACE NOTION ===\n');

  // 1. Busca todos os convidados no People Directory
  console.log('1. Consultando diretório de pessoas no Notion...');
  const res = await fetch(`https://api.notion.com/v1/databases/${PEOPLE_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });

  const data = await res.json();
  const pages = data.results || [];
  
  const convidados = [];
  for (const page of pages) {
    const props = page.properties;
    const name = props.Name?.title?.[0]?.plain_text || 'Sem nome';
    const membershipType = props['Membership Type']?.select?.name;
    const person = props.Person?.people?.[0];

    if (membershipType === 'Guest' && person?.id) {
      convidados.push({
        id: person.id,
        name,
        email: person.person?.email || 'N/A',
      });
    }
  }

  console.log(`Encontrados ${convidados.length} convidados para promover:\n`);
  for (const c of convidados) {
    console.log(`- ${c.name} (${c.email}) [ID: ${c.id}]`);
  }

  console.log('\n2. Executando promoções via API v3...');
  let sucesso = 0;
  let falhas = 0;

  for (const c of convidados) {
    try {
      await promoverUsuario(c.id, c.name);
      console.log(`✅ [PROMOVIDO] ${c.name} agora é Membro do Workspace!`);
      sucesso++;
    } catch (err) {
      console.error(`❌ [FALHA] ${c.name}: ${err.message}`);
      falhas++;
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log('\n=== RESULTADO DA OPERAÇÃO ===');
  console.log(`Promovidos com sucesso: ${sucesso}`);
  console.log(`Falhas: ${falhas}`);
}

main().catch(console.error);
