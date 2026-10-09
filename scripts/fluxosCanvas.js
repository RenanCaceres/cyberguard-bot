'use strict';
// Fluxogramas dos manuais: caixas coloridas + conectores em ângulo reto (estilo do manual original).
// Desenhados em unidades de 830 px de largura e exportados em alta resolução (escala 3x).
const { createCanvas } = require('@napi-rs/canvas');

const W = 830;
const ESCALA = 3;
const FONTE = 'sans-serif';

const TEMA = {
  azul:    { bg: '#dbe8ff', borda: '#2f6fed', txt: '#14213d' },
  laranja: { bg: '#ffeadb', borda: '#f08a24', txt: '#14213d' },
  verde:   { bg: '#dcf8e6', borda: '#22a352', txt: '#14213d' },
  cinza:   { bg: '#eef1f6', borda: '#6b7280', txt: '#14213d' },
};
const COR = { cinza: '#6b7280', verde: '#16a34a', vermelho: '#dc2626', azul: '#2f6fed' };

function nova(altura) {
  const canvas = createCanvas(W * ESCALA, altura * ESCALA);
  const ctx = canvas.getContext('2d');
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, altura);
  return { canvas, ctx, altura };
}

// linhas[0] em negrito; as demais, normais.
function caixa(ctx, x, y, w, h, tema, linhas) {
  const t = TEMA[tema];
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fillStyle = t.bg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = t.borda;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.txt;
  const passo = 17;
  const topo = y + h / 2 - ((linhas.length - 1) * passo) / 2;
  linhas.forEach((l, i) => {
    ctx.font = i === 0 ? `bold 13.5px ${FONTE}` : `13px ${FONTE}`;
    ctx.fillText(l, x + w / 2, topo + i * passo);
  });
  ctx.restore();
}

// Conector em ângulo reto: lista de pontos [x,y], seta no último.
function seta(ctx, pontos, cor = COR.cinza, { tracejada = false } = {}) {
  ctx.save();
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'miter';
  ctx.setLineDash(tracejada ? [5, 4] : []);

  const n = pontos.length;
  const [xf, yf] = pontos[n - 1];
  const [xp, yp] = pontos[n - 2];
  const ang = Math.atan2(yf - yp, xf - xp);
  const cab = 9;
  // a linha termina na base da cabeça para não "furar" a ponta
  const bx = xf - cab * Math.cos(ang);
  const by = yf - cab * Math.sin(ang);

  ctx.beginPath();
  ctx.moveTo(pontos[0][0], pontos[0][1]);
  for (let i = 1; i < n - 1; i++) ctx.lineTo(pontos[i][0], pontos[i][1]);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(xf, yf);
  ctx.lineTo(xf - cab * Math.cos(ang - 0.45), yf - cab * Math.sin(ang - 0.45));
  ctx.lineTo(xf - cab * Math.cos(ang + 0.45), yf - cab * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function rotulo(ctx, texto, x, y, cor = COR.cinza, alinhar = 'left') {
  ctx.save();
  ctx.font = `bold 12px ${FONTE}`;
  ctx.fillStyle = cor;
  ctx.textAlign = alinhar;
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y);
  ctx.restore();
}

function legenda(ctx, y, itens, nota) {
  ctx.save();
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, y);
  ctx.lineTo(W - 47, y);
  ctx.stroke();

  let x = 40;
  ctx.font = `13px ${FONTE}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const [tema, texto] of itens) {
    const t = TEMA[tema];
    ctx.beginPath();
    ctx.roundRect(x, y + 20, 22, 22, 5);
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = t.borda;
    ctx.stroke();
    ctx.fillStyle = '#14213d';
    ctx.fillText(texto, x + 30, y + 31);
    x += 30 + ctx.measureText(texto).width + 26;
  }
  if (nota) {
    ctx.font = `12px ${FONTE}`;
    ctx.fillStyle = COR.azul;
    ctx.fillText(nota, 40, y + 64);
  }
  ctx.restore();
}

const pronto = (n) => ({ buffer: n.canvas.toBuffer('image/png'), largura: W, altura: n.altura });

// ---------------------------------------------------------------------------------------
// 1) ADVERTÊNCIAS (visão 'lider' = "Você ..."; visão 'membro' = "O líder ...")
// ---------------------------------------------------------------------------------------
function fluxoAdvertencias({ visao = 'lider' } = {}) {
  const n = nova(735);
  const { ctx } = n;
  const lider = visao === 'lider';

  caixa(ctx, 240, 62, 342, 50, 'azul', [lider ? '1. Você abre a advertência' : '1. O líder abre a advertência']);
  seta(ctx, [[411, 112], [411, 156]]);

  caixa(ctx, 269, 156, 283, 56, 'laranja', [lider ? '2. O advertido recebe a mensagem' : '2. Você recebe a mensagem', 'Ciente  |  Não concordo']);

  // Ciente -> em vigência -> expirada
  seta(ctx, [[269, 190], [158, 190], [158, 262]], COR.verde);
  rotulo(ctx, 'Ciente', 200, 181, COR.verde);
  caixa(ctx, 66, 262, 185, 66, 'verde', ['EM VIGÊNCIA', 'vale por 90 dias']);
  seta(ctx, [[158, 328], [158, 366]]);
  caixa(ctx, 66, 366, 185, 66, 'cinza', ['EXPIRADA', 'após os 90 dias']);

  // 7 dias sem resposta
  seta(ctx, [[411, 212], [411, 262]]);
  rotulo(ctx, '7 dias sem resposta', 421, 244);
  caixa(ctx, 322, 262, 178, 66, 'cinza', ['SEM RESPOSTA']);
  seta(ctx, [[411, 328], [411, 357]]);
  caixa(ctx, 307, 357, 209, 84, 'azul', [lider ? 'Você escolhe:' : 'O líder escolhe:', 'Reenviar (volta ao 2)', 'ou Cancelar']);

  // Não concordo -> justificativa -> decisão
  seta(ctx, [[552, 206], [649, 206], [649, 262]], COR.vermelho);
  rotulo(ctx, 'Não concordo', 558, 196, COR.vermelho);
  caixa(ctx, 552, 262, 194, 66, 'laranja', [lider ? '3. O advertido escreve' : '3. Você escreve', 'a justificativa']);
  seta(ctx, [[649, 328], [649, 375]]);
  caixa(ctx, 538, 375, 223, 80, 'azul', [lider ? '4. Você decide' : '4. O líder decide', 'Contra-Argumentar,', 'Prosseguir ou Perdoar']);

  // Contra-argumentar: volta ao passo 2
  seta(ctx, [[761, 415], [773, 415], [773, 176], [552, 176]], COR.azul, { tracejada: true });
  rotulo(ctx, 'Contra-Argumentar: volta ao passo 2', 560, 164, COR.azul);

  // Prosseguir / Perdoar
  seta(ctx, [[589, 455], [589, 507]], COR.verde);
  rotulo(ctx, 'Prosseguir', 527, 477, COR.verde);
  caixa(ctx, 478, 507, 150, 66, 'verde', ['EM VIGÊNCIA', 'por 90 dias']);
  seta(ctx, [[693, 455], [693, 507]]);
  rotulo(ctx, 'Perdoar', 703, 477);
  caixa(ctx, 641, 507, 135, 66, 'cinza', ['PERDOADA', 'encerrada']);

  legenda(ctx, 641, [
    ['azul', lider ? 'Ação do líder' : 'Ação do líder'],
    ['laranja', 'Ação do advertido'],
    ['verde', 'Advertência vale'],
    ['cinza', 'Encerrada / aguardando'],
  ], 'Linha tracejada azul = a conversa continua: o advertido responde de novo (Ciente ou Não concordo).');

  return pronto(n);
}

// ---------------------------------------------------------------------------------------
// 2) PONTO — abrir e fechar (painel manual ou call de voz)
// ---------------------------------------------------------------------------------------
function fluxoPontoAbrirFechar() {
  const n = nova(720);
  const { ctx } = n;

  caixa(ctx, 90, 50, 260, 56, 'azul', ['A. Painel manual', 'clique em Abrir ponto']);
  caixa(ctx, 480, 50, 260, 56, 'azul', ['B. Call de voz', 'entre no canal de ponto']);

  seta(ctx, [[220, 106], [220, 203], [300, 203]]);
  seta(ctx, [[610, 106], [610, 203], [530, 203]]);

  caixa(ctx, 300, 170, 230, 66, 'azul', ['2. Você escolhe a tarefa', 'lista do Notion (painel ou DM)']);
  seta(ctx, [[415, 236], [415, 290]]);

  caixa(ctx, 300, 290, 230, 66, 'verde', ['3. PONTO ABERTO', 'as horas estão contando']);

  // esqueceu aberto -> teto
  seta(ctx, [[530, 323], [695, 323], [695, 410]]);
  rotulo(ctx, 'esqueceu aberto', 545, 313);
  caixa(ctx, 600, 410, 190, 66, 'cinza', ['ENCERRADO AUTOMÁTICO', 'teto de 8 horas']);

  // fechar
  seta(ctx, [[415, 356], [415, 410]]);
  rotulo(ctx, 'Fechar ponto (A) ou sair da call (B)', 425, 384);
  caixa(ctx, 270, 410, 290, 66, 'laranja', ['4. O bot pede o relato', 'progresso, o que fez e o que falta']);
  seta(ctx, [[415, 476], [415, 540]]);

  caixa(ctx, 240, 540, 350, 76, 'cinza', ['5. PONTO ENCERRADO', 'horas salvas no banco, no Notion,', 'na planilha e no log do Discord']);

  legenda(ctx, 640, [
    ['azul', 'Ação do membro'],
    ['laranja', 'Ação do bot'],
    ['verde', 'Ponto aberto'],
    ['cinza', 'Encerrado'],
  ]);

  return pronto(n);
}

// ---------------------------------------------------------------------------------------
// 3) PONTO — pergunta de atividade a cada 1 hora
// ---------------------------------------------------------------------------------------
function fluxoPontoVerificacao() {
  const n = nova(640);
  const { ctx } = n;

  caixa(ctx, 300, 50, 230, 56, 'verde', ['PONTO ABERTO', 'a cada 1 hora de ponto']);
  seta(ctx, [[415, 106], [415, 160]]);
  rotulo(ctx, 'passou 1 hora', 425, 134);

  caixa(ctx, 250, 160, 330, 66, 'laranja', ['O bot pergunta por DM', 'Você continua trabalhando?  (aviso 1, 2 ou 3)']);

  // Sim
  seta(ctx, [[250, 193], [150, 193], [150, 290]], COR.verde);
  rotulo(ctx, 'Sim', 205, 183, COR.verde);
  caixa(ctx, 50, 290, 200, 66, 'verde', ['PONTO CONTINUA ABERTO', 'o contador de avisos zera']);
  seta(ctx, [[50, 323], [26, 323], [26, 78], [300, 78]], COR.azul, { tracejada: true });
  rotulo(ctx, 'volta a contar 1 hora', 34, 66, COR.azul);

  // Não
  seta(ctx, [[415, 226], [415, 290]], COR.vermelho);
  rotulo(ctx, 'Não', 425, 262, COR.vermelho);
  caixa(ctx, 300, 290, 230, 66, 'cinza', ['ENCERRADO NA HORA', 'você recebe o botão do relato']);

  // Sem resposta
  seta(ctx, [[580, 193], [690, 193], [690, 290]]);
  rotulo(ctx, 'não respondeu', 596, 183);
  caixa(ctx, 590, 290, 200, 66, 'cinza', ['SEM RESPOSTA', 'repete a pergunta em 1 hora']);
  seta(ctx, [[690, 356], [690, 420]]);
  rotulo(ctx, 'no 3º aviso', 700, 392);
  caixa(ctx, 570, 420, 240, 66, 'cinza', ['ENCERRADO POR INATIVIDADE', 'você recebe uma mensagem']);

  legenda(ctx, 535, [
    ['laranja', 'Ação do bot'],
    ['verde', 'Ponto aberto'],
    ['cinza', 'Encerrado / aguardando'],
  ], 'Linha tracejada azul = o ponto segue aberto e a contagem de 1 hora recomeça.');

  return pronto(n);
}

// ---------------------------------------------------------------------------------------
// 4) AJUSTE DE PONTO PELO RH
// ---------------------------------------------------------------------------------------
function fluxoAjusteRH() {
  const n = nova(690);
  const { ctx } = n;

  const passos = [
    ['1. O RH clica em Ajustar ponto', 'botão do painel de ponto'],
    ['2. O RH escolhe o integrante', 'menu de usuários do Discord'],
    ['3. O RH escolhe a data e o ponto', 'últimos pontos fechados do membro'],
    ['4. O RH informa o novo horário', 'fechamento (dd/mm/aaaa hh:mm) e motivo'],
  ];
  let y = 40;
  passos.forEach((p, i) => {
    caixa(ctx, 270, y, 290, 60, 'azul', p);
    if (i < passos.length - 1) seta(ctx, [[415, y + 60], [415, y + 100]]);
    y += 100;
  });

  // fim da cadeia: y = 440 (base da caixa 4 = 340 + 60 = 400)
  const base = 40 + 3 * 100 + 60; // 400
  const tronco = 432;
  const destinos = [
    { x: 30, tema: 'verde', linhas: ['BANCO DE DADOS', 'horário corrigido e', 'marcado no histórico'] },
    { x: 305, tema: 'laranja', linhas: ['DM AO MEMBRO', 'aviso do ajuste, novo', 'horário e motivo'] },
    { x: 580, tema: 'cinza', linhas: ['PLANILHA E LOG', 'linha atualizada e', 'registro de quem ajustou'] },
  ];
  destinos.forEach((d) => {
    const cx = d.x + 110;
    seta(ctx, [[415, base], [415, tronco], [cx, tronco], [cx, 470]]);
    caixa(ctx, d.x, 470, 220, 80, d.tema, d.linhas);
  });

  legenda(ctx, 590, [
    ['azul', 'Ação do RH'],
    ['verde', 'Registro'],
    ['laranja', 'Aviso ao membro'],
    ['cinza', 'Auditoria'],
  ]);

  return pronto(n);
}

module.exports = { fluxoAdvertencias, fluxoPontoAbrirFechar, fluxoPontoVerificacao, fluxoAjusteRH };
