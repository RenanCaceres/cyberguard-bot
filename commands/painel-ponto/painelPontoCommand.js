'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// O tratamento real fica em src/ponto.js (handlePontoInteraction), que já responde ao /painel-ponto.
// Este arquivo existe para o deploy-commands.js registrar o comando.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-ponto')
    .setDescription('Envia o painel de controle de ponto neste canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    // Só é chamado se o seu index.js tiver um dispatcher genérico; o handler é idempotente por interação.
    await require('../../src/ponto').handlePontoInteraction(interaction);
  },
};
