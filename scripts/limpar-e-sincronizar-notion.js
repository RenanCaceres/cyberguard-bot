'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('../src/db');
const config = require('../src/config');

const BASE = 'https://api.notion.com/v1';
const DB_ID = process.env.NOTION_MEMBROS_DB_ID || '3f8c798f-d407-815a-9d95-eb30329ba64d';

async function reqNotion(method, path, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN não configurado.');

  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion ${res.status}: ${err.slice(0, 300)}`);
  }
  return res.json();
}

function normalizarSetor(roles) {
  const nomes = roles.map((r) => r.name || r);
  if (nomes.includes('Blue Team')) return 'Blue Team';
  if (nomes.includes('Red Team') || nomes.includes('Hacking Ético')) return 'Red Team';
  if (nomes.includes('Design')) return 'Design';
  if (nomes.includes('Hardware Hacking')) return 'Hardware Hacking';
  if (nomes.includes('Observatório') || nomes.includes('Observatorio')) return 'Observatório';
  if (nomes.includes('Recursos Humanos')) return 'Recursos Humanos';
  if (nomes.includes('Social Media & Copy')) return 'Social Media & Copy';
  if (nomes.includes('Líderes')) return 'Líderes';
  return null;
}

async function main() {
  console.log('Iniciando limpeza e ressincronização correta do Notion...\n');

  // 1. Busca todas as páginas atuais no Notion
  const rNotion = await reqNotion('POST', `/databases/${DB_ID}/query`, { page_size: 100 });
  const paginasNotion = rNotion.results;
  console.log(`Páginas encontradas no Notion: ${paginasNotion.length}`);

  // 2. Conecta ao Discord para saber quem REALMENTE está no servidor
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await client.login(config.discordToken);
  const guild = await client.guilds.fetch(config.guildId);
  await guild.members.fetch();

  // 3. Busca dados cadastrais do banco
  const { rows: membrosDb } = await db.pool.query('SELECT * FROM membros');
  const { rows: legadosDb } = await db.pool.query('SELECT * FROM cadastro_legado');

  const mapaMembrosDb = new Map(membrosDb.map((m) => [m.discord_id, m]));
  const mapaLegados = new Map(legadosDb.map((l) => [l.discord_id, l.nome]));

  // Arquiva páginas "lixo" que ficaram com Nome: "Membro"
  for (const pag of paginasNotion) {
    const titulo = pag.properties.Nome?.title?.[0]?.plain_text || '';
    if (!titulo || titulo.trim() === 'Membro') {
      console.log(`[Lixeira] Arquivando registro sem nome: ${pag.id}`);
      await reqNotion('PATCH', `/pages/${pag.id}`, { archived: true });
    }
  }

  // 4. Sincroniza cada membro ativo que está na guilda do Discord
  let ativosAtualizados = 0;
  for (const guildMember of guild.members.cache.values()) {
    if (guildMember.user.bot) continue;

    const discordId = guildMember.id;
    const registroDb = mapaMembrosDb.get(discordId);
    const nomeLegado = mapaLegados.get(discordId);

    const nomeReal =
      (registroDb && registroDb.nome && registroDb.nome.trim()) ||
      nomeLegado ||
      guildMember.displayName ||
      guildMember.user.username;

    const ra = (registroDb && registroDb.ra) || '';

    const setor =
      normalizarSetor(guildMember.roles.cache.map((r) => r.name)) ||
      (registroDb && normalizarSetor([registroDb.area_interesse])) ||
      'Líderes';

    const props = {
      Nome: {
        title: [{ text: { content: nomeReal } }],
      },
      Status: {
        select: { name: 'Ativo' },
      },
      Setor: {
        select: { name: setor },
      },
      'Data de Entrada': {
        date: { start: '2026-05-01' },
      },
      'Data de Saída': {
        date: null, // Limpa data de saída para quem está ativo!
      },
    };

    if (ra) {
      props.RA = {
        rich_text: [{ text: { content: String(ra) } }],
      };
    }

    // Procura se já tem página no Notion com esse nome
    const pagExistente = paginasNotion.find((p) => {
      const t = p.properties.Nome?.title?.[0]?.plain_text || '';
      return t.toLowerCase().trim() === nomeReal.toLowerCase().trim();
    });

    if (pagExistente) {
      await reqNotion('PATCH', `/pages/${pagExistente.id}`, { properties: props });
      console.log(`✅ [Notion Atualizado - ATIVO] ${nomeReal} | Setor: ${setor} | RA: ${ra || 'N/A'}`);
    } else {
      await reqNotion('POST', '/pages', {
        parent: { database_id: DB_ID },
        properties: props,
      });
      console.log(`➕ [Notion Criado - ATIVO] ${nomeReal} | Setor: ${setor} | RA: ${ra || 'N/A'}`);
    }

    ativosAtualizados++;
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\nConcluído! ${ativosAtualizados} membros ativos sincronizados no Notion.`);
  await client.destroy();
  await db.pool.end();
}

main().catch(console.error);
