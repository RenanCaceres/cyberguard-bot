'use strict';

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db = require('./db');
const config = require('./config');
const validators = require('./validators');
const { adicionarMembroWorkspace } = require('./notionWorkspace');

function criarBotoesPendenciaNotion(mostrarAjuda = false) {
  const botoes = [
    new ButtonBuilder()
      .setCustomId('notion_pendente_criar')
      .setLabel('✅ Já criei a conta no Notion')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('notion_pendente_mudar')
      .setLabel('✏️ Mudar e-mail do Notion')
      .setStyle(ButtonStyle.Secondary),
  ];

  if (mostrarAjuda) {
    botoes.push(
      new ButtonBuilder()
        .setCustomId('notion_pendente_ajuda')
        .setLabel('🆘 Pedir Ajuda (/help)')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return new ActionRowBuilder().addComponents(botoes);
}

async function enviarAvisoPendenteNotion(usuarioDiscord, emailNotion) {
  const row = criarBotoesPendenciaNotion(false);
  return usuarioDiscord.send({
    content:
      `⚠️ **Atenção sobre seu acesso ao Workspace do Notion:**\n` +
      `Não encontramos nenhuma conta cadastrada no Notion vinculada ao e-mail: \`${emailNotion}\`.\n\n` +
      `Para que você consiga acompanhar as tarefas, projetos e materiais da equipe:\n` +
      `1. Acesse https://www.notion.so e crie sua conta gratuita utilizando esse e-mail (ou altere para outro e-mail no botão abaixo);\n` +
      `2. Assim que concluir o cadastro, clique no botão **"✅ Já criei a conta no Notion"** para liberarmos seu acesso na hora!\n\n` +
      `*(Estes botões permanecem disponíveis aqui na sua DM e o bot enviará um lembrete a cada 24 horas até que seu acesso seja liberado).*`,
    components: [row],
  });
}

async function handleNotionPendenciasInteraction(interaction) {
  if (!interaction) return false;

  // 1. Botão: "Pedir Ajuda (/help)"
  if (interaction.isButton() && interaction.customId === 'notion_pendente_ajuda') {
    const { abrirModalSuporte } = require('./suporteDuvidas');
    return abrirModalSuporte(interaction, 'notion_pendencias');
  }

  // 2. Botão: "Já criei a conta no Notion"
  if (interaction.isButton() && interaction.customId === 'notion_pendente_criar') {
    await interaction.deferReply({ ephemeral: true });
    const membro = await db.getMembro(interaction.user.id);
    if (!membro) {
      await interaction.editReply('❌ Seu cadastro não foi localizado no sistema.');
      return true;
    }

    const emailAlvo = (membro.email_notion || membro.email || '').trim().toLowerCase();
    if (!emailAlvo) {
      await interaction.editReply('❌ Nenhum e-mail foi cadastrado para o Notion. Clique em "Mudar e-mail do Notion" para informar um.');
      return true;
    }

    const res = await adicionarMembroWorkspace(emailAlvo);
    if (res.sucesso) {
      await db.atualizarStatusNotionWorkspace(interaction.user.id, 'liberado', {
        tentativas_notion: 0,
      });
      const linkNotion = config.notionHomeUrl ? `\n\n📌 **Acesse a página central do CyberGuard:** ${config.notionHomeUrl}` : '';
      await interaction.editReply(
        `🎉 **Excelente! Sua conta no Notion foi localizada e seu acesso ao Workspace do CyberGuard foi liberado com sucesso!**${linkNotion}`
      );

      const tutorialNotionPath = path.resolve(__dirname, '../docs/manuais/Tutorial_Acesso_Workspace_Notion.pdf');
      if (fs.existsSync(tutorialNotionPath)) {
        await interaction.followUp({
          content: '📖 Segue em anexo o guia em PDF mostrando como alternar para o Workspace do CyberGuard no menu inferior esquerdo:',
          files: [{ attachment: tutorialNotionPath, name: 'tutorial_acesso_workspace_notion.pdf' }],
          ephemeral: true,
        }).catch(() => {});
      }

      try {
        if (interaction.message && interaction.message.editable) {
          await interaction.message.edit({
            content: `✅ **Acesso ao Workspace do Notion Liberado!**\nSua conta com o e-mail \`${emailAlvo}\` foi vinculada com sucesso ao Workspace.`,
            components: [],
          });
        }
      } catch (_) {}

      if (config.channelRhId) {
        try {
          const canalRh = await interaction.client.channels.fetch(config.channelRhId);
          await canalRh.send(
            `✅ **Notion Liberado (Pós-Cadastro):**\nO integrante **${membro.nome_social || membro.nome}** (<@${interaction.user.id}>) concluiu o cadastro no Notion com o e-mail \`${emailAlvo}\` e o acesso ao Workspace foi concedido automaticamente!`
          );
        } catch (e) {
          console.error('[notion-pendencias] Erro ao notificar RH sobre liberação:', e.message);
        }
      }
    } else {
      const tentativas = await db.incrementarTentativasNotion(interaction.user.id);
      const atingiuLimite = tentativas >= 3;

      let msgFalha =
        `⚠️ **Ainda não conseguimos localizar uma conta no Notion vinculada a \`${emailAlvo}\`.**\n\n` +
        `Por favor, certifique-se de que:\n` +
        `1. Você acessou https://www.notion.so e concluiu a criação da sua conta;\n` +
        `2. O e-mail utilizado no cadastro do Notion foi exatamente \`${emailAlvo}\`.\n\n` +
        `Se você utilizou outro endereço de e-mail no Notion, clique no botão **"✏️ Mudar e-mail do Notion"** para atualizar!`;

      if (atingiuLimite) {
        msgFalha +=
          `\n\n🆘 **Dificuldades para ativar sua conta?**\n` +
          `Detectamos que já foram feitas ${tentativas} tentativas e a conta ainda não foi encontrada no Notion. ` +
          `Você pode clicar no botão **"🆘 Pedir Ajuda (/help)"** abaixo ou digitar o comando \`/help\` no Discord para solicitar auxílio diretamente à liderança do projeto!`;
      }

      await interaction.editReply({
        content: msgFalha,
        components: [criarBotoesPendenciaNotion(atingiuLimite)],
      });
    }
    return true;
  }

  // 3. Botão: "Mudar e-mail do Notion"
  if (interaction.isButton() && interaction.customId === 'notion_pendente_mudar') {
    const membro = await db.getMembro(interaction.user.id);
    const emailAtual = membro?.email_notion || membro?.email || '';

    const modal = new ModalBuilder()
      .setCustomId('notion_modal_mudar_email')
      .setTitle('Mudar E-mail do Notion');

    const input = new TextInputBuilder()
      .setCustomId('novo_email_notion')
      .setLabel('Novo e-mail vinculado ao Notion')
      .setStyle(TextInputStyle.Short)
      .setValue(emailAtual)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return true;
  }

  // 4. Submissão do Modal: "Mudar E-mail do Notion"
  if (interaction.isModalSubmit() && interaction.customId === 'notion_modal_mudar_email') {
    await interaction.deferReply({ ephemeral: true });
    const novoEmail = interaction.fields.getTextInputValue('novo_email_notion').trim().toLowerCase();

    if (!validators.validarEmail(novoEmail)) {
      await interaction.editReply('❌ **Formato de e-mail inválido.** Por favor, informe um endereço de e-mail válido.');
      return true;
    }

    const membro = await db.getMembro(interaction.user.id);
    if (!membro) {
      await interaction.editReply('❌ Seu cadastro não foi localizado.');
      return true;
    }

    await db.atualizarStatusNotionWorkspace(interaction.user.id, 'pendente_conta', {
      email_notion: novoEmail,
    });

    try {
      const { registrarMembroAtivo } = require('./notionMembros');
      const membroAtualizado = await db.getMembro(interaction.user.id);
      if (membroAtualizado && (membroAtualizado.status === 'concluido' || membroAtualizado.status === 'aguardando_assinatura')) {
        await registrarMembroAtivo(membroAtualizado);
      }
    } catch (errNotion) {
      console.warn('[notion-pendencias] Falha ao sincronizar e-mail Notion na página DB:', errNotion.message);
    }

    const res = await adicionarMembroWorkspace(novoEmail);
    if (res.sucesso) {
      await db.atualizarStatusNotionWorkspace(interaction.user.id, 'liberado', {
        tentativas_notion: 0,
      });
      const linkNotion = config.notionHomeUrl ? `\n\n📌 **Acesse a página central do CyberGuard:** ${config.notionHomeUrl}` : '';
      await interaction.editReply(
        `✅ **E-mail atualizado para \`${novoEmail}\` e acesso ao Workspace do Notion liberado com sucesso!** 🎉${linkNotion}`
      );

      try {
        if (interaction.message && interaction.message.editable) {
          await interaction.message.edit({
            content: `✅ **Acesso ao Workspace do Notion Liberado!**\nSua conta com o e-mail \`${novoEmail}\` foi vinculada com sucesso ao Workspace.`,
            components: [],
          });
        }
      } catch (_) {}

      if (config.channelRhId) {
        try {
          const canalRh = await interaction.client.channels.fetch(config.channelRhId);
          await canalRh.send(
            `✏️🔑 **E-mail do Notion Atualizado & Liberado:**\nO integrante **${membro.nome_social || membro.nome}** (<@${interaction.user.id}>) atualizou o e-mail do Notion para \`${novoEmail}\` e foi adicionado ao Workspace com sucesso!`
          );
        } catch (e) {
          console.error('[notion-pendencias] Erro ao notificar RH:', e.message);
        }
      }
    } else {
      const tentativas = await db.incrementarTentativasNotion(interaction.user.id);
      const atingiuLimite = tentativas >= 3;

      let msg =
        `✅ **E-mail do Notion atualizado com sucesso para \`${novoEmail}\`!**\n` +
        `⚠️ Porém, ainda não encontramos nenhuma conta criada no Notion com esse endereço.\n\n` +
        `Por favor, acesse https://www.notion.so e cadastre-se com \`${novoEmail}\`.\n` +
        `Assim que terminar, clique no botão **"✅ Já criei a conta no Notion"** abaixo para ativar seu acesso.`;

      if (atingiuLimite) {
        msg +=
          `\n\n🆘 **Precisa de auxílio da equipe?**\n` +
          `Você já realizou ${tentativas} tentativas. Se preferir, clique no botão **"🆘 Pedir Ajuda (/help)"** abaixo ou digite o comando \`/help\` para abrir um chamado com a liderança.`;
      }

      await interaction.editReply({
        content: msg,
        components: [criarBotoesPendenciaNotion(atingiuLimite)],
      });
    }
    return true;
  }

  return false;
}

async function verificarLembretesPendentesNotion(client) {
  const agora = new Date();
  const pendentes = await db.listarMembrosNotionPendente();
  if (!pendentes || pendentes.length === 0) return;

  for (const membro of pendentes) {
    try {
      const emailAlvo = (membro.email_notion || membro.email || '').trim().toLowerCase();
      if (!emailAlvo) continue;

      // 1. Antes de mandar lembrete, verifica silenciosamente se ele já criou a conta no Notion
      const resWorkspace = await adicionarMembroWorkspace(emailAlvo);
      if (resWorkspace.sucesso) {
        await db.atualizarStatusNotionWorkspace(membro.discord_id, 'liberado', {
          tentativas_notion: 0,
        });
        const usuario = await client.users.fetch(membro.discord_id).catch(() => null);
        if (usuario) {
          const linkNotion = config.notionHomeUrl ? `\n\n📌 **Acesse a página central:** ${config.notionHomeUrl}` : '';
          const tutorialNotionPath = path.resolve(__dirname, '../docs/manuais/Tutorial_Acesso_Workspace_Notion.pdf');
          const filesNotion = fs.existsSync(tutorialNotionPath)
            ? [{ attachment: tutorialNotionPath, name: 'tutorial_acesso_workspace_notion.pdf' }]
            : [];

          await usuario.send({
            content:
              `🎉 **Olá, ${membro.nome_social || membro.nome}!**\n` +
              `Detectamos que você concluiu seu cadastro no Notion! Seu acesso ao Workspace do CyberGuard foi liberado automaticamente com sucesso.${linkNotion}\n\n` +
              `*(Enviamos em anexo um tutorial rápido em PDF mostrando como alternar para o Workspace pelo menu no canto inferior esquerdo).*`,
            files: filesNotion,
          }).catch(() => {});
        }
        if (config.channelRhId) {
          const canalRh = await client.channels.fetch(config.channelRhId).catch(() => null);
          if (canalRh) {
            await canalRh.send(
              `✅ **Acesso Notion Regularizado Automaticamente:**\nO integrante **${membro.nome_social || membro.nome}** (<@${membro.discord_id}>) criou a conta no Notion com o e-mail \`${emailAlvo}\` e foi adicionado ao Workspace na verificação periódica!`
            ).catch(() => {});
          }
        }
        continue;
      }

      // 2. Se ainda não criou a conta, incrementa tentativas e envia o lembrete de 24 horas
      const tentativas = await db.incrementarTentativasNotion(membro.discord_id);
      const atingiuLimite = tentativas >= 3;

      const usuario = await client.users.fetch(membro.discord_id).catch(() => null);
      if (!usuario) continue;

      const row = criarBotoesPendenciaNotion(atingiuLimite);
      let msgLembrete =
        `🔔 **Lembrete diário: Seu acesso ao Notion do CyberGuard ainda está pendente!**\n\n` +
        `Olá, **${membro.nome_social || membro.nome}**!\n` +
        `Notamos que você ainda não conseguiu ingressar no Workspace do Notion porque a conta vinculada ao e-mail \`${emailAlvo}\` ainda não foi criada no site do Notion.\n\n` +
        `O Notion é essencial no CyberGuard para acompanhamento das atividades, sprints e documentos do seu setor.\n\n` +
        `👉 **Passo a passo rápido:**\n` +
        `1. Acesse https://www.notion.so e conclua seu cadastro gratuito com o e-mail \`${emailAlvo}\` (ou com outro);\n` +
        `2. Clique em **"Já criei a conta no Notion"** abaixo para ativar seu acesso na hora.\n` +
        `*(Se você se cadastrou com outro e-mail, clique em "Mudar e-mail do Notion").*`;

      if (atingiuLimite) {
        msgLembrete +=
          `\n\n🆘 **Está travado ou com problemas para acessar?**\n` +
          `Já foram realizadas ${tentativas} tentativas de localização da sua conta. ` +
          `Você pode clicar no botão **"🆘 Pedir Ajuda (/help)"** abaixo ou digitar o comando \`/help\` no servidor para solicitar ajuda diretamente à coordenação/RH do projeto!`;
      }

      await usuario.send({
        content: msgLembrete,
        components: [row],
      }).catch((errDm) => {
        console.warn(`[notion-pendencias] Falha ao enviar DM de lembrete para ${membro.discord_id}:`, errDm.message);
      });

      await db.atualizarStatusNotionWorkspace(membro.discord_id, 'pendente_conta', {
        ultimo_lembrete_notion: agora,
      });
    } catch (errMembro) {
      console.error(`[notion-pendencias] Erro ao processar membro ${membro.discord_id}:`, errMembro.message);
    }
  }
}

function iniciarLembretesNotion(client) {
  // Checagem a cada hora para disparar conforme cada membro atinge 24h desde o último lembrete
  cron.schedule('15 * * * *', async () => {
    try {
      await verificarLembretesPendentesNotion(client);
    } catch (err) {
      console.error('[notion-pendencias] Erro no cron de lembretes Notion:', err);
    }
  });

  // Checagem 30 segundos após o boot do bot
  setTimeout(async () => {
    try {
      await verificarLembretesPendentesNotion(client);
    } catch (err) {
      console.error('[notion-pendencias] Erro na checagem pós-boot de lembretes Notion:', err);
    }
  }, 30000);
}

module.exports = {
  criarBotoesPendenciaNotion,
  enviarAvisoPendenteNotion,
  handleNotionPendenciasInteraction,
  iniciarLembretesNotion,
  verificarLembretesPendentesNotion,
};
