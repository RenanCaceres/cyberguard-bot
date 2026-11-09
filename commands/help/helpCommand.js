'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { abrirModalSuporte } = require('../../src/suporteDuvidas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Relate um problema ou solicite ajuda diretamente para a liderança do CyberGuard'),

  async execute(interaction) {
    return abrirModalSuporte(interaction, 'slash_help');
  },
};
