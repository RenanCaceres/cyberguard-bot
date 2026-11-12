#!/usr/bin/env node
'use strict';

/**
 * CyberGuard Bot — Conversor de Documentação Markdown para PDF Padronizado
 *
 * Converte arquivos Markdown (tutoriais de módulos, manuais operacionais e guias)
 * em PDFs institucionais A4 utilizando o motor `DocBuilder` (scripts/pdfDocBuilder.js).
 */

const fs = require('fs');
const path = require('path');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');

function limparInline(texto) {
  if (!texto) return '';
  return String(texto)
    // Remove links file:// mantendo apenas o rótulo legível
    .replace(/\[([^\]]+)\]\(file:\/\/[^)]+\)/g, '$1')
    // Links http/https para "Rótulo (url)"
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    // Remove marcadores de negrito/itálico/código inline (incluindo duplos backticks)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/``([^]*?)``/g, '$1')
    .replace(/`/g, '')
    // Converte bullet interno em hífen para compatibilidade total com Latin-1 do PDF
    .replace(/\s*\u2022\s*/g, ' - ')
    // Remove emojis/símbolos fora do Latin-1 que deixariam espaços sobrando
    .replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u2192\u2194]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resumirMermaidParaTexto(linhasMermaid) {
  const nodes = {};
  const passos = [];

  for (const raw of linhasMermaid) {
    const line = raw.trim();
    if (!line || line.startsWith('flowchart') || line.startsWith('graph') || line.startsWith('subgraph') || line === 'end') {
      continue;
    }

    // Extrai definições de nós como A["Texto"], B{"Texto"}, C("Texto")
    const regexNode = /\b([A-Za-z0-9_]+)\s*(?:\["([^"]+)"\]|\{"([^"]+)"\}|\("([^"]+)"\)|\[([^\]]+)\])/g;
    let m;
    while ((m = regexNode.exec(line)) !== null) {
      const id = m[1];
      const label = m[2] || m[3] || m[4] || m[5] || id;
      nodes[id] = limparInline(label);
    }

    // Extrai arestas A --> B ou A -- "condição" --> B ou A -->|condição| B
    const regexEdge = /([A-Za-z0-9_]+)(?:\s*\[[^\]]*\]|\s*\{[^}]*\}|\s*\([^)]*\))?\s*(?:--\s*"([^"]+)"\s*-->|-->\|([^|]+)\||-->)\s*([A-Za-z0-9_]+)/;
    const edge = line.match(regexEdge);
    if (edge) {
      const src = nodes[edge[1]] || edge[1];
      const cond = limparInline(edge[2] || edge[3] || '');
      const dst = nodes[edge[4]] || edge[4];
      if (cond) {
        passos.push(`${src}  --[${cond}]-->  ${dst}`);
      } else {
        passos.push(`${src}  -->  ${dst}`);
      }
    }
  }

  if (passos.length === 0) {
    return linhasMermaid.map(limparInline).filter(Boolean);
  }
  return passos;
}

function calcularLargurasColunas(cabecalho, linhas) {
  const numCols = cabecalho.length;
  const pesos = cabecalho.map((col, idx) => {
    let maxLen = col.length;
    for (const r of linhas) {
      const cellLen = (r[idx] || '').length;
      if (cellLen > maxLen) maxLen = cellLen;
    }
    return Math.max(8, Math.min(maxLen, 55));
  });

  const soma = pesos.reduce((a, b) => a + b, 0) || numCols;
  const minLarg = Math.min(80, Math.floor(LARGURA_UTIL / numCols));
  let larguras = pesos.map((p) => Math.max(minLarg, Math.floor((p / soma) * LARGURA_UTIL)));

  // Ajusta última coluna para fechar exatamente em LARGURA_UTIL
  const totalAtual = larguras.reduce((a, b) => a + b, 0);
  larguras[larguras.length - 1] += LARGURA_UTIL - totalAtual;

  return cabecalho.map((nome, idx) => ({
    nome,
    largura: larguras[idx],
  }));
}

async function converterMarkdownParaPdf(conteudoMd, caminhoPdfDestino, opcoes = {}) {
  const linhas = String(conteudoMd).replace(/\r\n/g, '\n').split('\n');

  let tituloPrincipal = opcoes.titulo || 'Manual Oficial CyberGuard';
  let subtituloCabecalho = opcoes.subtitulo || '';
  let tagCabecalho = opcoes.tag || 'CyberGuard Bot • Documentação Oficial';
  let rodapeDoc = opcoes.rodape || 'CyberGuard UTFPR • Documentação Técnica e Operacional';
  const metadados = [];

  // Pré-varredura para extrair H1, subtítulo inicial e bloco de metadados (>)
  let idxInicioCorpo = 0;
  let achouH1 = false;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!achouH1 && l.startsWith('# ')) {
      tituloPrincipal = limparInline(l.slice(2));
      achouH1 = true;
      idxInicioCorpo = i + 1;
      continue;
    }
    if (achouH1) {
      if (!l) {
        idxInicioCorpo = i + 1;
        continue;
      }
      if (!subtituloCabecalho && l.startsWith('**') && l.endsWith('**')) {
        subtituloCabecalho = limparInline(l);
        rodapeDoc = subtituloCabecalho;
        idxInicioCorpo = i + 1;
        continue;
      }
      if (l.startsWith('>')) {
        metadados.push(limparInline(l.replace(/^>\s*/, '')));
        idxInicioCorpo = i + 1;
        continue;
      }
      if (l === '---') {
        idxInicioCorpo = i + 1;
        continue;
      }
      break;
    }
  }

  const doc = new DocBuilder(tituloPrincipal, rodapeDoc);
  await doc.init();

  const descCabecalho =
    metadados.find((m) => m.toLowerCase().startsWith('objetivo:'))?.replace(/^objetivo:\s*/i, '') ||
    subtituloCabecalho ||
    'Guia operacional, fluxo de trabalho e diretrizes de conformidade LGPD.';

  doc.cabecalhoDocumento(tagCabecalho, tituloPrincipal, descCabecalho);

  const outrosMetadados = metadados.filter((m) => !m.toLowerCase().startsWith('objetivo:'));
  if (outrosMetadados.length > 0) {
    doc.alerta('Ficha Técnica do Módulo', outrosMetadados.join('  |  '), 'info');
  }

  let secCounter = 0;
  let i = idxInicioCorpo;

  while (i < linhas.length) {
    const linha = linhas[i];
    const trimmed = linha.trim();

    if (!trimmed || trimmed === '---') {
      i++;
      continue;
    }

    // Bloco de código / Mermaid
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim().toLowerCase();
      const bloco = [];
      i++;
      while (i < linhas.length && !linhas[i].trim().startsWith('```')) {
        bloco.push(linhas[i]);
        i++;
      }
      i++; // consome fechamento ```

      if (lang === 'mermaid') {
        const passosFluxo = resumirMermaidParaTexto(bloco);
        if (passosFluxo.length > 0) {
          doc.subsecao('Fluxo Operacional (Etapas do Diagrama)');
          for (const passo of passosFluxo) {
            doc.listaItem(passo, { marcador: '>' });
          }
        }
      } else {
        const codigoLimpo = bloco
          .map((b) => b.replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trimEnd())
          .filter((b) => b.trim().length > 0);
        if (codigoLimpo.length > 0) {
          doc.subsecao(lang ? `Comandos / Exemplo (${lang})` : 'Comandos / Código');
          for (const linhaCod of codigoLimpo) {
            doc.listaItem(linhaCod.trim(), { marcador: '$' });
          }
        }
      }
      continue;
    }

    // Seção (## )
    if (trimmed.startsWith('## ')) {
      let tituloSec = limparInline(trimmed.slice(3));
      const matchNum = tituloSec.match(/^(\d+)\.\s+(.*)$/);
      if (matchNum) {
        secCounter = Number(matchNum[1]);
        doc.secao(matchNum[1], matchNum[2]);
      } else {
        secCounter++;
        doc.secao(String(secCounter), tituloSec);
      }
      i++;
      continue;
    }

    // Subseção (### )
    if (trimmed.startsWith('### ')) {
      doc.subsecao(limparInline(trimmed.slice(4)));
      i++;
      continue;
    }

    // Tabela Markdown
    if (trimmed.startsWith('|')) {
      const linhasTabela = [];
      while (i < linhas.length && linhas[i].trim().startsWith('|')) {
        linhasTabela.push(linhas[i].trim());
        i++;
      }

      const linhasValidas = linhasTabela.filter((row) => !/^\|[\s:|-]+\|$/.test(row));
      if (linhasValidas.length >= 2) {
        const parseRow = (row) =>
          row
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => limparInline(cell));

        const cabecalho = parseRow(linhasValidas[0]);
        const dados = linhasValidas.slice(1).map(parseRow);
        const colunas = calcularLargurasColunas(cabecalho, dados);
        doc.tabela(colunas, dados);
      }
      continue;
    }

    // Blockquote (> )
    if (trimmed.startsWith('>')) {
      const notas = [];
      while (i < linhas.length && linhas[i].trim().startsWith('>')) {
        notas.push(limparInline(linhas[i].trim().replace(/^>\s*/, '')));
        i++;
      }
      const textoNota = notas.filter(Boolean).join('\n');
      if (textoNota) {
        doc.alerta('Observação Importante', textoNota, 'aviso');
      }
      continue;
    }

    // Lista não ordenada (- ou * )
    if (/^[-*•]\s+/.test(trimmed)) {
      const nivel = /^\s{2,}[-*•]/.test(linha) ? 2 : 1;
      const textoItem = limparInline(trimmed.replace(/^[-*•]\s+/, ''));
      if (textoItem) {
        doc.listaItem(textoItem, { nivel });
      }
      i++;
      continue;
    }

    // Lista ordenada (1. , 2. )
    const matchOrd = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (matchOrd) {
      const textoItem = limparInline(matchOrd[2]);
      if (textoItem) {
        doc.listaItem(textoItem, { marcador: `${matchOrd[1]}.`, nivel: 1 });
      }
      i++;
      continue;
    }

    // Parágrafo contínuo
    const paraLinhas = [];
    while (i < linhas.length) {
      const cur = linhas[i].trim();
      if (
        !cur ||
        cur === '---' ||
        cur.startsWith('#') ||
        cur.startsWith('```') ||
        cur.startsWith('|') ||
        cur.startsWith('>') ||
        /^[-*•]\s+/.test(cur) ||
        /^\d+\.\s+/.test(cur)
      ) {
        break;
      }
      paraLinhas.push(cur);
      i++;
    }
    const textoPara = limparInline(paraLinhas.join(' '));
    if (textoPara) {
      // Itálico de rodapé (ex: *Documento gerado...*)
      const ehRodape = paraLinhas.length === 1 && /^\*[^*]+\*$/.test(paraLinhas[0]);
      doc.paragrafo(textoPara, { espacoDepois: ehRodape ? 4 : 8 });
    }
  }

  const dirDestino = path.dirname(caminhoPdfDestino);
  if (!fs.existsSync(dirDestino)) {
    fs.mkdirSync(dirDestino, { recursive: true });
  }

  await doc.salvar(caminhoPdfDestino);
  return caminhoPdfDestino;
}

async function converterArquivoMdParaPdf(caminhoMd, caminhoPdfDestino, opcoes = {}) {
  const mdAbs = path.resolve(caminhoMd);
  if (!fs.existsSync(mdAbs)) {
    throw new Error(`Arquivo Markdown não encontrado: ${mdAbs}`);
  }
  const conteudo = fs.readFileSync(mdAbs, 'utf8');
  const destino = caminhoPdfDestino
    ? path.resolve(caminhoPdfDestino)
    : mdAbs.replace(/\.md$/i, '.pdf');

  return converterMarkdownParaPdf(conteudo, destino, opcoes);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Uso: node scripts/mdToPdf.js <arquivo.md> [saida.pdf]');
    process.exit(1);
  }
  converterArquivoMdParaPdf(args[0], args[1])
    .then((out) => console.log(`✅ PDF gerado: ${out}`))
    .catch((err) => {
      console.error('❌ Erro ao converter Markdown para PDF:', err);
      process.exit(1);
    });
}

module.exports = {
  converterMarkdownParaPdf,
  converterArquivoMdParaPdf,
  limparInline,
};
