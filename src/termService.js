const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { PDFDocument, rgb } = require('pdf-lib');
const config = require('./config');

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

async function gerarTermo(membro, opcoes = {}) {
  const conteudo = fs.readFileSync(path.resolve(config.templateTermoPath), 'binary');
  const zip = new PizZip(conteudo);

  const valorUtfpr = (membro.estudante_utfpr || 'Sim').trim().toLowerCase();
  const ehUtfpr =
    valorUtfpr !== 'não' && valorUtfpr !== 'nao' && valorUtfpr !== 'false' && valorUtfpr !== 'no';

  // 1. Detectar se o membro é líder
  let ehLider = false;
  if (typeof opcoes.ehLider === 'boolean') {
    ehLider = opcoes.ehLider;
  } else if (membro.papel === 'lider' || membro.eh_lider || membro.cargo === 'Líder') {
    ehLider = true;
  } else if (config.lideresTime && Object.values(config.lideresTime).includes(membro.discord_id)) {
    ehLider = true;
  } else if (opcoes.client) {
    try {
      for (const guild of opcoes.client.guilds.cache.values()) {
        const gm = guild.members.cache.get(membro.discord_id);
        if (gm && gm.roles?.cache) {
          const temRoleLider = gm.roles.cache.some((r) => {
            const nome = (r.name || '').toLowerCase();
            return (
              r.name === config.roleLiderNome ||
              r.id === config.roleViceLiderId ||
              r.name === config.roleViceLiderNome ||
              nome.includes('líder') ||
              nome.includes('lider') ||
              nome.includes('diretoria') ||
              nome.includes('presidente')
            );
          });
          if (temRoleLider) {
            ehLider = true;
            break;
          }
        }
      }
    } catch {}
  }

  // 2. Data de referência para os 6 meses de vigência do termo
  let dataReferencia = opcoes.dataReferencia || new Date();
  if (!opcoes.dataReferencia && membro.data_inicio) {
    const partes = String(membro.data_inicio).split('/');
    if (partes.length === 3) {
      dataReferencia = new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));
    }
  }

  // 3. Atualizar XML com as atividades do setor e cronograma semestral
  const docXmlFile = zip.file('word/document.xml');
  if (docXmlFile) {
    let xml = docXmlFile.asText();

    if (ehUtfpr) {
      // Quando o(a) aluno(a) é da UTFPR, removemos a linha extra "Instituição: {instituicao}"
      xml = xml.replace(
        /<w:tr\b[^>]*>(?:(?!<\/w:tr>)[\s\S])*?\{instituicao\}[\s\S]*?<\/w:tr>/,
        ''
      );
    }

    const temNomeSocial = Boolean(membro.nome_social && membro.nome_social.trim());
    if (temNomeSocial) {
      // Quando houver nome social, alteramos o rótulo da linha civil para "Nome civil:"
      // e inserimos logo abaixo uma linha adicional dedicada para "Nome social: {nome_social}"
      const rowNomeRegex = /(<w:tr\b[^>]*>(?:(?!<\/w:tr>)[\s\S])*?\{nome\}[\s\S]*?<\/w:tr>)/;
      const match = xml.match(rowNomeRegex);
      if (match) {
        const rowOriginal = match[1];
        const rowComNomeCivil = rowOriginal.replace(
          /<w:t xml:space="preserve">Nome: <\/w:t>/,
          '<w:t xml:space="preserve">Nome civil: </w:t>'
        );
        const novaLinhaNomeSocial =
          '<w:tr><w:trPr><w:trHeight w:val="253" w:hRule="atLeast"/></w:trPr>' +
          '<w:tc><w:tcPr><w:tcW w:w="9547" w:type="dxa"/><w:gridSpan w:val="6"/>' +
          '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
          '<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders></w:tcPr>' +
          '<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:widowControl w:val="false"/>' +
          '<w:spacing w:lineRule="exact" w:line="234" w:before="0" w:after="0"/><w:ind w:left="105"/>' +
          '<w:jc w:val="left"/><w:rPr><w:color w:val="000000"/><w:kern w:val="0"/><w:sz w:val="22"/>' +
          '<w:szCs w:val="22"/><w:lang w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:pPr>' +
          '<w:r><w:rPr><w:color w:val="000000"/><w:kern w:val="0"/><w:sz w:val="22"/><w:szCs w:val="22"/>' +
          '<w:lang w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr><w:t xml:space="preserve">Nome social: </w:t></w:r>' +
          '<w:r><w:rPr><w:color w:val="000000"/><w:kern w:val="0"/><w:sz w:val="22"/><w:szCs w:val="22"/>' +
          '<w:lang w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr><w:t>{nome_social}</w:t></w:r></w:p></w:tc></w:tr>';
        xml = xml.replace(rowOriginal, rowComNomeCivil + novaLinhaNomeSocial);
      }
    }

    let areaSetor = membro.area_interesse;
    if ((!areaSetor || areaSetor === 'Líderes') && opcoes.client) {
      try {
        for (const guild of opcoes.client.guilds.cache.values()) {
          const gm = guild.members.cache.get(membro.discord_id);
          if (gm && gm.roles?.cache) {
            const roleSetor = gm.roles.cache.find((r) => {
              const n = (r.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              return (
                n.includes('hardware') ||
                n.includes('hack') ||
                n.includes('etico') ||
                n.includes('design') ||
                n.includes('copy') ||
                n.includes('social') ||
                n.includes('desenv') ||
                n.includes('educ') ||
                n.includes('humano')
              );
            });
            if (roleSetor) {
              areaSetor = roleSetor.name;
              break;
            }
          }
        }
      } catch {}
    }

    const { aplicarAtividadesECronogramaNoXml } = require('./atividadesVoluntariado');
    xml = aplicarAtividadesECronogramaNoXml(
      xml,
      areaSetor,
      ehLider,
      dataReferencia,
      opcoes.atividadesCustomizadas || membro.atividades_customizadas
    );

    zip.file('word/document.xml', xml);
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      if (part.value === 'data_assinatura') return '';
      if (part.value === 'nome_social') return '';
      return `[[FALTA PREENCHER: ${part.value}]]`;
    },
  });

  doc.render({
    nome: membro.nome,
    nome_social: membro.nome_social || '',
    ra: membro.ra,
    curso: membro.curso,
    periodo: membro.periodo,
    período: membro.periodo,
    cpf: membro.cpf,
    data_nascimento: membro.data_nascimento,
    nacionalidade: membro.nacionalidade,
    endereco: membro.endereco,
    endereço: membro.endereco,
    cidade: membro.cidade || 'Cornélio Procópio',
    estado: membro.estado,
    telefone: membro.telefone,
    email: membro.email,
    utfpr_sim: ehUtfpr ? '(x)' : '( )',
    utfpr_nao: ehUtfpr ? '( )' : '(x)',
    instituicao: ehUtfpr ? 'UTFPR' : membro.instituicao || '—',
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