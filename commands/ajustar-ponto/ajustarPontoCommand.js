'use strict';
const { SlashCommandBuilder } = require('discord.js');

// Tratamento real em src/ponto.js (handlePontoInteraction). Só o RH (cargo PONTO_ROLE_RH_ID) consegue usar.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ajustar-ponto')
    .setDescription('RH: ajusta o horário de fechamento de um ponto de um membro')
    .addUserOption((o) => o.setName('membro').setDescription('Membro cujo ponto será ajustado').setRequired(true)),
  async execute(interaction) {
    await require('../../src/ponto').handlePontoInteraction(interaction);
  },
};
