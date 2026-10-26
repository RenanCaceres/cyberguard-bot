const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../src/db');
const { gerarDeclaracaoPdf } = require('../../src/declaracaoService');
const { enviarDeclaracaoParaProfessor, verificarRespostasDeclaracoes } = require('../../src/declaracaoEmail');

const config = require('../../src/config');

async function verificarSeEhLider(client, member, discordId) {
  if (discordId === config.presidenteId) return true;
  try {
    let guildMember = member;
    if (!guildMember || !guildMember.roles) {
      const guild = await client.guilds.fetch(config.guildId);
      guildMember = await guild.members.fetch(discordId).catch(() => null);
    }
    if (!guildMember?.roles) return false;
    const pontoLiderRole = process.env.PONTO_ROLE_LIDERES_ID;
    return guildMember.roles.cache.some(
      (r) =>
        r.name === config.roleLiderNome ||
        r.name === 'Líderes' ||
        r.name === 'Lideres' ||
        (pontoLiderRole && r.id === pontoLiderRole)
    );
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('declaracao')
    .setDescription('Solicitação e consulta de Declaração de Voluntariado no CyberGuard')
    .addSubcommand((sub) =>
      sub
        .setName('solicitar')
        .setDescription('Solicita a emissão da declaração de participação para assinatura do coordenador')
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Consulta o andamento das suas declarações solicitadas')
    ),

  async execute(interaction) {
    const subcomando = interaction.options.getSubcommand();

    if (subcomando === 'status') {
      await interaction.deferReply({ ephemeral: true });

      try {
        await verificarRespostasDeclaracoes(interaction.client);
      } catch (errImap) {
        console.error('[declaracao-status] Erro ao sincronizar IMAP:', errImap.message);
      }

      const rows = await db.pool
        .query(
          `SELECT * FROM declaracoes_solicitadas WHERE discord_id = $1 ORDER BY data_solicitacao DESC`,
          [interaction.user.id]
        )
        .then((r) => r.rows);

      if (rows.length === 0) {
        return interaction.editReply({
          content: 'Você ainda não possui nenhuma solicitação de declaração registrada.',
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('Suas Solicitações de Declaração')
        .setColor(0x2f6fed);

      for (const d of rows.slice(0, 10)) {
        const dataFormatada = new Date(d.data_solicitacao).toLocaleDateString('pt-BR');
        const statusLabel =
          d.status === 'concluida'
            ? '✅ Assinada e Entregue'
            : d.status === 'aguardando_assinatura_professor'
            ? '⏳ Aguardando assinatura do Prof. André'
            : '❌ Cancelada';

        embed.addFields({
          name: `#${d.codigo} (${dataFormatada})`,
          value: `**Status:** ${statusLabel}\n**Início declarado:** ${d.data_inicio}\n**Carga horária:** ${d.carga_horaria || '4 horas'}\n**RA:** ${d.ra}`,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcomando === 'solicitar') {
      await interaction.deferReply({ ephemeral: true });

      const membro = await db.getMembro(interaction.user.id);
      if (!membro || !membro.nome || !membro.ra) {
        return interaction.editReply({
          content:
            '❌ Seus dados cadastrais não foram encontrados no banco do CyberGuard. ' +
            'Se você entrou recentemente ou é membro legado, entre em contato com o RH.',
        });
      }

      // Verifica se já possui solicitação aberta aguardando
      const pendentes = await db.pool
        .query(
          `SELECT * FROM declaracoes_solicitadas WHERE discord_id = $1 AND status = 'aguardando_assinatura_professor'`,
          [interaction.user.id]
        )
        .then((r) => r.rows);

      if (pendentes.length > 0) {
        const p = pendentes[0];
        const dataFmt = new Date(p.data_solicitacao).toLocaleDateString('pt-BR');
        return interaction.editReply({
          content:
            `⚠️ Você já possui uma solicitação de declaração em andamento (\`#${p.codigo}\`), solicitada em ${dataFmt}.\n` +
            `Ela já foi enviada para o Prof. André Luiz Przybysz e está aguardando a assinatura digital do professor. Assim que ele assinar e responder, você receberá aqui por DM.`,
        });
      }

      const dataInicioFinal = membro.data_inicio || '05/2026';
      const ehLider = await verificarSeEhLider(interaction.client, interaction.member, interaction.user.id);
      const cargaHoraria = ehLider ? '10 horas' : '4 horas';
      const cargaHorariaExtenso = ehLider ? '10 horas semanais' : '4 horas semanais';

      const codigo = `DECL-${membro.ra}-${Date.now().toString().slice(-4)}`;

      try {
        // 1. Gera o PDF oficial
        const caminhoPdf = await gerarDeclaracaoPdf({
          nome: membro.nome,
          curso: membro.curso || 'Engenharia / Tecnologia',
          ra: membro.ra,
          dataInicio: dataInicioFinal,
          cargaHoraria: cargaHoraria,
          dataSolicitacao: new Date(),
        });

        // 2. Registra no banco
        const declaracao = await db.criarSolicitacaoDeclaracao({
          codigo,
          discordId: interaction.user.id,
          nome: membro.nome,
          ra: membro.ra,
          curso: membro.curso || 'Engenharia / Tecnologia',
          dataInicio: dataInicioFinal,
          cargaHoraria: cargaHoraria,
          caminhoPdfGerado: caminhoPdf,
        });

        // 3. Dispara e-mail para o professor
        let messageId = null;
        try {
          messageId = await enviarDeclaracaoParaProfessor({ declaracao, caminhoPdf });
          if (messageId) {
            await db.pool.query(
              'UPDATE declaracoes_solicitadas SET message_id_email = $2 WHERE codigo = $1',
              [codigo, messageId]
            );
          }
        } catch (errEmail) {
          console.error('[declaracao] Erro ao disparar e-mail para o professor:', errEmail.message);
        } finally {
          // Remove o PDF temporário não assinado da pasta ./temp/ após o envio (LGPD Art. 46)
          if (caminhoPdf) {
            fs.unlink(caminhoPdf, () => {});
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('Declaração Solicitada com Sucesso! 📜')
          .setDescription(
            `Sua declaração foi gerada automaticamente e enviada para o **Prof. André Luiz Przybysz** para assinatura digital pelo gov.br.`
          )
          .addFields(
            { name: 'Código da Solicitação', value: `\`#${codigo}\``, inline: true },
            { name: 'Aluno', value: membro.nome, inline: true },
            { name: 'RA', value: membro.ra, inline: true },
            { name: 'Curso', value: membro.curso || '—', inline: true },
            { name: 'Início no Projeto', value: dataInicioFinal, inline: true },
            { name: 'Carga Horária', value: cargaHorariaExtenso, inline: true }
          )
          .setColor(0x2f6fed)
          .setFooter({
            text: 'Assim que o professor responder ao e-mail assinado, você receberá o documento oficial aqui na sua DM.',
          })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (errGeral) {
        console.error('[declaracao] Erro ao gerar/solicitar declaração:', errGeral);
        return interaction.editReply({
          content: '❌ Ocorreu um erro ao gerar a sua declaração. Avise a equipe de tecnologia/RH do projeto.',
        });
      }
    }
  },
};
