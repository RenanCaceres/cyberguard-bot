const fs = require('fs');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./config');
const db = require('./db');
const { gerarTermo } = require('./termService');
const { adicionarLinhaPlanilha } = require('./sheetsService');
const { postarCartao } = require('./cartaoServidor');
const { TEXTO_MANUAL_CONDUTA } = require('./manualConduta');
const { adicionarMembroWorkspace } = require('./notionWorkspace');

function construirEmbedResumidoRH(membro, aprovado, responsavelUsername) {
  return new EmbedBuilder()
    .setTitle(aprovado ? '✅ Solicitação de entrada — Aprovada' : '❌ Solicitação de entrada — Rejeitada')
    .setDescription(
      '🔒 *Os dados pessoais sensíveis (CPF, endereço, telefone e data de nascimento) foram ocultados deste histórico do canal em conformidade com a LGPD (Art. 6º, III e Art. 46) e encontram-se arquivados com criptografia no banco de dados.*'
    )
    .addFields(
      { name: 'Discord', value: `<@${membro.discord_id}>`, inline: true },
      { name: 'Nome', value: membro.nome || '—', inline: true },
      { name: 'RA', value: membro.ra || '—', inline: true },
      { name: 'Curso / Período', value: `${membro.curso || '—'} (${membro.periodo || '—'})`, inline: true },
      { name: 'Área solicitada', value: membro.area_interesse || '—', inline: true },
      { name: 'Processado por', value: responsavelUsername || 'RH', inline: true }
    )
    .setColor(aprovado ? 0x57f287 : 0xed4245)
    .setTimestamp();
}

function membroTemRoleRh(interactionMember) {
  return interactionMember.roles.cache.some((r) => r.name === config.roleRhNome);
}

function botoesProcessando(aprovado) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('processando_aprovar')
      .setLabel(aprovado ? 'Aprovando...' : 'Aprovar')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('processando_rejeitar')
      .setLabel(!aprovado ? 'Rejeitando...' : 'Rejeitar')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );
  return [row];
}

async function handleAprovacaoInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('aprovar_') && !interaction.customId.startsWith('rejeitar_')) {
    return;
  }

  if (!membroTemRoleRh(interaction.member)) {
    await interaction.reply({
      content: `Apenas membros com o cargo "${config.roleRhNome}" podem aprovar ou rejeitar.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const aprovado = interaction.customId.startsWith('aprovar_');
  const discordId = interaction.customId.split('_')[1];

  const membro = await db.getMembro(discordId);
  if (!membro) {
    await interaction.editReply({ content: 'Membro não encontrado no banco.', components: [] });
    return;
  }

  if (membro.status !== 'pendente_aprovacao') {
    await interaction.editReply({
      content: `Essa solicitação já foi processada antes (status atual: ${membro.status}).`,
      components: [],
    });
    return;
  }

  await interaction.editReply({ components: botoesProcessando(aprovado) });

  const usuarioDiscord = await interaction.client.users.fetch(discordId);

  if (!aprovado) {
    await interaction.editReply({
      content:
        '✏️ Escreve aqui neste canal o **motivo da rejeição** (você tem 5 minutos). ' +
        'Isso fica só visível pro RH — o integrante não vê esse motivo.',
      components: [],
    });

    let motivo = 'Motivo não informado';
    try {
      const coletado = await interaction.channel.awaitMessages({
        filter: (m) => m.author.id === interaction.user.id,
        max: 1,
        time: 5 * 60 * 1000,
        errors: ['time'],
      });
      motivo = coletado.first().content.trim();
    } catch (err) {
      motivo = 'Motivo não informado (tempo esgotado ao pedir justificativa)';
    }

    await db.registrarRecusa({
      discordId,
      nome: membro.nome,
      ra: membro.ra,
      tipo: 'rejeitado',
      motivo,
    });

    await usuarioDiscord.send(
      'Sua solicitação de entrada não foi aprovada pelo RH. Se acha que isso é um engano, entre em contato com a diretoria.'
    );

    let statusExpulsao = '';
    if (config.expulsarAoRejeitar) {
      try {
        const guildMember = await interaction.guild.members.fetch(discordId);
        await guildMember.kick('Solicitação de entrada rejeitada pelo RH');
        statusExpulsao = ' — membro expulso do servidor';
      } catch (err) {
        console.error('Erro ao expulsar membro rejeitado:', err);
        statusExpulsao = ' — ⚠️ não consegui expulsar automaticamente, remova manualmente';
      }
    }

    // Mantém os dados arquivados (criptografados) no banco em vez de excluir (conforme diretriz de registro acadêmico)
    await db.atualizarStatus(discordId, 'rejeitado', { saida_processada: true });

    await interaction.editReply({
      content: `❌ Rejeitado por ${interaction.user.username}${statusExpulsao}`,
      embeds: [construirEmbedResumidoRH(membro, false, interaction.user.username)],
      components: [],
    });

    await interaction.channel.send(
      `❌ Rejeitado por ${interaction.user.username}${statusExpulsao}\nMotivo registrado: ${motivo}`
    );
    return;
  }

  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() + config.prazoDias);

  await db.atualizarStatus(discordId, 'aguardando_assinatura', {
    data_aprovacao: new Date(),
    data_limite_assinatura: dataLimite,
  });

  const membroAtualizado = await db.getMembro(discordId);
  const caminhoTermo = await gerarTermo(membroAtualizado);

  await adicionarLinhaPlanilha(membroAtualizado, usuarioDiscord.tag);

  try {
    const { registrarMembroAtivo } = require('./notionMembros');
    await registrarMembroAtivo(membroAtualizado);
  } catch (errNotion) {
    console.error('Erro ao registrar membro no Notion:', errNotion.message);
  }

  await postarCartao(interaction.client, config.channelBoasVindasId, {
    tipo: 'entrada',
    nome: membroAtualizado.nome,
    discordTag: usuarioDiscord.tag,
    avatarUrl: usuarioDiscord.displayAvatarURL({ extension: 'png', size: 256 }),
  });

  if (config.roleAprovadoNome || membroAtualizado.area_interesse) {
    try {
      const guildMember = await interaction.guild.members.fetch(discordId);
      const nomesParaAtribuir = [config.roleAprovadoNome, membroAtualizado.area_interesse].filter(
        Boolean
      );

      for (const nomeCargo of nomesParaAtribuir) {
        let role = null;
        const roleIdFixo = config.rolesArea && config.rolesArea[nomeCargo];
        if (roleIdFixo) {
          role =
            interaction.guild.roles.cache.get(roleIdFixo) ??
            (await interaction.guild.roles.fetch(roleIdFixo).catch(() => null));
        }
        if (!role) {
          role = interaction.guild.roles.cache.find(
            (r) => r.name.toLowerCase() === nomeCargo.toLowerCase()
          );
        }
        if (!role && (nomeCargo === 'Hacking Ético' || nomeCargo === 'Hacking Etico') && config.roleHackingEticoId) {
          role =
            interaction.guild.roles.cache.get(config.roleHackingEticoId) ??
            (await interaction.guild.roles.fetch(config.roleHackingEticoId).catch(() => null));
        }
        if (!role) {
          role = interaction.guild.roles.cache.find((r) => r.name === nomeCargo);
        }
        if (role) {
          await guildMember.roles.add(role);
        } else {
          console.warn(`Cargo "${nomeCargo}" não encontrado no servidor.`);
        }
      }
    } catch (err) {
      console.error('Erro ao atribuir cargos ao membro aprovado:', err);
    }
  }

  if (config.channelRhId && membroAtualizado.email) {
    let statusNotionWorkspace = '';
    try {
      const resWorkspace = await adicionarMembroWorkspace(membroAtualizado.email);
      if (resWorkspace.sucesso) {
        statusNotionWorkspace = '\n✅ *Acesso ao Workspace do Notion liberado automaticamente!*';
      } else {
        statusNotionWorkspace = `\n⚠️ *Aviso Workspace Notion:* ${resWorkspace.mensagem}`;
      }
    } catch (errWs) {
      statusNotionWorkspace = `\n⚠️ *Não foi possível adicionar automaticamente ao Workspace:* ${errWs.message}`;
    }

    try {
      const canalRh = await interaction.guild.channels.fetch(config.channelRhId);
      await canalRh.send({
        content: `🔑 **Liberação de Acesso ao Notion:**\nO integrante **${membroAtualizado.nome}** (<@${discordId}> - RA: \`${membroAtualizado.ra || 'N/A'}\`) foi aprovado no onboarding!\n📧 **E-mail:** \`${membroAtualizado.email}\`\n📌 *O cadastro foi registrado como Ativo no Notion.*${statusNotionWorkspace}`,
      });
    } catch (errRhNotif) {
      console.error('Erro ao notificar canal do RH sobre e-mail Notion:', errRhNotif.message);
    }
  }

  const areaMembro = membroAtualizado.area_interesse;
  let linkArea = config.whatsappLinksArea ? config.whatsappLinksArea[areaMembro] : null;
  if (!linkArea && areaMembro && config.whatsappLinksArea) {
    const chave = Object.keys(config.whatsappLinksArea).find(
      (k) =>
        k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ===
        areaMembro.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    if (chave) linkArea = config.whatsappLinksArea[chave];
  }
  const linhaLinkArea = linkArea
    ? `Aqui está também o link do grupo da sua área (${areaMembro}) no WhatsApp: ${linkArea}\n\n`
    : '';

  await usuarioDiscord.send({
    content:
      'Sua entrada foi aprovada! 🎉\n\n' +
      `Aqui está o link da comunidade geral no WhatsApp: ${config.whatsappLink}\n\n` +
      linhaLinkArea +
      'Segue também o termo de voluntariado, já quase todo preenchido. Antes de assinar:\n' +
      '1. Abra o PDF e preencha o campo **"Data:"** com a data de hoje (dd/mm/aaaa) — é o único campo em branco.\n' +
      '2. Envie esse mesmo PDF pra assinatura no **gov.br** (assinador de documentos).\n' +
      `3. Me mande o PDF já assinado de volta aqui por DM, em até **${config.prazoDias} dias**.`,
    files: [caminhoTermo],
  });

  // Remove o arquivo temporário em texto claro do disco local (LGPD Art. 46)
  fs.unlink(caminhoTermo, () => {});

  try {
    await usuarioDiscord.send({
      files: [{ attachment: config.tutorialGovbrPath, name: 'tutorial_assinatura_govbr.pdf' }],
    });
  } catch (err) {
    console.error('Erro ao enviar o tutorial de assinatura gov.br:', err);
  }

  await usuarioDiscord.send(TEXTO_MANUAL_CONDUTA);

  await interaction.editReply({
    content: `✅ Aprovado por ${interaction.user.username}`,
    embeds: [construirEmbedResumidoRH(membroAtualizado, true, interaction.user.username)],
    components: [],
  });
}

module.exports = { handleAprovacaoInteraction };
