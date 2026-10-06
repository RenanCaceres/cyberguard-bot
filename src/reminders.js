const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./config');
const db = require('./db');

function iniciarLembretes(client) {
  try {
    cron.schedule(config.cronLembrete, async () => {
      const pendentes = await db.listarAguardandoAssinatura();
      const agora = new Date();

      for (const membro of pendentes) {
        try {
          const usuario = await client.users.fetch(membro.discord_id);
          const prazoExpirado = new Date(membro.data_limite_assinatura) < agora;

          if (prazoExpirado) {
            await usuario.send(
              'O prazo de 7 dias para assinar o termo de voluntariado **já passou**. ' +
                'Envie o termo assinado o quanto antes para regularizar sua situação, ou fale com o RH.'
            );

            if (config.channelRhId) {
              const canalRh = await client.channels.fetch(config.channelRhId);
              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`lembrete_resolvido_${membro.discord_id}`)
                  .setLabel('✅ Já está tudo certo, parar de avisar')
                  .setStyle(ButtonStyle.Success)
              );
              await canalRh.send({
                content: `⚠️ <@${membro.discord_id}> está com o prazo de assinatura do termo vencido.`,
                components: [row],
              });
            }
          } else {
            const diasRestantes = Math.ceil(
              (new Date(membro.data_limite_assinatura) - agora) / (1000 * 60 * 60 * 24)
            );
            await usuario.send(
              `Lembrete: você ainda não enviou o termo de voluntariado assinado. ` +
                `Faltam ${diasRestantes} dia(s) dentro do prazo. Envie o arquivo assinado aqui por DM.`
            );
          }

          await db.atualizarStatus(membro.discord_id, membro.status, { ultimo_lembrete: agora });
        } catch (err) {
          console.error('Erro ao enviar lembrete para', membro.discord_id, err);
        }
      }
    });
  } catch (err) {
    console.error(
      '[reminders] erro ao agendar o cron de lembretes — lembretes diários desativados nesta ' +
        'sessão, mas o bot continua rodando normalmente:',
      err
    );
  }
}

async function handleResolverLembrete(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('lembrete_resolvido_')) {
    return false;
  }

  const temPermissao = interaction.member.roles.cache.some((r) => r.name === config.roleRhNome);
  if (!temPermissao) {
    await interaction.reply({
      content: `Só quem tem o cargo "${config.roleRhNome}" pode fazer isso.`,
      ephemeral: true,
    });
    return true;
  }

  const discordId = interaction.customId.replace('lembrete_resolvido_', '');

  try {
    await db.marcarLembreteResolvido(discordId);
    await interaction.update({
      content: `✅ Marcado como resolvido por ${interaction.user.username} — não vou mais avisar sobre <@${discordId}>.`,
      components: [],
    });
  } catch (err) {
    console.error('[reminders] erro ao marcar lembrete como resolvido:', err);
    await interaction.reply({
      content: 'Deu erro ao marcar como resolvido, tenta de novo.',
      ephemeral: true,
    });
  }

  return true;
}

module.exports = { iniciarLembretes, handleResolverLembrete };
