const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

try {
  GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVu-Bold');
  GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu');
} catch (err) {
  // segue o baile
}

const LARGURA = 2400;
const MARGEM = 60;
const GAP_COLUNA = 28;
const COLUNAS = 4;
const LARGURA_COLUNA = (LARGURA - MARGEM * 2 - GAP_COLUNA * (COLUNAS - 1)) / COLUNAS;

const COR_FUNDO_TOPO = '#081832';
const COR_FUNDO_BASE = '#122b52';
const COR_CARD = '#16294d';
const COR_BORDA = '#2e4d7a';
const COR_TEXTO = '#ffffff';
const COR_TEXTO_SEC = '#9fb4d6';
const COR_ACCENT = '#4c8dff';
const COR_LIDER = '#ffc94c';

const AVATAR_TAMANHO = 68;
const AVATAR_TAMANHO_LIDER = 90;
const AVATAR_TAMANHO_PRESIDENTE = 180;
const ITEM_LARGURA = 122;
const ITEM_ALTURA = 106;
const ITEM_ALTURA_LIDER = 128;

function desenharFundoGradiente(ctx, largura, altura) {
  const grad = ctx.createLinearGradient(0, 0, largura, altura);
  grad.addColorStop(0, COR_FUNDO_TOPO);
  grad.addColorStop(1, COR_FUNDO_BASE);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, largura, altura);
}

function desenharAvatarCircular(ctx, imagem, x, y, tamanho, corBorda, espessuraBorda = 4) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + tamanho / 2, y + tamanho / 2, tamanho / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (imagem) {
    ctx.drawImage(imagem, x, y, tamanho, tamanho);
  } else {
    ctx.fillStyle = '#3a5580';
    ctx.fillRect(x, y, tamanho, tamanho);
  }
  ctx.restore();

  if (corBorda) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + tamanho / 2, y + tamanho / 2, tamanho / 2, 0, Math.PI * 2);
    ctx.lineWidth = espessuraBorda;
    ctx.strokeStyle = corBorda;
    ctx.stroke();
    ctx.restore();
  }
}

function truncarTexto(ctx, texto, larguraMax) {
  if (ctx.measureText(texto).width <= larguraMax) return texto;
  let truncado = texto;
  while (truncado.length > 1 && ctx.measureText(truncado + '…').width > larguraMax) {
    truncado = truncado.slice(0, -1);
  }
  return truncado + '…';
}

function desenharPessoa(ctx, pessoa, centroX, y, { tamanho = AVATAR_TAMANHO, corBorda = null, coroa = false, larguraLabel = ITEM_LARGURA } = {}) {
  desenharAvatarCircular(ctx, pessoa.imagem, centroX - tamanho / 2, y, tamanho, corBorda);
  if (coroa) {
    ctx.font = '22px DejaVu-Bold, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COR_LIDER;
    ctx.fillText('★', centroX, y - 8);
  }

  ctx.font = coroa ? 'bold 14px DejaVu-Bold, sans-serif' : '13px DejaVu-Bold, sans-serif';
  ctx.fillStyle = COR_TEXTO;
  ctx.textAlign = 'center';
  const nomeExibido = truncarTexto(ctx, pessoa.nome, larguraLabel - 4);
  ctx.fillText(nomeExibido, centroX, y + tamanho + 19);
}

function desenharLinhaLideres(ctx, lideres, xCentroCard, yInicio) {
  if (lideres.length === 0) return 0;

  const larguraTotal = lideres.length * ITEM_LARGURA;
  let x = xCentroCard - larguraTotal / 2;

  for (const lider of lideres) {
    desenharPessoa(ctx, lider, x + ITEM_LARGURA / 2, yInicio, {
      tamanho: AVATAR_TAMANHO_LIDER,
      corBorda: COR_LIDER,
      coroa: true,
    });
    x += ITEM_LARGURA;
  }

  return ITEM_ALTURA_LIDER;
}

function desenharGradeMembros(ctx, membros, xCentroCard, yInicio, larguraDisponivel) {
  if (membros.length === 0) return 0;

  const porLinha = Math.max(1, Math.floor(larguraDisponivel / ITEM_LARGURA));
  let y = yInicio;

  for (let i = 0; i < membros.length; i += porLinha) {
    const linha = membros.slice(i, i + porLinha);
    let x = xCentroCard - (linha.length * ITEM_LARGURA) / 2;

    for (const pessoa of linha) {
      desenharPessoa(ctx, pessoa, x + ITEM_LARGURA / 2, y, {});
      x += ITEM_LARGURA;
    }

    y += ITEM_ALTURA;
  }

  const linhasUsadas = Math.ceil(membros.length / porLinha);
  return linhasUsadas * ITEM_ALTURA;
}

function medirAlturaCard(time, largura) {
  const lideres = time.membros.filter((m) => m.lider);
  const membros = time.membros.filter((m) => !m.lider);

  const larguraInterna = largura - 32;
  const porLinha = Math.max(1, Math.floor(larguraInterna / ITEM_LARGURA));
  const alturaCabecalho = 54;
  const alturaLideres = lideres.length > 0 ? ITEM_ALTURA_LIDER + 10 : 0;
  const linhasMembros = membros.length > 0 ? Math.ceil(membros.length / porLinha) : 0;
  const alturaMembros = linhasMembros * ITEM_ALTURA;

  let alturaConteudo = alturaLideres + alturaMembros;
  if (alturaConteudo === 0) alturaConteudo = 30;

  return alturaCabecalho + alturaConteudo + 26;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function desenharCardTime(ctx, time, x, y, largura, altura) {
  const lideres = time.membros.filter((m) => m.lider);
  const membros = time.membros.filter((m) => !m.lider);

  ctx.fillStyle = COR_CARD;
  ctx.strokeStyle = time.cor || COR_BORDA;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, largura, altura, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = time.cor || COR_ACCENT;
  roundRect(ctx, x, y, largura, 7, 3.5);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = 'bold 19px DejaVu-Bold, sans-serif';
  ctx.fillStyle = COR_TEXTO;
  const nomeExibido = truncarTexto(ctx, time.nome, largura - 24);
  ctx.fillText(nomeExibido, x + largura / 2, y + 34);

  const centroX = x + largura / 2;
  let cursorY = y + 58;

  if (lideres.length === 0 && membros.length === 0) {
    ctx.font = '14px DejaVu, sans-serif';
    ctx.fillStyle = COR_TEXTO_SEC;
    ctx.fillText('Sem integrantes', centroX, cursorY + 20);
    return;
  }

  if (lideres.length > 0) {
    const usada = desenharLinhaLideres(ctx, lideres, centroX, cursorY);
    cursorY += usada + 10;

    if (membros.length > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 20, cursorY - 4);
      ctx.lineTo(x + largura - 20, cursorY - 4);
      ctx.stroke();
    }
  }

  if (membros.length > 0) {
    desenharGradeMembros(ctx, membros, centroX, cursorY, largura - 32);
  }
}

async function renderizarHierarquia(dados) {
  const { presidente, times } = dados;

  // --------------------------------------------------------------------
  // Layout atual assume EXATAMENTE 6 times, nesta ordem (ver ORDEM_TIMES
  // em hierarquia.js):
  //   0-3: Social Media & Copy, Recursos Humanos, Design, Observatório
  //        -> uma linha com 4 cards (linha1)
  //   4:   Hardware Hacking     -> linha2, coluna esquerda
  //   5:   Hacking Ético        -> linha2, coluna direita
  // Se a quantidade ou a ordem dos times mudar, ajuste os índices abaixo.
  // --------------------------------------------------------------------
  const linha1 = times.slice(0, 4);
  const hardwareHacking = times[4];
  const hackingEtico = times[5];

  const alturaLinha1 = Math.max(...linha1.map((t) => medirAlturaCard(t, LARGURA_COLUNA)));

  // linha2 tem só 2 cards, cada um ocupando a largura de 2 colunas da linha1
  const larguraLinha2 = LARGURA_COLUNA * 2 + GAP_COLUNA;
  const alturaHardware = medirAlturaCard(hardwareHacking, larguraLinha2);
  const alturaEtico = medirAlturaCard(hackingEtico, larguraLinha2);
  const alturaLinha2 = Math.max(alturaHardware, alturaEtico);

  const alturaTitulo = 76;
  const alturaPresidente = AVATAR_TAMANHO_PRESIDENTE + 80;
  const alturaConectores = 76;
  const gapEntreLinhas = 34;

  const altura = Math.round(
    alturaTitulo +
      alturaPresidente +
      alturaConectores +
      alturaLinha1 +
      gapEntreLinhas +
      alturaLinha2 +
      MARGEM
  );

  const canvas = createCanvas(LARGURA, altura);
  const ctx = canvas.getContext('2d');

  desenharFundoGradiente(ctx, LARGURA, altura);

  ctx.textAlign = 'center';
  ctx.fillStyle = COR_TEXTO;
  ctx.font = 'bold 46px DejaVu-Bold, sans-serif';
  ctx.fillText('HIERARQUIA — CYBERGUARD', LARGURA / 2, 58);

  let y = alturaTitulo;
  const centroX = LARGURA / 2;

  desenharAvatarCircular(
    ctx,
    presidente.imagem,
    centroX - AVATAR_TAMANHO_PRESIDENTE / 2,
    y,
    AVATAR_TAMANHO_PRESIDENTE,
    COR_ACCENT,
    7
  );
  ctx.font = 'bold 28px DejaVu-Bold, sans-serif';
  ctx.fillStyle = COR_TEXTO;
  ctx.fillText(presidente.nome, centroX, y + AVATAR_TAMANHO_PRESIDENTE + 36);
  ctx.font = 'bold 17px DejaVu-Bold, sans-serif';
  ctx.fillStyle = COR_ACCENT;
  ctx.fillText('PRESIDENTE', centroX, y + AVATAR_TAMANHO_PRESIDENTE + 60);

  y += alturaPresidente;

  const yTroncoTopo = y;
  const yBarra = y + 30;
  ctx.strokeStyle = COR_BORDA;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(centroX, yTroncoTopo - 10);
  ctx.lineTo(centroX, yBarra);
  ctx.stroke();

  const centrosColunas = [];
  for (let i = 0; i < COLUNAS; i++) {
    const x = MARGEM + i * (LARGURA_COLUNA + GAP_COLUNA);
    centrosColunas.push(x + LARGURA_COLUNA / 2);
  }

  ctx.beginPath();
  ctx.moveTo(centrosColunas[0], yBarra);
  ctx.lineTo(centrosColunas[COLUNAS - 1], yBarra);
  ctx.stroke();

  const yFimGalho = y + alturaConectores;
  for (const cx of centrosColunas) {
    ctx.beginPath();
    ctx.moveTo(cx, yBarra);
    ctx.lineTo(cx, yFimGalho);
    ctx.stroke();
  }

  y += alturaConectores;

  linha1.forEach((time, i) => {
    const x = MARGEM + i * (LARGURA_COLUNA + GAP_COLUNA);
    desenharCardTime(ctx, time, x, y, LARGURA_COLUNA, alturaLinha1);
  });

  const yLinha2 = y + alturaLinha1 + gapEntreLinhas;

  // Conector: o tronco central continua descendo por trás da linha 1 e se
  // ramifica de novo pra linha 2 (Hardware Hacking + Hacking Ético), pra
  // deixar claro que os dois também estão sob o presidente.
  const xHardware = MARGEM;
  const xEtico = MARGEM + larguraLinha2 + GAP_COLUNA;
  const centroHardwareX = xHardware + larguraLinha2 / 2;
  const centroEticoX = xEtico + larguraLinha2 / 2;

  const yTroncoLinha2 = yLinha2 - gapEntreLinhas / 2;
  ctx.strokeStyle = COR_BORDA;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(centroX, yBarra);
  ctx.lineTo(centroX, yTroncoLinha2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centroHardwareX, yTroncoLinha2);
  ctx.lineTo(centroEticoX, yTroncoLinha2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centroHardwareX, yTroncoLinha2);
  ctx.lineTo(centroHardwareX, yLinha2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centroEticoX, yTroncoLinha2);
  ctx.lineTo(centroEticoX, yLinha2);
  ctx.stroke();

  desenharCardTime(ctx, hardwareHacking, xHardware, yLinha2, larguraLinha2, alturaLinha2);
  desenharCardTime(ctx, hackingEtico, xEtico, yLinha2, larguraLinha2, alturaLinha2);

  return canvas.encode('png');
}

module.exports = { renderizarHierarquia };
