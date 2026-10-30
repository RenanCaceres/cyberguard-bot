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
  pPrioridade: process.env.NOTION_PROP_PRIORIDADE ?? 'Prioridade',
  pDataInicio: process.env.NOTION_PROP_DATA_INICIO ?? 'Data de início',
  pDataFinal: process.env.NOTION_PROP_DATA_FINAL ?? 'Data final',
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

const responsavelDe = (prop) => {
  if (!prop) return '';
  if (prop.type === 'people' && Array.isArray(prop.people)) {
    return prop.people.map((p) => p.name || p.person?.email || 'Membro').filter(Boolean).join(', ').trim();
  }
  if (prop.type === 'rich_text') {
    return prop.rich_text?.map((t) => t.plain_text).join('').trim() || '';
  }
  return '';
};

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
        responsavel: responsavelDe(p.properties[c.pResponsavel]),
        prioridade: p.properties[c.pPrioridade]?.select?.name ?? null,
        dataInicio: p.properties[c.pDataInicio]?.date?.start ?? null,
        dataFinal: p.properties[c.pDataFinal]?.date?.start ?? null,
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

const obterPeopleDbId = () => process.env.NOTION_PEOPLE_DB_ID || '';
let notionUsersCache = { users: null, expiraEm: 0 };

function normalizarTexto(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Lista todos os usuários do workspace Notion (combina /v1/users e o database People) com cache em memória.
 */
async function listarUsuariosNotion() {
  const agora = Date.now();
  if (notionUsersCache.users && agora < notionUsersCache.expiraEm) {
    return notionUsersCache.users;
  }

  const { token } = cfg();
  if (!token) return [];

  const map = new Map();

  // 1. /v1/users (usuários registrados no Notion)
  try {
    let cursor;
    do {
      const url = new URL(`${BASE}/users`);
      if (cursor) url.searchParams.set('start_cursor', cursor);
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) break;
      const data = await res.json();
      for (const u of data.results || []) {
        if (u.type === 'person' && u.id) {
          map.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.person?.email ? u.person.email.toLowerCase().trim() : null,
          });
        }
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
  } catch (err) {
    console.warn('[notion] falha ao listar /v1/users:', err.message);
  }

  // 2. People DB (diretório de membros do workspace, opcional via NOTION_PEOPLE_DB_ID)
  const peopleDbId = obterPeopleDbId();
  if (peopleDbId) {
    try {
      const res = await fetch(`${BASE}/databases/${peopleDbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100 }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const p of data.results || []) {
        const person = p.properties.Person?.people?.[0];
        if (person?.id) {
          const id = person.id;
          const name = p.properties.Name?.title?.[0]?.plain_text || person.name;
          const email = person.person?.email?.toLowerCase().trim() || null;
          if (map.has(id)) {
            const cur = map.get(id);
            if (!cur.name && name) cur.name = name;
            if (!cur.email && email) cur.email = email;
          } else {
            map.set(id, { id, name, email });
          }
        }
      }
      }
    } catch (err) {
      console.warn('[notion] falha ao consultar People DB:', err.message);
    }
  }

  const users = Array.from(map.values());
  notionUsersCache = { users, expiraEm: agora + 10 * 60 * 1000 };
  return users;
}

/**
 * Localiza o usuário correspondente no Notion por e-mail, nome ou username
 */
async function buscarUsuarioNotion({ email = null, nome = null, username = null } = {}) {
  const users = await listarUsuariosNotion();
  if (!users.length) return null;

  // 1. Match exato por e-mail
  if (email && email.includes('@')) {
    const eNorm = email.toLowerCase().trim();
    const achouEmail = users.find((u) => u.email && u.email === eNorm);
    if (achouEmail) return achouEmail;
  }

  // 2. Match por nome completo normalizado
  if (nome) {
    const nNorm = normalizarTexto(nome);
    if (nNorm) {
      const exato = users.find((u) => normalizarTexto(u.name) === nNorm);
      if (exato) return exato;

      // 3. Match parcial de nome
      const parcial = users.find((u) => {
        const un = normalizarTexto(u.name);
        return un && (un.includes(nNorm) || nNorm.includes(un));
      });
      if (parcial) return parcial;
    }
  }

  // 4. Match por username do Discord
  if (username) {
    const uNorm = normalizarTexto(username);
    if (uNorm) {
      const achouUser = users.find((u) => {
        const un = normalizarTexto(u.name);
        return un && (un === uNorm || un.includes(uNorm) || uNorm.includes(un));
      });
      if (achouUser) return achouUser;
    }
  }

  return null;
}

/**
 * Cria uma nova tarefa no database de tarefas do Notion com todos os campos requisitados
 */
async function criarTarefa({
  titulo,
  responsavelNome = null,
  responsavelUserId = null,
  prioridade = 'Prioridade média',
  dataInicio = null,
  dataFinal = null,
  progresso = 0,
}) {
  const c = cfg();
  if (!c.token) throw new Error('NOTION_TOKEN não configurado');
  if (!c.ds) throw new Error('NOTION_DATA_SOURCE_ID não configurado');

  const ds = await req('GET', `/data_sources/${c.ds}`);
  const dbId = ds.parent?.database_id || ds.id;

  const titleEntry = Object.entries(ds.properties || {}).find(([, v]) => v.type === 'title');
  const titlePropName = titleEntry ? titleEntry[0] : 'Entrada';

  // Identifica propriedades reais do banco de dados (insensível a maiúsculas/acentos)
  const acharProp = (nomePreferido, tipoEsperado) => {
    if (ds.properties?.[nomePreferido]) return nomePreferido;
    const normPref = normalizarTexto(nomePreferido);
    const entry = Object.entries(ds.properties || {}).find(([k, v]) => {
      if (tipoEsperado && v.type !== tipoEsperado) return false;
      return normalizarTexto(k) === normPref;
    });
    return entry ? entry[0] : null;
  };

  const propStatus = acharProp(c.pStatus, 'status') || c.pStatus;
  const propProgresso = acharProp(c.pProgresso, 'number');
  const propResponsavel = acharProp(c.pResponsavel) || c.pResponsavel;
  const propPrioridade = acharProp(c.pPrioridade, 'select') || c.pPrioridade;
  const propDataInicio = acharProp(c.pDataInicio, 'date') || c.pDataInicio;
  const propDataFinal = acharProp(c.pDataFinal, 'date') || c.pDataFinal;

  const properties = {
    [titlePropName]: {
      title: [{ text: { content: String(titulo).trim() } }],
    },
    [propStatus]: {
      status: { name: S.andamento },
    },
  };

  if (propProgresso && ds.properties?.[propProgresso]?.type === 'number') {
    properties[propProgresso] = { number: Number(progresso) || 0 };
  }

  // 1. Responsável: preenche automaticamente pelo ID do usuário no Notion (ou rich_text se for texto)
  if (ds.properties?.[propResponsavel]) {
    const respType = ds.properties[propResponsavel].type;
    if (respType === 'people') {
      if (responsavelUserId) {
        properties[propResponsavel] = {
          people: [{ id: responsavelUserId }],
        };
      }
    } else if (respType === 'rich_text' && responsavelNome) {
      properties[propResponsavel] = {
        rich_text: [{ text: { content: String(responsavelNome).trim() } }],
      };
    }
  }

  // 2. Prioridade: definida conforme escolha do usuário
  if (prioridade && ds.properties?.[propPrioridade]?.type === 'select') {
    properties[propPrioridade] = {
      select: { name: prioridade },
    };
  }

  // 3. Data de início: preenchida automaticamente (padrão hoje no fuso de Brasília)
  const dataInicioFinal = dataInicio || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  if (dataInicioFinal && ds.properties?.[propDataInicio]?.type === 'date') {
    properties[propDataInicio] = {
      date: { start: dataInicioFinal },
    };
  }

  // 4. Data final: opcional, preenchida se informada pelo usuário
  if (dataFinal && ds.properties?.[propDataFinal]?.type === 'date') {
    properties[propDataFinal] = {
      date: { start: dataFinal },
    };
  }

  const novaPagina = await req('POST', '/pages', {
    parent: { database_id: dbId },
    properties,
  });

  return {
    id: novaPagina.id,
    titulo: String(titulo).trim(),
    status: S.andamento,
    responsavel: responsavelNome,
    responsavelUserId,
    prioridade,
    dataInicio: dataInicioFinal,
    dataFinal: dataFinal || null,
    progresso: Number(progresso) || 0,
    url: novaPagina.url || null,
  };
}

/**
 * Registra arquivos e comprovantes na tarefa do Notion:
 * 1) Na propriedade "Arquivos e mídia" da página
 * 2) No corpo da página (blocos de imagem / arquivo / callout)
 * 3) Em um comentário na página
 */
async function anexarArquivosNaTarefa(pageId, arquivos, { usuarioNome = 'Membro' } = {}) {
  const c = cfg();
  if (!pageId || !arquivos || !arquivos.length) return false;

  // 1. Atualiza propriedade "Arquivos e mídia"
  try {
    const page = await req('GET', `/pages/${pageId}`);
    const propArquivosNome = Object.entries(page.properties || {}).find(
      ([k, v]) => v.type === 'files' || k.toLowerCase().includes('arquivo') || k.toLowerCase().includes('midia')
    )?.[0] || 'Arquivos e mídia';

    const existentes = page.properties?.[propArquivosNome]?.files || [];
    const novosArquivos = arquivos.map((a) => ({
      name: a.name || 'comprovante',
      type: 'external',
      external: { url: a.url },
    }));

    await req('PATCH', `/pages/${pageId}`, {
      properties: {
        [propArquivosNome]: {
          files: [...existentes, ...novosArquivos],
        },
      },
    });
  } catch (err) {
    console.error('[notion] erro ao atualizar propriedade de arquivos:', err.message);
  }

  // 2. Adiciona blocos no corpo da página da tarefa
  try {
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const children = [
      {
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '📎' },
          rich_text: [
            {
              type: 'text',
              text: { content: `Comprovante(s) de entrega anexado(s) por ${usuarioNome} em ${dataHora}:` },
            },
          ],
        },
      },
    ];

    for (const a of arquivos) {
      const isImg = a.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || a.url);
      if (isImg) {
        children.push({
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: { url: a.url },
          },
        });
      } else {
        children.push({
          object: 'block',
          type: 'file',
          file: {
            type: 'external',
            external: { url: a.url },
            caption: [{ type: 'text', text: { content: a.name || 'Documento anexado' } }],
          },
        });
      }
    }

    await req('PATCH', `/blocks/${pageId}/children`, { children });
  } catch (err) {
    console.error('[notion] erro ao anexar blocos de arquivos no corpo da tarefa:', err.message);
  }

  // 3. Adiciona comentário na página da tarefa
  try {
    await comentar(
      pageId,
      `📎 ${usuarioNome} anexou ${arquivos.length} comprovante(s):\n${arquivos.map((a) => `• ${a.name}: ${a.url}`).join('\n')}`
    );
  } catch (err) {
    console.error('[notion] erro ao comentar anexos:', err.message);
  }

  return true;
}

module.exports = {
  listarTarefasAbertas,
  atualizarTarefa,
  comentar,
  criarTarefa,
  anexarArquivosNaTarefa,
  buscarUsuarioNotion,
  listarUsuariosNotion,
};

