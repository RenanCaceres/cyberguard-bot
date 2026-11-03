'use strict';

const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { garantirPainelAvisos, ehLiderAutorizado } = require('../../src/avisos');
const config = require('../../src/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-avisos')
    .setDescription('Publica ou atualiza o painel de Avisos e Agendamento de Eventos (Google Calendar)')
    .addChannelOption((opt) =>
      opt
        .setName('canal')
        .setDescription('Canal de texto onde o painel será publicado (padrão: canal de avisos configurado)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!ehLiderAutorizado(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas Líderes, Recursos Humanos, Presidente ou Vice-Presidente podem publicar o painel de avisos.',
        ephemeral: true,
      });
    }

    const canalEscolhido = interaction.options.getChannel('canal');
    const canalId = canalEscolhido ? canalEscolhido.id : config.canalAvisosId || interaction.channelId;

    await interaction.deferReply({ ephemeral: true });

    const msg = await garantirPainelAvisos(interaction.client, canalId);
    if (!msg) {
      return interaction.editReply({
        content: `❌ Não foi possível publicar o painel no canal informado (<#${canalId}>). Verifique as permissões do bot e o ID configurado.`,
      });
    }

    return interaction.editReply({
      content: `✅ Painel de Avisos e Agenda de Eventos publicado/atualizado com sucesso no canal <#${canalId}>!`,
    });
  },
};
