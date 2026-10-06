const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const MARGEM = 50;
const TAMANHO_PAGINA = [595.28, 841.89]; // A4 em pontos
const COR_TITULO = rgb(0.15, 0.15, 0.55);
const COR_SECAO = rgb(0.2, 0.2, 0.2);
const COR_TEXTO = rgb(0.1, 0.1, 0.1);

/**
 * Gera um PDF a partir do markdown simples retornado pelo Gemini (## seções, listas com "-",
 * checkboxes "- [ ]") e salva em outputDir. Retorna o caminho do arquivo gerado.
 */
async function gerarPdfAta({ titulo, dataFormatada, participantesNomes, ataMarkdown, outputDir }) {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let pagina = doc.addPage(TAMANHO_PAGINA);
  const largura = TAMANHO_PAGINA[0];
  let y = TAMANHO_PAGINA[1] - MARGEM;

  function novaPaginaSeNecessario(alturaNecessaria) {
    if (y - alturaNecessaria < MARGEM) {
      pagina = doc.addPage(TAMANHO_PAGINA);
      y = TAMANHO_PAGINA[1] - MARGEM;
    }
  }

  function escreverLinha(texto, { font, tamanho, cor, indent = 0, espacoDepois = 4 }) {
    novaPaginaSeNecessario(tamanho + espacoDepois);
    pagina.drawText(texto, {
      x: MARGEM + indent,
      y,
      size: tamanho,
      font,
      color: cor,
    });
    y -= tamanho + espacoDepois;
  }

  // Quebra um parágrafo em linhas que cabem na largura útil da página
  function quebrarLinhas(texto, font, tamanho, larguraMaxima) {
    const palavras = texto.split(/\s+/);
    const linhas = [];
    let linhaAtual = '';

    for (const palavra of palavras) {
      const tentativa = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
      const largura = font.widthOfTextAtSize(tentativa, tamanho);
      if (largura > larguraMaxima && linhaAtual) {
        linhas.push(linhaAtual);
        linhaAtual = palavra;
      } else {
        linhaAtual = tentativa;
      }
    }
    if (linhaAtual) linhas.push(linhaAtual);
    return linhas;
  }

  function escreverParagrafo(texto, { font = fontRegular, tamanho = 11, cor = COR_TEXTO, indent = 0, espacoDepois = 8 } = {}) {
    const larguraMaxima = largura - MARGEM * 2 - indent;
    const linhas = quebrarLinhas(texto, font, tamanho, larguraMaxima);
    for (const linha of linhas) {
      escreverLinha(linha, { font, tamanho, cor, indent, espacoDepois: 3 });
    }
    y -= espacoDepois - 3;
  }

  // --- Cabeçalho ---
  escreverLinha(titulo, { font: fontBold, tamanho: 18, cor: COR_TITULO, espacoDepois: 6 });
  escreverLinha(dataFormatada, { font: fontRegular, tamanho: 10, cor: rgb(0.4, 0.4, 0.4), espacoDepois: 4 });
  if (participantesNomes?.length) {
    escreverParagrafo(`Participantes: ${participantesNomes.join(', ')}`, {
      tamanho: 10,
      cor: rgb(0.4, 0.4, 0.4),
      espacoDepois: 14,
    });
  }

  // linha separadora
  novaPaginaSeNecessario(10);
  pagina.drawLine({
    start: { x: MARGEM, y },
    end: { x: largura - MARGEM, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 16;

  // --- Corpo (markdown simples) ---
  const linhasMarkdown = ataMarkdown.split('\n');
  for (const linhaBruta of linhasMarkdown) {
    const linha = linhaBruta.trim();
    if (!linha) {
      y -= 4;
      continue;
    }

    if (linha.startsWith('## ')) {
      novaPaginaSeNecessario(24);
      y -= 6;
      escreverLinha(linha.replace('## ', ''), {
        font: fontBold,
        tamanho: 13,
        cor: COR_SECAO,
        espacoDepois: 8,
      });
    } else if (linha.startsWith('- [ ]') || linha.startsWith('- [x]')) {
      const marcado = linha.startsWith('- [x]');
      const conteudo = linha.replace(/^- \[[ x]\]\s*/, '');
      escreverParagrafo(`${marcado ? '[x]' : '[ ]'} ${conteudo}`, { indent: 10, espacoDepois: 5 });
    } else if (linha.startsWith('- ') || linha.startsWith('* ')) {
      escreverParagrafo(`•  ${linha.slice(2)}`, { indent: 10, espacoDepois: 5 });
    } else {
      escreverParagrafo(linha, { espacoDepois: 8 });
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const nomeArquivo = `ata_${Date.now()}.pdf`;
  const caminhoCompleto = path.join(outputDir, nomeArquivo);
  const bytes = await doc.save();
  fs.writeFileSync(caminhoCompleto, bytes);

  return caminhoCompleto;
}

module.exports = { gerarPdfAta };
