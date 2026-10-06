const { pool } = require('../../src/db');

async function salvarAta({
  guildId,
  canalVozId,
  canalVozNome,
  titulo,
  transcricao,
  ataMarkdown,
  participantes,
  iniciadoEm,
  pdfPath,
  pastaAudioBackup,
  audioExpiraEm,
}) {
  const query = `
    INSERT INTO atas_reuniao
      (guild_id, canal_voz_id, canal_voz_nome, titulo, transcricao, ata_markdown, participantes, iniciado_em, pdf_path, pasta_audio_backup, audio_expira_em)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, finalizado_em;
  `;
  const valores = [
    guildId,
    canalVozId,
    canalVozNome,
    titulo,
    transcricao,
    ataMarkdown,
    JSON.stringify(participantes),
    iniciadoEm,
    pdfPath,
    pastaAudioBackup || null,
    audioExpiraEm || null,
  ];

  const { rows } = await pool.query(query, valores);
  return rows[0];
}

async function listarAtas(guildId, limite = 10) {
  const { rows } = await pool.query(
    `SELECT id, titulo, finalizado_em, pdf_path
     FROM atas_reuniao
     WHERE guild_id = $1
     ORDER BY finalizado_em DESC
     LIMIT $2;`,
    [guildId, limite]
  );
  return rows;
}

async function buscarAtaPorId(id) {
  const { rows } = await pool.query('SELECT * FROM atas_reuniao WHERE id = $1;', [id]);
  return rows[0] || null;
}

async function atualizarAtaReprocessada(id, { transcricao, ataMarkdown, pdfPath }) {
  await pool.query(
    `UPDATE atas_reuniao SET transcricao = $2, ata_markdown = $3, pdf_path = $4 WHERE id = $1`,
    [id, transcricao, ataMarkdown, pdfPath || null]
  );
}

async function listarBackupsExpirados() {
  const { rows } = await pool.query(
    `SELECT id, pasta_audio_backup FROM atas_reuniao
     WHERE pasta_audio_backup IS NOT NULL AND audio_expira_em < now()`
  );
  return rows;
}

async function limparReferenciaBackup(id) {
  await pool.query(`UPDATE atas_reuniao SET pasta_audio_backup = NULL WHERE id = $1`, [id]);
}

module.exports = {
  pool,
  salvarAta,
  listarAtas,
  buscarAtaPorId,
  atualizarAtaReprocessada,
  listarBackupsExpirados,
  limparReferenciaBackup,
};
