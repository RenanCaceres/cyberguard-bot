'use strict';
/**
 * scripts/simulacoesCanvas.js
 * Gera imagens simuladas (mockups) hiper-realistas da interface do Discord
 * demonstrando o uso dos módulos do CyberGuard Bot pelos usuários.
 */
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const W = 920;
const FONTE = 'sans-serif';

// Cores temáticas do Discord & CyberGuard
const DISCORD = {
  bgApp: '#1e1f22',
  bgChat: '#313338',
  bgCard: '#2b2d31',
  bgModal: '#232428',
  bgHeader: '#232428',
  txtBranco: '#f2f3f5',
  txtMuted: '#949ba4',
  txtTexto: '#dbdee1',
  borda: '#3f4147',
  badgeBot: '#5865f2',
  azulCyber: '#2f6fed',
  verde: '#248046',
  vermelho: '#da373c',
  cinzaBtn: '#4e5058',
  cinzaHover: '#6d6f78',
  ouro: '#f59e0b',
  laranja: '#f97316',
};

function criarCanvas(altura) {
  const canvas = createCanvas(W, altura);
  const ctx = canvas.getContext('2d');
  // Fundo principal estilo Discord chat
  ctx.fillStyle = DISCORD.bgChat;
  ctx.fillRect(0, 0, W, altura);
  return { canvas, ctx, altura };
}

// Desenha a barra superior do canal no Discord
function desenharBarraCanal(ctx, nomeCanal, ehDM = false) {
  ctx.save();
  ctx.fillStyle = DISCORD.bgHeader;
  ctx.fillRect(0, 0, W, 42);
  ctx.strokeStyle = '#202225';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 41.5, W, 1);

  // Ícone # ou @
  ctx.font = `bold 18px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const icone = ehDM ? '@' : '#';
  ctx.fillText(icone, 18, 22);

  // Nome do canal
  ctx.font = `bold 14.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText(nomeCanal, 36, 22);

  // Tag descritiva à direita
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.textAlign = 'right';
  ctx.fillText('Simulação de Uso • CyberGuard Bot UTFPR', W - 18, 22);
  ctx.restore();
}

// Desenha o avatar do usuário ou do bot
function desenharAvatar(ctx, x, y, r, { ehBot = false, cor = '#5865f2', letra = 'U' } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = ehBot ? DISCORD.azulCyber : cor;
  ctx.fill();

  ctx.font = `bold ${Math.round(r * 1.05)}px ${FONTE}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ehBot ? '🛡️' : letra, x, y + 1);
  ctx.restore();
}

// Cabeçalho da mensagem (Nome, Tag BOT se aplicável, Timestamp)
function desenharCabecalhoMensagem(ctx, x, y, nome, { ehBot = false, horario = 'Hoje às 14:30' } = {}) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Nome
  ctx.font = `bold 14px ${FONTE}`;
  ctx.fillStyle = ehBot ? '#60a5fa' : DISCORD.txtBranco;
  ctx.fillText(nome, x, y);
  const largNome = ctx.measureText(nome).width;
  let offsetX = x + largNome + 8;

  // Badge BOT
  if (ehBot) {
    ctx.fillStyle = DISCORD.badgeBot;
    ctx.beginPath();
    ctx.roundRect(offsetX, y - 12, 33, 14, 3);
    ctx.fill();

    ctx.font = `bold 10px ${FONTE}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('BOT', offsetX + 16.5, y - 1.5);
    offsetX += 41;
  }

  // Horário
  ctx.textAlign = 'left';
  ctx.font = `11.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText(horario, offsetX, y);
  ctx.restore();
}

// Desenha comando slash invocado pelo usuário
function desenharComandoSlash(ctx, x, y, comando) {
  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('usou ', x, y);
  const larg = ctx.measureText('usou ').width;

  ctx.fillStyle = '#4752c4';
  ctx.beginPath();
  ctx.roundRect(x + larg, y - 12, ctx.measureText(comando).width + 12, 16, 4);
  ctx.fill();

  ctx.fillStyle = '#e0e7ff';
  ctx.font = `bold 12px ${FONTE}`;
  ctx.fillText(comando, x + larg + 6, y);
  ctx.restore();
}

// Desenha Embed do Discord
function desenharEmbed(ctx, x, y, w, h, { corBorda = DISCORD.azulCyber, titulo, autor, campos = [], rodape } = {}) {
  ctx.save();
  // Fundo do card
  ctx.fillStyle = DISCORD.bgCard;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();

  // Borda colorida à esquerda
  ctx.fillStyle = corBorda;
  ctx.beginPath();
  ctx.roundRect(x, y, 4, h, [6, 0, 0, 6]);
  ctx.fill();

  let curY = y + 18;

  // Autor opcional
  if (autor) {
    ctx.font = `bold 11px ${FONTE}`;
    ctx.fillStyle = DISCORD.txtMuted;
    ctx.fillText(autor.toUpperCase(), x + 16, curY);
    curY += 16;
  }

  // Título
  if (titulo) {
    ctx.font = `bold 15px ${FONTE}`;
    ctx.fillStyle = DISCORD.txtBranco;
    ctx.fillText(titulo, x + 16, curY);
    curY += 22;
  }

  // Campos
  for (const c of campos) {
    ctx.font = `bold 12.5px ${FONTE}`;
    ctx.fillStyle = DISCORD.txtMuted;
    ctx.fillText(c.titulo, x + 16, curY);
    curY += 16;

    ctx.font = `13px ${FONTE}`;
    ctx.fillStyle = DISCORD.txtTexto;
    const linhas = Array.isArray(c.valor) ? c.valor : [c.valor];
    for (const linha of linhas) {
      ctx.fillText(linha, x + 16, curY);
      curY += 17;
    }
    curY += 6;
  }

  // Rodapé opcional
  if (rodape) {
    ctx.font = `11px ${FONTE}`;
    ctx.fillStyle = DISCORD.txtMuted;
    ctx.fillText(rodape, x + 16, y + h - 12);
  }

  ctx.restore();
}

// Desenha Botão do Discord
function desenharBotao(ctx, x, y, texto, estilo = 'cinza', { icone = null } = {}) {
  ctx.save();
  let bg = DISCORD.cinzaBtn;
  if (estilo === 'verde') bg = DISCORD.verde;
  if (estilo === 'vermelho') bg = DISCORD.vermelho;
  if (estilo === 'azul') bg = DISCORD.badgeBot;

  ctx.font = `bold 13px ${FONTE}`;
  const txtCompleto = icone ? `${icone}  ${texto}` : texto;
  const larg = Math.max(110, ctx.measureText(txtCompleto).width + 24);
  const alt = 32;

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, larg, alt, 4);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txtCompleto, x + larg / 2, y + alt / 2);
  ctx.restore();

  return larg;
}

// =========================================================================
// 1. SIMULAÇÃO: PONTO ELETRÔNICO & GESTÃO DE HORAS
// =========================================================================
function simularModuloPonto() {
  const { canvas, ctx, altura } = criarCanvas(560);
  desenharBarraCanal(ctx, 'ponto-eletronico');

  // Comando do usuário
  desenharAvatar(ctx, 36, 75, 18, { letra: 'M', cor: '#10b981' });
  desenharCabecalhoMensagem(ctx, 64, 70, 'Membro CyberGuard', { horario: 'Hoje às 09:00' });
  desenharComandoSlash(ctx, 64, 90, '/painel-ponto');

  // Resposta do Bot: Painel
  desenharAvatar(ctx, 36, 140, 18, { ehBot: true });
  desenharCabecalhoMensagem(ctx, 64, 134, 'CyberGuard Bot', { ehBot: true, horario: 'Hoje às 09:00' });

  desenharEmbed(ctx, 64, 150, 480, 180, {
    corBorda: DISCORD.azulCyber,
    autor: 'Controle de Ponto Eletrônico v2.0 • Notion & Sheets Sync',
    titulo: '🕒 Painel de Controle de Ponto',
    campos: [
      { titulo: 'Status Atual', valor: '🔴 Ponto Fechado — Nenhum expediente ativo no momento.' },
      { titulo: 'Demanda Vinculada (Notion)', valor: '• [Hacking Ético] Análise de Vulnerabilidades em Redes' },
      { titulo: 'Regras de Ponto', valor: 'Teto max. 8h | Grace period voz: 60s | Checagem ociosa: 1h' },
    ],
    rodape: 'Clique nos botões abaixo para gerenciar seu expediente.',
  });

  // Botões do Painel
  let bx = 64;
  bx += desenharBotao(ctx, bx, 342, 'Abrir ponto', 'verde', { icone: '🟢' }) + 10;
  bx += desenharBotao(ctx, bx, 342, 'Fechar ponto', 'vermelho', { icone: '🔴' }) + 10;
  bx += desenharBotao(ctx, bx, 342, 'Lista', 'cinza', { icone: '📋' }) + 10;
  bx += desenharBotao(ctx, bx, 342, 'Ranking', 'cinza', { icone: '🏆' }) + 10;
  desenharBotao(ctx, bx, 342, 'Resumo', 'cinza', { icone: '📊' });

  // Mockup da Checagem Horária (Card em DM à direita)
  const mx = 565;
  const my = 150;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx, my, 335, 230, 8);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('💬 Notificação em DM Particular (1h)', mx + 16, my + 24);

  ctx.font = `bold 14px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('Você ainda continua trabalhando?', mx + 16, my + 50);

  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('Seu ponto está aberto há 1 hora.', mx + 16, my + 72);
  ctx.fillText('Confirme sua atividade para zerar', mx + 16, my + 90);
  ctx.fillText('o contador de inatividade preventiva.', mx + 16, my + 108);

  desenharBotao(ctx, mx + 16, my + 130, 'Sim, continuo', 'verde', { icone: '✅' });
  desenharBotao(ctx, mx + 165, my + 130, 'Não, encerrei', 'vermelho', { icone: '🛑' });

  ctx.font = `italic 11px ${FONTE}`;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('⚠️ 3 avisos sem resposta encerram o ponto.', mx + 16, my + 195);
  ctx.restore();

  // Rodapé explicativo
  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('💡 Dica: Entrar na sala de voz dedicada abre o ponto automaticamente com tolerância de 60s.', 64, 430);
  ctx.fillText('Ao encerrar, preencha o modal com porcentagem (0-100%) e o que foi realizado.', 64, 450);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 2. SIMULAÇÃO: DECLARAÇÃO DE VOLUNTARIADO
// =========================================================================
function simularModuloDeclaracao() {
  const { canvas, ctx } = criarCanvas(520);
  desenharBarraCanal(ctx, 'solicitar-declaracao');

  // Comando do usuário
  desenharAvatar(ctx, 36, 75, 18, { letra: 'A', cor: '#3b82f6' });
  desenharCabecalhoMensagem(ctx, 64, 70, 'Aluno Voluntário', { horario: 'Hoje às 10:15' });
  desenharComandoSlash(ctx, 64, 90, '/declaracao solicitar');

  // Resposta do Bot
  desenharAvatar(ctx, 36, 140, 18, { ehBot: true });
  desenharCabecalhoMensagem(ctx, 64, 134, 'CyberGuard Bot', { ehBot: true, horario: 'Hoje às 10:15' });

  desenharEmbed(ctx, 64, 150, 480, 205, {
    corBorda: DISCORD.azulCyber,
    autor: 'Projeto CyberGuard • UTFPR Cornélio Procópio',
    titulo: '📜 Solicitação de Declaração Registrada',
    campos: [
      { titulo: 'Protocolo Institucional', valor: '#DECL-0000000-1234' },
      { titulo: 'Carga Horária Semanal', valor: '4 horas semanais (Membro Regular de Extensão)' },
      { titulo: 'Data de Ingresso Registrada', valor: '05/2026 • Termo de Voluntariado Regular' },
      { titulo: 'Status do Trâmite', valor: '⏳ Enviado por e-mail para assinatura do Coordenador' },
    ],
    rodape: 'O bot escuta a INBOX (IMAP) e entrega o PDF assinado via Gov.br na sua DM.',
  });

  // Card DM Recebimento do PDF assinado
  const mx = 565;
  const my = 150;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx, my, 335, 230, 8);
  ctx.fill();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#22c55e';
  ctx.fillText('📨 Mensagem Direta (DM) — Entrega Automática', mx + 16, my + 25);

  ctx.font = `bold 14px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('Sua Declaração foi Assinada! 🎉', mx + 16, my + 52);

  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('O Prof. André assinou seu documento no', mx + 16, my + 75);
  ctx.fillText('Assinador Oficial do Gov.br (ICP-Brasil).', mx + 16, my + 93);
  ctx.fillText('Válido perante a DIREC e Reitoria UTFPR.', mx + 16, my + 111);

  // Botão / Arquivo anexo simulado
  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx + 16, my + 130, 300, 42, 6);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('📎 declaracao_assinada_0000000.pdf', mx + 30, my + 155);

  ctx.font = `11px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('Use /declaracao status para sincronizar a qualquer instante.', mx + 16, my + 205);
  ctx.restore();

  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('⚖️ Regras de Carga: Membros = 4h | Vice-Líderes = 8h | Líderes / Presidência = 10h semanais.', 64, 400);
  ctx.fillText('Todas as declarações possuem protocolo único e conferência binária ICP-Brasil.', 64, 420);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 3. SIMULAÇÃO: PROCESSO DISCIPLINAR & ADVERTÊNCIAS
// =========================================================================
function simularModuloAdvertencias() {
  const { canvas, ctx } = criarCanvas(530);
  desenharBarraCanal(ctx, 'CyberGuard Bot (Mensagem Direta)', true);

  // Bot avisa em DM
  desenharAvatar(ctx, 36, 75, 18, { ehBot: true });
  desenharCabecalhoMensagem(ctx, 64, 70, 'CyberGuard Bot', { ehBot: true, horario: 'Hoje às 11:00' });

  desenharEmbed(ctx, 64, 85, 480, 220, {
    corBorda: DISCORD.vermelho,
    autor: 'Comissão Disciplinar e Ética • Amplo Contraditório',
    titulo: '⚠️ Notificação de Advertência Formal',
    campos: [
      { titulo: 'Categoria da Infração', valor: 'Média (Reincidência em falta regimental)' },
      { titulo: 'Motivo / Descrição', valor: 'Ausência reiterada em entregas sem justificativa prévia.' },
      { titulo: 'Prazo de Manifestação (Garantia Regimental)', valor: '7 dias corridos para resposta (Ampla Defesa e Contraditório).' },
      { titulo: 'Vigência Institucional', valor: '90 dias no banco de dados com expiração automática.' },
    ],
    rodape: 'Você tem direito de aceitar ou discordar apresentando réplica fundamentada.',
  });

  // Botões de Ação na DM
  let bx = 64;
  bx += desenharBotao(ctx, bx, 320, 'Ciente (Concordo)', 'verde', { icone: '✅' }) + 12;
  bx += desenharBotao(ctx, bx, 320, 'Não concordo (Defesa)', 'vermelho', { icone: '❌' }) + 12;
  desenharBotao(ctx, bx, 320, 'Minhas Advertências', 'cinza', { icone: '📜' });

  // Modal de Defesa simulado
  const mx = 565;
  const my = 85;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx, my, 335, 270, 8);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('📝 Modal de Amplo Contraditório (1.500 chars)', mx + 16, my + 26);

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('Apresente suas Razões de Defesa:', mx + 16, my + 54);

  // Campo de texto simulado
  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx + 16, my + 68, 300, 115, 6);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.stroke();

  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('Escreva sua justificativa detalhada e inclua links', mx + 26, my + 92);
  ctx.fillText('de evidências caso possua.', mx + 26, my + 110);
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('O líder poderá Perdoar, Contra-Argumentar', mx + 26, my + 140);
  ctx.fillText('(reiniciando o prazo de 7 dias) ou Prosseguir.', mx + 26, my + 158);

  desenharBotao(ctx, mx + 16, my + 205, 'Enviar Defesa ao Líder', 'azul', { icone: '📤' });
  ctx.restore();

  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('⚖️ Fila Automática (na_fila): Se houver advertência pendente, a nova aguarda a resolução.', 64, 385);
  ctx.fillText('Reincidência: Leve -> Média -> Grave -> Votação de Expulsão pelos Líderes.', 64, 405);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 4. SIMULAÇÃO: ONBOARDING & ASSINATURA GOV.BR
// =========================================================================
function simularModuloOnboarding() {
  const { canvas, ctx } = criarCanvas(530);
  desenharBarraCanal(ctx, 'CyberGuard Bot (Onboarding & Termo)', true);

  desenharAvatar(ctx, 36, 75, 18, { ehBot: true });
  desenharCabecalhoMensagem(ctx, 64, 70, 'CyberGuard Bot', { ehBot: true, horario: 'Hoje às 13:00' });

  desenharEmbed(ctx, 64, 85, 480, 215, {
    corBorda: DISCORD.azulCyber,
    autor: 'Onboarding Automatizado • Lei nº 9.608/1998 e LGPD',
    titulo: '🛡️ Bem-vindo(a) ao CyberGuard UTFPR!',
    campos: [
      { titulo: '1. Termo de Ciência e Privacidade LGPD', valor: 'Dados coletados estritamente para fins acadêmicos e registros.' },
      { titulo: '2. Coleta Guiada de Dados (13 Etapas)', valor: 'Nome, CPF, Data Nasc., RA, Curso, Endereço e Área de Atuação.' },
      { titulo: '3. Preenchimento Automático do DOCX/PDF', valor: 'Injeção de AcroForm interativo para data de Cornélio Procópio.' },
      { titulo: '4. Validação Criptográfica Gov.br (ICP-Brasil)', valor: 'Inspeção do objeto /Sig sobre a linha "Voluntário(a)".' },
    ],
    rodape: 'Tudo ocorre de forma 100% privada e sigilosa por Mensagem Direta.',
  });

  // Botões Onboarding
  let bx = 64;
  bx += desenharBotao(ctx, bx, 315, 'Concordo (LGPD)', 'verde', { icone: '✅' }) + 12;
  desenharBotao(ctx, bx, 315, 'Baixar Termo Preenchido', 'azul', { icone: '📄' });

  // Card de Validação Gov.br
  const mx = 565;
  const my = 85;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx, my, 335, 260, 8);
  ctx.fill();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#22c55e';
  ctx.fillText('🔐 Validação Criptográfica Gov.br', mx + 16, my + 26);

  ctx.font = `bold 14px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('Termo Aprovado com Sucesso! 🛡️', mx + 16, my + 52);

  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('• Assinatura ICP-Brasil verificada (/ByteRange)', mx + 16, my + 78);
  ctx.fillText('• Data de assinatura confirmada (Cornélio Procópio)', mx + 16, my + 98);
  ctx.fillText('• Upload automático no Google Drive institucional', mx + 16, my + 118);
  ctx.fillText('• Provisionamento automático no Notion Workspace', mx + 16, my + 138);

  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx + 16, my + 160, 300, 36, 6);
  ctx.fill();

  ctx.font = `bold 12px ${FONTE}`;
  ctx.fillStyle = '#22c55e';
  ctx.fillText('🎉 Cargo "Membro CyberGuard" Concedido!', mx + 30, my + 183);

  ctx.font = `11px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('Diagnóstico automático com reprovação e correção em DM.', mx + 16, my + 225);
  ctx.restore();

  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('🔒 Dados sensíveis (CPF, endereço, contatos) criptografados com AES-256-GCM em repouso.', 64, 380);
  ctx.fillText('Entusiastas que entram por links de comunidade recebem cargo direto sem onboarding.', 64, 400);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 5. SIMULAÇÃO: ATAS DE REUNIÃO COM IA GEMINI
// =========================================================================
function simularModuloReuniao() {
  const { canvas, ctx } = criarCanvas(530);
  desenharBarraCanal(ctx, 'reuniao-geral (Chat de Voz)');

  // Usuário inicia
  desenharAvatar(ctx, 36, 75, 18, { letra: 'L', cor: '#eab308' });
  desenharCabecalhoMensagem(ctx, 64, 70, 'Líder / RH', { horario: 'Hoje às 19:00' });
  desenharComandoSlash(ctx, 64, 90, '/reuniao iniciar');

  // Bot avisa sobre gravação e Opt-out
  desenharAvatar(ctx, 36, 140, 18, { ehBot: true });
  desenharCabecalhoMensagem(ctx, 64, 134, 'CyberGuard Bot', { ehBot: true, horario: 'Hoje às 19:00' });

  desenharEmbed(ctx, 64, 150, 480, 160, {
    corBorda: DISCORD.laranja,
    autor: 'Gravação de Áudio Opus • Inteligência Artificial Gemini 2.5 Flash',
    titulo: '🎙️ Gravação de Reunião em Andamento',
    campos: [
      { titulo: 'Canal Monitorado', valor: '🔊 Reunião Geral de Planejamento' },
      { titulo: 'Privacidade LGPD (Direito de Oposição)', valor: 'Clique abaixo caso não deseje que sua voz seja gravada.' },
    ],
    rodape: 'Gravação individualizada por participante para máxima nitidez.',
  });

  desenharBotao(ctx, 64, 322, 'Não gravar minha voz (Opt-out)', 'cinza', { icone: '🔇' });

  // Card Encerramento e Entrega da Ata
  const mx = 565;
  const my = 150;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx, my, 335, 235, 8);
  ctx.fill();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('📑 Ata Formal Gerada por IA (/reuniao finalizar)', mx + 16, my + 26);

  ctx.font = `bold 14px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('Transcrição e Síntese Concluídas! 🤖', mx + 16, my + 52);

  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('• Áudios em 16kHz Mono concatenados em lote', mx + 16, my + 78);
  ctx.fillText('• Transcrição via Gemini 2.5 Flash com retry', mx + 16, my + 98);
  ctx.fillText('• Estruturação de Resumo, Decisões e Tarefas', mx + 16, my + 118);

  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx + 16, my + 135, 300, 42, 6);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('📎 Ata_Reuniao_CyberGuard_2026.pdf', mx + 30, my + 160);

  ctx.font = `11px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('Backups retidos por 7 dias para reprocessamento em lote.', mx + 16, my + 205);
  ctx.restore();

  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('⚡ Comandos: /reuniao iniciar | /reuniao finalizar | /reuniao historico | /reuniao reprocessar', 64, 400);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 6. SIMULAÇÃO: PORTAL LGPD & MEUS DADOS
// =========================================================================
function simularModuloMeusDados() {
  const { canvas, ctx } = criarCanvas(510);
  desenharBarraCanal(ctx, 'meus-dados (Mensagem Efêmera Privada)');

  desenharAvatar(ctx, 36, 75, 18, { letra: 'V', cor: '#8b5cf6' });
  desenharCabecalhoMensagem(ctx, 64, 70, 'Membro Voluntário', { horario: 'Hoje às 16:20' });
  desenharComandoSlash(ctx, 64, 90, '/meus-dados visualizar');

  desenharAvatar(ctx, 36, 140, 18, { ehBot: true });
  desenharCabecalhoMensagem(ctx, 64, 134, 'CyberGuard Bot', { ehBot: true, horario: 'Hoje às 16:20' });

  desenharEmbed(ctx, 64, 150, 480, 205, {
    corBorda: DISCORD.badgeBot,
    autor: 'Portal de Privacidade e Direitos do Titular (LGPD — Art. 18)',
    titulo: '🔒 Seus Dados Cadastrais no CyberGuard',
    campos: [
      { titulo: 'Identificação Cadastral', valor: 'Nome: Renan Cáceres | RA: 0000000 | Cargo: Membro' },
      { titulo: 'Dados Pessoais (Criptografia AES-256-GCM)', valor: 'CPF: ***.222.333-** | Tel: (43) 9****-**89' },
      { titulo: 'Vínculo Acadêmico UTFPR', valor: 'Curso: ADS | Início: 05/2026 | Termo Ciência: Aceito' },
      { titulo: 'Banco de Horas Integrado', valor: 'Total: 48h 30min registradas no Ponto Eletrônico' },
    ],
    rodape: 'Visível apenas para você (mensagem 100% efêmera).',
  });

  // Botões de Direitos LGPD
  let bx = 64;
  bx += desenharBotao(ctx, bx, 368, 'Atualizar Dados', 'azul', { icone: '✏️' }) + 10;
  bx += desenharBotao(ctx, bx, 368, 'Termo LGPD', 'cinza', { icone: '📜' }) + 10;
  desenharBotao(ctx, bx, 368, 'Solicitar ao RH', 'cinza', { icone: '📨' });

  // Modal de Retificação à direita
  const mx = 565;
  const my = 150;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx, my, 335, 235, 8);
  ctx.fill();
  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#a78bfa';
  ctx.fillText('✏️ Modal de Retificação (/meus-dados atualizar)', mx + 16, my + 26);

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('Campos Editáveis pelo Titular:', mx + 16, my + 52);

  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('• Novo E-mail de Contato', mx + 16, my + 78);
  ctx.fillText('• Telefone / WhatsApp com DDD', mx + 16, my + 98);
  ctx.fillText('• Endereço, Cidade e CEP', mx + 16, my + 118);
  ctx.fillText('• Curso e Período Atualizado', mx + 16, my + 138);

  ctx.font = `11px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('Validação com regex estrito e atualização em tempo real', mx + 16, my + 175);
  ctx.fillText('com log de auditoria no canal institucional do RH.', mx + 16, my + 195);
  ctx.restore();

  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('🛡️ Conformidade total com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).', 64, 435);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 7. SIMULAÇÃO: VISÃO GERAL & DOCUMENTAÇÃO COMPLETA
// =========================================================================
function simularModuloCompleta() {
  const { canvas, ctx } = criarCanvas(520);
  desenharBarraCanal(ctx, 'central-documentacao');

  desenharAvatar(ctx, 36, 75, 18, { ehBot: true });
  desenharCabecalhoMensagem(ctx, 64, 70, 'CyberGuard Bot', { ehBot: true, horario: 'Hoje às 15:00' });

  desenharEmbed(ctx, 64, 85, 480, 240, {
    corBorda: DISCORD.ouro,
    autor: 'CyberGuard UTFPR • Arquitetura & Governança Integrada',
    titulo: '📘 Documentação Técnica e Operacional Completa',
    campos: [
      { titulo: 'Stack Integrada', valor: 'Discord.js v14 • Node.js v18+ • PostgreSQL (12 tabelas) • Gemini 2.5 Flash' },
      { titulo: 'Módulos Documentados', valor: 'Ponto v2 | Termos Gov.br | Declarações | Advertências | Atas IA | LGPD' },
      { titulo: 'Segurança & Criptografia', valor: 'AES-256-GCM em repouso | Verificação /Sig ICP-Brasil | LGPD-Guard' },
      { titulo: 'Integrações em Nuvem', valor: 'Notion API (Tarefas/Membros) | Google Sheets (3 abas) | Google Drive' },
    ],
    rodape: 'Clique em "Baixar PDF Oficial" ou faça uma pergunta à IA Gemini.',
  });

  desenharBotao(ctx, 64, 340, 'Baixar PDF Completo (13 págs)', 'azul', { icone: '📥' });
  desenharBotao(ctx, 335, 340, 'Perguntar à IA', 'verde', { icone: '💬' });

  // Card Resumo Arquitetura
  const mx = 565;
  const my = 85;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx, my, 335, 275, 8);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('🏛️ Núcleo Central de Governança', mx + 16, my + 26);

  ctx.font = `bold 14px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('Central de Manuais Oficiais 📄', mx + 16, my + 52);

  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('Todos os manuais possuem diagramas em', mx + 16, my + 80);
  ctx.fillText('alta resolução (Canvas 3x), tabelas de regras,', mx + 16, my + 100);
  ctx.fillText('fluxos passo a passo e alertas regimentais.', mx + 16, my + 120);

  ctx.fillText('Compilados deterministicamente e validados', mx + 16, my + 150);
  ctx.fillText('pelo scanner de conformidade LGPD-Guard.', mx + 16, my + 170);

  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx + 16, my + 195, 300, 42, 6);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.stroke();

  ctx.font = `bold 13px ${FONTE}`;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('📎 Documentacao_Completa_CyberGuard_Bot.pdf', mx + 30, my + 220);
  ctx.restore();

  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('✅ Todos os direitos intelectuais e de código pertencem a Renan Cáceres (UTFPR).', 64, 420);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// Exporta e compila todos os arquivos para a pasta docs/simulacoes
async function gerarTodasSimulacoes() {
  const pasta = path.resolve(__dirname, '../docs/simulacoes');
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });

  const mapas = [
    { nome: 'simulacao_ponto.png', fn: simularModuloPonto },
    { nome: 'simulacao_declaracao.png', fn: simularModuloDeclaracao },
    { nome: 'simulacao_advertencias.png', fn: simularModuloAdvertencias },
    { nome: 'simulacao_onboarding.png', fn: simularModuloOnboarding },
    { nome: 'simulacao_reuniao.png', fn: simularModuloReuniao },
    { nome: 'simulacao_meusdados.png', fn: simularModuloMeusDados },
    { nome: 'simulacao_completa.png', fn: simularModuloCompleta },
  ];

  for (const m of mapas) {
    const buf = m.fn();
    const dest = path.join(pasta, m.nome);
    fs.writeFileSync(dest, buf);
    console.log(`[Simulação] Gerada com sucesso: ${dest} (${buf.length} bytes)`);
  }
}

module.exports = {
  gerarTodasSimulacoes,
  simularModuloPonto,
  simularModuloDeclaracao,
  simularModuloAdvertencias,
  simularModuloOnboarding,
  simularModuloReuniao,
  simularModuloMeusDados,
  simularModuloCompleta,
};

if (require.main === module) {
  gerarTodasSimulacoes().catch(console.error);
}
