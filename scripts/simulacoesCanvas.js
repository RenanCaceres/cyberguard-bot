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

// =========================================================================
// 8. SIMULAÇÃO: CENTRAL DE APOIO & DÚVIDAS (PAINEL PRINCIPAL)
// =========================================================================
function simularModuloSuportePainel() {
  const { canvas, ctx } = criarCanvas(550);
  desenharBarraCanal(ctx, 'dúvidas');

  // Mensagem do Bot com Painel Fixado
  desenharAvatar(ctx, 36, 75, 18, { ehBot: true });
  desenharCabecalhoMensagem(ctx, 64, 70, 'Bot RH CyberGuard', { ehBot: true, horario: 'Hoje às 14:00' });

  desenharEmbed(ctx, 64, 85, 480, 275, {
    corBorda: DISCORD.azulCyber,
    autor: 'Central de Atendimento • CyberGuard UTFPR',
    titulo: '🛡️ Central de Apoio & Dúvidas • CyberGuard UTFPR',
    campos: [
      {
        titulo: 'Bem-vindo(a) à Central de Dúvidas e Atendimento!',
        valor: 'Precisa de orientações sobre o bot, ponto eletrônico, declarações ou normas do projeto?',
      },
      {
        titulo: 'Escolha uma das opções abaixo:',
        valor: [
          '• 📜 Regras e Manuais (PDF): Consulta de fluxos e manuais oficiais.',
          '• 🤖 Tirar Dúvida com IA (Gemini): Resposta imediata e contextualizada 24/7.',
          '• 👤 Tirar Dúvidas Comigo (Liderança): Envie para a coordenação por e-mail.',
        ],
      },
      {
        titulo: '💡 Como funciona o atendimento por e-mail?',
        valor: 'O bot gera um protocolo (#DUVIDA-0000) e entrega a resposta do líder na sua DM do Discord!',
      },
    ],
    rodape: 'CyberGuard UTFPR • Inteligência de Ameaças & Extensão Universitária',
  });

  // Botões do Painel
  let bx = 64;
  bx += desenharBotao(ctx, bx, 372, 'Regras e Manuais (PDF)', 'azul', { icone: '📜' }) + 10;
  bx += desenharBotao(ctx, bx, 372, 'Tirar Dúvida com IA', 'verde', { icone: '🤖' }) + 10;
  desenharBotao(ctx, bx, 372, 'Tirar Dúvidas Comigo', 'cinza', { icone: '👤' });

  // Card Lateral de Orientações Rápidas
  const mx = 565;
  const my = 85;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx, my, 335, 335, 8);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13.5px ${FONTE}`;
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('🌟 3 Vias de Atendimento Integradas', mx + 16, my + 28);

  ctx.font = `bold 12.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('1. Manuais Oficiais em PDF', mx + 16, my + 60);
  ctx.font = `11.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('Selecione o módulo e receba o PDF', mx + 16, my + 78);
  ctx.fillText('completo com regras e fluxogramas.', mx + 16, my + 94);

  ctx.font = `bold 12.5px ${FONTE}`;
  ctx.fillStyle = '#22c55e';
  ctx.fillText('2. Inteligência Artificial (Gemini)', mx + 16, my + 130);
  ctx.font = `11.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('Treinada com todas as normas internas.', mx + 16, my + 148);
  ctx.fillText('Tira dúvidas em segundos com sigilo total.', mx + 16, my + 164);

  ctx.font = `bold 12.5px ${FONTE}`;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('3. Contato Direto com a Liderança', mx + 16, my + 200);
  ctx.font = `11.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('Envio para o e-mail da coordenação.', mx + 16, my + 218);
  ctx.fillText('Retorno entregue na sua DM do Discord!', mx + 16, my + 234);

  // Box de garantia de privacidade
  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx + 16, my + 262, 303, 56, 6);
  ctx.fill();
  ctx.strokeStyle = '#2f6fed';
  ctx.stroke();

  ctx.font = `bold 11.5px ${FONTE}`;
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('🔒 100% Efêmero e Confidencial', mx + 26, my + 284);
  ctx.font = `10.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('Suas dúvidas e respostas não ficam visíveis no canal.', mx + 26, my + 302);
  ctx.restore();

  // Rodapé do Canvas
  ctx.save();
  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('💡 Dica: Você também pode usar /documentacao em qualquer canal para acessar o catálogo.', 64, 440);
  ctx.fillText('Tanto as respostas da IA quanto os manuais são enviados de modo privado (só você vê).', 64, 460);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 9. SIMULAÇÃO: TIRA-DÚVIDAS COM IA (MODAL & RESPOSTA GEMINI)
// =========================================================================
function simularModuloSuporteIA() {
  const { canvas, ctx } = criarCanvas(560);
  desenharBarraCanal(ctx, 'dúvidas • Tira-Dúvidas Instantâneo com IA');

  // Modal do Discord (Simulação no lado esquerdo)
  const mx1 = 30;
  const my1 = 60;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx1, my1, 415, 435, 8);
  ctx.fill();
  ctx.strokeStyle = '#5865f2';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 14px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtBranco;
  ctx.fillText('Tirar Dúvida com IA (Gemini)', mx1 + 18, my1 + 30);

  ctx.font = `bold 12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('QUAL É A SUA DÚVIDA SOBRE O CYBERGUARD? *', mx1 + 18, my1 + 68);

  // Campo de texto do Modal
  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx1 + 18, my1 + 80, 379, 130, 6);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.stroke();

  ctx.font = `12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('Por que o bot precisa dos meus dados pessoais no', mx1 + 28, my1 + 105);
  ctx.fillText('onboarding? Posso participar sem fornecer CPF ou', mx1 + 28, my1 + 125);
  ctx.fillText('como funciona a declaração de horas para AC?', mx1 + 28, my1 + 145);

  ctx.font = `11px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('Limite de 1.000 caracteres • Inteligência Gemini 3.8-Flash', mx1 + 18, my1 + 225);

  // Botões do Modal
  ctx.fillStyle = DISCORD.cinzaBtn;
  ctx.beginPath();
  ctx.roundRect(mx1 + 215, my1 + 245, 80, 32, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 12px ${FONTE}`;
  ctx.textAlign = 'center';
  ctx.fillText('Cancelar', mx1 + 255, my1 + 265);

  ctx.fillStyle = DISCORD.badgeBot;
  ctx.beginPath();
  ctx.roundRect(mx1 + 305, my1 + 245, 92, 32, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Enviar', mx1 + 351, my1 + 265);

  // Box explicativo no Modal
  ctx.textAlign = 'left';
  ctx.fillStyle = '#2b2d31';
  ctx.beginPath();
  ctx.roundRect(mx1 + 18, my1 + 295, 379, 115, 6);
  ctx.fill();
  ctx.strokeStyle = '#248046';
  ctx.stroke();

  ctx.font = `bold 12px ${FONTE}`;
  ctx.fillStyle = '#22c55e';
  ctx.fillText('⚡ Resposta em Tempo Real:', mx1 + 28, my1 + 320);
  ctx.font = `11.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('A IA analisa o regimento oficial, termos de voluntariado', mx1 + 28, my1 + 342);
  ctx.fillText('da UTFPR, sistema de pontos e normas LGPD.', mx1 + 28, my1 + 360);
  ctx.fillText('A resposta é exibida apenas para você (efêmera).', mx1 + 28, my1 + 378);
  ctx.restore();

  // Resposta do Bot com o Embed (Lado Direito)
  const mx2 = 465;
  const my2 = 60;
  ctx.save();
  desenharAvatar(ctx, mx2 + 20, my2 + 22, 16, { ehBot: true });
  desenharCabecalhoMensagem(ctx, mx2 + 46, my2 + 18, 'Bot RH CyberGuard', { ehBot: true, horario: 'Hoje às 14:01' });

  desenharEmbed(ctx, mx2 + 20, my2 + 32, 420, 360, {
    corBorda: DISCORD.azulCyber,
    autor: 'CyberGuard Assist • Suporte com IA',
    titulo: '🤖 Resposta da IA (Gemini 3.8-Flash)',
    campos: [
      {
        titulo: 'Sua Pergunta:',
        valor: '> "Por que o bot precisa dos meus dados no onboarding?..."',
      },
      {
        titulo: 'Orientações Oficiais:',
        valor: [
          '1. Base Legal dos Dados: O cadastro de CPF, RG e',
          '   RA é exigido pela Lei do Voluntariado (Lei 9.608/1998)',
          '   para emissão do Termo Formal aceito pela UTFPR.',
          '2. Segurança & Criptografia: Seus dados são salvos com',
          '   criptografia AES-256-GCM em repouso. Ninguém acessa.',
          '3. Cargo Entusiasta: Caso prefira não assinar o termo,',
          '   você pode participar da comunidade como Entusiasta.',
          '4. Horas AC: O comando /declaracao emite as horas para a DIREC.',
        ],
      },
      {
        titulo: 'A dúvida persistiu?',
        valor: 'Use o botão "Tirar Dúvidas Comigo" para falar com a Liderança.',
      },
    ],
    rodape: 'Só você pode ver esta mensagem • Resposta efêmera privada',
  });

  desenharBotao(ctx, mx2 + 20, my2 + 402, 'Visualizar PDF e Simulação', 'azul', { icone: '📄' });
  ctx.restore();

  // Rodapé geral
  ctx.save();
  ctx.font = `11.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('🛡️ O módulo de IA conta com fallback automático entre modelos para garantir 99.9% de disponibilidade.', 30, 520);
  ctx.fillText('Nenhuma informação sigilosa de outros membros é exposta nas respostas da IA.', 30, 538);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 10. SIMULAÇÃO: ATENDIMENTO COM A LIDERANÇA (E-MAIL + DM)
// =========================================================================
function simularModuloSuporteLideranca() {
  const { canvas, ctx } = criarCanvas(560);
  desenharBarraCanal(ctx, 'dúvidas • Contato Direto com a Liderança via E-mail');

  // Lado Esquerdo: Abertura do Chamado & Envio de E-mail
  const mx1 = 30;
  const my1 = 60;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx1, my1, 415, 435, 8);
  ctx.fill();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13.5px ${FONTE}`;
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('📨 1. Envio do Chamado (Discord -> E-mail)', mx1 + 18, my1 + 28);

  ctx.font = `bold 12px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('FORMULÁRIO PREENCHIDO PELO INTEGRANTE:', mx1 + 18, my1 + 55);

  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx1 + 18, my1 + 65, 379, 75, 6);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.stroke();

  ctx.font = `bold 11px ${FONTE}`;
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('Assunto: Validação de Horas e Atividades', mx1 + 28, my1 + 85);
  ctx.font = `11.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtTexto;
  ctx.fillText('Minhas horas do projeto anterior já foram aprovadas', mx1 + 28, my1 + 105);
  ctx.fillText('no Notion para constar na declaração deste mês?', mx1 + 28, my1 + 123);

  // Card de confirmação de envio
  desenharEmbed(ctx, mx1 + 18, my1 + 155, 379, 180, {
    corBorda: '#22c55e',
    titulo: '📨 Dúvida Encaminhada para a Liderança!',
    campos: [
      { titulo: 'Protocolo de Suporte', valor: '#DUVIDA-0000' },
      { titulo: 'Assunto', valor: 'Validação de Horas e Atividades' },
      { titulo: 'Status', valor: '⏳ Aguardando resposta por e-mail da Liderança' },
    ],
    rodape: 'O bot encaminhou o e-mail e aguarda a resposta do líder.',
  });

  ctx.font = `11px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('✉️ O e-mail contém o histórico da dúvida e o protocolo exclusivo.', mx1 + 18, my1 + 360);
  ctx.fillText('A liderança responde diretamente de seu cliente de e-mail.', mx1 + 18, my1 + 378);
  ctx.restore();

  // Lado Direito: Captura IMAP e Entrega Automática na DM
  const mx2 = 465;
  const my2 = 60;
  ctx.save();
  ctx.fillStyle = DISCORD.bgModal;
  ctx.beginPath();
  ctx.roundRect(mx2, my2, 425, 435, 8);
  ctx.fill();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 13.5px ${FONTE}`;
  ctx.fillStyle = '#22c55e';
  ctx.fillText('📬 2. Resposta Entregue na DM do Integrante', mx2 + 18, my2 + 28);

  desenharAvatar(ctx, mx2 + 20, my2 + 65, 16, { ehBot: true });
  desenharCabecalhoMensagem(ctx, mx2 + 46, my2 + 60, 'Bot RH CyberGuard', { ehBot: true, horario: 'Hoje às 15:30' });

  desenharEmbed(ctx, mx2 + 20, my2 + 75, 385, 255, {
    corBorda: DISCORD.azulCyber,
    autor: 'Central de Apoio & Suporte • CyberGuard',
    titulo: '📬 Sua Dúvida foi Respondida pela Liderança!',
    campos: [
      { titulo: '🔖 Protocolo Oficial', valor: '#DUVIDA-0000' },
      { titulo: '📌 Assunto', valor: 'Validação de Horas e Atividades' },
      {
        titulo: '💬 Resposta da Liderança:',
        valor: [
          '"Olá! Sim, todas as horas aprovadas no Notion',
          'até o último fechamento já estão consolidadas no banco.',
          'Pode emitir sua declaração oficial pelo comando',
          '/declaracao solicitar. Abraço!"',
        ],
      },
    ],
    rodape: 'Se suas DMs estiverem fechadas, o bot avisa no canal com segurança.',
  });

  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(mx2 + 20, my2 + 345, 385, 65, 6);
  ctx.fill();
  ctx.strokeStyle = '#3f4147';
  ctx.stroke();

  ctx.font = `bold 11.5px ${FONTE}`;
  ctx.fillStyle = '#22c55e';
  ctx.fillText('⚡ Ciclo Fechado & Autônomo:', mx2 + 30, my2 + 368);
  ctx.font = `11px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('O integrante não precisa ter o e-mail do líder, e o líder', mx2 + 30, my2 + 386);
  ctx.fillText('responde pelo Gmail do celular sem precisar abrir o Discord!', mx2 + 30, my2 + 400);
  ctx.restore();

  // Rodapé do Canvas
  ctx.save();
  ctx.font = `11.5px ${FONTE}`;
  ctx.fillStyle = DISCORD.txtMuted;
  ctx.fillText('🛡️ O sistema utiliza busca IMAP automatizada a cada 1 minuto com tratamento anti-spam e sanitização.', 30, 520);
  ctx.fillText('Protocolos exclusivos garantem que respostas sejam entregues unicamente ao autor da pergunta.', 30, 538);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// =========================================================================
// 11. SIMULAÇÃO: VISÃO GERAL DO MÓDULO SUPORTE & DOCUMENTAÇÃO
// =========================================================================
function simularModuloSuporte() {
  return simularModuloSuportePainel();
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
    { nome: 'simulacao_suporte_painel.png', fn: simularModuloSuportePainel },
    { nome: 'simulacao_suporte_ia.png', fn: simularModuloSuporteIA },
    { nome: 'simulacao_suporte_lideranca.png', fn: simularModuloSuporteLideranca },
    { nome: 'simulacao_suporte.png', fn: simularModuloSuporte },
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
  simularModuloSuportePainel,
  simularModuloSuporteIA,
  simularModuloSuporteLideranca,
  simularModuloSuporte,
};

if (require.main === module) {
  gerarTodasSimulacoes().catch(console.error);
}
