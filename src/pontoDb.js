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
const PENDENTE = 'pendente'; // tarefa ainda não escolhida (ponto aberto pela call de voz)

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

    -- v2
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS origem              TEXT NOT NULL DEFAULT 'manual'; -- manual | voz | importado
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS reportado           BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS lembrete_enviado    BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS progresso_inicial   INT;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS ajustado_por        TEXT;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS ajustado_em         TIMESTAMPTZ;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS fechado_em_original TIMESTAMPTZ;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS ajuste_motivo       TEXT;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS sheet_ok            BOOLEAN;
    ALTER TABLE pontos ADD COLUMN IF NOT EXISTS kov_msg_id          TEXT; -- origem 'kov': id da mensagem do log
    CREATE UNIQUE INDEX IF NOT EXISTS pontos_kov_msg_uniq ON pontos (kov_msg_id) WHERE kov_msg_id IS NOT NULL;
  `);
}

async function getAberto(discordId) {
  const { rows } = await q('SELECT * FROM pontos WHERE discord_id = $1 AND fechado_em IS NULL', [discordId]);
  return rows[0] ?? null;
}

async function getPorId(id) {
  const { rows } = await q('SELECT * FROM pontos WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// Retorna null se o usuário já tem ponto aberto (garantido pelo índice único parcial).
async function abrir({ discordId, nome, usuario, tarefaId, tarefaTitulo, progressoInicial = null, origem = 'manual' }) {
  try {
    const { rows } = await q(
      `INSERT INTO pontos (discord_id, nome, usuario, tarefa_id, tarefa_titulo, progresso_inicial, origem)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [discordId, nome, usuario, tarefaId, tarefaTitulo, progressoInicial, origem],
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') return null;
    throw e;
  }
}

// Define a tarefa de um ponto que está "pendente" (aberto pela call, antes da pessoa escolher).
async function definirTarefa(id, { tarefaId, tarefaTitulo, progressoInicial = null }) {
  const { rows } = await q(
    `UPDATE pontos SET tarefa_id = $2, tarefa_titulo = $3, progresso_inicial = $4
     WHERE id = $1 AND tarefa_id = $5 RETURNING *`,
    [id, tarefaId, tarefaTitulo, progressoInicial, PENDENTE],
  );
  return rows[0] ?? null;
}

// Fechamento manual (já vem com o reporte de progresso).
async function fechar(discordId, { progresso, feito, falta }) {
  const { rows } = await q(
    `UPDATE pontos SET fechado_em = now(), progresso = $2, feito = $3, falta = $4, reportado = true
     WHERE discord_id = $1 AND fechado_em IS NULL RETURNING *`,
    [discordId, progresso, feito, falta || null],
  );
  return rows[0] ?? null;
}

// Fechamento por saída da call: o reporte de progresso vem depois (reportado = false).
async function fecharPorSaida(discordId, quando) {
  const { rows } = await q(
    `UPDATE pontos
        SET fechado_em = GREATEST(aberto_em, LEAST($2::timestamptz, now())), reportado = false
      WHERE discord_id = $1 AND fechado_em IS NULL AND origem = 'voz' RETURNING *`,
    [discordId, quando],
  );
  return rows[0] ?? null;
}

// Última sessão de call fechada e ainda sem reporte (para quem escolhe a tarefa só depois de sair).
async function getPendenteReporte(discordId) {
  const { rows } = await q(
    `SELECT * FROM pontos
      WHERE discord_id = $1 AND origem = 'voz' AND reportado = false AND fechado_em IS NOT NULL
      ORDER BY fechado_em DESC LIMIT 1`,
    [discordId],
  );
  return rows[0] ?? null;
}

async function registrarReporte(id, discordId, { progresso, feito, falta }) {
  const { rows } = await q(
    `UPDATE pontos SET progresso = $3, feito = $4, falta = $5, reportado = true
      WHERE id = $1 AND discord_id = $2 AND reportado = false AND fechado_em IS NOT NULL RETURNING *`,
    [id, discordId, progresso, feito, falta || null],
  );
  return rows[0] ?? null;
}

async function reportesPendentesAntigos(horas) {
  const { rows } = await q(
    `SELECT * FROM pontos
      WHERE reportado = false AND fechado_em IS NOT NULL AND lembrete_enviado = false
        AND fechado_em < now() - ($1::float8 * interval '1 hour')`,
    [horas],
  );
  return rows;
}

async function marcarLembrete(id) {
  await q('UPDATE pontos SET lembrete_enviado = true WHERE id = $1', [id]);
}

async function marcarNotion(id, ok) {
  await q('UPDATE pontos SET notion_ok = $2 WHERE id = $1', [id, ok]);
}

async function marcarPlanilha(id, ok) {
  await q('UPDATE pontos SET sheet_ok = $2 WHERE id = $1', [id, ok]);
}

// ---------- importação sessão a sessão do bot KoV Ponto (canal de logs) ----------
// Retorna a linha inserida, ou null se a mensagem já tinha sido importada.
async function importarKov({ msgId, discordId, nome, usuario, entrada, saida }) {
  const { rows } = await q(
    `INSERT INTO pontos (discord_id, nome, usuario, tarefa_id, tarefa_titulo, aberto_em, fechado_em,
                         origem, reportado, kov_msg_id, sheet_ok, notion_ok)
     VALUES ($1, $2, $3, 'importado', 'KoV Ponto (importado)', $4, $5, 'kov', true, $6, false, true)
     ON CONFLICT DO NOTHING RETURNING *`,
    [discordId, nome, usuario, entrada, saida, msgId],
  );
  return rows[0] ?? null;
}

async function kovJaImportado(msgId) {
  const { rows } = await q('SELECT 1 FROM pontos WHERE kov_msg_id = $1', [msgId]);
  return rows.length > 0;
}

// Sessões do KoV ainda fora da planilha, do mais antigo ao mais recente.
async function kovPendentesPlanilha() {
  const { rows } = await q(
    `SELECT * FROM pontos WHERE kov_msg_id IS NOT NULL AND sheet_ok IS NOT TRUE ORDER BY aberto_em ASC, id ASC`,
  );
  return rows;
}

async function listarAbertos() {
  const { rows } = await q('SELECT * FROM pontos WHERE fechado_em IS NULL ORDER BY aberto_em');
  return rows;
}

// Totais por aluno (histórico inteiro, incluindo saldo importado; ponto aberto conta até agora).
async function resumoPorAluno() {
  const { rows } = await q(`
    SELECT discord_id,
           (ARRAY_AGG(nome    ORDER BY aberto_em DESC))[1] AS nome,
           (ARRAY_AGG(usuario ORDER BY aberto_em DESC))[1] AS usuario,
           (COUNT(*) FILTER (WHERE origem <> 'importado'))::int AS pontos,
           SUM(EXTRACT(EPOCH FROM (COALESCE(fechado_em, now()) - aberto_em)))::float8 AS seg,
           BOOL_OR(fechado_em IS NULL) AS em_servico
    FROM pontos
    GROUP BY discord_id
    ORDER BY seg DESC`);
  return rows;
}

async function totalAluno(discordId) {
  const { rows } = await q(
    `SELECT COUNT(*)::int AS linhas,
            (COUNT(*) FILTER (WHERE origem <> 'importado'))::int AS pontos,
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
    'SELECT * FROM pontos WHERE discord_id = $1 ORDER BY aberto_em DESC, id DESC LIMIT $2 OFFSET $3',
    [discordId, limit, offset],
  );
  return rows;
}

// Pontos fechados (candidatos a ajuste), mais recentes primeiro.
async function ultimosPontos(discordId, limite = 25) {
  const { rows } = await q(
    `SELECT * FROM pontos
      WHERE discord_id = $1 AND fechado_em IS NOT NULL AND origem <> 'importado'
      ORDER BY aberto_em DESC LIMIT $2`,
    [discordId, limite],
  );
  return rows;
}

// Ajuste de fechamento feito pelo RH. `local` = 'YYYY-MM-DD HH:MM' no fuso de São Paulo.
// Regras: depois da abertura, no passado e até 24h depois de aberto. Retorna null se violar.
async function ajustarFechamento(id, local, porDiscordId, motivo) {
  const { rows } = await q(
    `WITH antigo AS (
       SELECT id, fechado_em FROM pontos
        WHERE id = $1 AND fechado_em IS NOT NULL AND origem <> 'importado' FOR UPDATE
     )
     UPDATE pontos p
        SET fechado_em_original = COALESCE(p.fechado_em_original, a.fechado_em),
            fechado_em   = ($2::timestamp AT TIME ZONE $4::text),
            ajustado_por = $3, ajustado_em = now(), ajuste_motivo = $5::text,
            auto_fechado = false
       FROM antigo a
      WHERE p.id = a.id
        AND ($2::timestamp AT TIME ZONE $4::text) >  p.aberto_em
        AND ($2::timestamp AT TIME ZONE $4::text) <= now()
        AND ($2::timestamp AT TIME ZONE $4::text) <= p.aberto_em + interval '24 hours'
    RETURNING p.*, a.fechado_em AS fechado_em_antes`,
    [id, local, porDiscordId, TZ, motivo || null],
  );
  return rows[0] ?? null;
}

// Saldo vindo de fora (ex.: horas acumuladas no KOv Ponto). Não conta no ranking semanal.
// Se o membro já tem saldo importado, substitui (evita duplicar ao repetir o comando).
async function importarSaldo({ discordId, nome, usuario, segundos, obs, porDiscordId }) {
  const { rows: ex } = await q(
    `SELECT id FROM pontos WHERE discord_id = $1 AND origem = 'importado' ORDER BY id LIMIT 1`,
    [discordId],
  );
  if (ex[0]) {
    const { rows } = await q(
      `UPDATE pontos
          SET aberto_em = fechado_em - ($2::float8 * interval '1 second'),
              feito = $3, nome = $4, usuario = $5, ajustado_por = $6, ajustado_em = now()
        WHERE id = $1 RETURNING *, true AS substituiu`,
      [ex[0].id, segundos, obs || null, nome, usuario, porDiscordId],
    );
    return rows[0];
  }
  const { rows } = await q(
    `INSERT INTO pontos (discord_id, nome, usuario, tarefa_id, tarefa_titulo, aberto_em, fechado_em,
                         feito, origem, reportado, ajustado_por)
     VALUES ($1, $2, $3, 'importado', 'Saldo importado do KOv Ponto',
             now() - ($4::float8 * interval '1 second'), now(), $5, 'importado', true, $6)
     RETURNING *, false AS substituiu`,
    [discordId, nome, usuario, segundos, obs || null, porDiscordId],
  );
  return rows[0];
}

// offset 0 = semana atual (segunda a domingo, fuso de São Paulo); 1 = semana passada.
// Sessões que cruzam a virada da semana são cortadas na fronteira. Saldo importado fica de fora.
async function ranking(semanasAtras = 0, limite = 10) {
  const { rows } = await q(
    `WITH lim AS (
       SELECT (date_trunc('week', now() AT TIME ZONE $1::text) - $2::int * interval '1 week')
              AT TIME ZONE $1::text AS ini
     )
     SELECT p.discord_id,
            (ARRAY_AGG(p.nome ORDER BY p.aberto_em DESC))[1] AS nome,
            MAX(COALESCE(p.fechado_em, p.aberto_em)) AS ultimo,
            SUM(EXTRACT(EPOCH FROM (
              LEAST(COALESCE(p.fechado_em, now()), lim.ini + interval '1 week') - GREATEST(p.aberto_em, lim.ini)
            )))::float8 AS seg
     FROM pontos p, lim
     WHERE p.origem <> 'importado'
       AND p.aberto_em < lim.ini + interval '1 week'
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

// Início e fim (formatados, horário de Brasília) da semana pedida.
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
  PENDENTE, init, getAberto, getPorId, abrir, definirTarefa, fechar, fecharPorSaida,
  getPendenteReporte, registrarReporte, reportesPendentesAntigos, marcarLembrete,
  marcarNotion, marcarPlanilha, listarAbertos, resumoPorAluno, totalAluno, historicoAluno,
  ultimosPontos, ajustarFechamento, importarSaldo, ranking, autoFecharExpirados,
  semanaAtual, periodoSemana, getMeta, setMeta,
  importarKov, kovJaImportado, kovPendentesPlanilha,
};
