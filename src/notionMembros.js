'use strict';
// Integração de Histórico de Membros com o Notion (API 2022-06-28 / 2025-09-03).
const db = require('./db');

const BASE = 'https://api.notion.com/v1';

const cfg = () => ({
  token: process.env.NOTION_TOKEN,
  dbId: process.env.NOTION_MEMBROS_DB_ID || '3f8c798fd40780399b3ccb530c901967',
});

async function req(method, path, body) {
  const { token } = cfg();
  if (!token) return null;

  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const erroTexto = await res.text();
    console.error(`[notion-membros] Erro ${res.status} em ${method} ${path}:`, erroTexto.slice(0, 200));
    return null;
  }
  return res.json();
}

/**
 * Busca a página de um membro no Notion pelo Discord ID ou RA
 */
async function buscarPaginaMembro(discordId, ra = null) {
  const { dbId } = cfg();
  if (!dbId) return null;

  try {
    const filtros = [
      {
        property: 'Discord ID',
        rich_text: { equals: String(discordId) },
      },
    ];

    if (ra) {
      filtros.push({
        property: 'RA',
        rich_text: { equals: String(ra) },
      });
    }

    const r = await req('POST', `/databases/${dbId}/query`, {
      filter: filtros.length > 1 ? { or: filtros } : filtros[0],
      page_size: 1,
    });

    return r && r.results && r.results.length > 0 ? r.results[0] : null;
  } catch (err) {
    console.error('[notion-membros] Erro ao buscar página do membro:', err.message);
    return null;
  }
}

/**
 * Cadastra ou atualiza um membro ativo no Notion
 */
async function registrarMembroAtivo(membro) {
  const { dbId, token } = cfg();
  if (!token || !dbId) return;

  try {
    const existente = await buscarPaginaMembro(membro.discord_id, membro.ra);

    const propriedades = {
      Nome: {
        title: [{ text: { content: membro.nome || 'Membro' } }],
      },
      Status: {
        select: { name: 'Ativo' },
      },
      'Discord ID': {
        rich_text: [{ text: { content: String(membro.discord_id) } }],
      },
      RA: {
        rich_text: [{ text: { content: String(membro.ra || '') } }],
      },
    };

    if (membro.curso) {
      propriedades.Curso = { select: { name: membro.curso } };
    }
    if (membro.area_interesse) {
      propriedades.Time = { select: { name: membro.area_interesse } };
    }
    if (membro.data_inicio || membro.data_aprovacao) {
      const dataIso = (membro.data_aprovacao ? new Date(membro.data_aprovacao) : new Date()).toISOString().split('T')[0];
      propriedades['Data de Entrada'] = { date: { start: dataIso } };
    }

    if (existente) {
      await req('PATCH', `/pages/${existente.id}`, { properties: propriedades });
      console.log(`[notion-membros] Membro ${membro.nome} atualizado no Notion.`);
    } else {
      await req('POST', '/pages', {
        parent: { database_id: dbId },
        properties: propriedades,
      });
      console.log(`[notion-membros] Membro ${membro.nome} cadastrado no Notion.`);
    }
  } catch (err) {
    console.error('[notion-membros] Erro ao registrar membro ativo:', err.message);
  }
}

/**
 * Atualiza o status do membro para Egresso / Desligado ou Expulso ao sair do Discord
 */
async function registrarSaidaMembro(discordId, { motivo = null, expulso = false } = {}) {
  const { dbId, token } = cfg();
  if (!token || !dbId) return;

  try {
    const pagina = await buscarPaginaMembro(discordId);
    if (!pagina) {
      console.warn(`[notion-membros] Página não encontrada no Notion para o Discord ID ${discordId}`);
      return;
    }

    const dataHojeIso = new Date().toISOString().split('T')[0];
    const novoStatus = expulso ? 'Expulso' : 'Egresso / Desligado';

    const propriedades = {
      Status: { select: { name: novoStatus } },
      'Data de Saída': { date: { start: dataHojeIso } },
    };

    if (motivo) {
      propriedades['Motivo da Saída'] = {
        rich_text: [{ text: { content: motivo.slice(0, 2000) } }],
      };
    }

    await req('PATCH', `/pages/${pagina.id}`, { properties: propriedades });
    console.log(`[notion-membros] Saída do membro (${discordId}) registrada no Notion como "${novoStatus}".`);
  } catch (err) {
    console.error('[notion-membros] Erro ao registrar saída no Notion:', err.message);
  }
}

module.exports = {
  buscarPaginaMembro,
  registrarMembroAtivo,
  registrarSaidaMembro,
};
