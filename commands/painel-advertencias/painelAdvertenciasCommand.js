const { SlashCommandBuilder } = require('discord.js');
const { montarPainel, podeAbrirAdvertencia } = require('../../src/advertencias');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-advertencias')
    .setDescription('Publica o painel de advertências neste canal (RH/Presidência)'),

  async execute(interaction) {
    if (!podeAbrirAdvertencia(interaction.user.id)) {
      return interaction.reply({ content: 'Você não tem permissão para publicar o painel.', ephemeral: true });
    }
    await interaction.channel.send(montarPainel());
    await interaction.reply({ content: 'Painel publicado.', ephemeral: true });
  },
};
