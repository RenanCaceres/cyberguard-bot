const axios = require('axios');
const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} = require('discord.js');
const config = require('./config');
const db = require('./db');
const { encaminharTermoAssinado } = require('./emailService');
const { validarTermoDevolvido } = require('./dataAssinatura');
const { fazerUploadTermo } = require('./driveService');

const cooldownsRespostaDM = new Map();

function estaEmCooldownResposta(userId, segundos = 8) {
  const agora = Date.now();
  const ultimo = cooldownsRespostaDM.get(userId) || 0;
  return agora - ultimo < segundos * 1000;
}

function marcarCooldownResposta(userId) {
  cooldownsRespostaDM.set(userId, Date.now());
}

/**
 * Extrai anexos tanto do array direto message.attachments quanto de mensagens encaminhadas (messageSnapshots).
 */
function extrairAnexosMensagem(message) {
  const anexos = [];
  if (message.attachments && message.attachments.size > 0) {
    anexos.push(...message.attachments.values());
  }
  if (message.messageSnapshots && message.messageSnapshots.size > 0) {
    for (const snap of message.messageSnapshots.values()) {
      if (snap.attachments && snap.attachments.size > 0) {
        anexos.push(...snap.attachments.values());
      } else if (snap.message?.attachments && snap.message.attachments.size > 0) {
        anexos.push(...snap.message.attachments.values());
      }
    }
  }
  return anexos;
}

function temPermissaoRh(member) {
  if (!member) return false;
  if (member.permissions && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return member.roles && member.roles.cache.some((r) => r.name === config.roleRhNome);
}

async function baixarAnexo(url, destino) {
  const resposta = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(destino, resposta.data);
  return destino;
}

function obterSubpastaArea(area) {
  if (!area) return 'Geral';
  const a = area.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (a.includes('hardware')) return 'HardwareHacking';
  if (a.includes('etico') || a.includes('hack') || a.includes('red') || a.includes('blue')) return 'HackingEtico';
  if (a.includes('design')) return 'Design';
  if (a.includes('humano') || a.includes('rh')) return 'Recursos Humanos';
  if (a.includes('social') || a.includes('copy')) return 'SocialMedia';
  if (a.includes('lider')) return 'Líderes';
  if (a.includes('observatorio')) return 'Observatorio';
  if (a.includes('educacion')) return 'Educacional';
  if (a.includes('desenvolv')) return 'Desenvolvimento';
  return 'Geral';
}

async function concluirTermoAssinado({ membro, caminhoArquivo, nomeOriginal, client = null }) {
  // 1. Enviar e-mail para a coordenação com cópias
  let emailEnviado = true;
  let erroEmailMsg = null;
  try {
    await encaminharTermoAssinado(membro, caminhoArquivo, nomeOriginal);
  } catch (errEmail) {
    emailEnviado = false;
    erroEmailMsg = errEmail.message;
    console.error('Erro ao encaminhar termo assinado por e-mail:', errEmail);
  }

  // 2. Salvar cópia permanente na pasta docs/Termos-Voluntarios-Assinados/<área>
  let caminhoPermanente = null;
  try {
    const pastaBase = path.resolve('./docs/Termos-Voluntarios-Assinados');
    const subpasta = obterSubpastaArea(membro.area_interesse);
    const pastaDestino = path.join(pastaBase, subpasta);
    fs.mkdirSync(pastaDestino, { recursive: true });

    const nomeFormatado = (membro.nome || 'membro').trim().replace(/[\s/\\]+/g, '_');
    const raFormatado = (membro.ra || membro.discord_id).trim();
    const nomeArquivo = `termo_assinado_${raFormatado}_${nomeFormatado}.pdf`;
    caminhoPermanente = path.join(pastaDestino, nomeArquivo);

    // Remove eventuais versões anteriores do mesmo aluno na pasta local antes de gravar o novo
    try {
      const raLimpo = String(membro.ra || '').replace(/\D/g, '');
      const existentes = fs.readdirSync(pastaDestino);
      for (const arq of existentes) {
        if (arq === nomeArquivo || !arq.toLowerCase().endsWith('.pdf')) continue;
        if (
          (raLimpo.length >= 5 && arq.includes(raLimpo)) ||
          arq.toLowerCase().includes(nomeFormatado.toLowerCase())
        ) {
          fs.unlinkSync(path.join(pastaDestino, arq));
        }
      }
    } catch {}

    fs.copyFileSync(caminhoArquivo, caminhoPermanente);
  } catch (errSalvar) {
    console.error('Erro ao salvar cópia permanente do termo assinado:', errSalvar);
  }

  // 3. Salvar no Google Drive (substituindo versão anterior do mesmo aluno, se existir)
  let driveUpload = null;
  try {
    const nomeUpload = caminhoPermanente
      ? path.basename(caminhoPermanente)
      : nomeOriginal || `termo_assinado_${membro.ra || membro.discord_id}.pdf`;

    driveUpload = await fazerUploadTermo({
      caminhoArquivo: caminhoPermanente || caminhoArquivo,
      nomeArquivo: nomeUpload,
      area: membro.area_interesse,
      ra: membro.ra,
      nomeAluno: membro.nome,
    });
    if (driveUpload) {
      const nomeRef = membro.nome_social || membro.nome;
      console.log(`[drive] Termo de ${nomeRef} sincronizado no Google Drive: ${driveUpload.name}`);
    }
  } catch (errDrive) {
    console.error('Erro ao enviar termo assinado para o Google Drive:', errDrive.message);
  }

  // 4. Extrair data do carimbo da assinatura e atualizar status no banco
  let dataCarimboIso = null;
  try {
    const { extrairDataCarimboAssinatura } = require('./dataAssinatura');
    dataCarimboIso = await extrairDataCarimboAssinatura(caminhoPermanente || caminhoArquivo);
  } catch (eCarimbo) {
    console.warn('Não foi possível extrair carimbo da assinatura digital:', eCarimbo.message);
  }

  const updatesBanco = {
    termo_arquivo_path: caminhoPermanente || caminhoArquivo,
  };
  let dataAssinaturaDate = new Date();
  if (dataCarimboIso) {
    const [y, m, d] = dataCarimboIso.split('-');
    updatesBanco.data_inicio = `${d}/${m}/${y}`;
    dataAssinaturaDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }

  await db.atualizarStatus(membro.discord_id, 'concluido', updatesBanco);
  await db.registrarAssinaturaTermo(membro.discord_id, dataAssinaturaDate, caminhoPermanente || caminhoArquivo);

  // 5. Atualizar Notion: Membro agora passa para 'Ativo' e 'Data de Entrada' é baseada
  // única e exclusivamente na data do carimbo da assinatura.
  try {
    const { registrarMembroAtivo } = require('./notionMembros');
    const membroAtualizado = await db.getMembro(membro.discord_id);
    await registrarMembroAtivo(membroAtualizado, dataCarimboIso);

    if (membroAtualizado && membroAtualizado.status_notion_workspace !== 'liberado') {
      const { adicionarMembroWorkspace } = require('./notionWorkspace');
      const emailAlvo = (membroAtualizado.email_notion || membroAtualizado.email || '').trim().toLowerCase();
      if (emailAlvo) {
        const resWs = await adicionarMembroWorkspace(emailAlvo);
        if (resWs?.sucesso) {
          await db.atualizarStatusNotionWorkspace(membro.discord_id, 'liberado');
          if (config.channelRhId && client) {
            try {
              const canalRh = await client.channels.fetch(config.channelRhId);
              await canalRh.send(
                `✅ **Notion Liberado com o Termo:** O integrante **${membroAtualizado.nome_social || membroAtualizado.nome}** (<@${membro.discord_id}>) foi adicionado com sucesso ao Workspace do Notion!`
              );
            } catch (_) {}
          }
        }
      }
    }
  } catch (errNotion) {
    console.error('Erro ao atualizar membro ativo no Notion após assinatura:', errNotion.message);
  }

  // 6. Limpar o temporário se diferente do permanente
  if (caminhoArquivo && caminhoPermanente && caminhoArquivo !== caminhoPermanente && fs.existsSync(caminhoArquivo)) {
    fs.unlink(caminhoArquivo, () => {});
  }

  return { emailEnviado, erroEmailMsg, caminhoPermanente, driveUpload };
}

async function encaminharParaRevisaoManual(client, membro, caminhoArquivo, nomeOriginal, motivo) {
  if (!config.channelRhId) {
    console.warn('CHANNEL_RH_ID não configurado. Impossível encaminhar termo para revisão manual.');
    return;
  }
  const canalRh = await client.channels.fetch(config.channelRhId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`termo_aprovar_${membro.discord_id}`)
      .setLabel('Aprovar e Enviar E-mail')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`termo_reprovar_${membro.discord_id}`)
      .setLabel('Reprovar Termo')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );

  const nomeRefMembro = membro.nome_social
    ? `${membro.nome_social} (Nome Civil: ${membro.nome})`
    : membro.nome;

  const conteudoRh =
    `⚠️ **Termo pendente de revisão manual**\n` +
    `**Membro:** <@${membro.discord_id}> (${nomeRefMembro})\n` +
    `**RA:** \`${membro.ra || 'N/A'}\` | **Área:** ${membro.area_interesse || 'Geral'}\n` +
    `**Motivo da não validação automática:**\n> *${motivo || 'Data de assinatura ou posição não confirmada automaticamente.'}*\n\n` +
    `Por favor, baixe o PDF anexado abaixo para verificar. Se estiver tudo certo, clique em **Aprovar e Enviar E-mail**. ` +
    `Caso haja algo errado, clique em **Reprovar Termo** para informar o motivo da reprovação e notificar o aluno:`;

  await canalRh.send({
    content: conteudoRh,
    files: [{ attachment: caminhoArquivo, name: nomeOriginal || 'termo_assinado.pdf' }],
    components: [row],
  });
}

async function handleMensagemDM(message) {
  if (message.author.bot) return;
  if (message.channel.type !== 1) return; // 1 = DM

  const { estaEnviandoPrints } = require('./suporteDuvidas');
  if (estaEnviandoPrints(message.author.id)) return;

  const anexos = extrairAnexosMensagem(message);
  const membro = await db.getMembro(message.author.id);

  if (!membro) {
    if (anexos.length === 0) {
      if (estaEmCooldownResposta(message.author.id)) return;
      marcarCooldownResposta(message.author.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('onboarding_abrir_suporte')
          .setLabel('🆘 Abrir Chamado de Suporte')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🆘')
      );

      await message.reply({
        content:
          '👋 **Olá! Sou o assistente automatizado do CyberGuard.**\n\n' +
          'Não encontrei um cadastro ativo vinculado à sua conta no momento.\n' +
          '• Para iniciar seu cadastro no projeto, acesse o canal de boas-vindas do nosso servidor Discord;\n' +
          '• Se você tiver qualquer dúvida ou precisar falar com a liderança, use o comando **/ajuda** no servidor ou clique no botão abaixo para abrir um chamado:',
        components: [row],
      });
    }
    return;
  }

  if (membro.status === 'concluido') {
    if (anexos.length > 0) {
      await message.reply(
        'Seu termo de voluntariado já foi validado e seu cadastro no CyberGuard já está concluído! 🎉 Caso precise de auxílio, use o comando **/ajuda** no servidor ou digite **`ajuda`** aqui na DM.'
      );
      return;
    }

    if (estaEmCooldownResposta(message.author.id)) return;
    marcarCooldownResposta(message.author.id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('onboarding_abrir_suporte')
        .setLabel('🆘 Abrir Chamado de Suporte')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🆘')
    );

    await message.reply({
      content:
        '👋 **Olá!** Seu cadastro no CyberGuard já está **concluído** e seu termo foi validado com sucesso! 🎉\n\n' +
        '💡 **Precisa de ajuda ou suporte?**\n' +
        '• Digite **`ajuda`** aqui na DM ou use o comando **/ajuda** em qualquer canal do servidor para falar diretamente com a liderança;\n' +
        '• Você também pode consultar tutoriais e manuais no canal **#dúvidas** do servidor;\n' +
        '• Ou clique no botão abaixo para abrir uma solicitação de suporte diretamente:',
      components: [row],
    });
    return;
  }

  if (membro.status === 'coletando_dados') {
    if (anexos.length === 0) {
      if (estaEmCooldownResposta(message.author.id)) return;
      marcarCooldownResposta(message.author.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('onboarding_reiniciar')
          .setLabel('🔄 Continuar Cadastro')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId('onboarding_abrir_suporte')
          .setLabel('🆘 Abrir Chamado de Suporte')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🆘')
      );

      await message.reply({
        content:
          '👋 **Central de Cadastro • CyberGuard**\n\n' +
          'Seu cadastro ainda está em andamento. Clique em **"Continuar Cadastro"** abaixo para retomar de onde parou, ou em **"Abrir Chamado de Suporte"** se estiver enfrentando alguma dificuldade.\n\n' +
          '💡 Você também pode digitar **`ajuda`** a qualquer momento para falar com a coordenação.',
        components: [row],
      });
    }
    return;
  }

  if (membro.status !== 'aguardando_assinatura' && membro.status !== 'revisao_manual') {
    return;
  }

  // Se o membro está aguardando assinatura ou em revisão manual mas não enviou nenhum anexo nem snapshot
  if (anexos.length === 0) {
    if (estaEmCooldownResposta(message.author.id)) return;
    marcarCooldownResposta(message.author.id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('onboarding_abrir_suporte')
        .setLabel('🆘 Abrir Chamado de Suporte')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🆘')
    );

    if (membro.status === 'revisao_manual') {
      await message.reply({
        content:
          '⏳ **Termo em Análise Manual pelo RH**\n\n' +
          'Seu termo de voluntariado já foi recebido e está aguardando a conferência manual da equipe de Recursos Humanos.\n' +
          'Assim que a equipe validar o documento, você receberá a confirmação por aqui!\n\n' +
          '💡 **Precisa de suporte?** Se desejar falar com a liderança ou relatar alguma observação, use o comando **/ajuda** no servidor ou clique no botão abaixo:',
        components: [row],
      });
      return;
    }

    await message.reply({
      content:
        '👋 **Olá! Sou o assistente automatizado do CyberGuard.**\n\n' +
        'Identifiquei sua mensagem! Se você está tentando enviar o seu **Termo de Voluntariado assinado**, siga as orientações abaixo:\n\n' +
        '📄 **Como enviar o seu termo:**\n' +
        '1. O documento precisa ser enviado diretamente como anexo em formato **.pdf** aqui nesta conversa (evite colar links ou textos soltos);\n' +
        '2. Certifique-se de que o PDF foi assinado digitalmente pelo portal **gov.br** (assinador.iti.br) e que o campo **"Data:"** foi devidamente preenchido antes da assinatura.\n\n' +
        '💡 **Como utilizar o módulo de Ajuda & Suporte (/ajuda):**\n' +
        '• **Dúvidas ou problemas com o arquivo?** Se você não souber como assinar, o bot rejeitou seu arquivo ou você precisa de auxílio da liderança, clique em **"Abrir Chamado de Suporte"** abaixo;\n' +
        '• Você também pode digitar **`ajuda`** ou **`suporte`** a qualquer momento aqui na DM (ou usar o comando **/ajuda** no servidor) para relatar um problema e anexar prints;\n' +
        '• Um chamado oficial com protocolo (#DUVIDA-XXXX) será gerado para a liderança e a resposta chegará diretamente aqui na sua DM!',
      components: [row],
    });
    return;
  }

  const anexo = anexos[0];
  const extensao = path.extname(anexo.name || '').toLowerCase();

  if (extensao !== '.pdf') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('onboarding_abrir_suporte')
        .setLabel('🆘 Abrir Chamado de Suporte')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🆘')
    );

    await message.reply({
      content:
        '⚠️ **Arquivo em formato incompatível!**\n\n' +
        'Preciso que o termo assinado seja enviado em formato **.pdf** (o arquivo gerado pela assinatura ' +
        'digital no portal **gov.br**). Envie o arquivo PDF assinado, não o Word, imagem ou outro formato.\n\n' +
        '💡 **Precisa de ajuda com o documento?**\n' +
        'Se você tiver dificuldades para gerar ou assinar o PDF, clique em **"Abrir Chamado de Suporte"** abaixo ou use o comando **/ajuda** no servidor para falar com a liderança.',
      components: [row],
    });
    return;
  }

  const dirTemp = path.resolve('./temp');
  if (!fs.existsSync(dirTemp)) {
    fs.mkdirSync(dirTemp, { recursive: true });
  }

  const caminhoLocal = path.join(dirTemp, `pendente_termo_${message.author.id}.pdf`);
  await baixarAnexo(anexo.url, caminhoLocal);

  const validacao = await validarTermoDevolvido(caminhoLocal);

  if (!validacao.valido) {
    if (validacao.revisarManualmente) {
      // Apenas em anomalias técnicas raras (ex: assinatura criptográfica sem coordenadas legíveis)
      await db.atualizarStatus(message.author.id, 'revisao_manual', {
        termo_arquivo_path: caminhoLocal,
      });
      await encaminharParaRevisaoManual(message.client, membro, caminhoLocal, anexo.name, validacao.motivo);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('onboarding_abrir_suporte')
          .setLabel('🆘 Abrir Chamado de Suporte')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🆘')
      );

      await message.reply({
        content:
          `Recebi seu termo de voluntariado! Porém, não foi possível confirmar alguns metadados técnicos automaticamente:\n` +
          `> *${validacao.motivo}*\n\n` +
          `Encaminhei o documento para a equipe do Recursos Humanos conferir manualmente. Aguarde a confirmação por aqui!\n\n` +
          `💡 Se precisar de suporte adicional, clique em **"Abrir Chamado de Suporte"** abaixo ou use o comando **/ajuda**.`,
        components: [row],
      });
      return;
    }

    // Rejeição automática 100% assertiva direto para o membro corrigir e reenviar
    if (membro.status !== 'aguardando_assinatura') {
      await db.atualizarStatus(message.author.id, 'aguardando_assinatura');
    }
    if (fs.existsSync(caminhoLocal)) {
      fs.unlink(caminhoLocal, () => {});
    }

    const citacaoMotivo = validacao.motivo
      .split('\n')
      .map((linha) => `> ${linha}`)
      .join('\n');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('onboarding_abrir_suporte')
        .setLabel('🆘 Preciso de Ajuda / Suporte')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🆘')
    );

    await message.reply({
      content:
        `❌ **Não foi possível validar o seu Termo de Voluntariado pelo(s) seguinte(s) motivo(s):**\n\n` +
        `${citacaoMotivo}\n\n` +
        `Por favor, corrija o documento, assine novamente pelo portal **gov.br** e envie o PDF corrigido aqui nesta DM!\n\n` +
        `💡 **Como utilizar o módulo de Ajuda se precisar:**\n` +
        `• Caso você acredite que o documento está correto ou esteja com dúvidas sobre o erro apontado, clique em **"Preciso de Ajuda / Suporte"** abaixo para relatar à liderança;\n` +
        `• Você também pode usar o comando **/ajuda** no servidor ou digitar **\`ajuda\`** nesta conversa para anexar prints e pedir auxílio.`,
      components: [row],
    });
    return;
  }

  // Validação automática bem-sucedida!
  await concluirTermoAssinado({
    membro,
    caminhoArquivo: caminhoLocal,
    nomeOriginal: anexo.name,
    client: message.client,
  });

  const textoConclusaoAuto =
    'Termo recebido e validado com sucesso! 🎉 Encaminhei uma cópia para a coordenação por e-mail e seu cadastro está concluído. Bem-vindo(a) ao CyberGuard!' +
    (config.notionHomeUrl ? `\n\n📌 **Acesse a página central do CyberGuard no Notion:** ${config.notionHomeUrl}` : '');

  await message.reply(textoConclusaoAuto);

  if (config.channelRhId) {
    try {
      const canalRh = await message.client.channels.fetch(config.channelRhId);
      const nomeRef = membro.nome_social
        ? `${membro.nome_social} (Nome Civil: ${membro.nome})`
        : membro.nome;
      await canalRh.send({
        content: `📋 **Termo Validado Automaticamente**\nO termo de <@${membro.discord_id}> (${nomeRef} - RA: \`${membro.ra || 'N/A'}\`) foi validado e enviado por e-mail para a coordenação com sucesso!`,
      });
    } catch (e) {
      console.error('Erro ao avisar RH sobre termo auto-validado:', e);
    }
  }
}

async function handleRevisaoTermoInteraction(interaction) {
  // 1. Botões de aprovação e reprovação
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('termo_aprovar_')) {
      const discordId = interaction.customId.replace('termo_aprovar_', '');
      await handleBotaoAprovarTermo(interaction, discordId);
      return true;
    }
    if (interaction.customId.startsWith('termo_reprovar_')) {
      const discordId = interaction.customId.replace('termo_reprovar_', '');
      await handleBotaoReprovarTermo(interaction, discordId);
      return true;
    }
    return false;
  }

  // 2. Submissão do modal de reprovação
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_reprovar_termo_')) {
    const discordId = interaction.customId.replace('modal_reprovar_termo_', '');
    await handleModalReprovarTermo(interaction, discordId);
    return true;
  }

  return false;
}

async function handleBotaoAprovarTermo(interaction, discordId) {
  if (!temPermissaoRh(interaction.member)) {
    await interaction.reply({
      content: `Apenas membros com o cargo "${config.roleRhNome}" podem aprovar termos.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const membro = await db.getMembro(discordId);
  if (!membro) {
    await interaction.editReply({
      content: 'Membro não encontrado no banco de dados.',
      components: [],
    });
    return;
  }

  if (membro.status === 'concluido') {
    await interaction.editReply({
      content: `O termo de <@${discordId}> já foi aprovado anteriormente.`,
      components: [],
    });
    return;
  }

  // Localiza ou recupera o arquivo PDF
  let caminhoPdf = membro.termo_arquivo_path;
  const dirTemp = path.resolve('./temp');
  const fallbackPath = path.join(dirTemp, `pendente_termo_${discordId}.pdf`);

  if (!caminhoPdf || !fs.existsSync(caminhoPdf)) {
    if (fs.existsSync(fallbackPath)) {
      caminhoPdf = fallbackPath;
    } else {
      const anexo = interaction.message.attachments.first();
      if (anexo && anexo.url) {
        fs.mkdirSync(dirTemp, { recursive: true });
        caminhoPdf = fallbackPath;
        await baixarAnexo(anexo.url, caminhoPdf);
      }
    }
  }

  if (!caminhoPdf || !fs.existsSync(caminhoPdf)) {
    await interaction.editReply({
      content: '⚠️ Não foi possível localizar o arquivo PDF (nem no disco, nem no anexo da mensagem).',
      components: [],
    });
    return;
  }

  const nomeOriginal =
    interaction.message.attachments.first()?.name || `termo_assinado_${membro.ra || discordId}.pdf`;

  const { emailEnviado, erroEmailMsg } = await concluirTermoAssinado({
    membro,
    caminhoArquivo: caminhoPdf,
    nomeOriginal,
    client: interaction.client,
  });

  // Notificar o aluno por DM
  try {
    const usuario = await interaction.client.users.fetch(discordId);
    const msgConclusaoManual =
      'Seu termo de voluntariado foi revisado e aprovado pelo RH! 🎉 ' +
      'O documento foi encaminhado para a coordenação e seu cadastro no CyberGuard está concluído. ' +
      'Seja muito bem-vindo(a)!' +
      (config.notionHomeUrl ? `\n\n📌 **Acesse a página central do CyberGuard no Notion:** ${config.notionHomeUrl}` : '');

    await usuario.send(msgConclusaoManual);
  } catch (errDm) {
    console.error('Erro ao enviar DM de aprovação manual para o aluno:', errDm);
  }

  const avisoEmail = emailEnviado
    ? '📌 *O documento foi arquivado e o e-mail foi disparado para a coordenação com sucesso!*'
    : `⚠️ *O termo foi arquivado, mas houve erro no envio do e-mail: ${erroEmailMsg}*`;

  const nomeRefMembro = membro.nome_social
    ? `${membro.nome_social} (Nome Civil: ${membro.nome})`
    : membro.nome;

  await interaction.editReply({
    content:
      `✅ **Termo Aprovado Manualmente** por <@${interaction.user.id}>\n` +
      `**Membro:** <@${discordId}> (${nomeRefMembro})\n` +
      `**RA:** \`${membro.ra || 'N/A'}\` | **Área:** ${membro.area_interesse || 'Geral'}\n` +
      avisoEmail,
    components: [],
  });
}

async function handleBotaoReprovarTermo(interaction, discordId) {
  if (!temPermissaoRh(interaction.member)) {
    await interaction.reply({
      content: `Apenas membros com o cargo "${config.roleRhNome}" podem reprovar termos.`,
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_reprovar_termo_${discordId}`)
    .setTitle('Reprovar Termo de Voluntariado');

  const motivoInput = new TextInputBuilder()
    .setCustomId('motivo_reprova')
    .setLabel('Motivo da reprovação (enviado ao aluno)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Ex: A data precisa ser preenchida / Assinatura fora do campo Voluntário(a)...')
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));
  await interaction.showModal(modal);
}

async function handleModalReprovarTermo(interaction, discordId) {
  if (!temPermissaoRh(interaction.member)) {
    await interaction.reply({
      content: `Apenas membros com o cargo "${config.roleRhNome}" podem reprovar termos.`,
      ephemeral: true,
    });
    return;
  }

  const motivo = interaction.fields.getTextInputValue('motivo_reprova').trim();
  const membro = await db.getMembro(discordId);

  // 1. Atualizar status de volta para aguardando_assinatura para que o aluno possa reenviar
  await db.atualizarStatus(discordId, 'aguardando_assinatura');

  // Limpar arquivo temporário pendente
  const caminhoTemp = path.resolve('./temp', `pendente_termo_${discordId}.pdf`);
  if (fs.existsSync(caminhoTemp)) {
    fs.unlink(caminhoTemp, () => {});
  }

  // 2. Notificar o aluno por DM com o motivo
  let enviouDm = false;
  try {
    const usuario = await interaction.client.users.fetch(discordId);
    await usuario.send(
      '⚠️ **Atenção sobre o seu Termo de Voluntariado:**\n\n' +
      'O RH realizou a conferência do seu documento e ele precisou ser **reprovado** pelo seguinte motivo:\n' +
      `> *${motivo}*\n\n` +
      'Por favor, faça as correções necessárias e envie o PDF corrigido novamente aqui nesta DM.'
    );
    enviouDm = true;
  } catch (errDm) {
    console.error('Erro ao enviar DM de reprovação para o aluno:', errDm);
  }

  // 3. Atualizar a mensagem no canal do RH
  const statusDm = enviouDm
    ? 'O aluno foi notificado por DM e poderá enviar o termo corrigido.'
    : '⚠️ Não consegui notificar o aluno por DM (DMs fechadas).';

  const nomeRefMembro = membro?.nome_social
    ? `${membro.nome_social} (Nome Civil: ${membro.nome})`
    : (membro?.nome || 'Desconhecido');

  const conteudoAtualizado =
    `❌ **Termo Reprovado Manualmente** por <@${interaction.user.id}>\n` +
    `**Membro:** <@${discordId}> (${nomeRefMembro})\n` +
    `**RA:** \`${membro?.ra || 'N/A'}\` | **Área:** ${membro?.area_interesse || 'Geral'}\n` +
    `**Motivo informado ao aluno:**\n> *${motivo}*\n\n` +
    `📌 *${statusDm}*`;

  if (interaction.isFromMessage()) {
    await interaction.update({ content: conteudoAtualizado, components: [] });
  } else {
    await interaction.reply({ content: conteudoAtualizado, ephemeral: true });
  }
}

module.exports = {
  handleMensagemDM,
  handleRevisaoTermoInteraction,
  encaminharParaRevisaoManual,
  concluirTermoAssinado,
  extrairAnexosMensagem,
};
