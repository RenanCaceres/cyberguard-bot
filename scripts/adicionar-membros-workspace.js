'use strict';
require('dotenv').config();
const db = require('../src/db');
const { adicionarMembroWorkspace } = require('../src/notionWorkspace');

async function main() {
  console.log('=== ADICIONANDO MEMBROS ATIVOS AO WORKSPACE DO NOTION ===\n');

  const { rows: membros } = await db.pool.query(
    `SELECT id, nome, email, area_interesse 
     FROM membros 
     WHERE status = 'concluido' 
       AND (saida_processada IS NULL OR saida_processada = false) 
       AND email IS NOT NULL 
       AND email != ''
     ORDER BY id ASC`
  );

  console.log(`Encontrados ${membros.length} membros ativos com e-mail cadastrado.\n`);

  let adicionados = 0;
  let falhas = 0;

  for (const m of membros) {
    console.log(`[Workspace] Processando: ${m.nome} (${m.email})...`);
    try {
      const res = await adicionarMembroWorkspace(m.email, 'member');
      if (res.sucesso) {
        console.log(`✅ Sucesso: ${m.nome} adicionado ao Workspace!`);
        adicionados++;
      } else {
        console.warn(`⚠️ Aviso para ${m.nome}: ${res.mensagem}`);
        falhas++;
      }
    } catch (err) {
      console.error(`❌ Erro ao adicionar ${m.nome}:`, err.message);
      falhas++;
    }

    // Intervalo de segurança para respeitar o rate-limit do Notion
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log('\n=== CONCLUSÃO DA OPERAÇÃO ===');
  console.log(`Total adicionados com sucesso: ${adicionados}`);
  console.log(`Pendentes/Falhas: ${falhas}`);

  await db.pool.end();
}

main().catch(console.error);
