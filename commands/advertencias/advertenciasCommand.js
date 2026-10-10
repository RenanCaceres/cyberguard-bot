const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../src/db');
const { podeAbrirAdvertencia } = require('../../src/advertencias');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('advertencias')
    .setDescription('Mostra o histórico completo de advertências (RH/Presidência)')
    .addUserOption((o) => o.setName('membro').setDescription('Filtrar por um membro específico').setRequired(false)),

  async execute(interaction) {
    if (!podeAbrirAdvertencia(interaction.user.id)) {
      return interaction.reply({ content: 'Você não tem permissão para ver esse histórico.', ephemeral: true });
    }

    const membro = interaction.options.getUser('membro');
    const [advertencias, categorias] = await Promise.all([
      membro ? db.listarAdvertenciasDoUsuario(membro.id, { incluirFila: true }) : db.listarTodasAdvertencias(),
      db.getCategoriasAdvertencia(),
    ]);

    if (advertencias.length === 0) {
      return interaction.reply({ content: 'Nenhuma advertência encontrada.', ephemeral: true });
    }

    const nomeCategoria = (id) => categorias.find((c) => c.id === id)?.nome || '—';

    const embed = new EmbedBuilder()
      .setTitle(membro ? `Advertências de ${membro.tag}` : 'Todas as advertências')
      .setColor(0x5865f2);

    for (const adv of advertencias.slice(0, 25)) {
      embed.addFields({
        name: `#${adv.id} — ${adv.titulo}`,
        value:
          `Advertido: ${adv.nome_real} (<@${adv.discord_id}>)\n` +
          `Aberta por: <@${adv.autor_id}>\n` +
          `Categoria: ${nomeCategoria(adv.categoria_efetiva_id)}${adv.reincidencia ? ' (reincidência)' : ''}\n` +
          `Status: ${adv.status}\n` +
          `Aberta em: ${new Date(adv.data_abertura).toLocaleDateString('pt-BR')}`,
      });
    }

    if (advertencias.length > 25) {
      embed.setFooter({ text: `Mostrando as 25 mais recentes de ${advertencias.length} no total.` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
