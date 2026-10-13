'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { JWT } = require('google-auth-library');
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
  if (norm.includes('design') || norm.includes('desing')) return 'Design';
  if (norm.includes('hardware')) return 'Hardware Hacking';
  if (norm.includes('observatorio')) return 'Observatório';
  if (norm.includes('humano') || norm.includes('rh')) return 'Recursos Humanos';
  if (norm.includes('social') || norm.includes('copy') || norm.includes('midia')) return 'Social Media & Copy';
  if (norm.includes('lider')) return 'Líderes';
  return null;
}

function limparRa(ra) {
  if (!ra) return '';
  return String(ra).trim().replace(/\s+/g, '');
}

async function buscarDadosGoogleSheets() {
  if (!config.googleSheets.sheetId || !config.googleSheets.serviceAccountEmail) {
    console.log('Google Sheets não configurado ou credenciais ausentes.');
    return [];
  }

  try {
    const auth = new JWT({
      email: config.googleSheets.serviceAccountEmail,
      key: config.googleSheets.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const tokenRes = await auth.getAccessToken();
    const token = tokenRes.token;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.googleSheets.sheetId}/values/${encodeURIComponent(
      'Respostas ao formulário 1!A1:Z100'
    )}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    if (!data.values || data.values.length < 2) return [];

    const cabecalho = data.values[0];
    const linhas = data.values.slice(1);
    const resultado = [];

    for (const r of linhas) {
      if (!r[1]) continue;
      resultado.push({
        carimbo: r[0] || '',
        nome: (r[1] || '').trim(),
        ra: (r[2] || '').trim(),
        curso: (r[3] || '').trim(),
        cargo: (r[4] || '').trim(),
        time: (r[5] || '').trim(),
        email: (r[7] || '').trim(),
        discord: (r[8] || '').trim(),
      });
    }

    console.log(`Carregadas ${resultado.length} respostas diretamente do Google Sheets.`);
    return resultado;
  } catch (err) {
    console.warn('Erro ao carregar dados do Google Sheets:', err.message);
    return [];
  }
}

async function main() {
  console.log('Iniciando sincronização completa e precisa do Notion...\n');

  // 1. Garante que o banco seja inline na página de Membros e tenha apenas as 3 opções de Status solicitadas
  try {
    await reqNotion('PATCH', `/databases/${DB_ID}`, {
      is_inline: true,
      properties: {
        Status: {
          select: {
            options: [
              { name: 'Ativo', color: 'green' },
              { name: 'Inativo', color: 'gray' },
              { name: 'Expulso', color: 'red' },
            ],
          },
        },
      },
    });
    console.log('✅ Banco no Notion configurado como is_inline: true.');
    console.log('✅ Opções de Status padronizadas: [Ativo, Inativo, Expulso].');
  } catch (err) {
    console.warn('Aviso ao ajustar configurações do banco:', err.message);
  }

  // 2. Carrega respostas da planilha Google Sheets
  const respostasPlanilha = await buscarDadosGoogleSheets();
  const mapaPlanilhaPorNome = new Map();
  const mapaPlanilhaPorRa = new Map();
  const mapaPlanilhaPorDiscord = new Map();

  for (const item of respostasPlanilha) {
    if (item.nome) mapaPlanilhaPorNome.set(item.nome.toLowerCase().trim(), item);
    if (item.ra) {
      const raLimpo = limparRa(item.ra).replace(/\D/g, '');
      if (raLimpo) mapaPlanilhaPorRa.set(raLimpo, item);
    }
    if (item.discord) mapaPlanilhaPorDiscord.set(item.discord.toLowerCase().replace(/[@#]/g, '').trim(), item);
  }

  // 3. Carrega extração dos termos assinados
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

  // 4. Busca todas as páginas atuais no Notion
  const rNotion = await reqNotion('POST', `/databases/${DB_ID}/query`, { page_size: 100 });
  const paginasNotion = rNotion.results;
  console.log(`Páginas atuais encontradas no Notion: ${paginasNotion.length}`);

  // 5. Conecta ao Discord para saber quem REALMENTE está no servidor
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await client.login(config.discordToken);
  const guild = await client.guilds.fetch(config.guildId);
  await guild.members.fetch();

  // 6. Busca dados cadastrais do banco de dados
  const { rows: membrosDb } = await db.pool.query('SELECT * FROM membros');
  const { rows: legadosDb } = await db.pool.query('SELECT * FROM cadastro_legado');

  const mapaMembrosDb = new Map(membrosDb.map((m) => [m.discord_id, m]));
  const mapaLegados = new Map(legadosDb.map((l) => [l.discord_id, l.nome]));

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

  // 7. Sincroniza membros ativos aprovados
  console.log('\n--- ATUALIZANDO MEMBROS ATIVOS NO DISCORD ---');
  let ativosAtualizados = 0;
  const membrosProcessadosAtivos = new Set();

  for (const guildMember of guild.members.cache.values()) {
    if (guildMember.user.bot) continue;

    const discordId = guildMember.id;
    const registroDb = mapaMembrosDb.get(discordId);
    const nomeLegado = mapaLegados.get(discordId);

    // REGRA: Não poderá ir para a planilha aqueles que entraram no servidor mas ainda não foram aprovados!
    const ehLegado = mapaLegados.has(discordId);
    const temTermoAssinado =
      mapaTermosPorNome.has((guildMember.displayName || '').toLowerCase().trim()) ||
      (nomeLegado && mapaTermosPorNome.has(nomeLegado.toLowerCase().trim())) ||
      (registroDb && registroDb.nome && mapaTermosPorNome.has(registroDb.nome.toLowerCase().trim()));

    const temPlanilha =
      mapaPlanilhaPorDiscord.has(guildMember.user.username.toLowerCase()) ||
      (nomeLegado && mapaPlanilhaPorNome.has(nomeLegado.toLowerCase().trim())) ||
      (registroDb && registroDb.nome && mapaPlanilhaPorNome.has(registroDb.nome.toLowerCase().trim()));

    const aprovadoNoDb =
      registroDb &&
      (registroDb.status === 'concluido' ||
        registroDb.data_aprovacao !== null ||
        registroDb.status === 'revisao_manual');

    // Se o usuário entrou mas ainda está coletando dados sem aprovação e não é membro legado/reconhecido
    const estaAprovado = ehLegado || aprovadoNoDb || temTermoAssinado || temPlanilha;

    if (!estaAprovado) {
      console.log(`⚠️ [IGNORADO / NÃO APROVADO] ${guildMember.displayName} (${discordId}) ainda não foi aprovado pelo RH.`);
      // Se por engano foi parar no Notion anteriormente, arquiva a página
      const pagPendente = encontrarPagina(guildMember.displayName, null);
      if (pagPendente) {
        console.log(`[Lixeira] Arquivando página não aprovada: ${pagPendente.id} (${guildMember.displayName})`);
        await reqNotion('PATCH', `/pages/${pagPendente.id}`, { archived: true });
      }
      continue;
    }

    // Procura na planilha Google Sheets primeiro para dados cadastrais mais ricos (RA, etc.)
    let dadosPlanilha = null;
    if (registroDb && registroDb.ra) {
      dadosPlanilha = mapaPlanilhaPorRa.get(limparRa(registroDb.ra).replace(/\D/g, ''));
    }
    if (!dadosPlanilha && registroDb && registroDb.nome) {
      dadosPlanilha = mapaPlanilhaPorNome.get(registroDb.nome.toLowerCase().trim());
    }
    if (!dadosPlanilha && nomeLegado) {
      dadosPlanilha = mapaPlanilhaPorNome.get(nomeLegado.toLowerCase().trim());
    }
    if (!dadosPlanilha) {
      dadosPlanilha = mapaPlanilhaPorDiscord.get(guildMember.user.username.toLowerCase());
    }

    // Procura no termo de voluntariado
    let termoMembro = null;
    if (registroDb && registroDb.ra) {
      termoMembro = mapaTermosPorRa.get(limparRa(registroDb.ra).replace(/\D/g, ''));
    }
    if (!termoMembro && dadosPlanilha && dadosPlanilha.ra) {
      termoMembro = mapaTermosPorRa.get(limparRa(dadosPlanilha.ra).replace(/\D/g, ''));
    }
    if (!termoMembro && registroDb && registroDb.nome) {
      termoMembro = mapaTermosPorNome.get(registroDb.nome.toLowerCase().trim());
    }
    if (!termoMembro && nomeLegado) {
      termoMembro = mapaTermosPorNome.get(nomeLegado.toLowerCase().trim());
    }

    const nomeReal =
      (dadosPlanilha && dadosPlanilha.nome) ||
      (termoMembro && termoMembro.nome) ||
      (registroDb && registroDb.nome && registroDb.nome.trim()) ||
      nomeLegado ||
      guildMember.displayName;

    const ra =
      (dadosPlanilha && dadosPlanilha.ra) ||
      (termoMembro && termoMembro.ra) ||
      (registroDb && registroDb.ra) ||
      '';

    const setor =
      normalizarSetor(guildMember.roles.cache.map((r) => r.name)) ||
      (dadosPlanilha && normalizarSetor(dadosPlanilha.time)) ||
      (termoMembro && normalizarSetor(termoMembro.time)) ||
      (registroDb && normalizarSetor(registroDb.area_interesse)) ||
      'Líderes';

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
        rich_text: [{ text: { content: String(ra).trim() } }],
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

    membrosProcessadosAtivos.add(nomeReal.toLowerCase().trim());
    ativosAtualizados++;
    await new Promise((r) => setTimeout(r, 300));
  }

  // 8. Sincroniza Membros Desligados com Status 'Inativo'
  console.log('\n--- ATUALIZANDO MEMBROS INATIVOS ---');
  const membrosInativos = [
    {
      nome: 'Pedro Lucas Sales Larini',
      ra: '2767147',
      setor: 'Líderes',
      dataEntrada: '2026-06-24',
      dataSaida: '2026-10-06',
    },
    {
      nome: 'Maria Eduarda Fernandes Crespo',
      ra: '2565480',
      setor: 'Social Media & Copy',
      dataEntrada: '2026-06-29',
      dataSaida: '2026-09-13',
    },
    {
      nome: 'Augusto da Silva de Sá',
      ra: '2564319',
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

  for (const m of membrosInativos) {
    const props = {
      Nome: {
        title: [{ text: { content: m.nome } }],
      },
      Status: {
        select: { name: 'Inativo' },
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
        rich_text: [{ text: { content: String(m.ra).trim() } }],
      };
    } else {
      props.RA = {
        rich_text: [],
      };
    }

    const pagExistente = encontrarPagina(m.nome, m.ra);

    if (pagExistente) {
      await reqNotion('PATCH', `/pages/${pagExistente.id}`, { properties: props });
      console.log(`✅ [INATIVO] ${m.nome} | RA: ${m.ra || 'N/A'} | Saída: ${m.dataSaida || 'N/A'}`);
    } else {
      const novaPag = await reqNotion('POST', '/pages', {
        parent: { database_id: DB_ID },
        properties: props,
      });
      paginasNotion.push(novaPag);
      console.log(`➕ [INATIVO] ${m.nome} | RA: ${m.ra || 'N/A'} | Saída: ${m.dataSaida || 'N/A'}`);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  // 9. Limpa páginas obsoletas ou lixo (sem título ou pessoas avulsas que não deveriam estar no Notion)
  for (const pag of paginasNotion) {
    const titulo = (pag.properties.Nome?.title?.[0]?.plain_text || '').trim();
    if (!titulo || titulo === 'Membro' || titulo === '.') {
      console.log(`[Lixeira] Arquivando página sem nome: ${pag.id}`);
      await reqNotion('PATCH', `/pages/${pag.id}`, { archived: true });
    }
  }

  console.log(`\nSincronização concluída com sucesso!`);
  console.log(`- ${ativosAtualizados} membros ativos (aprovados).`);
  console.log(`- ${membrosInativos.length} membros inativos.`);

  await client.destroy();
  await db.pool.end();
}

main().catch(console.error);
