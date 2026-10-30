'use strict';
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const pontoMetas = require('../../src/pontoMetas');

const EPH = MessageFlags.Ephemeral;

function temCargo(interaction, roleId) {
  const roles = interaction.member?.roles;
  if (!roleId || !roles) return false;
  return Array.isArray(roles) ? roles.includes(roleId) : roles.cache?.has(roleId);
}

function isLiderOuRH(interaction) {
  const liderRole = process.env.PONTO_ROLE_LIDERES_ID;
  const rhRole = process.env.PONTO_ROLE_RH_ID;
  const roles = interaction.member?.roles;
  if (!roles) return false;

  if (temCargo(interaction, liderRole) || temCargo(interaction, rhRole)) return true;

  if (roles.cache) {
    return roles.cache.some(
      (r) =>
        r.name === 'Líderes' ||
        r.name === 'Lideres' ||
        r.name === 'Líder' ||
        r.name === 'Lider' ||
        r.name === 'Recursos Humanos' ||
        r.name === 'RH'
    );
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relatorio-semanal')
    .setDescription('Exibe o relatório de metas e horas de todas as semanas desde o ingresso no projeto')
    .addUserOption((o) =>
      o.setName('membro').setDescription('Membro cujo histórico semanal você deseja consultar (Líderes/RH)')
    )
    .addBooleanOption((o) =>
      o
        .setName('fechar_semana')
        .setDescription('Líderes/RH: dispara manualmente o encerramento semanal e relatórios por setor agora')
    ),

  async execute(interaction) {
    const fecharSemana = interaction.options.getBoolean('fechar_semana') || false;

    if (fecharSemana) {
      if (!isLiderOuRH(interaction)) {
        return interaction.reply({
          content: '🔒 Apenas Líderes e membros do RH podem forçar o fechamento semanal.',
          flags: EPH,
        });
      }

      await interaction.deferReply({ flags: EPH });
      try {
        const resultado = await pontoMetas.executarFechamentoSemanal(interaction.client, 1, { forcar: true });
        if (resultado.executado) {
          return interaction.editReply({
            content:
              `✅ **Fechamento semanal da semana ${resultado.periodo.ini} a ${resultado.periodo.fim} executado com sucesso!**\n\n` +
              `• **Integrantes avaliados:** ${resultado.totalParticipantes}\n` +
              `• **DMs enviadas para membros:** ${resultado.totalDisparosUsuarios} (Falhas: ${resultado.dmsComFalha})\n` +
              `• **Relatórios entregues para líderes:** ${resultado.totalRelatoriosLideres}\n\n` +
              `O resumo detalhado foi registrado no canal de logs do ponto.`,
          });
        } else {
          return interaction.editReply({
            content: `⚠️ O fechamento não pôde ser executado: ${resultado.motivo || 'motivo desconhecido'}.`,
          });
        }
      } catch (err) {
        console.error('[relatorioSemanalCommand] Erro ao fechar semana:', err);
        return interaction.editReply({
          content: `❌ Ocorreu um erro ao processar o fechamento semanal: ${err.message}`,
        });
      }
    }

    const membroAlvo = interaction.options.getUser('membro');
    const alvoId = membroAlvo?.id || interaction.user.id;

    if (alvoId !== interaction.user.id && !isLiderOuRH(interaction)) {
      return interaction.reply({
        content: '🔒 Você só possui permissão para visualizar o seu próprio histórico semanal de horas.',
        flags: EPH,
      });
    }

    await interaction.deferReply({ flags: EPH });
    try {
      await pontoMetas.renderizarOuAtualizarRelatorioSemanas(interaction, alvoId, 0, false);
    } catch (err) {
      console.error('[relatorioSemanalCommand] Erro ao obter histórico semanal:', err);
      return interaction.editReply({
        content: `❌ Erro ao consultar o histórico de semanas: ${err.message}`,
      });
    }
  },
};
