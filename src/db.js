const { Pool } = require('pg');
const {
  CAMPOS_SENSIVEIS_MEMBRO,
  estaCriptografado,
  criptografar,
  criptografarObjetoMembro,
  descriptografarMembro,
} = require('./cryptoUtils');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function criptografarDadosLegadosBanco() {
  try {
    const { rows } = await pool.query('SELECT * FROM membros');
    let migrados = 0;
    for (const row of rows) {
      const sets = [];
      const valores = [row.id];
      let idx = 2;
      for (const campo of CAMPOS_SENSIVEIS_MEMBRO) {
        if (row[campo] && !estaCriptografado(row[campo])) {
          sets.push(`${campo} = $${idx++}`);
          valores.push(criptografar(row[campo]));
        }
      }
      if (sets.length > 0) {
        await pool.query(`UPDATE membros SET ${sets.join(', ')} WHERE id = $1`, valores);
        migrados++;
      }
    }
    if (migrados > 0) {
      console.log(`[db/lgpd] ${migrados} registro(s) de membro(s) tiveram os campos sensíveis criptografados em repouso (AES-256-GCM).`);
    }
  } catch (err) {
    console.error('[db/lgpd] Erro ao criptografar registros legados:', err.message);
  }
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS membros (
      id SERIAL PRIMARY KEY,
      discord_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'coletando_dados',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const colunas = [
    'nome TEXT',
    'ra TEXT',
    'curso TEXT',
    'periodo TEXT',
    'cpf TEXT',
    'data_nascimento TEXT',
    'nacionalidade TEXT',
    'endereco TEXT',
    'cidade TEXT',
    'estado TEXT',
    'telefone TEXT',
    'email TEXT',
    'area_interesse TEXT',
    'estudante_utfpr TEXT',
    'instituicao TEXT',
    'data_aprovacao TIMESTAMPTZ',
    'data_limite_assinatura TIMESTAMPTZ',
    'ultimo_lembrete TIMESTAMPTZ',
    'termo_arquivo_path TEXT',
    'data_inicio TEXT',
    'termo_ciencia_aceito_em TIMESTAMPTZ',
  ];

  for (const coluna of colunas) {
    const [nomeColuna, tipo] = coluna.split(' ');
    await pool.query(`ALTER TABLE membros ADD COLUMN IF NOT EXISTS ${nomeColuna} ${tipo}`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS historico_recusas (
      id SERIAL PRIMARY KEY,
      discord_id TEXT,
      nome TEXT,
      ra TEXT,
      tipo TEXT NOT NULL,
      motivo TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_historico_recusas_discord_id ON historico_recusas (discord_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_historico_recusas_ra ON historico_recusas (ra)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_historico_recusas_nome ON historico_recusas (nome)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cadastro_legado (
      discord_id TEXT PRIMARY KEY,
      nome TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_state (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);

  // Deixa o RH silenciar o lembrete de um membro específico sem mexer no
  // status real dele (ex: quando o lembrete dispara errado / falso positivo).
  await pool.query(
    'ALTER TABLE membros ADD COLUMN IF NOT EXISTS lembrete_resolvido_manualmente BOOLEAN NOT NULL DEFAULT false'
  );

  // Marca se já processamos a saída desse membro (cartão postado e, se for
  // o caso, abandono arquivado). Usado pela reconciliação de saídas
  // perdidas no boot (ver catchUp.js -> processarSaidasPerdidas), pra não
  // ficar postando o mesmo cartão de novo a cada restart.
  await pool.query(
    'ALTER TABLE membros ADD COLUMN IF NOT EXISTS saida_processada BOOLEAN NOT NULL DEFAULT false'
  );

  // --- Sistema de advertências ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advertencias_categorias (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      ordem INT NOT NULL UNIQUE,
      comportamento TEXT NOT NULL,
      consequencia TEXT NOT NULL
    );
  `);

  await pool.query(`
    INSERT INTO advertencias_categorias (nome, ordem, comportamento, consequencia) VALUES
      ('Leve', 1, 'Atraso recorrente sem aviso', 'Conversa individual + plano de ajuste'),
      ('Média', 2, 'Uso indevido de conhecimento/ferramenta fora do escopo ético', 'Advertência formal + revisão de acesso'),
      ('Grave', 3, 'Uso malicioso de conhecimento, assédio ou vazamento de dados', 'Desligamento do projeto')
    ON CONFLICT (nome) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS advertencias (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      nome_real TEXT NOT NULL,
      titulo TEXT NOT NULL,
      evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,
      autor_id TEXT NOT NULL,
      categoria_declarada_id INT NOT NULL REFERENCES advertencias_categorias(id),
      categoria_efetiva_id INT NOT NULL REFERENCES advertencias_categorias(id),
      reincidencia BOOLEAN NOT NULL DEFAULT false,
      advertencia_referencia_id INT REFERENCES advertencias(id),
      status TEXT NOT NULL DEFAULT 'aguardando_aceitacao'
        CHECK (status IN (
          'na_fila', 'aguardando_aceitacao', 'sem_resposta', 'em_vigencia',
          'em_analise', 'perdoada', 'cancelada', 'expirada'
        )),
      replica_advertido TEXT,
      decisao_expulsao BOOLEAN,
      data_abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
      data_resposta TIMESTAMPTZ,
      data_expiracao TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Atualiza a constraint de status em bancos já existentes para incluir 'na_fila'
  await pool.query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'advertencias'::regclass AND contype = 'c'
      ) LOOP
        EXECUTE 'ALTER TABLE advertencias DROP CONSTRAINT ' || quote_ident(r.conname);
      END LOOP;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE advertencias
    ADD CONSTRAINT advertencias_status_check
    CHECK (status IN (
      'na_fila', 'aguardando_aceitacao', 'sem_resposta', 'em_vigencia',
      'em_analise', 'perdoada', 'cancelada', 'expirada'
    ));
  `);

  // Marca desde quando a advertência está esperando resposta do advertido (reinicia a cada contra-argumento)
  await pool.query('ALTER TABLE advertencias ADD COLUMN IF NOT EXISTS data_aguardando_desde TIMESTAMPTZ');

  await pool.query('CREATE INDEX IF NOT EXISTS idx_advertencias_discord_id ON advertencias (discord_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_advertencias_status ON advertencias (status)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS advertencias_historico_status (
      id SERIAL PRIMARY KEY,
      advertencia_id INT NOT NULL REFERENCES advertencias(id) ON DELETE CASCADE,
      status_anterior TEXT,
      status_novo TEXT NOT NULL,
      alterado_por TEXT NOT NULL,
      motivo TEXT,
      data TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Histórico da troca de argumentos (réplica do advertido <-> contra-argumento de quem advertiu)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advertencias_argumentos (
      id SERIAL PRIMARY KEY,
      advertencia_id INT NOT NULL REFERENCES advertencias(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK (tipo IN ('replica', 'contra_argumento')),
      autor_discord_id TEXT NOT NULL,
      texto TEXT NOT NULL,
      data TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // --- Sistema de Declarações de Voluntariado ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS declaracoes_solicitadas (
      id SERIAL PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      discord_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      ra TEXT NOT NULL,
      curso TEXT NOT NULL,
      data_inicio TEXT NOT NULL,
      data_solicitacao TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL DEFAULT 'aguardando_assinatura_professor'
        CHECK (status IN ('aguardando_assinatura_professor', 'concluida', 'cancelada')),
      caminho_pdf_gerado TEXT,
      caminho_pdf_assinado TEXT,
      message_id_email TEXT,
      carga_horaria TEXT DEFAULT '4 horas',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('ALTER TABLE declaracoes_solicitadas ADD COLUMN IF NOT EXISTS carga_horaria TEXT DEFAULT \'4 horas\'');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_declaracoes_codigo ON declaracoes_solicitadas (codigo)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_declaracoes_discord_id ON declaracoes_solicitadas (discord_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_declaracoes_status ON declaracoes_solicitadas (status)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS duvidas_suporte (
      id SERIAL PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      discord_id TEXT NOT NULL,
      nome_usuario TEXT NOT NULL,
      canal_origem_id TEXT,
      assunto TEXT,
      pergunta TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aguardando_resposta'
        CHECK (status IN ('aguardando_resposta', 'respondida', 'cancelada')),
      message_id_email TEXT,
      resposta TEXT,
      data_resposta TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_duvidas_codigo ON duvidas_suporte (codigo)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_duvidas_discord_id ON duvidas_suporte (discord_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_duvidas_status ON duvidas_suporte (status)');

  // Migra automaticamente quaisquer dados sensíveis ainda em texto puro para AES-256-GCM (LGPD Art. 46)
  await criptografarDadosLegadosBanco();
}

function getMembro(discordId) {
  return pool
    .query('SELECT * FROM membros WHERE discord_id = $1', [discordId])
    .then((r) => descriptografarMembro(r.rows[0] || null));
}

function criarMembro(discordId) {
  return pool
    .query(
      `INSERT INTO membros (discord_id, status, saida_processada) VALUES ($1, 'coletando_dados', false)
       ON CONFLICT (discord_id) DO UPDATE SET
         status = CASE
           WHEN membros.status IN ('rejeitado', 'abandonado', 'coletando_dados') THEN 'coletando_dados'
           ELSE membros.status
         END,
         saida_processada = false
       RETURNING *`,
      [discordId]
    )
    .then((r) => descriptografarMembro(r.rows[0]));
}

async function registrarAceiteTermoCiencia(discordId, nomeFallback = null) {
  const res = await pool.query(
    'UPDATE membros SET termo_ciencia_aceito_em = now() WHERE discord_id = $1 RETURNING *',
    [discordId]
  );
  if (res.rowCount > 0) return descriptografarMembro(res.rows[0]);

  const { rows: legRows } = await pool
    .query('SELECT * FROM cadastro_legado WHERE discord_id = $1', [discordId])
    .catch(() => ({ rows: [] }));
  const leg = legRows[0] || {};

  const ins = await pool.query(
    `INSERT INTO membros (discord_id, nome, ra, data_inicio, status, termo_ciencia_aceito_em)
     VALUES ($1, $2, $3, $4, 'concluido', now())
     ON CONFLICT (discord_id) DO UPDATE SET termo_ciencia_aceito_em = now()
     RETURNING *`,
    [discordId, leg.nome || nomeFallback || null, leg.ra || null, leg.data_inicio || '05/2026']
  );
  return descriptografarMembro(ins.rows[0]);
}

function atualizarDados(discordId, dados) {
  const dadosSeguros = criptografarObjetoMembro(dados);
  const {
    nome,
    ra,
    curso,
    periodo,
    cpf,
    data_nascimento,
    nacionalidade,
    endereco,
    cidade,
    estado,
    telefone,
    email,
    area_interesse,
    estudante_utfpr = 'Sim',
    instituicao = 'UTFPR',
  } = dadosSeguros;

  return pool.query(
    `UPDATE membros SET
       nome=$2, ra=$3, curso=$4, periodo=$5, cpf=$6, data_nascimento=$7,
       nacionalidade=$8, endereco=$9, cidade=$10, estado=$11, telefone=$12, email=$13,
       area_interesse=$14, estudante_utfpr=$15, instituicao=$16, status='pendente_aprovacao'
     WHERE discord_id=$1`,
    [
      discordId,
      nome,
      ra,
      curso,
      periodo,
      cpf,
      data_nascimento,
      nacionalidade,
      endereco,
      cidade,
      estado,
      telefone,
      email,
      area_interesse,
      estudante_utfpr,
      instituicao,
    ]
  );
}

/**
 * Atualiza campos específicos de um membro (usado no comando /meus-dados atualizar - LGPD Art. 18, III),
 * aplicando criptografia automática nos campos sensíveis.
 */
function atualizarDadosParciaisMembro(discordId, camposObj = {}) {
  const permitidos = ['email', 'telefone', 'endereco', 'cidade', 'estado', 'curso', 'periodo'];
  const filtrados = {};
  for (const chave of permitidos) {
    if (Object.prototype.hasOwnProperty.call(camposObj, chave) && camposObj[chave] !== undefined) {
      filtrados[chave] = camposObj[chave];
    }
  }
  const seguros = criptografarObjetoMembro(filtrados);
  const chaves = Object.keys(seguros);
  if (chaves.length === 0) return Promise.resolve();

  const sets = chaves.map((campo, idx) => `${campo} = $${idx + 2}`).join(', ');
  const valores = chaves.map((campo) => seguros[campo]);

  return pool.query(
    `UPDATE membros SET ${sets} WHERE discord_id = $1`,
    [discordId, ...valores]
  );
}

function atualizarStatus(discordId, status, extraFields = {}) {
  const extraSeguros = criptografarObjetoMembro(extraFields);
  const campos = Object.keys(extraSeguros);
  const setExtra = campos.map((campo, i) => `${campo} = $${i + 3}`).join(', ');
  const valores = campos.map((campo) => extraSeguros[campo]);

  return pool.query(
    `UPDATE membros SET status=$2 ${setExtra ? ', ' + setExtra : ''} WHERE discord_id=$1`,
    [discordId, status, ...valores]
  );
}

function listarAguardandoAssinatura() {
  return pool
    .query(
      `SELECT * FROM membros WHERE status = 'aguardando_assinatura' AND lembrete_resolvido_manualmente = false`
    )
    .then((r) => r.rows.map((row) => descriptografarMembro(row)));
}

/** RH marca que já verificou manualmente e não quer mais receber lembrete desse membro. */
function marcarLembreteResolvido(discordId) {
  return pool.query(
    'UPDATE membros SET lembrete_resolvido_manualmente = true WHERE discord_id = $1',
    [discordId]
  );
}

function removerMembro(discordId) {
  return pool.query('DELETE FROM membros WHERE discord_id = $1', [discordId]);
}

function registrarRecusa({ discordId, nome, ra, tipo, motivo }) {
  return pool.query(
    `INSERT INTO historico_recusas (discord_id, nome, ra, tipo, motivo) VALUES ($1, $2, $3, $4, $5)`,
    [discordId, nome || null, ra || null, tipo, motivo || null]
  );
}

function buscarRecusasAnteriores({ discordId, nome, ra }) {
  const condicoes = [];
  const valores = [];
  let i = 1;

  if (discordId) {
    condicoes.push(`discord_id = $${i++}`);
    valores.push(discordId);
  }
  if (ra) {
    condicoes.push(`ra = $${i++}`);
    valores.push(ra);
  }
  if (nome) {
    condicoes.push(`LOWER(nome) = LOWER($${i++})`);
    valores.push(nome);
  }

  if (condicoes.length === 0) return Promise.resolve([]);

  return pool
    .query(
      `SELECT * FROM historico_recusas WHERE ${condicoes.join(' OR ')} ORDER BY criado_em DESC`,
      valores
    )
    .then((r) => r.rows);
}

function getNomeLegado(discordId) {
  return pool
    .query('SELECT nome FROM cadastro_legado WHERE discord_id = $1', [discordId])
    .then((r) => (r.rows[0] ? r.rows[0].nome : null));
}

/**
 * Retorna um Map(discord_id -> nome_real) consolidando cadastro_legado e membros
 * (mesma lógica da hierarquia: membros tem prioridade sobre cadastro_legado).
 */
async function obterMapaNomesReais() {
  const { rows } = await pool.query(`
    SELECT discord_id, nome FROM cadastro_legado WHERE nome IS NOT NULL AND TRIM(nome) <> ''
    UNION ALL
    SELECT discord_id, nome FROM membros WHERE nome IS NOT NULL AND TRIM(nome) <> ''
  `);
  const mapa = new Map();
  for (const r of rows) {
    mapa.set(String(r.discord_id).trim(), r.nome.trim());
  }
  return mapa;
}

/**
 * Resolve o nome verdadeiro de um integrante (membros.nome -> cadastro_legado.nome -> fallback).
 */
async function resolverNomeReal(discordId, fallback = null) {
  try {
    const membro = await getMembro(discordId);
    if (membro && membro.nome && membro.nome.trim()) return membro.nome.trim();
    const legado = await getNomeLegado(discordId);
    if (legado && legado.trim()) return legado.trim();
  } catch (err) {
    console.error('[db] erro ao resolver nome real de', discordId, err.message);
  }
  return fallback;
}

function getEstado(chave) {
  return pool
    .query('SELECT valor FROM bot_state WHERE chave = $1', [chave])
    .then((r) => (r.rows[0] ? r.rows[0].valor : null));
}

function salvarEstado(chave, valor) {
  return pool.query(
    `INSERT INTO bot_state (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, valor]
  );
}

/** Membros que ainda não tivemos certeza se saíram do servidor (usado no boot). */
function listarMembrosParaChecarSaida() {
  return pool
    .query('SELECT discord_id, nome, ra, status FROM membros WHERE saida_processada = false')
    .then((r) => r.rows);
}

/** Marca que a saída desse membro já foi tratada (cartão postado). */
function marcarSaidaProcessada(discordId) {
  return pool.query('UPDATE membros SET saida_processada = true WHERE discord_id = $1', [discordId]);
}

// --- Sistema de advertências ---

function getCategoriasAdvertencia() {
  return pool.query('SELECT * FROM advertencias_categorias ORDER BY ordem').then((r) => r.rows);
}

/**
 * Busca advertências válidas para basear reincidência (inclui tanto as que já estão
 * em vigência quanto as que estão aguardando ciência/análise ou na fila).
 */
function getAdvertenciasEmVigencia(discordId, categoriaId) {
  return pool
    .query(
      `SELECT * FROM advertencias
       WHERE discord_id = $1
         AND categoria_efetiva_id = $2
         AND status IN ('em_vigencia', 'aguardando_aceitacao', 'em_analise', 'sem_resposta', 'na_fila')
       ORDER BY
         CASE WHEN status = 'em_vigencia' THEN 0 ELSE 1 END,
         data_abertura DESC`,
      [discordId, categoriaId]
    )
    .then((r) => r.rows);
}

function getAdvertenciasEstritamenteEmVigencia(discordId, categoriaId) {
  return pool
    .query(
      `SELECT * FROM advertencias
       WHERE discord_id = $1 AND categoria_efetiva_id = $2 AND status = 'em_vigencia'
       ORDER BY data_abertura DESC`,
      [discordId, categoriaId]
    )
    .then((r) => r.rows);
}

/**
 * Retorna a advertência ativa que ainda depende de resolução (ciência do membro ou decisão do autor)
 */
function getAdvertenciaPendenteDoUsuario(discordId) {
  return pool
    .query(
      `SELECT * FROM advertencias
       WHERE discord_id = $1
         AND status IN ('aguardando_aceitacao', 'em_analise', 'sem_resposta')
       ORDER BY data_abertura ASC, id ASC
       LIMIT 1`,
      [discordId]
    )
    .then((r) => r.rows[0] || null);
}

function listarFilaAdvertencias(discordId = null) {
  if (discordId) {
    return pool
      .query(
        `SELECT * FROM advertencias
         WHERE discord_id = $1 AND status = 'na_fila'
         ORDER BY data_abertura ASC, id ASC`,
        [discordId]
      )
      .then((r) => r.rows);
  }
  return pool
    .query(
      `SELECT * FROM advertencias
       WHERE status = 'na_fila'
       ORDER BY data_abertura ASC, id ASC`
    )
    .then((r) => r.rows);
}

function obterProximaAdvertenciaNaFila(discordId) {
  return pool
    .query(
      `SELECT * FROM advertencias
       WHERE discord_id = $1 AND status = 'na_fila'
       ORDER BY data_abertura ASC, id ASC
       LIMIT 1`,
      [discordId]
    )
    .then((r) => r.rows[0] || null);
}

function atualizarCategoriaAdvertencia(id, { categoriaEfetivaId, reincidencia, advertenciaReferenciaId }) {
  return pool
    .query(
      `UPDATE advertencias
       SET categoria_efetiva_id = $2,
           reincidencia = $3,
           advertencia_referencia_id = $4,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, categoriaEfetivaId, reincidencia, advertenciaReferenciaId]
    )
    .then((r) => r.rows[0] || null);
}

function getAdvertencia(id) {
  return pool.query('SELECT * FROM advertencias WHERE id = $1', [id]).then((r) => r.rows[0] || null);
}

function listarAdvertenciasDoUsuario(discordId, { incluirFila = false } = {}) {
  const query = incluirFila
    ? 'SELECT * FROM advertencias WHERE discord_id = $1 ORDER BY data_abertura DESC'
    : "SELECT * FROM advertencias WHERE discord_id = $1 AND status <> 'na_fila' ORDER BY data_abertura DESC";
  return pool.query(query, [discordId]).then((r) => r.rows);
}

function listarTodasAdvertencias() {
  return pool.query('SELECT * FROM advertencias ORDER BY data_abertura DESC').then((r) => r.rows);
}

function registrarHistoricoAdvertencia(advertenciaId, statusAnterior, statusNovo, alteradoPor, motivo = null) {
  return pool.query(
    `INSERT INTO advertencias_historico_status (advertencia_id, status_anterior, status_novo, alterado_por, motivo)
     VALUES ($1, $2, $3, $4, $5)`,
    [advertenciaId, statusAnterior, statusNovo, alteradoPor, motivo]
  );
}

async function criarAdvertencia({
  discordId,
  nomeReal,
  titulo,
  evidencias,
  autorId,
  categoriaDeclaradaId,
  categoriaEfetivaId,
  reincidencia,
  advertenciaReferenciaId,
  statusInicial = 'aguardando_aceitacao',
}) {
  const { rows } = await pool.query(
    `INSERT INTO advertencias
      (discord_id, nome_real, titulo, evidencias, autor_id, categoria_declarada_id, categoria_efetiva_id, reincidencia, advertencia_referencia_id, status, data_aguardando_desde)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, CASE WHEN $10 = 'aguardando_aceitacao' THEN now() ELSE NULL END)
     RETURNING *`,
    [
      discordId,
      nomeReal,
      titulo,
      JSON.stringify(evidencias),
      autorId,
      categoriaDeclaradaId,
      categoriaEfetivaId,
      reincidencia,
      advertenciaReferenciaId,
      statusInicial,
    ]
  );
  const motivo = statusInicial === 'na_fila' ? 'Adicionada à fila (membro possui advertência pendente)' : null;
  await registrarHistoricoAdvertencia(rows[0].id, null, statusInicial, autorId, motivo);
  return rows[0];
}

async function registrarReplicaAdvertencia(id, texto, discordId = 'desconhecido') {
  await pool.query('UPDATE advertencias SET replica_advertido = $2, updated_at = now() WHERE id = $1', [id, texto]);
  await registrarArgumento(id, 'replica', discordId, texto);
}

function registrarArgumento(advertenciaId, tipo, autorDiscordId, texto) {
  return pool.query(
    `INSERT INTO advertencias_argumentos (advertencia_id, tipo, autor_discord_id, texto)
     VALUES ($1, $2, $3, $4)`,
    [advertenciaId, tipo, autorDiscordId, texto]
  );
}

function listarArgumentos(advertenciaId) {
  return pool
    .query('SELECT * FROM advertencias_argumentos WHERE advertencia_id = $1 ORDER BY data ASC, id ASC', [advertenciaId])
    .then((r) => r.rows);
}

function registrarDecisaoExpulsao(id, expulsar) {
  return pool.query('UPDATE advertencias SET decisao_expulsao = $2, updated_at = now() WHERE id = $1', [id, expulsar]);
}

async function atualizarStatusAdvertencia(id, statusAnterior, statusNovo, alteradoPor, motivo = null, diasParaExpirar = 90) {
  const sets = ['status = $2', 'updated_at = now()'];
  if (statusNovo === 'em_vigencia') {
    sets.push('data_resposta = COALESCE(data_resposta, now())');
    sets.push(`data_expiracao = now() + interval '${diasParaExpirar} days'`);
  }
  if (statusNovo === 'aguardando_aceitacao') {
    sets.push('data_aguardando_desde = now()');
  }
  await pool.query(`UPDATE advertencias SET ${sets.join(', ')} WHERE id = $1`, [id, statusNovo]);
  await registrarHistoricoAdvertencia(id, statusAnterior, statusNovo, alteradoPor, motivo);
}

function listarAdvertenciasSemRespostaVencidas(diasParaResponder) {
  return pool
    .query(
      `SELECT * FROM advertencias
       WHERE status = 'aguardando_aceitacao'
       AND COALESCE(data_aguardando_desde, data_abertura) < now() - ($1 || ' days')::interval`,
      [String(diasParaResponder)]
    )
    .then((r) => r.rows);
}

function expirarAdvertenciasVencidas() {
  return pool.query(
    `UPDATE advertencias SET status = 'expirada', updated_at = now()
     WHERE status = 'em_vigencia' AND data_expiracao < now()`
  );
}

// --- Funções de Declaração de Voluntariado ---

async function criarSolicitacaoDeclaracao({
  codigo,
  discordId,
  nome,
  ra,
  curso,
  dataInicio,
  cargaHoraria = '4 horas',
  caminhoPdfGerado,
  messageIdEmail = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO declaracoes_solicitadas
      (codigo, discord_id, nome, ra, curso, data_inicio, carga_horaria, caminho_pdf_gerado, message_id_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [codigo, discordId, nome, ra, curso, dataInicio, cargaHoraria, caminhoPdfGerado, messageIdEmail]
  );
  return rows[0];
}

function buscarDeclaracaoPorCodigo(codigo) {
  return pool
    .query('SELECT * FROM declaracoes_solicitadas WHERE codigo = $1', [codigo])
    .then((r) => r.rows[0] || null);
}

function listarDeclaracoesPendentes() {
  return pool
    .query(
      `SELECT * FROM declaracoes_solicitadas
       WHERE status = 'aguardando_assinatura_professor'
       ORDER BY data_solicitacao ASC`
    )
    .then((r) => r.rows);
}

function atualizarDeclaracaoConcluida(codigo, caminhoPdfAssinado) {
  return pool
    .query(
      `UPDATE declaracoes_solicitadas
       SET status = 'concluida', caminho_pdf_assinado = $2, atualizado_em = now()
       WHERE codigo = $1
       RETURNING *`,
      [codigo, caminhoPdfAssinado]
    )
    .then((r) => r.rows[0] || null);
}

function atualizarDataInicioMembro(discordId, dataInicio) {
  return pool.query('UPDATE membros SET data_inicio = $2 WHERE discord_id = $1', [discordId, dataInicio]);
}

function atualizarDataInicioPorRa(ra, dataInicio) {
  return pool.query('UPDATE membros SET data_inicio = $2 WHERE ra = $1', [ra, dataInicio]);
}

function criarDuvidaSuporte({ codigo, discordId, nomeUsuario, canalOrigemId, assunto, pergunta, messageIdEmail }) {
  return pool
    .query(
      `INSERT INTO duvidas_suporte
        (codigo, discord_id, nome_usuario, canal_origem_id, assunto, pergunta, message_id_email, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'aguardando_resposta')
       RETURNING *`,
      [codigo, discordId, nomeUsuario, canalOrigemId, assunto, pergunta, messageIdEmail]
    )
    .then((r) => r.rows[0]);
}

function listarDuvidasPendentes() {
  return pool
    .query(`SELECT * FROM duvidas_suporte WHERE status = 'aguardando_resposta' ORDER BY criado_em ASC`)
    .then((r) => r.rows);
}

function getDuvidaPorCodigo(codigo) {
  return pool
    .query(`SELECT * FROM duvidas_suporte WHERE UPPER(codigo) = UPPER($1)`, [codigo])
    .then((r) => r.rows[0] || null);
}

function atualizarRespostaDuvida(codigo, respostaTexto) {
  return pool
    .query(
      `UPDATE duvidas_suporte
       SET status = 'respondida', resposta = $2, data_resposta = now(), atualizado_em = now()
       WHERE UPPER(codigo) = UPPER($1)
       RETURNING *`,
      [codigo, respostaTexto]
    )
    .then((r) => r.rows[0] || null);
}

module.exports = {
  pool,
  initSchema,
  getMembro,
  criarMembro,
  registrarAceiteTermoCiencia,
  atualizarDados,
  atualizarDadosParciaisMembro,
  atualizarStatus,
  listarAguardandoAssinatura,
  removerMembro,
  registrarRecusa,
  buscarRecusasAnteriores,
  getNomeLegado,
  obterMapaNomesReais,
  resolverNomeReal,
  getEstado,
  salvarEstado,
  marcarLembreteResolvido,
  listarMembrosParaChecarSaida,
  marcarSaidaProcessada,
  // advertências
  getCategoriasAdvertencia,
  getAdvertenciasEmVigencia,
  getAdvertenciasEstritamenteEmVigencia,
  getAdvertenciaPendenteDoUsuario,
  listarFilaAdvertencias,
  obterProximaAdvertenciaNaFila,
  atualizarCategoriaAdvertencia,
  getAdvertencia,
  listarAdvertenciasDoUsuario,
  listarTodasAdvertencias,
  criarAdvertencia,
  registrarReplicaAdvertencia,
  registrarArgumento,
  listarArgumentos,
  registrarDecisaoExpulsao,
  atualizarStatusAdvertencia,
  listarAdvertenciasSemRespostaVencidas,
  expirarAdvertenciasVencidas,
  // declarações
  criarSolicitacaoDeclaracao,
  buscarDeclaracaoPorCodigo,
  listarDeclaracoesPendentes,
  atualizarDeclaracaoConcluida,
  atualizarDataInicioMembro,
  atualizarDataInicioPorRa,
  criptografarDadosLegadosBanco,
  // dúvidas e suporte
  criarDuvidaSuporte,
  listarDuvidasPendentes,
  getDuvidaPorCodigo,
  atualizarRespostaDuvida,
};
