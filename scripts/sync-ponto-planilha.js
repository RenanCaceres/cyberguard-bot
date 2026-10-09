'use strict';
// Envia para a planilha todos os pontos já fechados que estão no banco (útil na 1ª vez ou para refazer).
// Uso (na pasta do bot): node scripts/sync-ponto-planilha.js
require('../src/config'); // carrega o .env
const pdb = require('../src/pontoDb');
const sheets = require('../src/pontoSheets');

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let n = 0;
  for (const a of await pdb.resumoPorAluno()) {
    for (let off = 0; ; off += 100) {
      const rows = await pdb.historicoAluno(a.discord_id, 100, off);
      for (const r of rows) {
        if (!r.fechado_em) continue; // ponto ainda aberto
        await sheets.upsertPonto(r);
        await pdb.marcarPlanilha(r.id, true);
        n++;
        await dorme(1200); // respeita a cota da API do Google
      }
      if (rows.length < 100) break;
    }
  }
  console.log(`${n} ponto(s) sincronizado(s) com a planilha.`);
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
