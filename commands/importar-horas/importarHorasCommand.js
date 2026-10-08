'use strict';
const { SlashCommandBuilder } = require('discord.js');

// Tratamento real em src/ponto.js (handlePontoInteraction). Só o RH (cargo PONTO_ROLE_RH_ID) consegue usar.
// Os campos espelham o formato do /ver-horas do KOv: "1 dia 22 horas 22 minutos 30 segundos".
module.exports = {
  data: new SlashCommandBuilder()
    .setName('importar-horas')
    .setDescription('RH: importa o saldo de horas de um membro (ex.: total do KOv Ponto)')
    .addUserOption((o) => o.setName('membro').setDescription('Membro').setRequired(true))
    .addIntegerOption((o) => o.setName('dias').setDescription('Dias').setMinValue(0).setMaxValue(3650))
    .addIntegerOption((o) => o.setName('horas').setDescription('Horas').setMinValue(0).setMaxValue(23))
    .addIntegerOption((o) => o.setName('minutos').setDescription('Minutos').setMinValue(0).setMaxValue(59))
    .addIntegerOption((o) => o.setName('segundos').setDescription('Segundos').setMinValue(0).setMaxValue(59))
    .addStringOption((o) => o.setName('observacao').setDescription('Observação (ex.: total do /ver-horas em 06/10/2026)').setMaxLength(200)),
  async execute(interaction) {
    await require('../../src/ponto').handlePontoInteraction(interaction);
  },
};
