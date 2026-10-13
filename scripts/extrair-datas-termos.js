const fs = require('fs');
const path = require('path');

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

  // Regex para RA (apenas dígitos)
  const matchRa = textoCompleto.match(/RA:\s*([0-9]{5,8})/i);
  const ra = matchRa ? matchRa[1].trim() : null;

  // Regex para Data de Início
  // No termo de voluntariado da UTFPR costuma aparecer: "Início: 01/05/2026" ou "05/2026"
  const matchInicioCompleto = textoCompleto.match(/In[íi]cio:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  let dataInicio = null;
  let mesAnoInicio = null;

  if (matchInicioCompleto) {
    dataInicio = matchInicioCompleto[1];
    const partes = dataInicio.split('/');
    mesAnoInicio = `${partes[1]}/${partes[2]}`;
  } else {
    // Tenta formato mm/aaaa direto
    const matchMesAno = textoCompleto.match(/In[íi]cio:\s*([0-9]{2}\/[0-9]{4})/i);
    if (matchMesAno) {
      mesAnoInicio = matchMesAno[1];
    }
  }

  // Regex para Data de Assinatura
  const matchDataAssinatura = textoCompleto.match(/Data:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  const dataAssinatura = matchDataAssinatura ? matchDataAssinatura[1] : null;

  // Nome do voluntário (geralmente entre "VOLUNTÁRIO(A):" ou no início da tabela)
  const matchNome = textoCompleto.match(/Nome:\s*([^,\n\r]+?)(?=\s+Data nascimento|\s+CPF|\s+Curso)/i);
  const nome = matchNome ? matchNome[1].trim() : null;

  return {
    caminho: caminhoPdf,
    nomeArquivo: path.basename(caminhoPdf),
    ra,
    nome,
    dataInicio,
    mesAnoInicio,
    dataAssinatura,
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
