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
  if (a.includes('etico') || a.includes('hack') || a.includes('red') || a.includes('blue')) return 'HackingEtico';
  if (a.includes('design')) return 'Design';
  if (a.includes('hardware')) return 'HardwareHacking';
  if (a.includes('humano') || a.includes('rh')) return 'Recursos Humanos';
  if (a.includes('social') || a.includes('copy')) return 'SocialMedia';
  if (a.includes('lider')) return 'Líderes';
  return 'Geral';
}

async function concluirTermoAssinado({ membro, caminhoArquivo, nomeOriginal }) {
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

    fs.copyFileSync(caminhoArquivo, caminhoPermanente);
  } catch (errSalvar) {
    console.error('Erro ao salvar cópia permanente do termo assinado:', errSalvar);
  }

  // 3. Atualizar status no banco
  await db.atualizarStatus(membro.discord_id, 'concluido', {
    termo_arquivo_path: caminhoPermanente || caminhoArquivo,
  });

  // 4. Limpar o temporário se diferente do permanente
  if (caminhoArquivo && caminhoPermanente && caminhoArquivo !== caminhoPermanente && fs.existsSync(caminhoArquivo)) {
    fs.unlink(caminhoArquivo, () => {});
  }

  return { emailEnviado, erroEmailMsg, caminhoPermanente };
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

  const conteudoRh =
    `⚠️ **Termo pendente de revisão manual**\n` +
    `**Membro:** <@${membro.discord_id}> (${membro.nome})\n` +
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
  if (message.attachments.size === 0) return;

  const membro = await db.getMembro(message.author.id);
  if (!membro) return;

  if (membro.status === 'concluido') {
    await message.reply('Seu termo de voluntariado já foi validado e seu cadastro no CyberGuard já está concluído! 🎉');
    return;
  }

  if (membro.status !== 'aguardando_assinatura' && membro.status !== 'revisao_manual') {
    return;
  }

  const anexo = message.attachments.first();
  const extensao = path.extname(anexo.name).toLowerCase();

  if (extensao !== '.pdf') {
    await message.reply(
      'Preciso que o termo assinado seja enviado em formato **.pdf** (o arquivo gerado pela assinatura ' +
        'digital no gov.br). Envie o PDF assinado, não o Word ou imagem.'
    );
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
    // Encaminha para o RH revisar manualmente com botões de aprovar/reprovar
    await db.atualizarStatus(message.author.id, 'revisao_manual', {
      termo_arquivo_path: caminhoLocal,
    });
    await encaminharParaRevisaoManual(message.client, membro, caminhoLocal, anexo.name, validacao.motivo);

    await message.reply(
      `Recebi seu termo de voluntariado! Porém, não foi possível validá-lo automaticamente pelo seguinte motivo:\n` +
      `> *${validacao.motivo}*\n\n` +
      `Encaminhei o documento para a equipe do Recursos Humanos conferir manualmente. ` +
      `Aguarde a confirmação por aqui!`
    );
    return;
  }

  // Validação automática bem-sucedida!
  await concluirTermoAssinado({
    membro,
    caminhoArquivo: caminhoLocal,
    nomeOriginal: anexo.name,
  });

  await message.reply(
    'Termo recebido e validado com sucesso! 🎉 Encaminhei uma cópia para a coordenação por e-mail e seu cadastro está concluído. Bem-vindo(a) ao CyberGuard!'
  );

  if (config.channelRhId) {
    try {
      const canalRh = await message.client.channels.fetch(config.channelRhId);
      await canalRh.send({
        content: `📋 **Termo Validado Automaticamente**\nO termo de <@${membro.discord_id}> (${membro.nome} - RA: \`${membro.ra || 'N/A'}\`) foi validado e enviado por e-mail para a coordenação com sucesso!`,
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
  });

  // Notificar o aluno por DM
  try {
    const usuario = await interaction.client.users.fetch(discordId);
    await usuario.send(
      'Seu termo de voluntariado foi revisado e aprovado pelo RH! 🎉 ' +
      'O documento foi encaminhado para a coordenação e seu cadastro no CyberGuard está concluído. ' +
      'Seja muito bem-vindo(a)!'
    );
  } catch (errDm) {
    console.error('Erro ao enviar DM de aprovação manual para o aluno:', errDm);
  }

  const avisoEmail = emailEnviado
    ? '📌 *O documento foi arquivado e o e-mail foi disparado para a coordenação com sucesso!*'
    : `⚠️ *O termo foi arquivado, mas houve erro no envio do e-mail: ${erroEmailMsg}*`;

  await interaction.editReply({
    content:
      `✅ **Termo Aprovado Manualmente** por <@${interaction.user.id}>\n` +
      `**Membro:** <@${discordId}> (${membro.nome})\n` +
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

  const conteudoAtualizado =
    `❌ **Termo Reprovado Manualmente** por <@${interaction.user.id}>\n` +
    `**Membro:** <@${discordId}> (${membro?.nome || 'Desconhecido'})\n` +
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
};
