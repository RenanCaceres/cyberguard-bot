'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { garantirPainelDuvidas } = require('../../src/suporteDuvidas');
const config = require('../../src/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-duvidas')
    .setDescription('Publica ou atualiza o painel interativo de atendimento e dúvidas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName('canal')
        .setDescription('Canal de texto onde o painel será publicado (padrão: canal configurado no .env)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const canalEscolhido = interaction.options.getChannel('canal');
    const canalId = canalEscolhido ? canalEscolhido.id : config.canalDuvidasId || interaction.channelId;

    await interaction.deferReply({ ephemeral: true });

    const msg = await garantirPainelDuvidas(interaction.client, canalId);
    if (!msg) {
      return interaction.editReply({
        content: `❌ Não foi possível publicar o painel no canal informado (<#${canalId}>). Verifique as permissões do bot e o ID configurado.`,
      });
    }

    return interaction.editReply({
      content: `✅ Painel de Atendimento e Dúvidas publicado/atualizado com sucesso no canal <#${canalId}>!`,
    });
  },
};
