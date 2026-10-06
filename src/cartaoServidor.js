const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');

const LARGURA = 1000;
const ALTURA = 320;

async function baixarImagem(url) {
  const resposta = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(resposta.data);
}

function quebrarNome(ctx, nome, maxLargura, fonte) {
  ctx.font = fonte;
  if (ctx.measureText(nome).width <= maxLargura) return [nome];

  const palavras = nome.split(' ');
  let linha1 = '';
  let i = 0;
  for (; i < palavras.length; i++) {
    const tentativa = linha1 ? `${linha1} ${palavras[i]}` : palavras[i];
    if (ctx.measureText(tentativa).width > maxLargura && linha1) break;
    linha1 = tentativa;
  }

  let linha2 = palavras.slice(i).join(' ');
  if (linha2 && ctx.measureText(linha2).width > maxLargura) {
    while (linha2.length > 1 && ctx.measureText(linha2 + '…').width > maxLargura) {
      linha2 = linha2.slice(0, -1);
    }
    linha2 += '…';
  }

  return linha2 ? [linha1, linha2] : [linha1];
}

function desenharCircuitos(ctx, cor) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;
  ctx.lineWidth = 2;

  const linhas = [
    [40, 60, 130, 60],
    [40, 260, 150, 260],
    [860, 50, 950, 50],
    [830, 270, 950, 270],
  ];
  for (const [x1, y1, x2, y2] of linhas) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x2, y2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function desenharEscudoMascote(ctx, cx, cy, escala, corEscudo, feliz) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(escala, escala);

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = corEscudo;
  ctx.beginPath();
  ctx.moveTo(0, -95);
  ctx.bezierCurveTo(45, -80, 85, -70, 85, -40);
  ctx.bezierCurveTo(85, 30, 45, 85, 0, 105);
  ctx.bezierCurveTo(-45, 85, -85, 30, -85, -40);
  ctx.bezierCurveTo(-85, -70, -45, -80, 0, -95);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();

  ctx.fillStyle = '#141a33';
  ctx.beginPath();
  ctx.arc(-28, -15, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(28, -15, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#141a33';
  if (feliz) {
    ctx.arc(0, 5, 30, 0.15 * Math.PI, 0.85 * Math.PI);
  } else {
    ctx.moveTo(-22, 20);
    ctx.quadraticCurveTo(0, 12, 22, 20);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(20,26,51,0.55)';
  ctx.beginPath();
  ctx.roundRect(-16, 45, 32, 26, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 45, 13, Math.PI, 0, false);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(20,26,51,0.55)';
  ctx.stroke();

  ctx.restore();
}

function desenharIconeMovimento(ctx, x, y, entrada, cor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (entrada) {
    ctx.beginPath();
    ctx.moveTo(-16, 10);
    ctx.lineTo(0, -14);
    ctx.lineTo(16, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, 22);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    ctx.lineTo(0, 16);
    ctx.lineTo(16, -8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(0, -18);
    ctx.stroke();
  }
  ctx.restore();
}

async function gerarCartao({ tipo, nome, discordTag, avatarUrl }) {
  const canvas = createCanvas(LARGURA, ALTURA);
  const ctx = canvas.getContext('2d');

  const ehEntrada = tipo === 'entrada';
  const corBase1 = ehEntrada ? '#0b1020' : '#1a1408';
  const corBase2 = ehEntrada ? '#1c3f9e' : '#8a5a12';
  const corAccent = ehEntrada ? '#5b9bff' : '#f0a93a';
  const corEscudo = ehEntrada ? '#2F6FED' : '#d98a2b';
  const rotulo = ehEntrada ? 'EMBARCOU NO SERVIDOR' : 'DESEMBARCOU DO SERVIDOR';

  const raioCard = 28;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, LARGURA, ALTURA, raioCard);
  ctx.clip();

  const grad = ctx.createLinearGradient(0, 0, LARGURA, ALTURA);
  grad.addColorStop(0, corBase1);
  grad.addColorStop(1, corBase2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  desenharCircuitos(ctx, corAccent);
  desenharEscudoMascote(ctx, 830, ALTURA / 2, 1.15, corEscudo, ehEntrada);

  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(2, 2, LARGURA - 4, ALTURA - 4, raioCard);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.stroke();

  const avatarBuffer = avatarUrl.startsWith('http')
    ? await baixarImagem(avatarUrl)
    : require('fs').readFileSync(avatarUrl);
  const avatarImg = await loadImage(avatarBuffer);

  const tamanhoAvatar = 190;
  const ax = 70;
  const ay = (ALTURA - tamanhoAvatar) / 2;
  const cx = ax + tamanhoAvatar / 2;
  const cy = ay + tamanhoAvatar / 2;

  const anelGrad = ctx.createLinearGradient(ax, ay, ax + tamanhoAvatar, ay + tamanhoAvatar);
  anelGrad.addColorStop(0, corAccent);
  anelGrad.addColorStop(1, corEscudo);
  ctx.beginPath();
  ctx.arc(cx, cy, tamanhoAvatar / 2 + 7, 0, Math.PI * 2);
  ctx.fillStyle = anelGrad;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, tamanhoAvatar / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatarImg, ax, ay, tamanhoAvatar, tamanhoAvatar);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx + 68, cy + 68, 26, 0, Math.PI * 2);
  ctx.fillStyle = ehEntrada ? '#173a8a' : '#7a4a10';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  desenharIconeMovimento(ctx, cx + 68, cy + 68, ehEntrada, '#ffffff');

  const textX = ax + tamanhoAvatar + 60;

  ctx.font = 'bold 22px sans-serif';
  const larguraTextoRotulo = ctx.measureText(rotulo).width;

  ctx.beginPath();
  ctx.roundRect(textX - 16, 46, larguraTextoRotulo + 40, 38, 19);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();

  ctx.fillStyle = corAccent;
  ctx.fillText(rotulo, textX + 4, 72);

  ctx.fillStyle = '#ffffff';
  const fonteNome = 'bold 46px sans-serif';
  const maxLarguraNome = 700 - textX;
  const linhasNome = quebrarNome(ctx, nome, maxLarguraNome, fonteNome);

  ctx.font = fonteNome;
  if (linhasNome.length === 1) {
    ctx.fillText(linhasNome[0], textX, 155);
  } else {
    ctx.fillText(linhasNome[0], textX, 130);
    ctx.fillText(linhasNome[1], textX, 178);
  }

  const yTag = linhasNome.length === 1 ? 195 : 215;
  ctx.fillStyle = '#d8e2f5';
  ctx.font = '26px sans-serif';
  ctx.fillText(`@${discordTag}`, textX, yTag);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('CYBERGUARD', textX, ALTURA - 30);

  return canvas.toBuffer('image/png');
}

async function postarCartao(client, channelId, params) {
  if (!channelId) return;

  try {
    const canal = await client.channels.fetch(channelId);
    const buffer = await gerarCartao(params);
    await canal.send({ files: [{ attachment: buffer, name: `cartao_${params.tipo}.png` }] });
  } catch (err) {
    console.error('Erro ao postar cartão de entrada/saída:', err);
  }
}

module.exports = { gerarCartao, postarCartao };
