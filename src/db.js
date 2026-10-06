const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    'data_aprovacao TIMESTAMPTZ',
    'data_limite_assinatura TIMESTAMPTZ',
    'ultimo_lembrete TIMESTAMPTZ',
    'termo_arquivo_path TEXT',
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
          'aguardando_aceitacao', 'sem_resposta', 'em_vigencia',
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
}

function getMembro(discordId) {
  return pool
    .query('SELECT * FROM membros WHERE discord_id = $1', [discordId])
    .then((r) => r.rows[0] || null);
}

function criarMembro(discordId) {
  return pool
    .query(
      `INSERT INTO membros (discord_id, status) VALUES ($1, 'coletando_dados')
       ON CONFLICT (discord_id) DO NOTHING RETURNING *`,
      [discordId]
    )
    .then((r) => r.rows[0]);
}

function atualizarDados(discordId, dados) {
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
  } = dados;

  return pool.query(
    `UPDATE membros SET
       nome=$2, ra=$3, curso=$4, periodo=$5, cpf=$6, data_nascimento=$7,
       nacionalidade=$8, endereco=$9, cidade=$10, estado=$11, telefone=$12, email=$13,
       area_interesse=$14, status='pendente_aprovacao'
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
    ]
  );
}

function atualizarStatus(discordId, status, extraFields = {}) {
  const campos = Object.keys(extraFields);
  const setExtra = campos.map((campo, i) => `${campo} = $${i + 3}`).join(', ');
  const valores = campos.map((campo) => extraFields[campo]);

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
    .then((r) => r.rows);
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

function getAdvertenciasEmVigencia(discordId, categoriaId) {
  return pool
    .query(
      `SELECT * FROM advertencias
       WHERE discord_id = $1 AND categoria_efetiva_id = $2 AND status = 'em_vigencia'
       ORDER BY data_abertura DESC`,
      [discordId, categoriaId]
    )
    .then((r) => r.rows);
}

function getAdvertencia(id) {
  return pool.query('SELECT * FROM advertencias WHERE id = $1', [id]).then((r) => r.rows[0] || null);
}

function listarAdvertenciasDoUsuario(discordId) {
  return pool
    .query('SELECT * FROM advertencias WHERE discord_id = $1 ORDER BY data_abertura DESC', [discordId])
    .then((r) => r.rows);
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
}) {
  const { rows } = await pool.query(
    `INSERT INTO advertencias
      (discord_id, nome_real, titulo, evidencias, autor_id, categoria_declarada_id, categoria_efetiva_id, reincidencia, advertencia_referencia_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
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
    ]
  );
  await registrarHistoricoAdvertencia(rows[0].id, null, 'aguardando_aceitacao', autorId);
  return rows[0];
}

function registrarReplicaAdvertencia(id, texto) {
  return pool.query('UPDATE advertencias SET replica_advertido = $2, updated_at = now() WHERE id = $1', [id, texto]);
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
  await pool.query(`UPDATE advertencias SET ${sets.join(', ')} WHERE id = $1`, [id, statusNovo]);
  await registrarHistoricoAdvertencia(id, statusAnterior, statusNovo, alteradoPor, motivo);
}

function listarAdvertenciasSemRespostaVencidas(diasParaResponder) {
  return pool
    .query(
      `SELECT * FROM advertencias
       WHERE status = 'aguardando_aceitacao'
       AND data_abertura < now() - ($1 || ' days')::interval`,
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

module.exports = {
  pool,
  initSchema,
  getMembro,
  criarMembro,
  atualizarDados,
  atualizarStatus,
  listarAguardandoAssinatura,
  removerMembro,
  registrarRecusa,
  buscarRecusasAnteriores,
  getNomeLegado,
  getEstado,
  salvarEstado,
  marcarLembreteResolvido,
  listarMembrosParaChecarSaida,
  marcarSaidaProcessada,
  // advertências
  getCategoriasAdvertencia,
  getAdvertenciasEmVigencia,
  getAdvertencia,
  listarAdvertenciasDoUsuario,
  listarTodasAdvertencias,
  criarAdvertencia,
  registrarReplicaAdvertencia,
  registrarDecisaoExpulsao,
  atualizarStatusAdvertencia,
  listarAdvertenciasSemRespostaVencidas,
  expirarAdvertenciasVencidas,
};
