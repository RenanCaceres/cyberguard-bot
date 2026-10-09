'use strict';
// Integração com o database de Tarefas do Notion (API 2025-09-03, usa data source).
// Sem dependências: usa o fetch nativo do Node 18+.

const BASE = 'https://api.notion.com/v1';

// Nomes lidos na hora do uso (garante que o dotenv já carregou).
const cfg = () => ({
  token: process.env.NOTION_TOKEN,
  ds: process.env.NOTION_DATA_SOURCE_ID,
  pStatus: process.env.NOTION_PROP_STATUS ?? 'Status',
  // Deixe NOTION_PROP_PROGRESSO= (vazio) no .env se NÃO criou a propriedade Progresso no Notion.
  pProgresso: process.env.NOTION_PROP_PROGRESSO ?? 'Progresso',
  pResponsavel: process.env.NOTION_PROP_RESPONSAVEL ?? 'Responsável',
});

const S = { concluido: 'Concluído', andamento: 'Em andamento' };

// Ordem em que as tarefas aparecem no select (as primeiras são as mais prováveis de serem escolhidas).
const ORDEM = [
  'Em andamento',
  'A fazer - Essa Semana',
  'Depois de 1 mês',
  'Próximo Semestre',
  'Aguardando Terceiros',
  'Backlogs - Sem Data',
  'Standby Estratégico',
];
const pos = (s) => {
  const i = ORDEM.indexOf(s);
  return i === -1 ? 99 : i; // sem status / desconhecido vai pro fim
};

async function req(method, path, body) {
  const { token } = cfg();
  if (!token) throw new Error('NOTION_TOKEN não configurado');
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Notion ${res.status} ${method} ${path}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

const tituloDe = (page) => {
  const prop = Object.values(page.properties).find((p) => p.type === 'title');
  return prop?.title.map((t) => t.plain_text).join('').trim() || '(sem título)';
};
const textoDe = (prop) => prop?.rich_text?.map((t) => t.plain_text).join('').trim() || '';

// Todas as tarefas que não estão em "Concluído" (inclui as sem status).
async function listarTarefasAbertas() {
  const c = cfg();
  if (!c.ds) throw new Error('NOTION_DATA_SOURCE_ID não configurado');
  const out = [];
  let cursor;
  do {
    const r = await req('POST', `/data_sources/${c.ds}/query`, {
      filter: { property: c.pStatus, status: { does_not_equal: S.concluido } },
      start_cursor: cursor,
      page_size: 100,
    });
    for (const p of r.results) {
      out.push({
        id: p.id,
        titulo: tituloDe(p),
        status: p.properties[c.pStatus]?.status?.name ?? null,
        responsavel: textoDe(p.properties[c.pResponsavel]),
        // Progresso atual da tarefa no Notion (null se a propriedade não existir ou estiver vazia)
        progresso: c.pProgresso && typeof p.properties[c.pProgresso]?.number === 'number'
          ? p.properties[c.pProgresso].number
          : null,
      });
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  out.sort((a, b) => pos(a.status) - pos(b.status));
  return out;
}

// Garante que a propriedade numérica de progresso existe no database (cria se faltar).
// Sucesso fica em cache; falha é reavaliada a cada 30 min (ex.: conexão sem permissão de editar o schema).
let progressoCache = { ok: undefined, em: 0 };

async function garantirProgresso() {
  const c = cfg();
  if (!c.pProgresso) return false;
  if (progressoCache.ok === true) return true;
  if (progressoCache.ok === false && Date.now() - progressoCache.em < 30 * 60 * 1000) return false;

  let ok = false;
  try {
    const ds = await req('GET', `/data_sources/${c.ds}`);
    const existente = ds.properties?.[c.pProgresso];
    if (existente) {
      ok = existente.type === 'number';
      if (!ok) console.error(`[ponto] a propriedade "${c.pProgresso}" existe mas é do tipo ${existente.type}; precisa ser Número.`);
    } else {
      await req('PATCH', `/data_sources/${c.ds}`, {
        properties: { [c.pProgresso]: { number: { format: 'number' } } },
      });
      console.log(`[ponto] propriedade "${c.pProgresso}" (Número) criada no Notion.`);
      ok = true;
    }
  } catch (e) {
    console.error('[ponto] notion (garantir progresso):', e.message);
  }
  progressoCache = { ok, em: Date.now() };
  return ok;
}

// 100% -> Concluído; qualquer outro valor -> Em andamento.
// Status e progresso vão em chamadas separadas: o progresso (opcional) nunca bloqueia o status.
async function atualizarTarefa(pageId, progresso) {
  const c = cfg();
  await req('PATCH', `/pages/${pageId}`, {
    properties: { [c.pStatus]: { status: { name: progresso >= 100 ? S.concluido : S.andamento } } },
  });
  if (await garantirProgresso()) {
    await req('PATCH', `/pages/${pageId}`, {
      properties: { [c.pProgresso]: { number: progresso } },
    });
  }
}

// Comentário na página da tarefa (a conexão precisa da capacidade "inserir comentários").
async function comentar(pageId, texto) {
  await req('POST', '/comments', {
    parent: { page_id: pageId },
    rich_text: [{ text: { content: String(texto).slice(0, 2000) } }],
  });
}

module.exports = { listarTarefasAbertas, atualizarTarefa, comentar };
