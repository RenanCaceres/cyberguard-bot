const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../src/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('minhas-advertencias')
    .setDescription('Mostra suas próprias advertências'),

  async execute(interaction) {
    const [advertencias, categorias] = await Promise.all([
      db.listarAdvertenciasDoUsuario(interaction.user.id),
      db.getCategoriasAdvertencia(),
    ]);

    if (advertencias.length === 0) {
      return interaction.reply({ content: 'Você não possui advertências registradas.', ephemeral: true });
    }

    const nomeCategoria = (id) => categorias.find((c) => c.id === id)?.nome || '—';

    const embed = new EmbedBuilder().setTitle('Suas advertências').setColor(0x5865f2);

    for (const adv of advertencias.slice(0, 25)) {
      embed.addFields({
        name: `#${adv.id} — ${adv.titulo}`,
        value: `Categoria: ${nomeCategoria(adv.categoria_efetiva_id)}\nStatus: ${adv.status}\nAberta em: ${new Date(
          adv.data_abertura
        ).toLocaleDateString('pt-BR')}`,
      });
    }

    if (advertencias.length > 25) {
      embed.setFooter({ text: `Mostrando as 25 mais recentes de ${advertencias.length} no total.` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
