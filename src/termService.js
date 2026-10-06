const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { PDFDocument, rgb } = require('pdf-lib');
const config = require('./config');

const execFileAsync = promisify(execFile);

async function converterParaPdf(caminhoDocx, dirSaida) {
  await execFileAsync('soffice', [
    '--headless',
    '--convert-to',
    'pdf',
    '--outdir',
    dirSaida,
    caminhoDocx,
  ]);

  const nomeBase = path.basename(caminhoDocx, '.docx');
  return path.join(dirSaida, `${nomeBase}.pdf`);
}

async function localizarCampoData(caminhoPdf) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(caminhoPdf));
  const documento = await pdfjsLib.getDocument({ data }).promise;

  for (let i = 1; i <= documento.numPages; i++) {
    const pagina = await documento.getPage(i);
    const conteudo = await pagina.getTextContent();

    for (const item of conteudo.items) {
      if (item.str.trim() === 'Data:') {
        return {
          pageIndex: i - 1,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        };
      }
    }
  }

  return null;
}

async function adicionarCampoDataPreenchivel(caminhoPdf) {
  const posicao = await localizarCampoData(caminhoPdf);
  if (!posicao) {
    throw new Error('Não encontrei o rótulo "Data:" no PDF gerado — o template pode ter mudado de layout.');
  }

  const pdfBytes = fs.readFileSync(caminhoPdf);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pagina = pdfDoc.getPages()[posicao.pageIndex];

  const form = pdfDoc.getForm();
  const campo = form.createTextField('data_assinatura');
  campo.setText('');

  const margemEsquerda = posicao.x + posicao.width + 6;
  const largura = 100;
  const altura = 16;

  campo.addToPage(pagina, {
    x: margemEsquerda,
    y: posicao.y - 3,
    width: largura,
    height: altura,
    borderWidth: 1,
    borderColor: rgb(0.2, 0.2, 0.6),
  });

  const bytesFinal = await pdfDoc.save();
  fs.writeFileSync(caminhoPdf, bytesFinal);
}

async function gerarTermo(membro) {
  const conteudo = fs.readFileSync(path.resolve(config.templateTermoPath), 'binary');
  const zip = new PizZip(conteudo);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      if (part.value === 'data_assinatura') return '';
      return `[[FALTA PREENCHER: ${part.value}]]`;
    },
  });

  doc.render({
    nome: membro.nome,
    ra: membro.ra,
    curso: membro.curso,
    periodo: membro.periodo,
    período: membro.periodo,
    cpf: membro.cpf,
    data_nascimento: membro.data_nascimento,
    nacionalidade: membro.nacionalidade,
    endereco: membro.endereco,
    endereço: membro.endereco,
    cidade: membro.cidade,
    estado: membro.estado,
    telefone: membro.telefone,
    email: membro.email,
  });

  const bufferDocx = doc.getZip().generate({ type: 'nodebuffer' });
  const nomeArquivo = `termo_${membro.discord_id}_${Date.now()}`;
  const dirSaida = path.resolve('./temp');
  const caminhoDocx = path.join(dirSaida, `${nomeArquivo}.docx`);
  fs.writeFileSync(caminhoDocx, bufferDocx);

  const caminhoPdf = await converterParaPdf(caminhoDocx, dirSaida);
  await adicionarCampoDataPreenchivel(caminhoPdf);

  fs.unlink(caminhoDocx, () => {});

  return caminhoPdf;
}

module.exports = { gerarTermo };