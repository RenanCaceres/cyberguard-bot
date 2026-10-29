'use strict';
// Integração de Histórico de Membros com o Notion (API 2022-06-28 / 2025-09-03).
const db = require('./db');

const BASE = 'https://api.notion.com/v1';

const cfg = () => ({
  token: process.env.NOTION_TOKEN,
  dbId: process.env.NOTION_MEMBROS_DB_ID || '',
});

function normalizarSetor(area) {
  if (!area) return null;
  const a = area.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (a.includes('etico') || a.includes('hack') || a.includes('red') || a.includes('blue')) return 'Hacking Ético';
  if (a.includes('design')) return 'Design';
  if (a.includes('hardware')) return 'Hardware Hacking';
  if (a.includes('humano') || a.includes('rh')) return 'Recursos Humanos';
  if (a.includes('social') || a.includes('copy')) return 'Social Media & Copy';
  if (a.includes('lider')) return 'Líderes';
  if (a.includes('educacion')) return 'Educacional';
  if (a.includes('desenvolv')) return 'Desenvolvimento';
  return area.trim();
}

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
 * Busca a página de um membro no Notion pelo RA ou Nome
 */
async function buscarPaginaMembro(discordId, ra = null, nome = null) {
  const { dbId } = cfg();
  if (!dbId) return null;

  try {
    let nomeBuscar = nome;
    let raBuscar = ra;

    if (discordId && (!nomeBuscar || !raBuscar)) {
      const regDb = await db.getMembro(discordId).catch(() => null);
      if (regDb) {
        if (!nomeBuscar && regDb.nome) nomeBuscar = regDb.nome;
        if (!raBuscar && regDb.ra) raBuscar = regDb.ra;
      }
      if (!nomeBuscar || !raBuscar) {
        const { rows: leg } = await db.pool.query('SELECT nome, ra FROM cadastro_legado WHERE discord_id = $1', [discordId]).catch(() => ({ rows: [] }));
        if (leg && leg[0]) {
          if (!nomeBuscar && leg[0].nome) nomeBuscar = leg[0].nome;
          if (!raBuscar && leg[0].ra) raBuscar = leg[0].ra;
        }
      }
    }

    const r = await req('POST', `/databases/${dbId}/query`, { page_size: 100 });
    if (!r?.results?.length) return null;

    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const nBuscar = norm(nomeBuscar);
    const raLimpo = String(raBuscar || '').replace(/\D/g, '');

    // 1. Busca por RA
    if (raLimpo) {
      const achouRa = r.results.find((p) => {
        const pRa = String(p.properties.RA?.rich_text?.[0]?.plain_text || '').replace(/\D/g, '');
        return pRa && pRa === raLimpo;
      });
      if (achouRa) return achouRa;
    }

    // 2. Busca por Nome
    if (nBuscar) {
      const achouNome = r.results.find((p) => {
        const pNome = norm(p.properties.Nome?.title?.[0]?.plain_text || '');
        if (!pNome) return false;
        return pNome === nBuscar || pNome.includes(nBuscar) || nBuscar.includes(pNome);
      });
      if (achouNome) return achouNome;
    }

    return null;
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
    const existente = await buscarPaginaMembro(membro.discord_id, membro.ra, membro.nome);

    const propriedades = {
      Nome: {
        title: [{ text: { content: membro.nome || 'Membro' } }],
      },
      Status: {
        select: { name: 'Ativo' },
      },
      RA: {
        rich_text: membro.ra ? [{ text: { content: String(membro.ra).trim() } }] : [],
      },
      'Data de Saída': {
        date: null,
      },
    };

    if (membro.email) {
      propriedades['E-mail'] = { email: String(membro.email).trim() };
    }

    const setorNormalizado = normalizarSetor(membro.area_interesse);
    if (setorNormalizado) {
      propriedades.Setor = { select: { name: setorNormalizado } };
    }

    if (membro.data_inicio || membro.data_aprovacao || membro.created_at) {
      let dataIso = null;
      if (membro.data_inicio && membro.data_inicio.includes('/')) {
        const partes = membro.data_inicio.split('/');
        if (partes.length === 2) {
          // mm/aaaa -> aaaa-mm-01
          dataIso = `${partes[1]}-${partes[0].padStart(2, '0')}-01`;
        } else if (partes.length === 3) {
          // dd/mm/aaaa -> aaaa-mm-dd
          dataIso = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
        }
      }
      if (!dataIso && (membro.data_aprovacao || membro.created_at)) {
        dataIso = new Date(membro.data_aprovacao || membro.created_at).toISOString().split('T')[0];
      }
      if (dataIso) {
        propriedades['Data de Entrada'] = { date: { start: dataIso } };
      }
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
 * Atualiza o status do membro para Inativo ao sair do Discord (apenas Ativo ou Inativo conforme LGPD)
 */
async function registrarSaidaMembro(discordId, { nome = null, ra = null } = {}) {
  const { dbId, token } = cfg();
  if (!token || !dbId) return;

  try {
    const pagina = await buscarPaginaMembro(discordId, ra, nome);
    if (!pagina) {
      console.warn(`[notion-membros] Página não encontrada no Notion para o Discord ID ${discordId}`);
      return;
    }

    const dataHojeIso = new Date().toISOString().split('T')[0];
    const novoStatus = 'Inativo';

    const propriedades = {
      Status: { select: { name: novoStatus } },
      'Data de Saída': { date: { start: dataHojeIso } },
    };

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
