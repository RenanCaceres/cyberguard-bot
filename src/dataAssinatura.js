const fs = require('fs');
const { PDFDocument, PDFName } = require('pdf-lib');
const { validarData } = require('./validators');

function dataHojeBrasil() {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return formatter.format(new Date());
}

async function lerCampoFormulario(pdfDoc) {
  try {
    const form = pdfDoc.getForm();
    const campo = form.getTextField('data_assinatura');
    const valor = campo.getText();
    return valor && valor.trim() ? valor.trim() : null;
  } catch (err) {
    return null;
  }
}

function inspecionarObjetosPdf(pdfDoc) {
  const objetos = pdfDoc.context.enumerateIndirectObjects();

  let temAssinaturaCriptografica = false;
  let widgetRef = null;
  let widgetDict = null;

  for (const [ref, obj] of objetos) {
    if (!obj || typeof obj.get !== 'function') continue;

    const tipo = obj.get(PDFName.of('Type'));
    if (tipo && tipo.asString && tipo.asString() === '/Sig' && obj.get(PDFName.of('ByteRange'))) {
      temAssinaturaCriptografica = true;
    }

    const subtype = obj.get(PDFName.of('Subtype'));
    const ft = obj.get(PDFName.of('FT'));
    if (
      subtype &&
      subtype.asString &&
      subtype.asString() === '/Widget' &&
      ft &&
      ft.asString &&
      ft.asString() === '/Sig'
    ) {
      widgetRef = ref;
      widgetDict = obj;
    }
  }

  let widget = null;
  if (widgetRef && widgetDict) {
    const rectObj = widgetDict.get(PDFName.of('Rect'));
    const rect = rectObj && rectObj.asArray ? rectObj.asArray().map((n) => n.asNumber()) : null;

    let pageIndex = null;
    const paginas = pdfDoc.getPages();
    for (let i = 0; i < paginas.length; i++) {
      const annots = paginas[i].node.Annots ? paginas[i].node.Annots() : null;
      if (!annots) continue;
      for (let j = 0; j < annots.size(); j++) {
        const r = annots.get(j);
        if (r && r.objectNumber === widgetRef.objectNumber) {
          pageIndex = i;
        }
      }
    }

    if (rect) {
      widget = { rect, pageIndex };
    }
  }

  return { temAssinaturaCriptografica, widget };
}

async function localizarAreaEsperadaAssinatura(caminhoPdf) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(caminhoPdf));
  const documento = await pdfjsLib.getDocument({ data }).promise;

  for (let i = 1; i <= documento.numPages; i++) {
    const pagina = await documento.getPage(i);
    const conteudo = await pagina.getTextContent();

    let voluntario = null;
    let coordenacao = null;
    for (const item of conteudo.items) {
      const texto = item.str.trim();
      if (texto === 'Voluntário(a)') voluntario = item;
      if (texto === 'Coordenação da ação') coordenacao = item;
    }

    if (voluntario && coordenacao) {
      return {
        pageIndex: i - 1,
        xMin: 210,
        xMax: 548,
        yMin: coordenacao.transform[5],
        yMax: voluntario.transform[5] + 25,
      };
    }
  }

  return null;
}

function pontoDentroDaArea(rectWidget, area) {
  const cx = (rectWidget[0] + rectWidget[2]) / 2;
  const cy = (rectWidget[1] + rectWidget[3]) / 2;
  return cx >= area.xMin && cx <= area.xMax && cy >= area.yMin && cy <= area.yMax;
}

async function validarTermoDevolvido(caminhoPdf) {
  const bytes = fs.readFileSync(caminhoPdf);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const { temAssinaturaCriptografica, widget } = inspecionarObjetosPdf(pdfDoc);

  if (!temAssinaturaCriptografica) {
    return {
      valido: false,
      motivo:
        'Não encontrei uma assinatura digital nesse PDF. Envie o arquivo já assinado pelo gov.br ' +
        '(o processo de assinatura no site do gov.br gera esse PDF assinado).',
    };
  }

  if (!widget) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        'Encontrei a assinatura digital, mas não consegui confirmar automaticamente onde ela foi ' +
        'posicionada no documento. Encaminhei para o RH revisar manualmente.',
    };
  }

  const areaEsperada = await localizarAreaEsperadaAssinatura(caminhoPdf);
  if (!areaEsperada || areaEsperada.pageIndex !== widget.pageIndex) {
    return {
      valido: false,
      motivo:
        'A assinatura não parece estar na página correta do documento (linha "Voluntário(a)" da tabela ' +
        'ACEITE E CONCORDÂNCIA, terceira página do termo). Confira o tutorial de assinatura e refaça.',
    };
  }

  if (!pontoDentroDaArea(widget.rect, areaEsperada)) {
    return {
      valido: false,
      motivo:
        'A assinatura foi colocada fora da linha "Voluntário(a)" da tabela. Ela precisa ficar exatamente ' +
        'nessa linha, não em qualquer lugar da página — confira o tutorial de assinatura e refaça.',
    };
  }

  const dataEncontrada = await lerCampoFormulario(pdfDoc);

  if (!dataEncontrada) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        'Não consegui ler automaticamente o campo de data desse PDF (pode ter sido achatado por algum ' +
        'editor). Encaminhei para o RH revisar manualmente.',
    };
  }

  if (!validarData(dataEncontrada)) {
    return {
      valido: false,
      motivo: `A data "${dataEncontrada}" não é uma data válida. Use o formato dd/mm/aaaa.`,
    };
  }

  const hoje = dataHojeBrasil();
  if (dataEncontrada !== hoje) {
    return {
      valido: false,
      motivo:
        `A data preenchida no termo (${dataEncontrada}) não é a data de hoje (${hoje}). ` +
        'A data de assinatura precisa ser o mesmo dia em que você está enviando o arquivo. ' +
        'Corrija o campo, assine novamente pelo gov.br e reenvie.',
    };
  }

  return { valido: true };
}

module.exports = { validarTermoDevolvido, dataHojeBrasil };