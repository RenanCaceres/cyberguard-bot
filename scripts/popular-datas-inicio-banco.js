const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const relatorioPath = path.resolve('./temp/extracao_termos_resultado.json');
  if (!fs.existsSync(relatorioPath)) {
    console.error(`Relatório de extração não encontrado em ${relatorioPath}. Execute scripts/extrair-datas-termos.js primeiro.`);
    process.exit(1);
  }

  const itens = JSON.parse(fs.readFileSync(relatorioPath, 'utf8'));
  console.log(`Carregados ${itens.length} registros extraídos dos termos.\n`);

  let atualizados = 0;
  for (const item of itens) {
    if (!item.ra || !item.mesAnoInicio) continue;

    const res = await db.atualizarDataInicioPorRa(item.ra, item.mesAnoInicio);
    if (res.rowCount > 0) {
      console.log(`✅ Membro com RA ${item.ra} (${item.nome || item.nomeArquivo}) atualizado para início em ${item.mesAnoInicio}`);
      atualizados++;
    }
  }

  // Também garante que qualquer membro já cadastrado com status 'concluido' sem data_inicio receba '05/2026' como padrão
  const resPadrao = await db.pool.query(
    `UPDATE membros SET data_inicio = '05/2026' WHERE (data_inicio IS NULL OR TRIM(data_inicio) = '') AND status = 'concluido'`
  );

  console.log(`\nConcluído:`);
  console.log(`- ${atualizados} membro(s) atualizados com correspondência exata de RA.`);
  console.log(`- ${resPadrao.rowCount} membro(s) adicionais que estavam sem data receberam o início padrão (05/2026).`);

  await db.pool.end();
}

main().catch(console.error);
