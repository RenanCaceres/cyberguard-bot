'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const config = require('../../src/config');
const db = require('../../src/db');
const encurtador = require('../../src/encurtador');

function usuarioTemPermissaoGestao(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === config.presidenteId || member.id === config.vicePresidenteId) return true;

  const roleLiderId = process.env.PONTO_ROLE_LIDERES_ID;
  const roleRhId = process.env.PONTO_ROLE_RH_ID;

  return Boolean(
    member.roles?.cache?.some(
      (r) =>
        r.name === config.roleRhNome ||
        r.name === config.roleLiderNome ||
        r.name === 'Líderes' ||
        r.name === 'Lideres' ||
        (roleRhId && r.id === roleRhId) ||
        (roleLiderId && r.id === roleLiderId)
    )
  );
}

function truncarTexto(texto, max = 120) {
  const s = String(texto || '');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('encurtar')
    .setDescription('Encurtador de links oficial do CyberGuard Bot (is.gd / TinyURL)')
    .addSubcommand((sub) =>
      sub
        .setName('link')
        .setDescription('Encurta uma URL manualmente e opcionalmente define um apelido personalizado')
        .addStringOption((opt) =>
          opt
            .setName('url')
            .setDescription('URL completa (ex: https://exemplo.com/pagina-muito-longa)')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('apelido')
            .setDescription('Apelido opcional (5 a 30 caracteres: letras, números ou _)')
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('publico')
            .setDescription('Publicar o link encurtado visível no canal (padrão: privado/efêmero)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('historico')
        .setDescription('Exibe os últimos 10 links encurtados por você (ou pelo servidor, para Liderança/RH)')
        .addStringOption((opt) =>
          opt
            .setName('escopo')
            .setDescription('Escopo da consulta')
            .setRequired(false)
            .addChoices(
              { name: 'Meus links', value: 'meus' },
              { name: 'Servidor inteiro (Liderança/RH/Admin)', value: 'servidor' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Mostra as configurações atuais e estatísticas do encurtador automático')
    )
    .addSubcommand((sub) =>
      sub
        .setName('configurar')
        .setDescription('[Liderança/RH/Admin] Ativa/desativa o encurtamento automático ou ignora canais')
        .addBooleanOption((opt) =>
          opt
            .setName('auto')
            .setDescription('Ativar (true) ou desativar (false) o encurtamento automático no chat')
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('ignorar_canal')
            .setDescription('Ignorar (true) ou monitorar novamente (false) o canal selecionado')
            .setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName('canal')
            .setDescription('Canal alvo para ignorar/monitorar (padrão: canal atual)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'link') {
      const urlInformada = interaction.options.getString('url', true);
      const apelido = interaction.options.getString('apelido');
      const publico = interaction.options.getBoolean('publico') === true;

      await interaction.deferReply({ ephemeral: !publico });

      try {
        const res = await encurtador.encurtarUrl(urlInformada, { apelido });
        await db
          .registrarLinkEncurtado({
            discordId: interaction.user.id,
            canalId: interaction.channelId,
            urlOriginal: res.urlOriginal,
            urlEncurtada: res.urlEncurtada,
            provedor: res.provedor,
            origem: 'comando',
            apelido: apelido ? apelido.trim() : null,
          })
          .catch(() => {});

        const economia = res.urlOriginal.length - res.urlEncurtada.length;
        const textoEconomia =
          economia > 0 ? `-${economia} caracteres` : 'Mantido com tamanho compacto';

        const embed = new EmbedBuilder()
          .setColor(0x0ea5e9)
          .setTitle('🔗 Link Encurtado com Sucesso')
          .addFields(
            { name: 'Link Curto', value: `${res.urlEncurtada}\n\`${res.urlEncurtada}\`` },
            { name: 'Destino Original', value: `\`${truncarTexto(res.urlOriginal, 250)}\`` },
            { name: 'Provedor', value: `\`${res.provedor}\``, inline: true },
            { name: 'Economia', value: textoEconomia, inline: true }
          )
          .setFooter({ text: `CyberGuard Links • Solicitado por ${interaction.user.username}` })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Não foi possível encurtar o link: ${err.message}`,
        });
      }
    }

    if (sub === 'historico') {
      const escopo = interaction.options.getString('escopo') || 'meus';
      if (escopo === 'servidor' && !usuarioTemPermissaoGestao(interaction.member)) {
        return interaction.reply({
          content: '❌ Apenas **Liderança, RH ou Administradores** podem consultar o histórico global do servidor.',
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const [registros, stats] = await Promise.all([
        escopo === 'servidor'
          ? db.listarLinksEncurtadosRecentes(10)
          : db.listarLinksEncurtadosDoUsuario(interaction.user.id, 10),
        db.obterEstatisticasEncurtador(escopo === 'servidor' ? null : interaction.user.id),
      ]);

      const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle(
          escopo === 'servidor'
            ? '📊 Histórico Global de Links Encurtados'
            : '🔗 Seus Links Encurtados Recentes'
        )
        .setDescription(
          `**Total:** \`${stats.total}\` link(s) • **Automático:** \`${stats.total_auto}\` • **Comando:** \`${stats.total_comando}\``
        );

      if (registros.length === 0) {
        embed.addFields({
          name: 'Sem registros',
          value: 'Nenhum link encurtado encontrado até o momento.',
        });
      } else {
        const linhas = registros.map((r, idx) => {
          const unix = Math.floor(new Date(r.criado_em).getTime() / 1000);
          const tagOrigem = r.origem === 'auto' ? '⚡ Auto' : '🛠️ Comando';
          const autor = escopo === 'servidor' ? ` • <@${r.discord_id}>` : '';
          return (
            `**${idx + 1}.** ${tagOrigem} (<t:${unix}:R>)${autor}\n` +
            `   Curto: \`${r.url_encurtada}\` (\`${r.provedor}\`)\n` +
            `   Original: \`${truncarTexto(r.url_original, 75)}\``
          );
        });
        embed.addFields({ name: 'Últimos 10 registros', value: linhas.join('\n') });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'status') {
      await interaction.deferReply({ ephemeral: true });
      const [cfg, stats] = await Promise.all([
        encurtador.obterConfigDinamica(),
        db.obterEstatisticasEncurtador(null),
      ]);

      const canaisTxt =
        cfg.canaisIgnorados.length > 0
          ? cfg.canaisIgnorados.map((id) => `<#${id}>`).join(', ')
          : 'Nenhum canal ignorado';

      const dominiosExtrasTxt =
        cfg.dominiosIgnorados.length > 0
          ? cfg.dominiosIgnorados.map((d) => `\`${d}\``).join(', ')
          : 'Apenas lista padrão (Discord, GIFs e encurtadores conhecidos)';

      const embed = new EmbedBuilder()
        .setColor(cfg.autoAtivo ? 0x10b981 : 0xf59e0b)
        .setTitle('⚙️ Status do Módulo Encurtador')
        .addFields(
          {
            name: 'Encurtamento Automático no Chat',
            value: cfg.autoAtivo ? '🟢 **Ativo**' : '🔴 **Desativado**',
            inline: true,
          },
          {
            name: 'Tamanho Mínimo da URL',
            value: `\`${cfg.minTamanho}\` caracteres`,
            inline: true,
          },
          {
            name: 'Links Processados (Total)',
            value: `\`${stats.total}\` (${stats.total_auto} auto / ${stats.total_comando} manual)`,
            inline: true,
          },
          {
            name: 'Canais Ignorados',
            value: canaisTxt,
          },
          {
            name: 'Domínios Ignorados Adicionais',
            value: dominiosExtrasTxt,
          }
        )
        .setFooter({ text: 'Links dentro de blocos de código (`...`) e URLs do Discord/mídia nunca são alterados.' });

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'configurar') {
      if (!usuarioTemPermissaoGestao(interaction.member)) {
        return interaction.reply({
          content: '❌ Apenas **Liderança, RH ou Administradores** podem alterar as configurações do encurtador.',
          ephemeral: true,
        });
      }

      const autoOpcao = interaction.options.getBoolean('auto');
      const ignorarOpcao = interaction.options.getBoolean('ignorar_canal');
      const canalAlvo = interaction.options.getChannel('canal');

      if (autoOpcao === null && ignorarOpcao === null) {
        return interaction.reply({
          content: 'ℹ️ Informe pelo menos uma opção (`auto` ou `ignorar_canal`) para atualizar.',
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      let cfg = await encurtador.obterConfigDinamica();
      const alteracoes = [];

      if (autoOpcao !== null) {
        cfg = await encurtador.definirAutoAtivo(autoOpcao);
        alteracoes.push(
          `• Encurtamento automático: **${cfg.autoAtivo ? 'Ativado' : 'Desativado'}**`
        );
      }

      if (ignorarOpcao !== null) {
        const canalId = canalAlvo ? canalAlvo.id : interaction.channelId;
        cfg = await encurtador.alternarCanalIgnorado(canalId, ignorarOpcao);
        alteracoes.push(
          `• Canal <#${canalId}>: **${ignorarOpcao ? 'Ignorado pelo encurtador automático' : 'Monitorado novamente'}**`
        );
      }

      return interaction.editReply({
        content: `✅ **Configuração do Encurtador atualizada:**\n${alteracoes.join('\n')}`,
      });
    }
  },
};
