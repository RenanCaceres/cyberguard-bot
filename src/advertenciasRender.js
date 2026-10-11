'use strict';
const axios = require('axios');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

try {
  GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVu-Bold');
  GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu');
} catch {
  // segue com a fonte padrão do sistema
}

// Cache rápido de avatares em memória (TTL de 15 minutos) para abrir o painel instantaneamente
const avatarCache = new Map();
const AVATAR_TTL_MS = 15 * 60 * 1000;

async function baixarAvatar(url) {
  if (!url) return null;
  const cached = avatarCache.get(url);
  if (cached && Date.now() - cached.em < AVATAR_TTL_MS) {
    return cached.img;
  }
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    const img = await loadImage(Buffer.from(res.data));
    avatarCache.set(url, { img, em: Date.now() });
    return img;
  } catch {
    return null;
  }
}

function truncarTexto(ctx, texto, larguraMax) {
  const str = String(texto || '');
  if (ctx.measureText(str).width <= larguraMax) return str;
  let truncado = str;
  while (truncado.length > 1 && ctx.measureText(truncado + '…').width > larguraMax) {
    truncado = truncado.slice(0, -1);
  }
  return truncado + '…';
}

function retanguloArredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function desenharAvatarCircular(ctx, imagem, x, y, tamanho, inicial = '?') {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + tamanho / 2, y + tamanho / 2, tamanho / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (imagem) {
    ctx.drawImage(imagem, x, y, tamanho, tamanho);
  } else {
    ctx.fillStyle = '#2e4d7a';
    ctx.fillRect(x, y, tamanho, tamanho);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px DejaVu-Bold, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(inicial).charAt(0).toUpperCase(), x + tamanho / 2, y + tamanho / 2);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + tamanho / 2, y + tamanho / 2, tamanho / 2, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#d85a30';
  ctx.stroke();
  ctx.restore();
}

/**
 * Renderiza uma imagem estilo catálogo com a foto do Discord e o verdadeiro nome
 * de cada integrante da página atual (até 25 integrantes por página).
 *
 * @param {Array<{ id: string, numero: number, nomeReal: string, nomeDiscord: string, avatarUrl: string }>} itens
 * @param {{ paginaAtual: number, totalPaginas: number, totalMembros: number }} meta
 * @returns {Promise<Buffer>}
 */
async function renderizarListaMembrosAdvertencia(itens, { paginaAtual = 1, totalPaginas = 1, totalMembros = 0 } = {}) {
  const imagens = await Promise.all(itens.map((item) => baixarAvatar(item.avatarUrl)));

  const COLUNAS = Math.min(3, Math.max(1, itens.length));
  const LINHAS = Math.ceil(itens.length / COLUNAS);

  const LARGURA_CARD = 330;
  const ALTURA_CARD = 74;
  const GAP_X = 16;
  const GAP_Y = 12;
  const MARGEM_X = 28;
  const TOPO_HEADER = 76;
  const RODAPE = 24;

  const largura = MARGEM_X * 2 + COLUNAS * LARGURA_CARD + (COLUNAS - 1) * GAP_X;
  const altura = TOPO_HEADER + LINHAS * ALTURA_CARD + Math.max(0, LINHAS - 1) * GAP_Y + RODAPE;

  const canvas = createCanvas(largura, altura);
  const ctx = canvas.getContext('2d');

  // Fundo escuro igual ao padrão visual da hierarquia
  const grad = ctx.createLinearGradient(0, 0, largura, altura);
  grad.addColorStop(0, '#081832');
  grad.addColorStop(1, '#122b52');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, largura, altura);

  // Cabeçalho
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px DejaVu-Bold, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Selecione o integrante a ser advertido', MARGEM_X, 20);

  ctx.fillStyle = '#9fb4d6';
  ctx.font = '13px DejaVu, sans-serif';
  ctx.fillText(
    `Mostrando ${itens.length} de ${totalMembros} integrante(s) • Página ${paginaAtual}/${totalPaginas}`,
    MARGEM_X,
    46
  );

  // Cards dos integrantes (Foto do Discord + Nome Verdadeiro)
  const TAM_AVATAR = 50;

  itens.forEach((item, idx) => {
    const col = idx % COLUNAS;
    const row = Math.floor(idx / COLUNAS);
    const x = MARGEM_X + col * (LARGURA_CARD + GAP_X);
    const y = TOPO_HEADER + row * (ALTURA_CARD + GAP_Y);

    ctx.save();
    retanguloArredondado(ctx, x, y, LARGURA_CARD, ALTURA_CARD, 12);
    ctx.fillStyle = '#16294d';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2e4d7a';
    ctx.stroke();
    ctx.restore();

    const avatarX = x + 12;
    const avatarY = y + (ALTURA_CARD - TAM_AVATAR) / 2;
    desenharAvatarCircular(ctx, imagens[idx], avatarX, avatarY, TAM_AVATAR, item.nomeReal);

    const textoX = avatarX + TAM_AVATAR + 12;
    const larguraMaxTexto = LARGURA_CARD - (textoX - x) - 12;

    // Número + Nome Real em destaque
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px DejaVu-Bold, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const titulo = truncarTexto(ctx, `${item.numero}. ${item.nomeReal}`, larguraMaxTexto);
    ctx.fillText(titulo, textoX, y + 18);

    // Subtítulo discreto com o @ do Discord para referência
    ctx.fillStyle = '#9fb4d6';
    ctx.font = '12px DejaVu, sans-serif';
    const subtitulo = truncarTexto(ctx, `@${item.nomeDiscord}`, larguraMaxTexto);
    ctx.fillText(subtitulo, textoX, y + 40);
  });

  return canvas.toBuffer('image/png');
}

module.exports = { renderizarListaMembrosAdvertencia };
