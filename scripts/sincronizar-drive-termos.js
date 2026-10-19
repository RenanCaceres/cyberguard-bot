'use strict';

/**
 * Script para sincronizar retroativamente todos os termos e declarações locais
 * na pasta docs/Termos-Voluntarios-Assinados com as pastas no Google Drive.
 *
 * Uso: node scripts/sincronizar-drive-termos.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const {
  fazerUploadTermo,
  fazerUploadDeclaracao,
  verificarAcessoDrive,
  normalizarAreaSubpasta,
} = require('../src/driveService');

const dorme = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listarArquivosCompletos(diretorio) {
  let resultados = [];
  if (!fs.existsSync(diretorio)) return resultados;

  const itens = fs.readdirSync(diretorio, { withFileTypes: true });
  for (const item of itens) {
    const caminhoCompleto = path.join(diretorio, item.name);
    if (item.isDirectory()) {
      resultados = resultados.concat(listarArquivosCompletos(caminhoCompleto));
    } else if (item.name.toLowerCase().endsWith('.pdf')) {
      resultados.push(caminhoCompleto);
    }
  }
  return resultados;
}

async function main() {
  console.log('========================================================');
  console.log('🚀 SINCRONIZAÇÃO DE DOCUMENTOS COM O GOOGLE DRIVE');
  console.log('========================================================\n');

  console.log(`Pasta de Termos ID:       ${config.googleDrive?.termosFolderId || 'NÃO CONFIGURADO'}`);
  console.log(`Pasta de Declarações ID:  ${config.googleDrive?.declaracoesFolderId || 'NÃO CONFIGURADO'}`);
  console.log(`Service Account:          ${config.googleSheets?.serviceAccountEmail || 'NÃO CONFIGURADA'}\n`);

  console.log('🔍 Testando conectividade e permissões no Google Drive...');
  const teste = await verificarAcessoDrive();

  if (!teste.ok) {
    console.error('\n❌ Falha na autenticação ou acesso ao Google Drive:');
    if (teste.motivo) console.error(`   ${teste.motivo}`);
    if (teste.resultados) {
      for (const r of teste.resultados) {
        if (!r.ok) {
          console.error(`   - ${r.nome} (${r.id}): ${r.erro || 'Erro desconhecido'}`);
        }
      }
    }
    console.log('\n⚠️ Para corrigir:');
    console.log('1. Certifique-se de habilitar a "Google Drive API" no console do Google Cloud:');
    console.log('   https://console.developers.google.com/apis/api/drive.googleapis.com/overview');
    console.log('2. Compartilhe ambas as pastas do Drive com permissão de Editor para o e-mail:');
    console.log(`   ${config.googleSheets?.serviceAccountEmail || 'seu-email-de-service-account'}`);
    process.exit(1);
  }

  console.log('✅ Conexão com o Google Drive validada com sucesso!\n');

  const pastaBase = path.resolve('./docs/Termos-Voluntarios-Assinados');
  if (!fs.existsSync(pastaBase)) {
    console.log(`Nenhum diretório local encontrado em: ${pastaBase}`);
    return;
  }

  const todosArquivos = listarArquivosCompletos(pastaBase);
  console.log(`📁 Localizados ${todosArquivos.length} documento(s) em ${pastaBase} para sincronizar:\n`);

  let termosEnviados = 0;
  let declaracoesEnviadas = 0;
  let erros = 0;

  for (let i = 0; i < todosArquivos.length; i++) {
    const arquivo = todosArquivos[i];
    const relativo = path.relative(pastaBase, arquivo);
    const partes = relativo.split(path.sep);
    const subpasta = partes.length > 1 ? partes[0] : 'Geral';
    const nomeArquivo = path.basename(arquivo);

    try {
      if (subpasta === 'DeclaracoesAssinadas') {
        process.stdout.write(`[${i + 1}/${todosArquivos.length}] [Declarações] Enviando ${nomeArquivo}... `);
        const res = await fazerUploadDeclaracao({
          caminhoArquivo: arquivo,
          nomeArquivo,
        });
        console.log(`✅ OK (${res.atualizado ? 'Atualizado' : 'Novo'})`);
        declaracoesEnviadas++;
      } else {
        const area = normalizarAreaSubpasta(subpasta);
        process.stdout.write(`[${i + 1}/${todosArquivos.length}] [Termos/${area}] Enviando ${nomeArquivo}... `);
        const res = await fazerUploadTermo({
          caminhoArquivo: arquivo,
          nomeArquivo,
          area,
        });
        console.log(`✅ OK (${res.atualizado ? 'Atualizado' : 'Novo'})`);
        termosEnviados++;
      }
      // Pequena pausa para respeitar cotas da API
      await dorme(300);
    } catch (err) {
      console.log(`❌ ERRO: ${err.message}`);
      erros++;
    }
  }

  console.log('\n========================================================');
  console.log('📊 RESUMO DA SINCRONIZAÇÃO:');
  console.log(`   - Termos de voluntariado sincronizados: ${termosEnviados}`);
  console.log(`   - Declarações assinadas sincronizadas:  ${declaracoesEnviadas}`);
  console.log(`   - Falhas:                              ${erros}`);
  console.log('========================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
