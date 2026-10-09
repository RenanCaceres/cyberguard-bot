'use strict';
// Imagem ilustrativa do ranking de horas: pódio com avatares (top 3) + barras de progresso (4º em diante).
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');

const W = 1000;
const FONTE = 'sans-serif';
const CORES = {
  ouro: ['#ffe27a', '#f0a500'],
  prata: ['#f2f4f8', '#9aa5b8'],
  bronze: ['#f0b27a', '#b0642a'],
};

const fmtHoras = (seg) => {
  const min = Math.round(seg / 60);
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

async function carregarAvatar(url) {
  if (!url) return null;
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    return await loadImage(Buffer.from(r.data));
  } catch {
    return null;
  }
}

function cortar(ctx, texto, max) {
  if (ctx.measureText(texto).width <= max) return texto;
  while (texto.length > 1 && ctx.measureText(texto + '…').width > max) texto = texto.slice(0, -1);
  return texto + '…';
}

function coroa(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, -20, 0, 20);
  g.addColorStop(0, '#ffe27a');
  g.addColorStop(1, '#f0a500');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-26, 16);
  ctx.lineTo(-30, -14);
  ctx.lineTo(-14, 0);
  ctx.lineTo(0, -22);
  ctx.lineTo(14, 0);
  ctx.lineTo(30, -14);
  ctx.lineTo(26, 16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function avatar(ctx, img, cx, cy, r, cor, nome) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, cor[0]);
  g.addColorStop(1, cor[1]);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#2a3566';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${r}px ${FONTE}`;
    ctx.textAlign = 'center';
    ctx.fillText((nome?.[0] ?? '?').toUpperCase(), cx, cy + r * 0.35);
  }
  ctx.restore();
}

// itens: [{ nome, seg, avatarUrl }] já ordenados (maior primeiro)
async function gerarRanking({ titulo, subtitulo, itens }) {
  const top = itens.slice(0, 3);
  const resto = itens.slice(3, 10);
  const PODIO_H = 430;
  const LINHA_H = 64;
  const H = 150 + PODIO_H + (resto.length ? 40 + resto.length * LINHA_H : 0) + 60;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // fundo
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 28);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(1, '#1c3f9e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc((i * 211) % W, (i * 137) % H, 3 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // cabeçalho
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 44px ${FONTE}`;
  ctx.fillText(titulo, W / 2, 70);
  ctx.fillStyle = '#9fc0ff';
  ctx.font = `24px ${FONTE}`;
  ctx.fillText(subtitulo, W / 2, 110);

  if (!itens.length) {
    ctx.fillStyle = '#d8e2f5';
    ctx.font = `bold 30px ${FONTE}`;
    ctx.fillText('Ninguém registrou ponto neste período ainda.', W / 2, 260);
    return canvas.toBuffer('image/png');
  }

  // pódio: 2º (esq), 1º (centro), 3º (dir)
  const avatares = await Promise.all(top.map((t) => carregarAvatar(t.avatarUrl)));
  const base = 150 + PODIO_H; // chão do pódio
  const slots = [
    { i: 1, x: 190, h: 150, cor: CORES.prata, r: 62 },
    { i: 0, x: 500, h: 215, cor: CORES.ouro, r: 76 },
    { i: 2, x: 810, h: 110, cor: CORES.bronze, r: 56 },
  ];
  for (const s of slots) {
    const t = top[s.i];
    if (!t) continue;
    const topo = base - s.h;
    const larg = 250;
    const g = ctx.createLinearGradient(0, topo, 0, base);
    g.addColorStop(0, s.cor[0]);
    g.addColorStop(1, s.cor[1]);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(s.x - larg / 2, topo, larg, s.h, [18, 18, 0, 0]);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(11,16,32,0.75)';
    ctx.font = `bold 84px ${FONTE}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(s.i + 1), s.x, topo + s.h / 2 + 30);

    const cy = topo - s.r - 78;
    avatar(ctx, avatares[s.i], s.x, cy, s.r, s.cor, t.nome);
    if (s.i === 0) coroa(ctx, s.x, cy - s.r - 26, 1.1);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 28px ${FONTE}`;
    ctx.fillText(cortar(ctx, t.nome, 270), s.x, topo - 38);
    ctx.fillStyle = s.cor[0];
    ctx.font = `bold 26px ${FONTE}`;
    ctx.fillText(fmtHoras(t.seg), s.x, topo - 8);
  }

  // 4º em diante: barras proporcionais ao líder
  if (resto.length) {
    const max = top[0].seg || 1;
    let y = base + 40;
    for (let i = 0; i < resto.length; i++) {
      const r = resto[i];
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(50, y, W - 100, LINHA_H - 10, 14);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#9fc0ff';
      ctx.font = `bold 28px ${FONTE}`;
      ctx.fillText(`${i + 4}º`, 72, y + 38);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 26px ${FONTE}`;
      ctx.fillText(cortar(ctx, r.nome, 330), 140, y + 38);

      const bx = 500;
      const bw = 340;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(bx, y + 17, bw, 20, 10);
      ctx.fill();
      const gb = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      gb.addColorStop(0, '#5b9bff');
      gb.addColorStop(1, '#a56bff');
      ctx.fillStyle = gb;
      ctx.beginPath();
      ctx.roundRect(bx, y + 17, Math.max(14, bw * Math.min(1, r.seg / max)), 20, 10);
      ctx.fill();

      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = `bold 26px ${FONTE}`;
      ctx.fillText(fmtHoras(r.seg), W - 72, y + 38);
      y += LINHA_H;
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `bold 20px ${FONTE}`;
  ctx.fillText('CYBERGUARD • RANKING DE HORAS', W / 2, H - 24);

  return canvas.toBuffer('image/png');
}

module.exports = { gerarRanking };
