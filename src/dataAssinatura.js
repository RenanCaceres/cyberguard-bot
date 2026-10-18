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

async function extrairInfoDataDoTermo(pdfDoc, caminhoPdf) {
  // 1. Tentar ler do campo interativo de formulário AcroForm (se o leitor/assinador não tiver achatado)
  const valorForm = await lerCampoFormulario(pdfDoc);
  if (valorForm) {
    const match = valorForm.match(/([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4})/);
    const dataFormatada = match ? normalizarData(match[1], match[2], match[3]) : null;
    return {
      preenchida: true,
      valorBruto: valorForm,
      dataFormatada: dataFormatada && validarData(dataFormatada) ? dataFormatada : null,
    };
  }

  // 2. Extrair anotações e texto posicionado na linha "Local: ... | Data:" usando pdfjs-dist
  // IMPORTANTE: Nunca ler a data do carimbo gov.br (que contém a hora da assinatura),
  // pois se o aluno deixou o campo "Data:" em branco no documento, isso deve ser acusado!
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(caminhoPdf));
    const documento = await pdfjsLib.getDocument({ data }).promise;

    let paginaAceite = 1;
    let yAceite = Infinity;
    for (let i = 1; i <= documento.numPages; i++) {
      const pagina = await documento.getPage(i);
      const conteudo = await pagina.getTextContent();
      for (const item of conteudo.items) {
        if (/ACEITE E CONCORD[ÂA]NCIA/i.test(item.str)) {
          paginaAceite = i;
          yAceite = item.transform[5];
        }
      }
    }

    for (let i = 1; i <= documento.numPages; i++) {
      const pagina = await documento.getPage(i);
      const annots = await pagina.getAnnotations();

      // 2A. Verificar anotação do campo 'data_assinatura' no pdfjs
      for (const a of annots) {
        if (a.fieldName === 'data_assinatura' || a.fieldType === 'Tx') {
          const val = (a.fieldValue || a.contents || '').toString().trim();
          if (val) {
            const match = val.match(/([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4})/);
            const dataFormatada = match ? normalizarData(match[1], match[2], match[3]) : null;
            return {
              preenchida: true,
              valorBruto: val,
              dataFormatada: dataFormatada && validarData(dataFormatada) ? dataFormatada : null,
            };
          }
        }
      }

      // 2B. Localizar o rótulo "Data:" na seção ACEITE E CONCORDÂNCIA (ao lado de "Local:")
      const conteudo = await pagina.getTextContent();
      const itens = conteudo.items
        .map((it) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          w: it.width || 0,
          h: it.height || 0,
        }))
        .filter((it) => it.str.trim().length > 0);

      const candidatosData = itens.filter(
        (it) =>
          /\bData:/i.test(it.str) &&
          !/[0-9]{2}:[0-9]{2}:[0-9]{2}/.test(it.str)
      );

      for (const labelData of candidatosData) {
        // Confirmar que é a linha do cabeçalho de data (mesma linha de "Local:" ou próxima a "ACEITE E CONCORDÂNCIA")
        const temLocalNaLinha = itens.some(
          (it) => Math.abs(it.y - labelData.y) <= 12 && /Local:/i.test(it.str)
        );
        const pertoDeAceite = i === paginaAceite && Math.abs(labelData.y - yAceite) <= 40;
        if (!temLocalNaLinha && !pertoDeAceite) {
          continue;
        }

        // Verificar se há alguma anotação FreeText / caixa de texto adicionada sobre o campo Data:
        for (const a of annots) {
          if (a.fieldType === 'Sig') continue;
          if (Array.isArray(a.rect) && a.rect.length === 4) {
            const cx = (a.rect[0] + a.rect[2]) / 2;
            const cy = (a.rect[1] + a.rect[3]) / 2;
            if (Math.abs(cy - labelData.y) <= 20 && cx >= labelData.x - 10) {
              const val = (a.fieldValue || a.contents || a.textContent || '').toString().trim();
              if (val) {
                const match = val.match(/([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4})/);
                const dataFormatada = match ? normalizarData(match[1], match[2], match[3]) : null;
                return {
                  preenchida: true,
                  valorBruto: val,
                  dataFormatada: dataFormatada && validarData(dataFormatada) ? dataFormatada : null,
                };
              }
            }
          }
        }

        // Coletar todos os fragmentos de texto na mesma linha horizontal à direita de "Data:"
        // (cobre PDFs achatados e datas fragmentadas pelo LibreOffice/leitor de PDF)
        const itensMesmaLinha = itens
          .filter(
            (it) =>
              Math.abs(it.y - labelData.y) <= 10 &&
              it.x >= labelData.x - 2 &&
              !/[0-9]{2}:[0-9]{2}:[0-9]{2}/.test(it.str) &&
              !/gov\.br|iti\.gov|assinado digitalmente/i.test(it.str)
          )
          .sort((a, b) => a.x - b.x);

        const textoLinha = itensMesmaLinha.map((it) => it.str).join(' ');
        const posData = textoLinha.replace(/^.*?\bData:\s*/i, '').replace(/_+/g, '').trim();

        if (posData.length > 0) {
          const match = posData.match(/([0-9\s]{1,4})\s*\/\s*([0-9\s]{1,4})\s*\/\s*([0-9\s]{4})/);
          const dataFormatada = match ? normalizarData(match[1], match[2], match[3]) : null;
          return {
            preenchida: true,
            valorBruto: posData,
            dataFormatada: dataFormatada && validarData(dataFormatada) ? dataFormatada : null,
          };
        }
      }
    }
  } catch (err) {
    console.error('Erro ao extrair texto do PDF para ler data:', err);
  }

  return { preenchida: false, valorBruto: null, dataFormatada: null };
}

async function extrairDataDoTermo(pdfDoc, caminhoPdf) {
  const info = await extrairInfoDataDoTermo(pdfDoc, caminhoPdf);
  return info.dataFormatada || info.valorBruto || null;
}

function inspecionarObjetosPdf(pdfDoc) {
  const objetos = pdfDoc.context.enumerateIndirectObjects();

  let temAssinaturaCriptografica = false;
  const widgetsEncontrados = [];

  for (const [ref, obj] of objetos) {
    if (!obj || typeof obj.get !== 'function') continue;

    const tipo = obj.get(PDFName.of('Type'));
    const byteRange = obj.get(PDFName.of('ByteRange'));
    const contents = obj.get(PDFName.of('Contents'));
    const subFilter = obj.get(PDFName.of('SubFilter'));

    if (
      byteRange &&
      contents &&
      ((tipo && tipo.asString && tipo.asString() === '/Sig') || subFilter)
    ) {
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

    if (pageIndex === null) {
      const pRef = dict.get(PDFName.of('P'));
      if (pRef && typeof pRef.objectNumber === 'number') {
        for (let i = 0; i < paginas.length; i++) {
          if (paginas[i].ref && paginas[i].ref.objectNumber === pRef.objectNumber) {
            pageIndex = i;
            break;
          }
        }
      }
    }

    if (rect) {
      widgets.push({ rect, pageIndex });
    }
  }

  return { temAssinaturaCriptografica, widgets, widget: widgets[0] || null };
}

async function extrairMetadadosPdfjs(caminhoPdf) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(caminhoPdf));
  const documento = await pdfjsLib.getDocument({ data }).promise;

  let paginaAceite = null;
  let yAceite = Infinity;
  let temTextoCarimboGovBr = false;
  const sigWidgetsPdfjs = [];
  const paginasItens = [];

  for (let i = 1; i <= documento.numPages; i++) {
    const pagina = await documento.getPage(i);
    const conteudo = await pagina.getTextContent();
    const annots = await pagina.getAnnotations();

    for (const a of annots) {
      if (
        a.fieldType === 'Sig' ||
        (a.subtype === 'Widget' && /^Signature/i.test(a.fieldName || ''))
      ) {
        if (Array.isArray(a.rect) && a.rect.length === 4) {
          sigWidgetsPdfjs.push({ pageIndex: i - 1, rect: a.rect });
        }
      }
    }

    const itens = [];
    for (const item of conteudo.items) {
      const texto = item.str.trim();
      if (!texto) continue;
      if (/validar\.iti\.gov\.br|Documento assinado digitalmente/i.test(texto)) {
        temTextoCarimboGovBr = true;
      }
      if (/ACEITE E CONCORD[ÂA]NCIA/i.test(texto)) {
        paginaAceite = i;
        yAceite = item.transform[5];
      }
      itens.push({
        texto,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
        height: item.height || 0,
      });
    }
    paginasItens.push({ pageNumber: i, pageIndex: i - 1, itens });
  }

  // Localizar a tabela de assinaturas na seção ACEITE E CONCORDÂNCIA.
  // Os rótulos da tabela ("Voluntário(a)", "Coordenação da ação", "DIREC")
  // ficam sempre na primeira coluna da tabela (x entre 50 e 120) e após o título
  // "ACEITE E CONCORDÂNCIA", evitando falsos positivos com o texto corrido da página 2
  // (onde "voluntário(a)" aparece em minúsculo em x=121 e "DIREC" em x=352).
  let areaEsperada = null;
  const inicioBusca = paginaAceite || 1;

  for (let i = inicioBusca; i <= documento.numPages; i++) {
    const { pageIndex, itens } = paginasItens[i - 1];

    let voluntario = null;
    let coordenacao = null;
    let direc = null;

    for (const item of itens) {
      if (i === paginaAceite && item.y > yAceite + 5) continue;
      if (item.x < 50 || item.x > 120) continue;

      if (/^Volunt[aá]rio\(a\)$/.test(item.texto)) voluntario = item;
      if (/^Coordena[cç][aã]o da a[cç][aã]o$/i.test(item.texto)) coordenacao = item;
      if (/^DIREC$/i.test(item.texto)) direc = item;
    }

    if (voluntario && (coordenacao || direc)) {
      const yMin = coordenacao ? coordenacao.y + 7 : voluntario.y - 40;
      const yMax = voluntario.y + 32;
      areaEsperada = {
        pageIndex,
        xMin: 185,
        xMax: 560,
        yMin,
        yMax,
        voluntarioY: voluntario.y,
        coordenacaoY: coordenacao ? coordenacao.y : null,
        direcY: direc ? direc.y : null,
      };
      break;
    }
  }

  return {
    numPages: documento.numPages,
    areaEsperada,
    sigWidgetsPdfjs,
    temTextoCarimboGovBr,
  };
}

async function localizarAreaEsperadaAssinatura(caminhoPdf) {
  const { areaEsperada } = await extrairMetadadosPdfjs(caminhoPdf);
  return areaEsperada;
}

function pontoDentroDaArea(rectWidget, area) {
  const cx = (rectWidget[0] + rectWidget[2]) / 2;
  const cy = (rectWidget[1] + rectWidget[3]) / 2;
  return cx >= area.xMin && cx <= area.xMax && cy >= area.yMin && cy <= area.yMax;
}

async function validarTermoDevolvido(caminhoPdf) {
  const bytes = fs.readFileSync(caminhoPdf);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const { temAssinaturaCriptografica, widgets: widgetsPdfLib } = inspecionarObjetosPdf(pdfDoc);
  const { areaEsperada, sigWidgetsPdfjs, temTextoCarimboGovBr } = await extrairMetadadosPdfjs(caminhoPdf);
  const infoData = await extrairInfoDataDoTermo(pdfDoc, caminhoPdf);

  // Caso o PDF não possua a tabela ACEITE E CONCORDÂNCIA (documento errado ou layout irreconhecível)
  if (!areaEsperada) {
    return {
      valido: false,
      revisarManualmente: false,
      motivo:
        'Não consegui localizar a tabela de assinaturas ("ACEITE E CONCORDÂNCIA") neste PDF. ' +
        'Certifique-se de enviar o Termo de Adesão ao Serviço Voluntário gerado pelo bot.',
    };
  }

  const erros = [];
  let revisarManualmente = false;

  // 1. Validar presença e posição da assinatura digital gov.br
  const widgets =
    widgetsPdfLib && widgetsPdfLib.length > 0 && widgetsPdfLib.every((w) => w.pageIndex !== null)
      ? widgetsPdfLib
      : sigWidgetsPdfjs.length > 0
      ? sigWidgetsPdfjs
      : widgetsPdfLib || [];

  if (!temAssinaturaCriptografica) {
    if (temTextoCarimboGovBr) {
      erros.push(
        'O PDF contém o texto visual do gov.br, mas perdeu a assinatura digital criptográfica ' +
          '(isso acontece quando se usa "Imprimir > Salvar como PDF" após assinar). ' +
          'Envie o arquivo PDF original baixado diretamente do portal gov.br.'
      );
    } else {
      erros.push(
        'Não encontrei a assinatura digital gov.br neste PDF. ' +
          'O documento precisa ser assinado digitalmente pelo portal gov.br (assinador.iti.br).'
      );
    }
  } else if (!widgets || widgets.length === 0) {
    revisarManualmente = true;
    erros.push(
      'Encontrei a assinatura digital criptográfica, mas não consegui identificar automaticamente as coordenadas dela na página.'
    );
  } else {
    const widgetNaArea = widgets.find(
      (w) => w.pageIndex === areaEsperada.pageIndex && pontoDentroDaArea(w.rect, areaEsperada)
    );

    if (!widgetNaArea) {
      const widgetsNaPaginaCorreta = widgets.filter((w) => w.pageIndex === areaEsperada.pageIndex);
      const numPagEsperada = areaEsperada.pageIndex + 1;

      if (widgetsNaPaginaCorreta.length === 0) {
        const pagAssinada = widgets[0]?.pageIndex != null ? widgets[0].pageIndex + 1 : 'outra página';
        erros.push(
          `A assinatura digital foi colocada na página ${pagAssinada}, mas ela deve ficar na página ${numPagEsperada}, ` +
            'dentro da linha "Voluntário(a)" da tabela ACEITE E CONCORDÂNCIA.'
        );
      } else {
        const w = widgetsNaPaginaCorreta[0];
        const cy = (w.rect[1] + w.rect[3]) / 2;
        if (areaEsperada.coordenacaoY != null && cy < areaEsperada.yMin) {
          erros.push(
            'A assinatura digital foi posicionada na linha errada da tabela (no espaço reservado à "Coordenação da ação" ou "DIREC"). ' +
              'Ela deve ficar na primeira linha da tabela, ao lado de "Voluntário(a)".'
          );
        } else {
          erros.push(
            'A assinatura digital foi posicionada fora do campo da linha "Voluntário(a)" na tabela ACEITE E CONCORDÂNCIA. ' +
              'Posicione o selo da assinatura dentro da linha "Voluntário(a)".'
          );
        }
      }
    }
  }

  // 2. Validar preenchimento e validade do campo "Data:"
  if (!infoData.preenchida) {
    erros.push(
      'O campo "Data:" (ao lado de "Local:", na seção ACEITE E CONCORDÂNCIA) não foi preenchido. ' +
        'Você deve preencher a data (formato dd/mm/aaaa) no documento antes de assiná-lo no gov.br.'
    );
  } else if (!infoData.dataFormatada) {
    erros.push(
      `O valor preenchido no campo "Data:" ("${infoData.valorBruto}") não é uma data válida. ` +
        `Preencha uma data real no formato dd/mm/aaaa (ex: ${dataHojeBrasil()}).`
    );
  } else {
    const dataEncontrada = infoData.dataFormatada;
    const [d, m, y] = dataEncontrada.split('/').map(Number);
    const dataAssinatura = new Date(y, m - 1, d, 12, 0, 0);

    const [dHoje, mHoje, yHoje] = dataHojeBrasil().split('/').map(Number);
    const fimDeHoje = new Date(yHoje, mHoje - 1, dHoje, 23, 59, 59, 999);

    if (dataAssinatura > fimDeHoje) {
      erros.push(
        `A data preenchida no termo (${dataEncontrada}) é uma data futura. ` +
          `Preencha a data atual (${dataHojeBrasil()}) e assine novamente.`
      );
    } else {
      const limitePassado = new Date(yHoje, mHoje - 1, dHoje, 0, 0, 0);
      limitePassado.setDate(limitePassado.getDate() - 90);
      if (dataAssinatura < limitePassado) {
        erros.push(
          `A data preenchida no termo (${dataEncontrada}) é de mais de 90 dias atrás. ` +
            'O termo precisa conter a data recente da assinatura.'
        );
      }
    }
  }

  if (erros.length > 0) {
    const motivo = erros.length === 1 ? erros[0] : erros.map((e, idx) => `${idx + 1}. ${e}`).join('\n');
    return {
      valido: false,
      revisarManualmente,
      erros,
      motivo,
    };
  }

  return { valido: true, data: infoData.dataFormatada };
}

module.exports = {
  validarTermoDevolvido,
  dataHojeBrasil,
  extrairDataDoTermo,
  extrairInfoDataDoTermo,
  inspecionarObjetosPdf,
  localizarAreaEsperadaAssinatura,
  pontoDentroDaArea,
};