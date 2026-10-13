'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

function limparRa(ra) {
  if (!ra) return '';
  return String(ra).trim().replace(/\D/g, '');
}

async function main() {
  const relatorioPath = path.resolve('./temp/extracao_termos_resultado.json');
  let itens = [];

  if (fs.existsSync(relatorioPath)) {
    itens = JSON.parse(fs.readFileSync(relatorioPath, 'utf8'));
    console.log(`Carregados ${itens.length} registros extraídos dos termos.\n`);
  } else {
    console.log('Arquivo temp/extracao_termos_resultado.json não encontrado.');
  }

  let atualizados = 0;
  for (const item of itens) {
    if (!item.mesAnoInicio) continue;

    const raLimpo = limparRa(item.ra);
    if (raLimpo) {
      const res = await db.pool.query(
        `UPDATE membros SET data_inicio = $1 WHERE REGEXP_REPLACE(ra, '\\D', '', 'g') = $2`,
        [item.mesAnoInicio, raLimpo]
      );
      if (res.rowCount > 0) {
        console.log(`✅ [RA] ${item.nome || item.nomeArquivo} (RA ${item.ra}) -> início ${item.mesAnoInicio}`);
        atualizados++;
        continue;
      }
    }

    if (item.nome) {
      const res = await db.pool.query(
        `UPDATE membros SET data_inicio = $1 WHERE LOWER(TRIM(nome)) = LOWER(TRIM($2))`,
        [item.mesAnoInicio, item.nome]
      );
      if (res.rowCount > 0) {
        console.log(`✅ [Nome] ${item.nome} -> início ${item.mesAnoInicio}`);
        atualizados++;
      }
    }
  }

  // Para membros cadastrados pelo bot sem termo legado (ex: Christopher, Fernanda Menan):
  // usa o mês/ano de aprovação ou criação no banco
  const { rows: semData } = await db.pool.query(
    `SELECT id, discord_id, nome, created_at FROM membros WHERE (data_inicio IS NULL OR TRIM(data_inicio) = '' OR data_inicio = '05/2026')`
  );

  let atualizadosPorCriacao = 0;
  for (const m of semData) {
    if (m.created_at) {
      const d = new Date(m.created_at);
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      const mesAno = `${mm}/${yyyy}`;
      // Só atualiza se created_at for diferente de maio (ex: set/2026, out/2026)
      if (mesAno !== '05/2026') {
        await db.pool.query(`UPDATE membros SET data_inicio = $1 WHERE id = $2`, [mesAno, m.id]);
        console.log(`📅 [Onboarding] ${m.nome || m.discord_id} -> início definido para ${mesAno} (data de entrada no bot)`);
        atualizadosPorCriacao++;
      }
    }
  }

  console.log(`\nConcluído:`);
  console.log(`- ${atualizados} membro(s) atualizados com data real do termo assinado.`);
  console.log(`- ${atualizadosPorCriacao} membro(s) atualizados com data de criação do onboarding.`);

  await db.pool.end();
}

main().catch(console.error);
