'use strict';
require('dotenv').config();
const db = require('../src/db');
const { registrarMembroAtivo, registrarSaidaMembro } = require('../src/notionMembros');

async function main() {
  console.log('Iniciando sincronização de membros com o Notion...\n');

  const { rows: membros } = await db.pool.query(
    'SELECT * FROM membros ORDER BY id ASC'
  );

  console.log(`Encontrados ${membros.length} membros no banco de dados.\n`);

  let ativos = 0;
  let egressos = 0;

  for (const m of membros) {
    if (m.status === 'concluido' && !m.saida_processada) {
      console.log(`[Notion] Sincronizando membro ativo: ${m.nome || m.discord_id} (${m.area_interesse || 'Sem setor'})...`);
      await registrarMembroAtivo(m);
      ativos++;
    } else {
      console.log(`[Notion] Sincronizando membro desligado/inativo: ${m.nome || m.discord_id}...`);
      await registrarMembroAtivo(m); // Primeiro garante que a página existe
      await registrarSaidaMembro(m.discord_id, {
        motivo: `Status: ${m.status || 'desligado'}`,
        expulso: m.status === 'rejeitado',
      });
      egressos++;
    }

    // Intervalo suave de 350ms para respeitar o rate-limit do Notion (máx 3 req/s)
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log('\n--- SINCRONIZAÇÃO NOTION CONCLUÍDA ---');
  console.log(`Ativos sincronizados: ${ativos}`);
  console.log(`Desligados/Egressos sincronizados: ${egressos}`);
  console.log(`Total: ${membros.length}`);

  await db.pool.end();
}

main().catch(console.error);
