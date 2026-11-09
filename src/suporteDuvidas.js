'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const nodemailer = require('nodemailer');
const config = require('./config');
const db = require('./db');
const { responderDuvidaComGemini } = require('../commands/documentacao/geminiHelp');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

const usuariosEnviandoPrints = new Set();
const sessoesSuportePrints = new Map();

function estaEnviandoPrints(userId) {
  return usuariosEnviandoPrints.has(userId);
}

function criarModalSuporte(origem = 'geral') {
  const modal = new ModalBuilder()
    .setCustomId(`modal_suporte_duvida_lideranca_${origem}`)
    .setTitle('Ajuda & Suporte • CyberGuard');

  const inputAssunto = new TextInputBuilder()
    .setCustomId('input_assunto_lideranca')
    .setLabel('Título / Assunto do problema')
    .setPlaceholder('Ex.: Bot não respondeu na etapa de CPF / Dúvida cadastral')
    .setStyle(TextInputStyle.Short)
    .setMinLength(3)
    .setMaxLength(100)
    .setRequired(true);

  const inputPergunta = new TextInputBuilder()
    .setCustomId('input_pergunta_lideranca')
    .setLabel('Descrição detalhada da solicitação')
    .setPlaceholder('Descreva o que ocorreu, onde você travou ou o que precisa...')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(1500)
    .setRequired(true);

  const inputLinksPrints = new TextInputBuilder()
    .setCustomId('input_links_prints')
    .setLabel('Link de prints/imagens (opcional)')
    .setPlaceholder('Cole links de prints aqui (ou envie os arquivos no chat a seguir)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputAssunto),
    new ActionRowBuilder().addComponents(inputPergunta),
    new ActionRowBuilder().addComponents(inputLinksPrints)
  );

  return modal;
}

async function abrirModalSuporte(interaction, origem = 'geral') {
  const modal = criarModalSuporte(origem);
  return interaction.showModal(modal);
}

function montarPainelDuvidas() {
  const embed = new EmbedBuilder()
    .setColor(0x2f6fed)
    .setTitle('🛡️ Central de Apoio & Dúvidas • CyberGuard UTFPR')
    .setDescription(
      'Seja bem-vindo(a) à **Central de Dúvidas e Atendimento** do CyberGuard!\n\n' +
        'Precisa de orientações sobre o bot, ponto eletrônico, declarações, termos de voluntariado ou normas do projeto? ' +
        'Escolha uma das opções abaixo:\n\n' +
        '📜 **Regras e Manuais (PDF)**\n' +
        'Consulte a documentação completa, fluxogramas de processos e faça o download dos manuais oficiais em PDF.\n\n' +
        '🤖 **Tirar Dúvida com a IA (Gemini)**\n' +
        'Receba uma resposta instantânea da nossa Inteligência Artificial, treinada com todas as regras e diretrizes do CyberGuard.\n\n' +
        '👤 **Tirar Dúvidas Comigo (Liderança)**\n' +
        'Envie sua pergunta diretamente para a Liderança do projeto por e-mail. A resposta será entregue na sua DM do Discord assim que for respondida.'
    )
    .addFields({
      name: '💡 Como funciona o atendimento por e-mail?',
      value:
        'Ao clicar no botão da Liderança, você preenche o formulário com sua dúvida. O bot encaminha um e-mail para a coordenação ' +
        'com um protocolo exclusivo (#DUVIDA-XXXX). Quando a liderança responder ao e-mail, o bot captura a resposta e entrega diretamente para você no Discord!',
    })
    .setFooter({ text: 'CyberGuard UTFPR • Inteligência de Ameaças & Extensão Universitária' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('painel_duvidas_regras')
      .setLabel('Regras e Manuais (PDF)')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📜'),
    new ButtonBuilder()
      .setCustomId('painel_duvidas_ia')
      .setLabel('Tirar Dúvida com IA (Gemini)')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🤖'),
    new ButtonBuilder()
      .setCustomId('painel_duvidas_lideranca')
      .setLabel('Tirar Dúvidas Comigo (Liderança)')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👤')
  );

  return { embeds: [embed], components: [row] };
}

async function garantirPainelDuvidas(client, canalIdCustom = null) {
  const canalId = canalIdCustom || config.canalDuvidasId;
  if (!canalId) {
    console.log('[suporte] Nenhum canal de dúvidas configurado (CANAL_DUVIDAS_ID vazio).');
    return null;
  }

  try {
    const canal = await client.channels.fetch(canalId);
    if (!canal || !canal.isTextBased()) {
      console.warn(`[suporte] Canal de dúvidas (${canalId}) não encontrado ou não é de texto.`);
      return null;
    }

    const mensagens = await canal.messages.fetch({ limit: 20 });
    const painelExistente = mensagens.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0].title?.includes('Central de Apoio & Dúvidas')
    );

    const painelData = montarPainelDuvidas();

    if (painelExistente) {
      await painelExistente.edit(painelData);
      console.log(`[suporte] Painel de dúvidas atualizado com sucesso no canal #${canal.name}.`);
      return painelExistente;
    }

    const novaMensagem = await canal.send(painelData);
    console.log(`[suporte] Novo painel de dúvidas publicado no canal #${canal.name}.`);
    return novaMensagem;
  } catch (err) {
    console.error('[suporte] Erro ao garantir painel de dúvidas:', err.message);
    return null;
  }
}

function iniciarColetorPrints(canal, sessao) {
  if (!canal || typeof canal.createMessageCollector !== 'function') return;

  const coletor = canal.createMessageCollector({
    filter: (m) => m.author.id === sessao.userId && m.attachments.size > 0,
    time: 90_000,
  });

  sessao.coletor = coletor;

  coletor.on('collect', async (mensagem) => {
    if (sessao.finalizado) return;

    for (const anexo of mensagem.attachments.values()) {
      if (sessao.arquivosAnexados.length >= 5) {
        await mensagem.reply('⚠️ Limite máximo de 5 prints atingido para este chamado. Clique no botão acima para concluir o envio.').catch(() => {});
        break;
      }

      const nomeExt = path.extname(anexo.name || '').toLowerCase();
      const extensoesPermitidas = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'];
      if (!extensoesPermitidas.includes(nomeExt) && !anexo.contentType?.startsWith('image/')) {
        await mensagem.reply(`⚠️ O arquivo \`${anexo.name}\` não é uma imagem ou PDF válido e foi desconsiderado.`).catch(() => {});
        continue;
      }

      if (anexo.size > 10 * 1024 * 1024) {
        await mensagem.reply(`⚠️ O arquivo \`${anexo.name}\` ultrapassa 10MB e não pôde ser anexado.`).catch(() => {});
        continue;
      }

      try {
        const dirTemp = path.resolve('./temp');
        if (!fs.existsSync(dirTemp)) {
          fs.mkdirSync(dirTemp, { recursive: true });
        }
        const nomeArquivoTemp = `print_${sessao.codigo}_${sessao.arquivosAnexados.length + 1}_${Date.now()}${nomeExt || '.png'}`;
        const caminhoLocal = path.join(dirTemp, nomeArquivoTemp);

        const resp = await axios.get(anexo.url, { responseType: 'arraybuffer', timeout: 15000 });
        fs.writeFileSync(caminhoLocal, resp.data);

        sessao.arquivosAnexados.push({
          filename: anexo.name || nomeArquivoTemp,
          path: caminhoLocal,
        });

        await mensagem.reply(
          `📸 Print recebido com sucesso: **${anexo.name}**!\n` +
          `Total anexado: **${sessao.arquivosAnexados.length}** print(s). Você pode enviar mais imagens ou clicar em **"✉️ Concluir e Enviar E-mail"** acima para finalizar.`
        ).catch(() => {});
      } catch (errDownload) {
        console.error('[suporte] Erro ao baixar print anexo:', errDownload.message);
        await mensagem.reply(`❌ Ocorreu uma falha ao baixar o print \`${anexo.name}\`. Tente enviar novamente.`).catch(() => {});
      }
    }
  });

  coletor.on('end', async (_coletados, razao) => {
    if (sessao.finalizado) return;
    if (razao === 'time') {
      console.log(`[suporte] Timeout de 90s atingido para a coleta de prints do chamado #${sessao.codigo}. Enviando automaticamente...`);
      await finalizarEEnviarChamado(sessao.codigo);
    }
  });
}

async function finalizarEEnviarChamado(codigo, interactionBotao = null) {
  const sessao = sessoesSuportePrints.get(codigo);
  if (!sessao || sessao.finalizado) return;
  sessao.finalizado = true;

  if (sessao.coletor) {
    try { sessao.coletor.stop(); } catch (_) {}
  }

  usuariosEnviandoPrints.delete(sessao.userId);
  sessoesSuportePrints.delete(codigo);

  const destinatarioAdmin =
    config.emailSuporteAdmin || config.smtp.destinatarios[0] || config.smtp.user;

  let statusMembro = 'Não cadastrado';
  try {
    const m = await db.getMembro(sessao.userId);
    if (m) {
      statusMembro = m.status ? `Status: ${m.status}` : 'Em andamento';
      if (m.ra) statusMembro += ` (RA: ${m.ra})`;
    }
  } catch (_) {}

  const printsInfoTexto =
    sessao.arquivosAnexados.length > 0
      ? `\n* Foram anexados ${sessao.arquivosAnexados.length} print(s)/arquivo(s) a este e-mail.`
      : '';

  const linksTexto = sessao.linksPrints ? `LINKS DE PRINTS: ${sessao.linksPrints}\n` : '';

  let messageId = null;
  try {
    const emailInfo = await transporter.sendMail({
      from: config.smtp.from || config.smtp.user,
      to: destinatarioAdmin,
      subject: `[CyberGuard Suporte] Dúvida #${codigo} - ${sessao.assunto}`,
      text:
        `Olá Renan / Liderança do CyberGuard,\n\n` +
        `O integrante ${sessao.nomeUsuario} (<@${sessao.userId}>) enviou uma solicitação de suporte / ajuda.\n\n` +
        `----------------------------------------------------------------------\n` +
        `PROTOCOLO: #${codigo}\n` +
        `INTEGRANTE: ${sessao.nomeUsuario} (ID: ${sessao.userId})\n` +
        `ORIGEM: ${sessao.origem === 'onboarding' ? 'Onboarding / Cadastro' : 'Canal / Dúvidas'}\n` +
        `SITUAÇÃO DO CADASTRO: ${statusMembro}\n` +
        `ASSUNTO: ${sessao.assunto}\n` +
        `${linksTexto}` +
        `PRINTS ANEXADOS: ${sessao.arquivosAnexados.length} imagem(ns)\n` +
        `----------------------------------------------------------------------\n\n` +
        `SOLICITAÇÃO / DÚVIDA DO INTEGRANTE:\n` +
        `"${sessao.pergunta}"\n${printsInfoTexto}\n\n` +
        `======================================================================\n` +
        `COMO RESPONDER:\n` +
        `Basta RESPONDER a este e-mail normalmente pelo seu cliente de e-mail!\n` +
        `O CyberGuard Bot monitora esta caixa postal, capturará o seu texto e\n` +
        `enviará a resposta diretamente para ${sessao.nomeUsuario} no Discord.\n` +
        `IMPORTANTE: Mantenha o código [#${codigo}] no assunto do e-mail.\n` +
        `======================================================================\n\n` +
        `Atenciosamente,\n` +
        `Central de Atendimento Automático • CyberGuard Bot`,
      attachments: sessao.arquivosAnexados.map((a) => ({
        filename: a.filename,
        path: a.path,
      })),
    });
    messageId = emailInfo.messageId;
  } catch (errEmail) {
    console.error('[suporte] Erro ao enviar e-mail para a liderança:', errEmail.message);
    const erroMsg = '❌ Falha na conexão SMTP ao enviar o e-mail para a liderança. Por favor, tente novamente em instantes.';
    if (interactionBotao) {
      await interactionBotao.reply({ content: erroMsg, ephemeral: true }).catch(() => {});
    } else if (sessao.interaction) {
      await sessao.interaction.followUp({ content: erroMsg, ephemeral: true }).catch(() => {});
    }
    return;
  } finally {
    for (const arq of sessao.arquivosAnexados) {
      try {
        if (fs.existsSync(arq.path)) fs.unlinkSync(arq.path);
      } catch (_) {}
    }
  }

  const nomesAnexos = sessao.arquivosAnexados.map((a) => a.filename).join(', ') || null;
  const perguntaFinal = sessao.linksPrints
    ? `${sessao.pergunta}\n\n[Links de prints]: ${sessao.linksPrints}`
    : sessao.pergunta;

  await db.criarDuvidaSuporte({
    codigo,
    discordId: sessao.userId,
    nomeUsuario: sessao.nomeUsuario,
    canalOrigemId: sessao.canalOrigemId,
    assunto: sessao.assunto,
    pergunta: perguntaFinal,
    messageIdEmail: messageId,
    anexos: nomesAnexos,
    origem: sessao.origem,
  });

  const embedConfirmacao = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('📨 Solicitação Encaminhada para a Liderança!')
    .setDescription(
      `Sua solicitação foi registrada com sucesso e um e-mail com todas as informações e prints foi enviado para a coordenação.\n\n` +
        `• **Protocolo:** \`#${codigo}\`\n` +
        `• **Título:** ${sessao.assunto}\n` +
        `• **Prints Anexados:** ${sessao.arquivosAnexados.length} imagem(ns)\n` +
        `• **Status:** ⏳ Aguardando resposta por e-mail da Liderança\n\n` +
        `Assim que a liderança responder ao e-mail, **o bot entregará a resposta diretamente para você por Mensagem Direta (DM)!**`
    )
    .setFooter({ text: 'Guarde seu código de protocolo para referência futura.' })
    .setTimestamp();

  if (interactionBotao) {
    await interactionBotao.update({ embeds: [embedConfirmacao], components: [] }).catch(() => {});
  } else if (sessao.interaction) {
    await sessao.interaction.editReply({ embeds: [embedConfirmacao], components: [] }).catch(() => {});
  }
}

function cancelarSessaoSuporte(codigo, interactionBotao = null) {
  const sessao = sessoesSuportePrints.get(codigo);
  if (!sessao || sessao.finalizado) return;
  sessao.finalizado = true;

  if (sessao.coletor) {
    try { sessao.coletor.stop(); } catch (_) {}
  }

  usuariosEnviandoPrints.delete(sessao.userId);
  sessoesSuportePrints.delete(codigo);

  for (const arq of sessao.arquivosAnexados) {
    try {
      if (fs.existsSync(arq.path)) fs.unlinkSync(arq.path);
    } catch (_) {}
  }

  const msgCancelado = '❌ **Chamado de suporte cancelado.** Nenhum e-mail foi enviado.';
  if (interactionBotao) {
    interactionBotao.update({ content: msgCancelado, embeds: [], components: [] }).catch(() => {});
  } else if (sessao.interaction) {
    sessao.interaction.editReply({ content: msgCancelado, embeds: [], components: [] }).catch(() => {});
  }
}

async function handleDuvidasInteraction(interaction) {
  // 1. Botão Acessar Regras e Manuais
  if (interaction.isButton() && interaction.customId === 'painel_duvidas_regras') {
    const documentacaoCommand = require('../commands/documentacao/documentacaoCommand');
    return documentacaoCommand.execute(interaction, { ephemeral: true });
  }

  // 2. Botão Tirar Dúvida com IA
  if (interaction.isButton() && interaction.customId === 'painel_duvidas_ia') {
    const modal = new ModalBuilder()
      .setCustomId('modal_suporte_duvida_ia')
      .setTitle('Tirar Dúvida com IA (Gemini)');

    const input = new TextInputBuilder()
      .setCustomId('input_texto_duvida_ia')
      .setLabel('Qual é a sua dúvida sobre o CyberGuard?')
      .setPlaceholder('Ex.: Como justifico uma falta, como funciona o ponto ou a declaração?')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(5)
      .setMaxLength(1000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 3. Submissão do Modal de Dúvida com IA
  if (interaction.isModalSubmit() && interaction.customId === 'modal_suporte_duvida_ia') {
    const pergunta = interaction.fields.getTextInputValue('input_texto_duvida_ia');
    await interaction.deferReply({ ephemeral: true });

    const respostaIA = await responderDuvidaComGemini(pergunta, {
      nomeUsuario: interaction.user.displayName || interaction.user.username,
    });

    const embed = new EmbedBuilder()
      .setColor(0x2f6fed)
      .setTitle('🤖 CyberGuard Assist • Resposta da IA (Gemini)')
      .setDescription(`**Sua Dúvida:**\n> *${pergunta}*\n\n**Orientações Oficiais:**\n${respostaIA}`)
      .setFooter({ text: 'Se a dúvida persistir, utilize o botão "Tirar Dúvidas Comigo" no canal.' });

    return interaction.editReply({ embeds: [embed] });
  }

  // 4. Botão Tirar Dúvidas com a Liderança (Painel ou Onboarding)
  if (
    interaction.isButton() &&
    (interaction.customId === 'painel_duvidas_lideranca' ||
      interaction.customId === 'onboarding_abrir_suporte')
  ) {
    const origem = interaction.customId === 'onboarding_abrir_suporte' ? 'onboarding' : 'painel';
    return abrirModalSuporte(interaction, origem);
  }

  // 5. Finalizar ou Cancelar envio de chamado com prints via botões
  if (interaction.isButton() && interaction.customId.startsWith('suporte_enviar_')) {
    const codigo = interaction.customId.replace('suporte_enviar_', '');
    await finalizarEEnviarChamado(codigo, interaction);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('suporte_cancelar_')) {
    const codigo = interaction.customId.replace('suporte_cancelar_', '');
    cancelarSessaoSuporte(codigo, interaction);
    return true;
  }

  // 6. Submissão do Modal de Dúvida / Suporte para a Liderança
  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith('modal_suporte_duvida_lideranca')
  ) {
    const origem = interaction.customId.replace('modal_suporte_duvida_lideranca_', '') || 'geral';
    const assunto = interaction.fields.getTextInputValue('input_assunto_lideranca');
    const pergunta = interaction.fields.getTextInputValue('input_pergunta_lideranca');
    let linksPrints = '';
    try {
      linksPrints = interaction.fields.getTextInputValue('input_links_prints')?.trim() || '';
    } catch (_) {}

    await interaction.deferReply({ ephemeral: true });

    const destinatarioAdmin =
      config.emailSuporteAdmin || config.smtp.destinatarios[0] || config.smtp.user;

    if (!destinatarioAdmin) {
      return interaction.editReply({
        content:
          '❌ Não foi possível registrar sua solicitação: nenhum e-mail de liderança/suporte está configurado no sistema.',
      });
    }

    const randomSufixo = Math.floor(1000 + Math.random() * 9000);
    const codigo = `DUVIDA-${randomSufixo}`;
    const nomeUsuario = interaction.user.tag || interaction.user.username;
    const userId = interaction.user.id;

    for (const [cod, sess] of sessoesSuportePrints.entries()) {
      if (sess.userId === userId) {
        cancelarSessaoSuporte(cod);
      }
    }

    const sessao = {
      codigo,
      userId,
      nomeUsuario,
      canalOrigemId: interaction.channelId,
      assunto,
      pergunta,
      linksPrints,
      origem,
      arquivosAnexados: [],
      coletor: null,
      timerTimeout: null,
      finalizado: false,
      interaction,
    };

    sessoesSuportePrints.set(codigo, sessao);
    usuariosEnviandoPrints.add(userId);

    const embedAguardando = new EmbedBuilder()
      .setColor(0x2f6fed)
      .setTitle(`📋 Chamado #${codigo} Iniciado!`)
      .setDescription(
        `Seu chamado foi registrado com o protocolo **\`#${codigo}\`**.\n\n` +
          `• **Título:** ${assunto}\n` +
          `• **Solicitação:** ${pergunta}\n` +
          (linksPrints ? `• **Link informado:** ${linksPrints}\n` : '') +
          `\n📸 **Deseja anexar capturas de tela/prints do problema?**\n` +
          `Você pode **enviar imagens/prints diretamente aqui nesta conversa (DM)** nos próximos 90 segundos.\n\n` +
          `Assim que terminar de anexar seus prints (ou se já quiser enviar sem anexar imagens), clique no botão **"✉️ Concluir e Enviar E-mail"** abaixo.`
      )
      .setFooter({ text: 'O CyberGuard encaminhará seus dados e prints para o e-mail da liderança.' })
      .setTimestamp();

    const rowBotoes = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`suporte_enviar_${codigo}`)
        .setLabel('✉️ Concluir e Enviar E-mail')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✉️'),
      new ButtonBuilder()
        .setCustomId(`suporte_cancelar_${codigo}`)
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [embedAguardando], components: [rowBotoes] });

    iniciarColetorPrints(interaction.channel, sessao);
    return true;
  }

  return false;
}

function encontrarParteTexto(structure) {
  let partePlain = null;
  let parteHtml = null;

  function percorrer(node) {
    if (!node) return;
    if (node.type === 'text/plain' && node.part && !partePlain) {
      partePlain = node.part;
    } else if (node.type === 'text/html' && node.part && !parteHtml) {
      parteHtml = node.part;
    }
    if (Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        percorrer(child);
      }
    }
  }

  percorrer(structure);
  return partePlain || parteHtml || null;
}

function limparRespostaEmail(textoBruto) {
  if (!textoBruto) return '';
  let texto = textoBruto;

  if (/<[a-z][\s\S]*>/i.test(texto)) {
    texto = texto
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }

  const linhas = texto.split(/\r?\n/);
  const linhasLimpas = [];
  for (const linha of linhas) {
    const l = linha.trim();
    if (/^Em\s.+escreveu:?$/i.test(l)) break;
    if (/^On\s.+wrote:?$/i.test(l)) break;
    if (/^-+\s*(Mensagem original|Original message|Forwarded message)\s*-+$/i.test(l)) break;
    if (/^De:\s.+/i.test(l) && linhasLimpas.length > 0) break;
    if (/^From:\s.+/i.test(l) && linhasLimpas.length > 0) break;
    if (l.startsWith('>')) continue;
    linhasLimpas.push(linha);
  }

  const limpo = linhasLimpas.join('\n').trim();
  return limpo || texto.trim();
}

/**
 * Escuta IMAP e processa respostas de e-mail enviadas pela liderança para as dúvidas pendentes.
 */
async function processarRespostasDuvidasImap(imap, client) {
  const duvidasPendentes = await db.listarDuvidasPendentes();
  if (!duvidasPendentes || duvidasPendentes.length === 0) {
    return;
  }

  const uids = await imap.search({ subject: 'DUVIDA-' });
  if (!uids || uids.length === 0) {
    return;
  }

  for (const uid of uids) {
    const msg = await imap.fetchOne(uid, { envelope: true, bodyStructure: true, flags: true });
    const assunto = msg.envelope?.subject || '';
    const match = assunto.match(/#(DUVIDA-[A-Z0-9_-]+)/i);
    if (!match) continue;

    const codigo = match[1].toUpperCase();
    const duvida = duvidasPendentes.find((d) => d.codigo.toUpperCase() === codigo);
    if (!duvida) continue;

    let textoResposta = '';
    const parteTexto = encontrarParteTexto(msg.bodyStructure);

    if (parteTexto) {
      const downloadRes = await imap.download(uid, parteTexto);
      const chunks = [];
      for await (const chunk of downloadRes.content) {
        chunks.push(chunk);
      }
      textoResposta = Buffer.concat(chunks).toString('utf-8');
    } else {
      const downloadRes = await imap.download(uid);
      const chunks = [];
      for await (const chunk of downloadRes.content) {
        chunks.push(chunk);
      }
      textoResposta = Buffer.concat(chunks).toString('utf-8');
    }

    textoResposta = limparRespostaEmail(textoResposta);
    if (!textoResposta) {
      console.warn(`[suporte-imap] E-mail para ${codigo} recebido, mas o texto da resposta veio vazio.`);
      continue;
    }

    console.log(`[suporte-imap] Resposta da Liderança recebida para #${codigo}! Atualizando registro...`);
    await db.atualizarRespostaDuvida(codigo, textoResposta);

    try {
      await imap.messageFlagsAdd({ uid }, ['\\Seen']);
    } catch (_) {}

    const embedNotificacao = new EmbedBuilder()
      .setColor(0x2f6fed)
      .setTitle('📬 Sua Solicitação foi Respondida pela Liderança!')
      .setDescription(`Olá, <@${duvida.discord_id}>! A liderança do CyberGuard respondeu sua mensagem enviada por e-mail.`)
      .addFields(
        { name: '🔖 Protocolo', value: `\`#${duvida.codigo}\``, inline: true },
        { name: '📌 Assunto', value: duvida.assunto || 'Solicitação de Apoio', inline: true },
        { name: '❓ Sua Mensagem', value: duvida.pergunta },
        { name: '💬 Resposta da Liderança', value: textoResposta }
      )
      .setFooter({ text: 'CyberGuard UTFPR • Central de Apoio e Suporte' })
      .setTimestamp();

    const components = [];
    try {
      const membro = await db.getMembro(duvida.discord_id);
      if (membro && membro.status !== 'concluido') {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('onboarding_reiniciar')
              .setLabel('🔄 Continuar Cadastro / Onboarding')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔄')
          )
        );
      }
    } catch (_) {}

    let enviadoDm = false;
    try {
      const user = await client.users.fetch(duvida.discord_id);
      if (user) {
        await user.send({ embeds: [embedNotificacao], components });
        enviadoDm = true;
        console.log(`[suporte-imap] Resposta de #${codigo} entregue com sucesso na DM de ${duvida.discord_id}.`);
      }
    } catch (errDm) {
      console.warn(`[suporte-imap] Falha ao enviar DM para ${duvida.discord_id} (DMs fechadas?):`, errDm.message);
    }

    // Se o usuário bloqueia DMs, posta notificação no canal de suporte
    if (!enviadoDm) {
      try {
        const canalAlvoId = duvida.canal_origem_id || config.canalDuvidasId;
        if (canalAlvoId) {
          const canal = await client.channels.fetch(canalAlvoId);
          if (canal) {
            await canal.send({
              content: `📢 <@${duvida.discord_id}>, a liderança respondeu sua dúvida (#${duvida.codigo}) por e-mail (sua DM está indisponível):`,
              embeds: [embedNotificacao],
              components,
            });
            console.log(`[suporte-imap] Resposta de #${codigo} postada no canal #${canal.name}.`);
          }
        }
      } catch (errCanal) {
        console.error('[suporte-imap] Erro ao postar resposta de fallback no canal:', errCanal.message);
      }
    }
  }
}

module.exports = {
  montarPainelDuvidas,
  garantirPainelDuvidas,
  criarModalSuporte,
  abrirModalSuporte,
  estaEnviandoPrints,
  handleDuvidasInteraction,
  processarRespostasDuvidasImap,
};
