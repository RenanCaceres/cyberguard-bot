const fs = require('fs');
const { PDFDocument, PDFName } = require('pdf-lib');
const { validarData } = require('./validators');

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

function dataHojeBrasil() {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return formatter.format(new Date());
}

function normalizarData(diaStr, mesStr, anoStr) {
  const d = diaStr.replace(/\s+/g, '').padStart(2, '0');
  const m = mesStr.replace(/\s+/g, '').padStart(2, '0');
  const y = anoStr.replace(/\s+/g, '');
  if (d.length === 2 && m.length === 2 && y.length === 4) {
    return `${d}/${m}/${y}`;
  }
  return null;
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

async function extrairDataDoTermo(pdfDoc, caminhoPdf) {
  // 1. Tentar ler do campo interativo de formulário (se o leitor/assinador não tiver achatado)
  const valorForm = await lerCampoFormulario(pdfDoc);
  if (valorForm && validarData(valorForm)) {
    return valorForm;
  }

  // 2. Extrair o texto completo das páginas usando pdfjs-dist
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(caminhoPdf));
    const documento = await pdfjsLib.getDocument({ data }).promise;

    let textoCompleto = '';
    for (let i = 1; i <= documento.numPages; i++) {
      const pagina = await documento.getPage(i);
      const conteudo = await pagina.getTextContent();
      textoCompleto += ' ' + conteudo.items.map((it) => it.str).join(' ');
    }

    // A. Procurar por Data: DD/MM/AAAA na seção de Aceite / Local
    const matchAceite = textoCompleto.match(
      /(?:Local:.*?Data:|ACEITE E CONCORD[ÂA]NCIA[\s\S]*?Data:)\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4})/i
    );
    if (matchAceite) {
      const dataFormatada = normalizarData(matchAceite[1], matchAceite[2], matchAceite[3]);
      if (dataFormatada && validarData(dataFormatada)) return dataFormatada;
    }

    // B. Procurar por "Data: DD/MM/AAAA" geral (ano >= 2024 para descartar nascimento)
    const matchesData = [
      ...textoCompleto.matchAll(/(?:Data|data):\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4})/gi),
    ];
    for (const m of matchesData) {
      const dataFormatada = normalizarData(m[1], m[2], m[3]);
      if (dataFormatada && validarData(dataFormatada)) {
        const ano = parseInt(dataFormatada.split('/')[2], 10);
        if (ano >= 2024) return dataFormatada;
      }
    }

    // C. Carimbo de assinatura do gov.br (contém DD/MM/AAAA HH:MM:SS)
    const matchGov = textoCompleto.match(/([0-9]{2})\/([0-9]{2})\/([0-9]{4})\s+[0-9]{2}:[0-9]{2}:[0-9]{2}/);
    if (matchGov) {
      const dataFormatada = normalizarData(matchGov[1], matchGov[2], matchGov[3]);
      if (dataFormatada && validarData(dataFormatada)) return dataFormatada;
    }
  } catch (err) {
    console.error('Erro ao extrair texto do PDF para ler data:', err);
  }

  return null;
}

function inspecionarObjetosPdf(pdfDoc) {
  const objetos = pdfDoc.context.enumerateIndirectObjects();

  let temAssinaturaCriptografica = false;
  const widgetsEncontrados = [];

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
      widgetsEncontrados.push({ ref, dict: obj });
    }
  }

  const widgets = [];
  const paginas = pdfDoc.getPages();

  for (const { ref, dict } of widgetsEncontrados) {
    const rectObj = dict.get(PDFName.of('Rect'));
    const rect = rectObj && rectObj.asArray ? rectObj.asArray().map((n) => n.asNumber()) : null;

    let pageIndex = null;
    for (let i = 0; i < paginas.length; i++) {
      const annots = paginas[i].node.Annots ? paginas[i].node.Annots() : null;
      if (!annots) continue;
      for (let j = 0; j < annots.size(); j++) {
        const r = annots.get(j);
        if (r && r.objectNumber === ref.objectNumber) {
          pageIndex = i;
        }
      }
    }

    if (rect) {
      widgets.push({ rect, pageIndex });
    }
  }

  return { temAssinaturaCriptografica, widgets, widget: widgets[0] || null };
}

async function localizarAreaEsperadaAssinatura(caminhoPdf) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(caminhoPdf));
  const documento = await pdfjsLib.getDocument({ data }).promise;

  for (let i = 1; i <= documento.numPages; i++) {
    const pagina = await documento.getPage(i);
    const conteudo = await pagina.getTextContent();
    const textoPagina = conteudo.items.map((it) => it.str).join(' ');

    // Deve ser a página da seção ACEITE E CONCORDÂNCIA
    if (!/aceite e concord[âa]ncia/i.test(textoPagina)) {
      continue;
    }

    let voluntario = null;
    let coordenacao = null;
    for (const item of conteudo.items) {
      const texto = item.str.trim();
      if (/^Volunt[aá]rio\(a\)$/i.test(texto)) voluntario = item;
      if (/^Coordena[cç][aã]o da a[cç][aã]o$/i.test(texto)) coordenacao = item;
    }

    if (voluntario && coordenacao) {
      return {
        pageIndex: i - 1,
        xMin: 210,
        xMax: 548,
        yMin: Math.min(coordenacao.transform[5], voluntario.transform[5]),
        yMax: Math.max(coordenacao.transform[5], voluntario.transform[5]) + 30,
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

  const { temAssinaturaCriptografica, widgets } = inspecionarObjetosPdf(pdfDoc);

  if (!temAssinaturaCriptografica) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        'Não encontrei uma assinatura digital gov.br nesse PDF. ' +
        'O arquivo precisa ser assinado pelo portal gov.br (assinador de documentos).',
    };
  }

  if (!widgets || widgets.length === 0) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        'Encontrei a assinatura digital, mas não consegui confirmar automaticamente a posição dela no documento.',
    };
  }

  const areaEsperada = await localizarAreaEsperadaAssinatura(caminhoPdf);
  if (!areaEsperada) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        'Não consegui localizar a tabela de assinaturas ("ACEITE E CONCORDÂNCIA") no layout do PDF.',
    };
  }

  // Verifica se pelo menos um widget de assinatura está na página e área corretas
  const widgetNaArea = widgets.find(
    (w) => w.pageIndex === areaEsperada.pageIndex && pontoDentroDaArea(w.rect, areaEsperada)
  );

  if (!widgetNaArea) {
    const naPagina = widgets.some((w) => w.pageIndex === areaEsperada.pageIndex);
    if (!naPagina) {
      return {
        valido: false,
        revisarManualmente: true,
        motivo:
          'A assinatura digital não está na página correta (terceira página, linha "Voluntário(a)" da tabela ACEITE E CONCORDÂNCIA).',
      };
    }
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        'A assinatura digital foi posicionada fora da linha "Voluntário(a)" da tabela. Ela deve ficar exatamente nessa linha.',
    };
  }

  // Extrair e validar a data
  const dataEncontrada = await extrairDataDoTermo(pdfDoc, caminhoPdf);

  if (!dataEncontrada) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        'Não consegui ler automaticamente o campo de data de assinatura desse documento.',
    };
  }

  if (!validarData(dataEncontrada)) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo: `A data "${dataEncontrada}" encontrada no termo não é uma data válida. Use o formato dd/mm/aaaa.`,
    };
  }

  const [d, m, y] = dataEncontrada.split('/').map(Number);
  const dataAssinatura = new Date(y, m - 1, d);
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);

  if (dataAssinatura > hoje) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        `A data preenchida no termo (${dataEncontrada}) é uma data futura. Corrija o campo e assine novamente.`,
    };
  }

  // Verifica se a assinatura não tem mais de 60 dias
  const limitePassado = new Date();
  limitePassado.setDate(limitePassado.getDate() - 60);
  if (dataAssinatura < limitePassado) {
    return {
      valido: false,
      revisarManualmente: true,
      motivo:
        `A data preenchida no termo (${dataEncontrada}) é de mais de 60 dias atrás. O termo precisa ser recente.`,
    };
  }

  return { valido: true, data: dataEncontrada };
}

module.exports = {
  validarTermoDevolvido,
  dataHojeBrasil,
  extrairDataDoTermo,
  inspecionarObjetosPdf,
  localizarAreaEsperadaAssinatura,
  pontoDentroDaArea,
};