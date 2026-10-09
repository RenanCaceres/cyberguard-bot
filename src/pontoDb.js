'use strict';
// Camada de dados do ponto. Reaproveita o pool do ./db se ele exportar `pool`;
// senão cria um próprio (DATABASE_URL ou as variáveis padrão PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT).
const { Pool } = require('pg');

let base = {};
try { base = require('./db'); } catch { /* sem db.js acessível: usa pool próprio */ }

const pool =
  base.pool ||
  new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 3 } : { max: 3 });

const q = (text, params) => pool.query(text, params);
const TZ = 'America/Sao_Paulo';

async function init() {
  await q(`
    CREATE TABLE IF NOT EXISTS pontos (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      nome          TEXT NOT NULL,
      usuario       TEXT NOT NULL,
      tarefa_id     TEXT NOT NULL,
      tarefa_titulo TEXT NOT NULL,
      aberto_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      fechado_em    TIMESTAMPTZ,
      progresso     INT CHECK (progresso BETWEEN 0 AND 100),
      feito         TEXT,
      falta         TEXT,
      auto_fechado  BOOLEAN NOT NULL DEFAULT false,
      notion_ok     BOOLEAN
    );
    CREATE UNIQUE INDEX IF NOT EXISTS pontos_um_aberto_por_usuario
      ON pontos (discord_id) WHERE fechado_em IS NULL;
    CREATE INDEX IF NOT EXISTS pontos_discord_idx ON pontos (discord_id, aberto_em DESC);
    CREATE TABLE IF NOT EXISTS ponto_meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS canal_voz_id TEXT;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS kov_msg_id TEXT;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS sheet_ok BOOLEAN;
    CREATE UNIQUE INDEX IF NOT EXISTS pontos_kov_msg_uniq ON pontos (kov_msg_id) WHERE kov_msg_id IS NOT NULL;
  `);
}

async function getAberto(discordId) {
  const { rows } = await q('SELECT * FROM pontos WHERE discord_id = $1 AND fechado_em IS NULL', [discordId]);
  return rows[0] ?? null;
}

// Retorna null se o usuário já tem ponto aberto (garantido pelo índice único parcial).
async function abrir({ discordId, nome, usuario, tarefaId, tarefaTitulo, canalVozId = null }) {
  try {
    const { rows } = await q(
      `INSERT INTO pontos (discord_id, nome, usuario, tarefa_id, tarefa_titulo, canal_voz_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [discordId, nome, usuario, tarefaId, tarefaTitulo, canalVozId],
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') return null;
    throw e;
  }
}

async function fechar(discordId, { progresso, feito, falta }) {
  const { rows } = await q(
    `UPDATE pontos SET fechado_em = now(), progresso = $2, feito = $3, falta = $4
     WHERE discord_id = $1 AND fechado_em IS NULL RETURNING *`,
    [discordId, progresso, feito, falta || null],
  );
  return rows[0] ?? null;
}

// Encerra o ponto aberto porque a pessoa saiu da call (sem progresso/descrição).
async function fecharPorVoz(discordId) {
  const { rows } = await q(
    `UPDATE pontos SET fechado_em = now()
     WHERE discord_id = $1 AND fechado_em IS NULL RETURNING *`,
    [discordId],
  );
  return rows[0] ?? null;
}

// Define/troca a tarefa de um ponto ainda aberto (ponto aberto por voz começa sem tarefa).
async function definirTarefa(discordId, tarefaId, tarefaTitulo) {
  const { rows } = await q(
    `UPDATE pontos SET tarefa_id = $2, tarefa_titulo = $3
     WHERE discord_id = $1 AND fechado_em IS NULL RETURNING *`,
    [discordId, tarefaId, tarefaTitulo],
  );
  return rows[0] ?? null;
}

// Preenche progresso/relato de um ponto já fechado pela saída da call (uma única vez).
async function completar(id, discordId, { progresso, feito, falta }) {
  const { rows } = await q(
    `UPDATE pontos SET progresso = $3, feito = $4, falta = $5
     WHERE id = $1 AND discord_id = $2 AND fechado_em IS NOT NULL AND progresso IS NULL AND kov_msg_id IS NULL
     RETURNING *`,
    [id, discordId, progresso, feito, falta || null],
  );
  return rows[0] ?? null;
}

// Ponto aberto dentro de uma call: acompanha a pessoa se ela trocar de canal.
async function setCanalVoz(discordId, canalId) {
  await q('UPDATE pontos SET canal_voz_id = $2 WHERE discord_id = $1 AND fechado_em IS NULL', [discordId, canalId]);
}

// ---------- importação do KoV Ponto ----------
// Retorna a linha inserida, ou null se a mensagem já tinha sido importada.
async function importarKov({ msgId, discordId, nome, usuario, entrada, saida }) {
  const { rows } = await q(
    `INSERT INTO pontos (discord_id, nome, usuario, tarefa_id, tarefa_titulo, aberto_em, fechado_em, kov_msg_id, sheet_ok, notion_ok)
     VALUES ($1, $2, $3, $4, 'KoV Ponto (importado)', $5, $6, $7, false, true)
     ON CONFLICT DO NOTHING RETURNING *`,
    [discordId, nome, usuario, `kov:${msgId}`, entrada, saida, msgId],
  );
  return rows[0] ?? null;
}

async function kovJaImportado(msgId) {
  const { rows } = await q('SELECT 1 FROM pontos WHERE kov_msg_id = $1', [msgId]);
  return rows.length > 0;
}

// Registros do KoV ainda não enviados à planilha, do mais antigo ao mais recente.
async function kovPendentesPlanilha() {
  const { rows } = await q('SELECT * FROM pontos WHERE kov_msg_id IS NOT NULL AND sheet_ok = false ORDER BY aberto_em ASC, id ASC');
  return rows;
}

async function marcarSheet(ids) {
  if (ids.length) await q('UPDATE pontos SET sheet_ok = true WHERE id = ANY($1::int[])', [ids]);
}

async function marcarNotion(id, ok) {
  await q('UPDATE pontos SET notion_ok = $2 WHERE id = $1', [id, ok]);
}

async function listarAbertos() {
  const { rows } = await q('SELECT * FROM pontos WHERE fechado_em IS NULL ORDER BY aberto_em');
  return rows;
}

// Totais por aluno (histórico inteiro; ponto aberto conta até agora).
async function resumoPorAluno() {
  const { rows } = await q(`
    SELECT discord_id,
           (ARRAY_AGG(nome    ORDER BY aberto_em DESC))[1] AS nome,
           (ARRAY_AGG(usuario ORDER BY aberto_em DESC))[1] AS usuario,
           COUNT(*)::int AS pontos,
           SUM(EXTRACT(EPOCH FROM (COALESCE(fechado_em, now()) - aberto_em)))::float8 AS seg,
           BOOL_OR(fechado_em IS NULL) AS em_servico
    FROM pontos
    GROUP BY discord_id
    ORDER BY seg DESC`);
  return rows;
}

async function totalAluno(discordId) {
  const { rows } = await q(
    `SELECT COUNT(*)::int AS pontos,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(fechado_em, now()) - aberto_em))), 0)::float8 AS seg,
            (ARRAY_AGG(nome    ORDER BY aberto_em DESC))[1] AS nome,
            (ARRAY_AGG(usuario ORDER BY aberto_em DESC))[1] AS usuario
     FROM pontos WHERE discord_id = $1`,
    [discordId],
  );
  return rows[0];
}

async function historicoAluno(discordId, limit, offset) {
  const { rows } = await q(
    'SELECT * FROM pontos WHERE discord_id = $1 ORDER BY aberto_em DESC LIMIT $2 OFFSET $3',
    [discordId, limit, offset],
  );
  return rows;
}

// offset 0 = semana atual (segunda a domingo, fuso de São Paulo); 1 = semana passada.
// Sessões que cruzam a virada da semana são cortadas na fronteira.
async function ranking(semanasAtras = 0, limite = 10) {
  const { rows } = await q(
    `WITH lim AS (
       SELECT (date_trunc('week', now() AT TIME ZONE $1::text) - $2::int * interval '1 week')
              AT TIME ZONE $1::text AS ini
     )
     SELECT p.discord_id,
            (ARRAY_AGG(p.nome ORDER BY p.aberto_em DESC))[1] AS nome,
            MAX(COALESCE(p.fechado_em, p.aberto_em)) AS ultimo,
            COUNT(*)::int AS pontos,
            SUM(EXTRACT(EPOCH FROM (
              LEAST(COALESCE(p.fechado_em, now()), lim.ini + interval '1 week') - GREATEST(p.aberto_em, lim.ini)
            )))::float8 AS seg
     FROM pontos p, lim
     WHERE p.aberto_em < lim.ini + interval '1 week'
       AND COALESCE(p.fechado_em, now()) > lim.ini
     GROUP BY p.discord_id
     ORDER BY seg DESC
     LIMIT $3`,
    [TZ, semanasAtras, limite],
  );
  return rows;
}

// Fecha pontos esquecidos: conta só até o teto (aberto_em + maxHoras) e marca auto_fechado.
async function autoFecharExpirados(maxHoras) {
  const { rows } = await q(
    `UPDATE pontos
        SET fechado_em = aberto_em + ($1::float8 * interval '1 hour'), auto_fechado = true
      WHERE fechado_em IS NULL AND aberto_em < now() - ($1::float8 * interval '1 hour')
      RETURNING *`,
    [maxHoras],
  );
  return rows;
}

// Início e fim (já formatados, horário de Brasília) da semana pedida.
async function periodoSemana(semanasAtras = 0) {
  const { rows } = await q(
    `WITH lim AS (SELECT date_trunc('week', now() AT TIME ZONE $1::text) - $2::int * interval '1 week' AS ini)
     SELECT to_char(ini, 'DD/MM/YYYY') AS ini, to_char(ini + interval '6 days', 'DD/MM/YYYY') AS fim FROM lim`,
    [TZ, semanasAtras],
  );
  return rows[0];
}

async function semanaAtual() {
  const { rows } = await q(
    `SELECT to_char(date_trunc('week', now() AT TIME ZONE $1::text), 'YYYY-MM-DD') AS s`,
    [TZ],
  );
  return rows[0].s;
}

async function getMeta(chave) {
  const { rows } = await q('SELECT valor FROM ponto_meta WHERE chave = $1', [chave]);
  return rows[0]?.valor ?? null;
}

async function setMeta(chave, valor) {
  await q(
    `INSERT INTO ponto_meta (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, valor],
  );
}

module.exports = {
  init, getAberto, abrir, fechar, fecharPorVoz, definirTarefa, completar, setCanalVoz, importarKov, kovJaImportado,
  kovPendentesPlanilha, marcarSheet, marcarNotion, listarAbertos,
  resumoPorAluno, totalAluno, historicoAluno, ranking,
  autoFecharExpirados, periodoSemana, semanaAtual, getMeta, setMeta,
};
