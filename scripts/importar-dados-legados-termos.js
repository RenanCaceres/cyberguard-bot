require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { registrarMembroAtivo } = require('../src/notionMembros');

if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

async function extrairDadosCompletos(caminhoPdf) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(caminhoPdf));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((it) => it.str).join(' ');

  // Nome: Nome Completo (até Curso, Data nascimento ou CPF)
  const matchNome = text.match(/Nome:\s*([^\n\r,]+?)(?=\s+Data nascimento|\s+CPF|\s+Curso|\s+Nacionalidade)/i);
  const nome = matchNome ? matchNome[1].trim() : null;

  // Curso: Nome do Curso (até Período, RA, etc.)
  const matchCurso = text.match(/Curso:\s*([^\n\r,]+?)(?=\s+Per[ií]odo|\s+RA:|\s+Data|\s+Endere[çc]o)/i);
  const curso = matchCurso ? matchCurso[1].trim() : null;

  // RA: Apenas números
  const matchRa = text.match(/RA:\s*([0-9]{5,8})/i);
  const ra = matchRa ? matchRa[1].trim() : null;

  return { nome, curso, ra };
}

function listarArquivosRecursivo(dir) {
  let resultados = [];
  const itens = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of itens) {
    const caminhoCompleto = path.join(dir, item.name);
    if (item.isDirectory()) {
      resultados = resultados.concat(listarArquivosRecursivo(caminhoCompleto));
    } else if (item.name.toLowerCase().endsWith('.pdf')) {
      resultados.push(caminhoCompleto);
    }
  }
  return resultados;
}

function normalizarNome(n) {
  if (!n) return '';
  return n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function main() {
  const pastaBase = path.resolve('./docs/Termos-Voluntarios-Assinados');
  if (!fs.existsSync(pastaBase)) {
    console.error('Pasta docs/Termos-Voluntarios-Assinados não encontrada.');
    process.exit(1);
  }

  const arquivos = listarArquivosRecursivo(pastaBase);
  console.log(`Analisando ${arquivos.length} termos para importação cadastral...\n`);

  // Puxa mapa de cadastro_legado
  const { rows: legados } = await db.pool.query('SELECT discord_id, nome FROM cadastro_legado');
  const mapaLegados = new Map();
  for (const l of legados) {
    mapaLegados.set(normalizarNome(l.nome), l.discord_id);
  }

  let totalImportados = 0;

  for (const arquivo of arquivos) {
    try {
      const dados = await extrairDadosCompletos(arquivo);
      if (!dados.nome || !dados.ra) continue;

      const subpasta = path.basename(path.dirname(arquivo));
      const setor = subpasta === 'Termos-Voluntarios-Assinados' ? 'Geral' : subpasta;

      const nomeNorm = normalizarNome(dados.nome);
      let discordId = mapaLegados.get(nomeNorm);

      // Se não achou correspondência exata, tenta busca aproximada
      if (!discordId) {
        for (const [nomeLeg, id] of mapaLegados.entries()) {
          if (nomeNorm.includes(nomeLeg) || nomeLeg.includes(nomeNorm)) {
            discordId = id;
            break;
          }
        }
      }

      if (!discordId) {
        console.warn(`[?] Termo de ${dados.nome} (RA ${dados.ra}) não teve Discord ID encontrado em cadastro_legado.`);
        continue;
      }

      // Atualiza ou insere na tabela membros
      await db.pool.query(
        `INSERT INTO membros (discord_id, nome, ra, curso, area_interesse, data_inicio, status, termo_arquivo_path)
         VALUES ($1, $2, $3, $4, $5, '05/2026', 'concluido', $6)
         ON CONFLICT (discord_id) DO UPDATE SET
           nome = EXCLUDED.nome,
           ra = EXCLUDED.ra,
           curso = COALESCE(EXCLUDED.curso, membros.curso),
           area_interesse = COALESCE(EXCLUDED.area_interesse, membros.area_interesse),
           data_inicio = '05/2026',
           status = 'concluido',
           termo_arquivo_path = EXCLUDED.termo_arquivo_path`,
        [discordId, dados.nome, dados.ra, dados.curso, setor, arquivo]
      );

      console.log(`✅ Cadastrado/Atualizado: ${dados.nome} (RA ${dados.ra}) | Setor: ${setor} | Discord ID: ${discordId}`);

      // Atualiza no Notion
      await registrarMembroAtivo({
        discord_id: discordId,
        nome: dados.nome,
        ra: dados.ra,
        curso: dados.curso,
        area_interesse: setor,
        data_inicio: '05/2026',
      });

      totalImportados++;
    } catch (err) {
      console.error(`Erro ao processar ${path.basename(arquivo)}:`, err.message);
    }
  }

  console.log(`\nImportação concluída com sucesso! Total atualizados: ${totalImportados}`);
  await db.pool.end();
}

main().catch(console.error);
