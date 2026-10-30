'use strict';

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

  // 4. Botão Tirar Dúvidas com a Liderança (E-mail)
  if (interaction.isButton() && interaction.customId === 'painel_duvidas_lideranca') {
    const modal = new ModalBuilder()
      .setCustomId('modal_suporte_duvida_lideranca')
      .setTitle('Enviar Dúvida para a Liderança');

    const inputAssunto = new TextInputBuilder()
      .setCustomId('input_assunto_lideranca')
      .setLabel('Assunto / Tópico')
      .setPlaceholder('Ex.: Dúvida sobre validação de documento ou ajuste específico')
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(100)
      .setRequired(true);

    const inputPergunta = new TextInputBuilder()
      .setCustomId('input_pergunta_lideranca')
      .setLabel('Descreva sua dúvida com detalhes:')
      .setPlaceholder('Explique o que ocorreu e o que você precisa que seja esclarecido...')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(10)
      .setMaxLength(1500)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(inputAssunto),
      new ActionRowBuilder().addComponents(inputPergunta)
    );
    return interaction.showModal(modal);
  }

  // 5. Submissão do Modal de Dúvida para a Liderança
  if (interaction.isModalSubmit() && interaction.customId === 'modal_suporte_duvida_lideranca') {
    const assunto = interaction.fields.getTextInputValue('input_assunto_lideranca');
    const pergunta = interaction.fields.getTextInputValue('input_pergunta_lideranca');

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

    let messageId = null;
    try {
      const emailInfo = await transporter.sendMail({
        from: config.smtp.from || config.smtp.user,
        to: destinatarioAdmin,
        subject: `[CyberGuard Suporte] Dúvida #${codigo} - ${assunto}`,
        text:
          `Olá Renan / Liderança do CyberGuard,\n\n` +
          `O integrante ${nomeUsuario} (<@${interaction.user.id}>) enviou uma dúvida através do canal de suporte do Discord.\n\n` +
          `----------------------------------------------------------------------\n` +
          `PROTOCOLO: #${codigo}\n` +
          `INTEGRANTE: ${nomeUsuario} (ID: ${interaction.user.id})\n` +
          `CANAL: #${interaction.channel?.name || 'suporte'}\n` +
          `ASSUNTO: ${assunto}\n` +
          `----------------------------------------------------------------------\n\n` +
          `DÚVIDA DO INTEGRANTE:\n` +
          `"${pergunta}"\n\n` +
          `======================================================================\n` +
          `COMO RESPONDER:\n` +
          `Basta RESPONDER a este e-mail normalmente pelo seu cliente de e-mail!\n` +
          `O CyberGuard Bot monitora esta caixa postal, capturará o seu texto e\n` +
          `enviará a resposta diretamente para ${nomeUsuario} no Discord.\n` +
          `IMPORTANTE: Mantenha o código [#${codigo}] no assunto do e-mail.\n` +
          `======================================================================\n\n` +
          `Atenciosamente,\n` +
          `Central de Atendimento Automático • CyberGuard Bot`,
      });
      messageId = emailInfo.messageId;
    } catch (errEmail) {
      console.error('[suporte] Erro ao enviar e-mail para a liderança:', errEmail.message);
      return interaction.editReply({
        content:
          '❌ Ocorreu uma falha na conexão SMTP ao enviar o e-mail para a liderança. Por favor, tente novamente em instantes ou avise a equipe.',
      });
    }

    await db.criarDuvidaSuporte({
      codigo,
      discordId: interaction.user.id,
      nomeUsuario,
      canalOrigemId: interaction.channelId,
      assunto,
      pergunta,
      messageIdEmail: messageId,
    });

    const embedConfirmacao = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('📨 Dúvida Encaminhada para a Liderança!')
      .setDescription(
        `Sua dúvida foi registrada com sucesso e um e-mail com todas as informações foi enviado para a coordenação.\n\n` +
          `• **Protocolo:** \`#${codigo}\`\n` +
          `• **Assunto:** ${assunto}\n` +
          `• **Status:** ⏳ Aguardando resposta por e-mail da Liderança\n\n` +
          `Assim que a liderança responder ao e-mail, **o bot enviará a resposta diretamente para você por Mensagem Direta (DM)!**`
      )
      .setFooter({ text: 'Guarde seu código de protocolo para referência futura.' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embedConfirmacao] });
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

  // Sanitiza tags HTML se for mensagem HTML
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
    // Interrompe quando começar citação de e-mails antigos ou headers
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
      .setTitle('📬 Sua Dúvida foi Respondida pela Liderança!')
      .setDescription(`Olá, <@${duvida.discord_id}>! A liderança do CyberGuard respondeu sua dúvida enviada por e-mail.`)
      .addFields(
        { name: '🔖 Protocolo', value: `\`#${duvida.codigo}\``, inline: true },
        { name: '📌 Assunto', value: duvida.assunto || 'Dúvida Geral', inline: true },
        { name: '❓ Sua Pergunta', value: duvida.pergunta },
        { name: '💬 Resposta da Liderança', value: textoResposta }
      )
      .setFooter({ text: 'CyberGuard UTFPR • Central de Apoio e Suporte' })
      .setTimestamp();

    let enviadoDm = false;
    try {
      const user = await client.users.fetch(duvida.discord_id);
      if (user) {
        await user.send({ embeds: [embedNotificacao] });
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
  handleDuvidasInteraction,
  processarRespostasDuvidasImap,
};
