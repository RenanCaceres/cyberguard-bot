const { SlashCommandBuilder } = require('discord.js');
const { iniciarFluxoAdvertencia } = require('../../src/advertencias');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('advertir')
    .setDescription('Abre uma advertência formal para um membro')
    .addUserOption((o) => o.setName('membro').setDescription('Membro advertido').setRequired(true))
    .addStringOption((o) => o.setName('nome_real').setDescription('Nome real do membro').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('categoria')
        .setDescription('Categoria da advertência')
        .setRequired(true)
        .addChoices({ name: 'Leve', value: 'Leve' }, { name: 'Média', value: 'Média' }, { name: 'Grave', value: 'Grave' })
    )
    .addBooleanOption((o) =>
      o.setName('reincidente').setDescription('É reincidência de uma advertência em vigência na mesma categoria?').setRequired(true)
    ),

  execute(interaction) {
    return iniciarFluxoAdvertencia(interaction);
  },
};
