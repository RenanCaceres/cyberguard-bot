'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

function normalizarSetor(rolesOuTexto) {
  const lista = Array.isArray(rolesOuTexto) ? rolesOuTexto : [rolesOuTexto];
  const str = lista.filter(Boolean).map((r) => (typeof r === 'string' ? r : r.name || '')).join(' ');
  const norm = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (norm.includes('blue')) return 'Blue Team';
  if (norm.includes('red') || norm.includes('etico')) return 'Red Team';
  if (norm.includes('design')) return 'Design';
  if (norm.includes('hardware')) return 'Hardware Hacking';
  if (norm.includes('observatorio')) return 'Observatório';
  if (norm.includes('humano') || norm.includes('rh')) return 'Recursos Humanos';
  if (norm.includes('social') || norm.includes('copy')) return 'Social Media & Copy';
  if (norm.includes('lider')) return 'Líderes';
  return null;
}

function limparRa(ra) {
  if (!ra) return '';
  return String(ra).trim().replace(/\s+/g, '');
}

async function main() {
  console.log('Iniciando sincronização completa e precisa do Notion...\n');

  // 1. Garante que o banco seja inline na página de Membros
  try {
    await reqNotion('PATCH', `/databases/${DB_ID}`, { is_inline: true });
    console.log('✅ Banco no Notion configurado como is_inline: true (renderiza direto na página).');
  } catch (err) {
    console.warn('Aviso ao ajustar is_inline:', err.message);
  }

  // 2. Carrega extração dos termos assinados se disponível
  const relatorioPath = path.resolve('./temp/extracao_termos_resultado.json');
  let termos = [];
  if (fs.existsSync(relatorioPath)) {
    termos = JSON.parse(fs.readFileSync(relatorioPath, 'utf8'));
    console.log(`Carregados ${termos.length} termos de voluntariado extraídos.`);
  }

  const mapaTermosPorRa = new Map();
  const mapaTermosPorNome = new Map();
  for (const t of termos) {
    if (t.ra) {
      mapaTermosPorRa.set(limparRa(t.ra).toLowerCase().replace(/\D/g, ''), t);
    }
    if (t.nome) {
      mapaTermosPorNome.set(t.nome.toLowerCase().trim(), t);
    }
  }

  // 3. Busca todas as páginas atuais no Notion
  const rNotion = await reqNotion('POST', `/databases/${DB_ID}/query`, { page_size: 100 });
  const paginasNotion = rNotion.results;
  console.log(`Páginas atuais encontradas no Notion: ${paginasNotion.length}`);

  // 4. Conecta ao Discord para saber quem REALMENTE está no servidor
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await client.login(config.discordToken);
  const guild = await client.guilds.fetch(config.guildId);
  await guild.members.fetch();

  // 5. Busca dados cadastrais do banco
  const { rows: membrosDb } = await db.pool.query('SELECT * FROM membros');
  const { rows: legadosDb } = await db.pool.query('SELECT * FROM cadastro_legado');

  const mapaMembrosDb = new Map(membrosDb.map((m) => [m.discord_id, m]));
  const mapaLegados = new Map(legadosDb.map((l) => [l.discord_id, l.nome]));

  // Remove páginas inválidas ou lixo
  for (const pag of paginasNotion) {
    const titulo = pag.properties.Nome?.title?.[0]?.plain_text || '';
    if (!titulo || titulo.trim() === 'Membro' || titulo.trim() === '.') {
      console.log(`[Lixeira] Arquivando registro inválido: ${pag.id}`);
      await reqNotion('PATCH', `/pages/${pag.id}`, { archived: true });
    }
  }

  // Função auxiliar para encontrar página existente no Notion por Nome ou RA
  function encontrarPagina(nome, ra) {
    const nomeNorm = (nome || '').toLowerCase().trim();
    const raLimpo = limparRa(ra).replace(/\D/g, '');

    return paginasNotion.find((p) => {
      const pNome = (p.properties.Nome?.title?.[0]?.plain_text || '').toLowerCase().trim();
      const pRa = limparRa(p.properties.RA?.rich_text?.[0]?.plain_text || '').replace(/\D/g, '');

      if (raLimpo && pRa && raLimpo === pRa) return true;
      if (nomeNorm && pNome && (pNome === nomeNorm || pNome.includes(nomeNorm) || nomeNorm.includes(pNome))) {
        return true;
      }
      return false;
    });
  }

  // 6. Sincroniza cada membro ativo que está na guilda do Discord
  console.log('\n--- ATUALIZANDO MEMBROS ATIVOS NO DISCORD ---');
  let ativosAtualizados = 0;
  for (const guildMember of guild.members.cache.values()) {
    if (guildMember.user.bot) continue;

    const discordId = guildMember.id;
    const registroDb = mapaMembrosDb.get(discordId);
    const nomeLegado = mapaLegados.get(discordId);

    // Tenta achar termo associado
    let termoMembro = null;
    if (registroDb && registroDb.ra) {
      termoMembro = mapaTermosPorRa.get(limparRa(registroDb.ra).toLowerCase().replace(/\D/g, ''));
    }
    if (!termoMembro && registroDb && registroDb.nome) {
      termoMembro = mapaTermosPorNome.get(registroDb.nome.toLowerCase().trim());
    }
    if (!termoMembro && nomeLegado) {
      termoMembro = mapaTermosPorNome.get(nomeLegado.toLowerCase().trim());
    }

    const nomeReal =
      (termoMembro && termoMembro.nome) ||
      (registroDb && registroDb.nome && registroDb.nome.trim()) ||
      nomeLegado ||
      guildMember.displayName ||
      guildMember.user.username;

    const ra = (termoMembro && termoMembro.ra) || (registroDb && registroDb.ra) || '';

    const setor =
      normalizarSetor(guildMember.roles.cache.map((r) => r.name)) ||
      (termoMembro && normalizarSetor(termoMembro.time)) ||
      (registroDb && normalizarSetor(registroDb.area_interesse)) ||
      'Líderes';

    // Determina Data de Entrada real
    let dataEntradaIso = null;
    if (termoMembro && termoMembro.dataInicioIso) {
      dataEntradaIso = termoMembro.dataInicioIso;
    } else if (registroDb && registroDb.created_at) {
      dataEntradaIso = new Date(registroDb.created_at).toISOString().split('T')[0];
    } else if (guildMember.joinedAt) {
      dataEntradaIso = guildMember.joinedAt.toISOString().split('T')[0];
    } else {
      dataEntradaIso = '2026-05-01';
    }

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
        date: { start: dataEntradaIso },
      },
      'Data de Saída': {
        date: null,
      },
    };

    if (ra) {
      props.RA = {
        rich_text: [{ text: { content: String(ra) } }],
      };
    } else {
      props.RA = {
        rich_text: [],
      };
    }

    const pagExistente = encontrarPagina(nomeReal, ra);

    if (pagExistente) {
      await reqNotion('PATCH', `/pages/${pagExistente.id}`, { properties: props });
      console.log(`✅ [ATIVO] ${nomeReal} | Setor: ${setor} | RA: ${ra || 'N/A'} | Entrada: ${dataEntradaIso}`);
    } else {
      const novaPag = await reqNotion('POST', '/pages', {
        parent: { database_id: DB_ID },
        properties: props,
      });
      paginasNotion.push(novaPag);
      console.log(`➕ [ATIVO] ${nomeReal} | Setor: ${setor} | RA: ${ra || 'N/A'} | Entrada: ${dataEntradaIso}`);
    }

    ativosAtualizados++;
    await new Promise((r) => setTimeout(r, 300));
  }

  // 7. Sincroniza Membros Desligados / Egressos
  console.log('\n--- ATUALIZANDO MEMBROS DESLIGADOS / EGRESSOS ---');
  const membrosDesligados = [
    {
      nome: 'Pedro Lucas Sales Larini',
      ra: '2767147',
      setor: 'Líderes',
      dataEntrada: '2026-06-24',
      dataSaida: '2026-10-06',
    },
    {
      nome: 'Maria Eduarda Fernandes Crespo',
      ra: 'a2565480',
      setor: 'Social Media & Copy',
      dataEntrada: '2026-06-29',
      dataSaida: '2026-09-13',
    },
    {
      nome: 'Augusto da Silva de Sá',
      ra: '',
      setor: 'Líderes',
      dataEntrada: '2026-06-22',
      dataSaida: '2026-09-13',
    },
    {
      nome: 'Gabriel de Almeida Oliveira',
      ra: '2575361',
      setor: 'Blue Team',
      dataEntrada: '2026-06-25',
      dataSaida: '2026-08-30',
    },
    {
      nome: 'Pedro Coppo',
      ra: '',
      setor: 'Observatório',
      dataEntrada: '2026-06-11',
      dataSaida: '2026-07-27',
    },
    {
      nome: 'lelouchzada',
      ra: '',
      setor: 'Design',
      dataEntrada: '2026-07-15',
      dataSaida: '2026-07-27',
    },
  ];

  for (const m of membrosDesligados) {
    const props = {
      Nome: {
        title: [{ text: { content: m.nome } }],
      },
      Status: {
        select: { name: 'Desligado / Egresso' },
      },
      Setor: {
        select: { name: m.setor || 'Líderes' },
      },
      'Data de Entrada': {
        date: m.dataEntrada ? { start: m.dataEntrada } : null,
      },
      'Data de Saída': {
        date: m.dataSaida ? { start: m.dataSaida } : null,
      },
    };

    if (m.ra) {
      props.RA = {
        rich_text: [{ text: { content: String(m.ra) } }],
      };
    } else {
      props.RA = {
        rich_text: [],
      };
    }

    const pagExistente = encontrarPagina(m.nome, m.ra);

    if (pagExistente) {
      await reqNotion('PATCH', `/pages/${pagExistente.id}`, { properties: props });
      console.log(`✅ [DESLIGADO] ${m.nome} | Setor: ${m.setor} | Saída: ${m.dataSaida || 'N/A'}`);
    } else {
      const novaPag = await reqNotion('POST', '/pages', {
        parent: { database_id: DB_ID },
        properties: props,
      });
      paginasNotion.push(novaPag);
      console.log(`➕ [DESLIGADO] ${m.nome} | Setor: ${m.setor} | Saída: ${m.dataSaida || 'N/A'}`);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nSincronização concluída com sucesso!`);
  console.log(`- ${ativosAtualizados} membros ativos.`);
  console.log(`- ${membrosDesligados.length} membros desligados / egressos.`);

  await client.destroy();
  await db.pool.end();
}

main().catch(console.error);
