require('dotenv').config();
const fs = require('fs');
const path = require('path');

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

function formatarDataIso(diaStr, mesStr, anoStr) {
  const d = diaStr.replace(/\s+/g, '').padStart(2, '0');
  const m = mesStr.replace(/\s+/g, '').padStart(2, '0');
  const y = anoStr.replace(/\s+/g, '');
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return null;
  return `${y}-${m}-${d}`;
}

async function extrairDadosDePdf(caminhoPdf) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(caminhoPdf));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let textoCompleto = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => it.str).join(' ');
    textoCompleto += ` ${strings}`;
  }

  // Regex para RA (ex: 2525526, A2865688)
  const matchRa = textoCompleto.match(/RA:\s*([a-zA-Z0-9]{5,10})/i);
  const ra = matchRa ? matchRa[1].trim() : null;

  // Nome do voluntário (especificamente na seção 'Dados do(a) Voluntário(a)', para não pegar a coordenação)
  const matchVoluntario = textoCompleto.match(
    /Dados do\(a\) Volunt[aá]rio\(a\)[\s\S]*?Nome:\s*([^,\n\r]+?)(?=\s+Data nascimento|\s+CPF|\s+É estudante|\s+Curso)/i
  );
  let nome = matchVoluntario ? matchVoluntario[1].trim() : null;
  if (!nome) {
    // Fallback: tenta match após "Voluntário(a)" em geral
    const matchAlt = textoCompleto.match(/Volunt[aá]rio\(a\)[\s\S]*?Nome:\s*([^,\n\r]+?)(?=\s+Data nascimento|\s+CPF)/i);
    if (matchAlt) nome = matchAlt[1].trim();
  }

  // Data de Entrada / Assinatura (na página 2 ou 3, em 'Local: Cornélio Procópio Data: DD/MM/AAAA' ou 'ACEITE E CONCORDÂNCIA')
  let dataInicioIso = null;
  let dataInicio = null;
  let mesAnoInicio = null;

  const matchDataAceite =
    textoCompleto.match(/Local:.*?Data:\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4,6})/i) ||
    textoCompleto.match(/ACEITE E CONCORD[ÂA]NCIA[\s\S]*?Data:\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4,6})/i);

  if (matchDataAceite) {
    dataInicioIso = formatarDataIso(matchDataAceite[1], matchDataAceite[2], matchDataAceite[3]);
  }

  // Se não achou com o prefixo 'Local:', busca 'Data: DD/MM/AAAA' geral (excluindo Data nascimento)
  if (!dataInicioIso) {
    const todosMatches = [
      ...textoCompleto.matchAll(/(?:Data|data):\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4,6})/gi),
    ];
    for (const m of todosMatches) {
      const iso = formatarDataIso(m[1], m[2], m[3]);
      // Não é data de nascimento (anos 199x ou 200x até 2008)
      if (iso && !iso.startsWith('199') && !iso.startsWith('200')) {
        dataInicioIso = iso;
        break;
      }
    }
  }

  // Caso especial: termos com data '2X/06/2026'
  if (!dataInicioIso) {
    const match2X = textoCompleto.match(/Data:\s*2[xX]\s*\/\s*([0-9]{2})\s*\/\s*([0-9]{4})/i);
    if (match2X) {
      dataInicioIso = `${match2X[2]}-${match2X[1]}-25`;
    }
  }

  // Assinatura digital gov.br (ex: 13/07/2026 14:30:00)
  if (!dataInicioIso) {
    const matchGovBr = textoCompleto.match(/([0-9]{2})\/([0-9]{2})\/([0-9]{4})\s+[0-9]{2}:[0-9]{2}:[0-9]{2}/);
    if (matchGovBr) {
      dataInicioIso = formatarDataIso(matchGovBr[1], matchGovBr[2], matchGovBr[3]);
    }
  }

  if (dataInicioIso) {
    const [y, m, d] = dataInicioIso.split('-');
    dataInicio = `${d}/${m}/${y}`;
    mesAnoInicio = `${m}/${y}`;
  }

  return {
    caminho: caminhoPdf,
    nomeArquivo: path.basename(caminhoPdf),
    ra,
    nome,
    dataInicio,
    dataInicioIso,
    mesAnoInicio,
  };
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

async function main() {
  const pastaBase = path.resolve('./docs/Termos-Voluntarios-Assinados');
  if (!fs.existsSync(pastaBase)) {
    console.error(`Pasta não encontrada: ${pastaBase}`);
    return;
  }

  const arquivos = listarArquivosRecursivo(pastaBase);
  console.log(`Encontrados ${arquivos.length} arquivo(s) PDF para análise.\n`);

  const resultados = [];
  for (const arquivo of arquivos) {
    try {
      const dados = await extrairDadosDePdf(arquivo);
      const subpasta = path.relative(pastaBase, path.dirname(arquivo));
      dados.time = subpasta || 'Raiz';
      resultados.push(dados);
    } catch (err) {
      console.error(`Erro ao processar ${path.basename(arquivo)}:`, err.message);
    }
  }

  console.log('--- RESUMO DA EXTRAÇÃO ---');
  let comRa = 0;
  let comDataInicio = 0;

  for (const r of resultados) {
    if (r.ra) comRa++;
    if (r.mesAnoInicio) comDataInicio++;
    console.log(
      `[${r.time}] Arquivo: ${r.nomeArquivo} | RA: ${r.ra || 'N/A'} | Nome: ${r.nome || 'N/A'} | Início: ${r.mesAnoInicio || 'N/A'}`
    );
  }

  console.log(`\nTotal analisado: ${resultados.length}`);
  console.log(`Com RA identificado: ${comRa}/${resultados.length}`);
  console.log(`Com Mês/Ano início identificado: ${comDataInicio}/${resultados.length}`);

  // Salva resultado em JSON para inspeção ou uso pelo bot
  const relatorioPath = path.resolve('./temp/extracao_termos_resultado.json');
  fs.mkdirSync('./temp', { recursive: true });
  fs.writeFileSync(relatorioPath, JSON.stringify(resultados, null, 2));
  console.log(`\nRelatório completo salvo em: ${relatorioPath}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { extrairDadosDePdf, listarArquivosRecursivo };
