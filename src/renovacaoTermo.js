'use strict';

/**
 * CyberGuard UTFPR — Módulo de Monitoramento e Renovação Semestral de Termos
 * Vigência estrita de 6 meses por termo.
 * Notifica o canal do RH quando a vigência expira e fornece ações interativas:
 * 1. Gerar novo termo (renovação automática de 6 meses).
 * 2. Modal para edição/customização das 5 atividades antes de gerar.
 */

const fs = require('fs');
const cron = require('node-cron');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('./config');
const db = require('./db');
const { gerarTermo } = require('./termService');
const { obterAtividadesECronograma } = require('./atividadesVoluntariado');

function membroTemRoleRh(interactionMember) {
  if (!interactionMember || !interactionMember.roles || !interactionMember.roles.cache) return false;
  return interactionMember.roles.cache.some((r) => r.name === config.roleRhNome);
}

function formatarDataBr(dataObj) {
  if (!dataObj) return '—';
  const d = dataObj instanceof Date ? dataObj : new Date(dataObj);
  if (isNaN(d.getTime())) return '—';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

async function verificarRenovacoes(client) {
  if (!config.channelRhId) return;

  let canalRh = null;
  try {
    canalRh = await client.channels.fetch(config.channelRhId);
  } catch (errCanal) {
    console.error('[renovacao-termos] Erro ao buscar canal do RH:', errCanal.message);
    return;
  }
  if (!canalRh) return;

  const membrosParaRenovar = await db.listarMembrosParaRenovacaoTermo();
  const agora = new Date();

  for (const membro of membrosParaRenovar) {
    try {
      // 1. Verificar se o membro ainda está no servidor do Discord
      let guildMember = null;
      for (const guild of client.guilds.cache.values()) {
        const gm = guild.members.cache.get(membro.discord_id) || (await guild.members.fetch(membro.discord_id).catch(() => null));
        if (gm) {
          guildMember = gm;
          break;
        }
      }
      if (!guildMember) {
        // Aluno não está mais no servidor
        continue;
      }

      // 2. Determinar datas de vigência
      let dInicio = membro.data_assinatura_termo ? new Date(membro.data_assinatura_termo) : null;
      if (!dInicio && membro.data_inicio) {
        const partes = String(membro.data_inicio).split('/');
        if (partes.length === 3) {
          dInicio = new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));
        }
      }
      if (!dInicio && membro.data_aprovacao) {
        dInicio = new Date(membro.data_aprovacao);
      }
      if (!dInicio) dInicio = agora;

      let dFim = membro.data_fim_termo ? new Date(membro.data_fim_termo) : null;
      if (!dFim) {
        dFim = new Date(dInicio);
        dFim.setMonth(dFim.getMonth() + 6);
      }

      // Se ainda não atingiu a data de fim (e falta mais de 5 dias), não notifica ainda
      const diffDias = Math.floor((agora - dFim) / (1000 * 60 * 60 * 24));
      if (diffDias < -5) continue;

      const rolesArray = guildMember.roles?.cache ? Array.from(guildMember.roles.cache.values()) : [];
      const ehLider = rolesArray.some((r) =>
        /l[ií]der/i.test(r.name) || r.name === 'Diretoria' || r.name === 'Presidente' || r.name === 'Vice-Presidente'
      ) || (config.lideresTime && Object.values(config.lideresTime).includes(membro.discord_id));

      const { setorNome, papelLabel } = obterAtividadesECronograma(membro.area_interesse, ehLider);

      const embed = new EmbedBuilder()
        .setTitle('⏰ Alerta: Termo de Voluntariado Vencido (6 Meses)')
        .setDescription(
          `O termo de adesão ao serviço voluntário de <@${membro.discord_id}> completou **6 meses de vigência** desde a assinatura.\n\n` +
          `Para manter a regularidade institucional perante a UTFPR e a continuidade do voluntário no projeto, é necessário emitir a **renovação semestral** do termo.`
        )
        .addFields(
          {
            name: 'Voluntário(a)',
            value: `<@${membro.discord_id}> (${membro.nome_social ? `${membro.nome_social} (Nome Civil: ${membro.nome})` : (membro.nome || '—')})`,
            inline: true,
          },
          { name: 'RA', value: `\`${membro.ra || 'N/A'}\``, inline: true },
          { name: 'Setor / Função', value: `${setorNome} (${papelLabel})`, inline: true },
          { name: 'Data de Início/Assinatura', value: formatarDataBr(dInicio), inline: true },
          { name: 'Fim da Vigência', value: `${formatarDataBr(dFim)} (6 meses expirados)`, inline: true },
          { name: 'Situação', value: '⚠️ Aguardando renovação', inline: true }
        )
        .setColor(0xf1c40f)
        .setFooter({ text: 'CyberGuard UTFPR • Gestão Regulatória de Voluntariado' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`renovar_termo_gerar_${membro.discord_id}`)
          .setLabel('Gerar Novo Termo (Renovar)')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId(`renovar_termo_editar_${membro.discord_id}`)
          .setLabel('Editar Atividades do Termo')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✏️')
      );

      await canalRh.send({ embeds: [embed], components: [row] });
      await db.marcarAlertaRenovacaoEnviado(membro.discord_id);
    } catch (errMembro) {
      console.error(`[renovacao-termos] Erro ao processar membro ${membro.discord_id}:`, errMembro.message);
    }
  }
}

function iniciarMonitoramentoRenovacao(client) {
  try {
    const cronSchedule = config.cronLembrete || '0 9 * * *';
    cron.schedule(cronSchedule, async () => {
      await verificarRenovacoes(client);
    });

    // Verificação inicial após boot do bot (com pequeno delay para conexões estabilizarem)
    setTimeout(() => {
      verificarRenovacoes(client).catch((err) =>
        console.error('[renovacao-termos] Erro na verificação inicial:', err.message)
      );
    }, 20000);

    console.log('[renovacao-termos] Monitoramento semestral de termos ativo.');
  } catch (err) {
    console.error('[renovacao-termos] Erro ao iniciar monitoramento:', err.message);
  }
}

async function enviarTermoRenovadoAoMembroERh(client, interaction, membro, caminhoPdf, atividadesUsadas = null) {
  const usuarioDiscord = await client.users.fetch(membro.discord_id).catch(() => null);
  let enviadoDm = false;

  if (usuarioDiscord) {
    try {
      await usuarioDiscord.send({
        content:
          `Olá, <@${membro.discord_id}>! 🎉\n\n` +
          `Seu termo de adesão ao serviço voluntário no **CyberGuard UTFPR** completou 6 meses e chegou o momento da **renovação** para você continuar com a gente no projeto!\n\n` +
          `Segue em anexo o seu novo termo de adesão (com vigência de mais 6 meses), preenchido com as atividades vigentes do seu setor.\n\n` +
          `**Passo a passo para regularização:**\n` +
          `1. Abra o PDF e confira o campo **"Data:"** com a data de hoje (dd/mm/aaaa).\n` +
          `2. Assine o PDF no portal oficial do **gov.br** (assinador de documentos).\n` +
          `3. Me envie o PDF assinado de volta aqui por DM para manter seu registro e suas horas ativas!`,
        files: [caminhoPdf],
      });
      enviadoDm = true;
    } catch (errDm) {
      console.warn(`[renovacao-termos] Falha ao enviar DM para ${membro.discord_id}:`, errDm.message);
    }
  }

  // Notificação no canal do RH com o arquivo gerado
  if (config.channelRhId) {
    try {
      const canalRh = await client.channels.fetch(config.channelRhId);
      const msgDmStatus = enviadoDm
        ? '✅ *O novo termo foi enviado automaticamente na DM do aluno com as instruções de assinatura gov.br.*'
        : '⚠️ *Não foi possível enviar por DM (privacidade fechada). O RH pode encaminhar o arquivo anexado abaixo.*';

      const nomeVoluntario = membro.nome_social
        ? `${membro.nome_social} (Nome Civil: ${membro.nome})`
        : (membro.nome || '—');

      await canalRh.send({
        content:
          `📄 **Termo de Renovação Emitido (Vigência de 6 Meses)**\n` +
          `**Voluntário(a):** <@${membro.discord_id}> (${nomeVoluntario})\n` +
          `**RA:** \`${membro.ra || 'N/A'}\` | **Setor:** ${membro.area_interesse || 'Geral'}\n` +
          `**Emitido por:** ${interaction.user.username}\n` +
          `${msgDmStatus}`,
        files: [{ attachment: caminhoPdf, name: `termo_renovacao_${membro.ra || membro.discord_id}.pdf` }],
      });
    } catch (errRh) {
      console.error('[renovacao-termos] Erro ao notificar RH com termo gerado:', errRh.message);
    }
  }

  // Atualiza status do aluno para aguardar a assinatura da renovação
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() + (config.prazoDias || 7));

  await db.atualizarStatus(membro.discord_id, 'aguardando_assinatura', {
    data_limite_assinatura: dataLimite,
  });

  if (atividadesUsadas) {
    await db.salvarAtividadesCustomizadas(membro.discord_id, atividadesUsadas);
  }

  // Limpeza de arquivo temporário
  fs.unlink(caminhoPdf, () => {});
}

async function handleRenovacaoTermoInteraction(interaction) {
  // 1. Botão: Gerar Novo Termo diretamente
  if (interaction.isButton() && interaction.customId.startsWith('renovar_termo_gerar_')) {
    if (!membroTemRoleRh(interaction.member)) {
      await interaction.reply({
        content: `Apenas integrantes com o cargo "${config.roleRhNome}" podem gerar a renovação do termo.`,
        ephemeral: true,
      });
      return true;
    }

    const discordId = interaction.customId.replace('renovar_termo_gerar_', '');
    const membro = await db.getMembro(discordId);
    if (!membro) {
      await interaction.reply({ content: 'Membro não encontrado no banco de dados.', ephemeral: true });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const caminhoPdf = await gerarTermo(membro, {
        client: interaction.client,
        dataReferencia: new Date(),
      });

      await enviarTermoRenovadoAoMembroERh(interaction.client, interaction, membro, caminhoPdf);

      await interaction.editReply({
        content: `✅ O termo de renovação semestral de <@${discordId}> foi gerado e enviado com sucesso!`,
      });
    } catch (err) {
      console.error('[renovacao-termos] Erro ao gerar termo:', err);
      await interaction.editReply({
        content: `❌ Ocorreu um erro ao gerar o termo: ${err.message}`,
      });
    }
    return true;
  }

  // 2. Botão: Abrir Modal para editar as 5 atividades antes de gerar
  if (interaction.isButton() && interaction.customId.startsWith('renovar_termo_editar_')) {
    if (!membroTemRoleRh(interaction.member)) {
      await interaction.reply({
        content: `Apenas integrantes com o cargo "${config.roleRhNome}" podem editar as atividades do termo.`,
        ephemeral: true,
      });
      return true;
    }

    const discordId = interaction.customId.replace('renovar_termo_editar_', '');
    const membro = await db.getMembro(discordId);
    if (!membro) {
      await interaction.reply({ content: 'Membro não encontrado no banco de dados.', ephemeral: true });
      return true;
    }

    const guildMember = interaction.guild ? await interaction.guild.members.fetch(discordId).catch(() => null) : null;
    const rolesArray = guildMember?.roles?.cache ? Array.from(guildMember.roles.cache.values()) : [];
    const ehLider = rolesArray.some((r) =>
      /l[ií]der/i.test(r.name) || r.name === 'Diretoria' || r.name === 'Presidente' || r.name === 'Vice-Presidente'
    ) || (config.lideresTime && Object.values(config.lideresTime).includes(discordId));

    const { atividades: ativPadrao } = obterAtividadesECronograma(membro.area_interesse, ehLider);
    const ativs = (Array.isArray(membro.atividades_customizadas) && membro.atividades_customizadas.length === 5)
      ? membro.atividades_customizadas
      : ativPadrao;

    const modal = new ModalBuilder()
      .setCustomId(`modal_renovar_editar_${discordId}`)
      .setTitle('Editar Atividades do Termo');

    for (let i = 0; i < 5; i++) {
      const input = new TextInputBuilder()
        .setCustomId(`ativ_${i + 1}`)
        .setLabel(`Atividade ${i + 1}`)
        .setStyle(TextInputStyle.Paragraph)
        .setValue(String(ativs[i] || '').slice(0, 1000))
        .setMaxLength(1000)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
    }

    await interaction.showModal(modal);
    return true;
  }

  // 3. Submissão do Modal de Edição de Atividades
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_renovar_editar_')) {
    const discordId = interaction.customId.replace('modal_renovar_editar_', '');
    const membro = await db.getMembro(discordId);
    if (!membro) {
      await interaction.reply({ content: 'Membro não encontrado no banco de dados.', ephemeral: true });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const atividadesCustom = [
        interaction.fields.getTextInputValue('ativ_1'),
        interaction.fields.getTextInputValue('ativ_2'),
        interaction.fields.getTextInputValue('ativ_3'),
        interaction.fields.getTextInputValue('ativ_4'),
        interaction.fields.getTextInputValue('ativ_5'),
      ];

      const caminhoPdf = await gerarTermo(membro, {
        client: interaction.client,
        dataReferencia: new Date(),
        atividadesCustomizadas: atividadesCustom,
      });

      await enviarTermoRenovadoAoMembroERh(interaction.client, interaction, membro, caminhoPdf, atividadesCustom);

      await interaction.editReply({
        content: `✅ As atividades foram atualizadas e o novo termo de renovação de <@${discordId}> foi gerado e enviado com sucesso!`,
      });
    } catch (err) {
      console.error('[renovacao-termos] Erro ao submeter modal de renovação:', err);
      await interaction.editReply({
        content: `❌ Ocorreu um erro ao emitir o termo customizado: ${err.message}`,
      });
    }
    return true;
  }

  return false;
}

module.exports = {
  iniciarMonitoramentoRenovacao,
  verificarRenovacoes,
  handleRenovacaoTermoInteraction,
};
