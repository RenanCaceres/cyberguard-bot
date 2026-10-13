const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const execFileAsync = promisify(execFile);

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function formatarDataExtenso(data = new Date()) {
  const dia = data.getDate();
  const mes = MESES[data.getMonth()];
  const ano = data.getFullYear();
  return `${dia} de ${mes} de ${ano}`;
}

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

/**
 * Gera a declaração oficial de voluntariado em PDF a partir do template .docx
 */
async function gerarDeclaracaoPdf({
  nome,
  curso,
  ra,
  dataInicio,
  cargaHoraria = '10 horas',
  dataSolicitacao = new Date(),
}) {
  const caminhoTemplate = path.resolve('./templates/declaracao_participacao.docx');
  if (!fs.existsSync(caminhoTemplate)) {
    throw new Error(`Template não encontrado em: ${caminhoTemplate}`);
  }

  const conteudo = fs.readFileSync(caminhoTemplate, 'binary');
  const zip = new PizZip(conteudo);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render({
    nome: (nome || '').trim(),
    curso: (curso || '').trim(),
    ra: (ra || '').trim(),
    data_inicio: (dataInicio || '05/2026').trim(),
    carga_horaria: cargaHoraria,
    data_solicitacao: formatarDataExtenso(dataSolicitacao),
  });

  const bufferDocx = doc.getZip().generate({ type: 'nodebuffer' });
  const dirSaida = path.resolve('./temp');
  fs.mkdirSync(dirSaida, { recursive: true });

  const raLimpo = (ra || 'aluno').toString().replace(/[^0-9]/g, '');
  const nomeArquivo = `declaracao_${raLimpo}_${Date.now()}`;
  const caminhoDocx = path.join(dirSaida, `${nomeArquivo}.docx`);
  fs.writeFileSync(caminhoDocx, bufferDocx);

  const caminhoPdf = await converterParaPdf(caminhoDocx, dirSaida);
  fs.unlink(caminhoDocx, () => {});

  return caminhoPdf;
}

module.exports = {
  formatarDataExtenso,
  gerarDeclaracaoPdf,
};
