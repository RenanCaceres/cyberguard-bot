'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../../src/db');
const config = require('../../src/config');
const validators = require('../../src/validators');
const { TERMO_CIENCIA_TEXTO } = require('../../src/onboarding');

function formatarMinutos(minutos = 0) {
  const min = Math.max(0, Math.floor(Number(minutos) || 0));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
}

function usuarioTemPermissaoRhOuAdmin(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === config.presidenteId || member.id === config.vicePresidenteId) return true;

  const roleLiderId = process.env.PONTO_ROLE_LIDERES_ID;
  const roleRhId = process.env.PONTO_ROLE_RH_ID;

  return member.roles?.cache?.some(
    (r) =>
      r.name === config.roleRhNome ||
      r.name === config.roleLiderNome ||
      r.name === 'Líderes' ||
      r.name === 'Lideres' ||
      (roleRhId && r.id === roleRhId) ||
      (roleLiderId && r.id === roleLiderId)
  );
}

function ehMembroDoProjetoNoServidor(guildMember) {
  if (guildMember.user.bot) return false;
  // Ignora quem não tem nenhum cargo além de @everyone
  if (guildMember.roles.cache.size <= 1) return false;

  // Ignora quem possui apenas o cargo de Entusiasta (comunidade aberta sem vínculo de voluntariado)
  const cargosSemEveryone = guildMember.roles.cache.filter((r) => r.id !== guildMember.guild.id);
  const nomeEntusiasta = (config.roleEntusiastaNome || 'Entusiasta').toLowerCase();
  const apenasEntusiasta =
    cargosSemEveryone.size === 1 &&
    cargosSemEveryone.first().name.toLowerCase() === nomeEntusiasta;

  return !apenasEntusiasta;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meus-dados')
    .setDescription('Portal de Privacidade e Direitos do Titular (LGPD — Art. 18)')
    .addSubcommand((sub) =>
      sub
        .setName('visualizar')
        .setDescription('Visualiza de forma 100% privada todos os seus dados armazenados pelo bot')
    )
    .addSubcommand((sub) =>
      sub
        .setName('atualizar')
        .setDescription('Corrige ou atualiza seus dados cadastrais (e-mail, telefone, endereço, curso/período)')
    )
    .addSubcommand((sub) =>
      sub
        .setName('privacidade')
        .setDescription('Consulta o Termo de Ciência LGPD, registra seu aceite ou envia solicitação ao RH')
    )
    .addSubcommand((sub) =>
      sub
        .setName('enviar-termo-dm')
        .setDescription('[RH/Admin] Envia o Termo LGPD na DM dos membros pendentes e identifica DMs fechadas')
    )
    .addSubcommand((sub) =>
      sub
        .setName('status-aceite')
        .setDescription('[RH/Admin] Lista quais integrantes já aceitaram o Termo LGPD e quais estão pendentes')
    ),

  async execute(interaction) {
    const subcomando = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    if (subcomando === 'visualizar') {
      await interaction.deferReply({ ephemeral: true });

      const membro = await db.getMembro(discordId);
      const { rows: legadoRows } = await db.pool
        .query('SELECT * FROM cadastro_legado WHERE discord_id = $1', [discordId])
        .catch(() => ({ rows: [] }));
      const legado = legadoRows[0] || null;

      const { rows: pontoRows } = await db.pool
        .query('SELECT total_minutos FROM ponto_totais WHERE user_id = $1', [discordId])
        .catch(() => ({ rows: [] }));
      const totalMinutos = pontoRows[0]?.total_minutos || 0;

      if (!membro && !legado) {
        await interaction.editReply({
          content:
            '🔍 **Nenhum registro cadastral encontrado** para a sua conta do Discord em nosso banco de dados.',
        });
        return;
      }

      const dataAceite = membro?.termo_ciencia_aceito_em
        ? `✅ Aceito em ${new Date(membro.termo_ciencia_aceito_em).toLocaleString('pt-BR')}`
        : '⏳ Pendente de aceite eletrônico (use `/meus-dados privacidade` para registrar)';

      const embed = new EmbedBuilder()
        .setTitle('🔐 Seus Dados Pessoais Armazenados (LGPD — Art. 18, I e II)')
        .setDescription(
          'Esta mensagem é **100% privada (efêmera)** — apenas você pode visualizá-la.\n' +
            'Seus dados sensíveis (CPF, data de nascimento, endereço e telefone) encontram-se **criptografados em repouso (AES-256-GCM)** no banco de dados e são utilizados **exclusivamente para fins de registros e acadêmicos** junto ao projeto CyberGuard e à UTFPR.'
        )
        .addFields(
          { name: 'Nome Completo', value: membro?.nome || legado?.nome || '—', inline: true },
          { name: 'RA / Matrícula', value: membro?.ra || legado?.ra || '—', inline: true },
          { name: 'Status no Sistema', value: `\`${membro?.status || 'legado'}\``, inline: true },
          { name: 'CPF', value: membro?.cpf || '—', inline: true },
          { name: 'Data de Nascimento', value: membro?.data_nascimento || '—', inline: true },
          { name: 'Nacionalidade', value: membro?.nacionalidade || '—', inline: true },
          {
            name: 'Instituição / Estudante UTFPR',
            value: `${membro?.instituicao || 'UTFPR'} (${membro?.estudante_utfpr || 'Sim'})`,
            inline: true,
          },
          {
            name: 'Curso / Período',
            value: `${membro?.curso || '—'} (${membro?.periodo || '—'})`,
            inline: true,
          },
          { name: 'Área / Setor', value: membro?.area_interesse || '—', inline: true },
          { name: 'Endereço', value: membro?.endereco || '—', inline: false },
          {
            name: 'Cidade / UF',
            value: `${membro?.cidade || '—'} / ${membro?.estado || '—'}`,
            inline: true,
          },
          { name: 'Telefone', value: membro?.telefone || '—', inline: true },
          { name: 'E-mail', value: membro?.email || '—', inline: true },
          {
            name: 'Horas Acumuladas (Ponto)',
            value: formatarMinutos(totalMinutos),
            inline: true,
          },
          {
            name: 'Data de Início no Projeto',
            value: membro?.data_inicio || legado?.data_inicio || '—',
            inline: true,
          },
          {
            name: 'Termo de Ciência LGPD',
            value: dataAceite,
            inline: false,
          }
        )
        .setColor(0x57f287)
        .setFooter({
          text: 'Para corrigir algum dado, utilize /meus-dados atualizar',
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcomando === 'atualizar') {
      const membro = await db.getMembro(discordId);
      if (!membro) {
        await interaction.reply({
          content:
            '⚠️ Você ainda não possui um registro na tabela principal de membros para atualizar diretamente. Caso seja um membro legado ou precise de ajuste cadastral, utilize `/meus-dados privacidade` para enviar uma solicitação ao RH.',
          ephemeral: true,
        });
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('lgpd_modal_contato')
          .setLabel('📍 Atualizar Contato e Endereço')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('lgpd_modal_academico')
          .setLabel('🎓 Atualizar Curso e Período')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content:
          '✏️ **Retificação de Dados Pessoais (LGPD — Art. 18, III)**\n' +
          'Escolha abaixo qual grupo de informações cadastrais você deseja atualizar. ' +
          'Para alterar dados de identificação civil (Nome, CPF ou RA), utilize `/meus-dados privacidade` para solicitar a revisão documental ao RH.',
        components: [row],
        ephemeral: true,
      });
      return;
    }

    if (subcomando === 'privacidade') {
      const membro = await db.getMembro(discordId);
      const jaAceitou = Boolean(membro?.termo_ciencia_aceito_em);

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Portal de Privacidade e Direitos do Titular (LGPD)')
        .setDescription(TERMO_CIENCIA_TEXTO)
        .setColor(0x5865f2)
        .setFooter({
          text: jaAceitou
            ? `Aceite registrado em ${new Date(membro.termo_ciencia_aceito_em).toLocaleString('pt-BR')}`
            : 'Projeto CyberGuard — UTFPR | Lei nº 13.709/2018',
        });

      const botoes = [];
      if (!jaAceitou) {
        botoes.push(
          new ButtonBuilder()
            .setCustomId('lgpd_aceite_retroativo')
            .setLabel('✅ Li e concordo com o Termo de Ciência (LGPD)')
            .setStyle(ButtonStyle.Success)
        );
      }
      botoes.push(
        new ButtonBuilder()
          .setCustomId('lgpd_modal_solicitacao_rh')
          .setLabel('📩 Enviar solicitação ou dúvida ao RH')
          .setStyle(ButtonStyle.Primary)
      );

      const row = new ActionRowBuilder().addComponents(botoes);

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true,
      });
      return;
    }

    if (subcomando === 'enviar-termo-dm') {
      if (!usuarioTemPermissaoRhOuAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ Apenas membros do RH, Liderança ou Administradores podem executar este comando.',
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;
        const membrosGuild = await guild.members.list({ limit: 1000 }).catch(() => guild.members.cache);
        const mapaNomes = await db.obterMapaNomesReais().catch(() => new Map());

        const { rows: todosDb } = await db.pool.query(
          'SELECT discord_id, nome, termo_ciencia_aceito_em FROM membros'
        );
        const mapaDb = new Map(todosDb.map((r) => [r.discord_id, r]));

        const alvos = [];
        const jaAceitaram = [];

        for (const gm of membrosGuild.values()) {
          if (!ehMembroDoProjetoNoServidor(gm)) continue;
          const reg = mapaDb.get(gm.id);
          if (reg && reg.termo_ciencia_aceito_em) {
            jaAceitaram.push(gm);
          } else {
            alvos.push(gm);
          }
        }

        await interaction.editReply({
          content:
            `📨 Iniciando envio do Termo de Ciência LGPD via DM para **${alvos.length}** integrante(s) pendente(s) ` +
            `(${jaAceitaram.length} já possuem aceite registrado)... Aguarde a conclusão do diagnóstico.`,
        });

        const embedTermoDm = new EmbedBuilder()
          .setTitle('🛡️ Termo de Ciência e Privacidade de Dados (LGPD)')
          .setDescription(
            `Olá! Como você já faz parte do **Projeto CyberGuard (UTFPR)**, estamos atualizando nosso registro formal de conformidade com a **LGPD (Lei nº 13.709/2018)**.\n\n` +
              TERMO_CIENCIA_TEXTO +
              `\n\n👇 **Clique no botão verde abaixo para confirmar sua ciência e registrar seu aceite:**`
          )
          .setColor(0x57f287)
          .setFooter({ text: 'Projeto CyberGuard — UTFPR | Lei nº 13.709/2018' });

        const rowBotaoDm = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('lgpd_aceite_retroativo')
            .setLabel('✅ Li e concordo com o Termo de Ciência (LGPD)')
            .setStyle(ButtonStyle.Success)
        );

        const enviados = [];
        const dmFechada = [];

        for (const gm of alvos) {
          const nomeReal = mapaNomes.get(gm.id) || gm.displayName || gm.user.username;
          try {
            await gm.user.send({
              embeds: [embedTermoDm],
              components: [rowBotaoDm],
            });
            enviados.push({ id: gm.id, tag: gm.user.tag, nome: nomeReal });
          } catch (errDm) {
            dmFechada.push({
              id: gm.id,
              tag: gm.user.tag,
              nome: nomeReal,
              codigo: errDm.code || errDm.message,
            });
          }
          // Pausa de 1.1s para respeitar rate-limit de DMs do Discord
          await new Promise((r) => setTimeout(r, 1100));
        }

        const listaDmFechadaTexto =
          dmFechada.length > 0
            ? dmFechada
                .map((u) => `• **${u.nome}** (<@${u.id}> — \`${u.tag}\`)`)
                .join('\n')
                .slice(0, 1020)
            : '🎉 Nenhum! Todos os membros pendentes estão com a DM aberta e receberam o termo.';

        const embedRelatorio = new EmbedBuilder()
          .setTitle('📊 Relatório de Disparo do Termo LGPD (DM)')
          .setDescription(
            'O bot verificou todos os membros ativos do servidor (exceto bots e Entusiastas) e disparou a solicitação de aceite do Termo de Ciência e Privacidade.'
          )
          .addFields(
            {
              name: '✅ Já haviam aceitado antes',
              value: `${jaAceitaram.length} membro(s)`,
              inline: true,
            },
            {
              name: '📩 DMs enviadas agora',
              value: `${enviados.length} membro(s)`,
              inline: true,
            },
            {
              name: '🔒 DMs Fechadas / Bloqueadas',
              value: `${dmFechada.length} membro(s)`,
              inline: true,
            },
            {
              name: '⚠️ Casos Específicos — Membros com DM Fechada',
              value: listaDmFechadaTexto,
              inline: false,
            }
          )
          .setColor(dmFechada.length > 0 ? 0xfee75c : 0x57f287)
          .setFooter({
            text: 'Dica: Quem estiver com DM fechada também pode aceitar digitando /meus-dados privacidade no servidor.',
          })
          .setTimestamp();

        await interaction.editReply({
          content: '✅ **Disparo e verificação de DMs concluídos!**',
          embeds: [embedRelatorio],
        });

        if (config.channelRhId) {
          try {
            const canalRh = await interaction.client.channels.fetch(config.channelRhId);
            await canalRh.send({ embeds: [embedRelatorio] });
          } catch {}
        }
      } catch (err) {
        console.error('[meus-dados] Erro em enviar-termo-dm:', err);
        await interaction.editReply({
          content: `❌ Ocorreu um erro ao processar o disparo de DMs: \`${err.message}\``,
        });
      }
      return;
    }

    if (subcomando === 'status-aceite') {
      if (!usuarioTemPermissaoRhOuAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ Apenas membros do RH, Liderança ou Administradores podem executar este comando.',
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;
        const membrosGuild = await guild.members.list({ limit: 1000 }).catch(() => guild.members.cache);
        const mapaNomes = await db.obterMapaNomesReais().catch(() => new Map());

        const { rows: todosDb } = await db.pool.query(
          'SELECT discord_id, nome, termo_ciencia_aceito_em FROM membros'
        );
        const mapaDb = new Map(todosDb.map((r) => [r.discord_id, r]));

        const aceitos = [];
        const pendentes = [];

        for (const gm of membrosGuild.values()) {
          if (!ehMembroDoProjetoNoServidor(gm)) continue;
          const nomeReal = mapaNomes.get(gm.id) || gm.displayName || gm.user.username;
          const reg = mapaDb.get(gm.id);
          if (reg && reg.termo_ciencia_aceito_em) {
            const dataStr = new Date(reg.termo_ciencia_aceito_em).toLocaleDateString('pt-BR');
            aceitos.push(`• **${nomeReal}** (<@${gm.id}>) — *${dataStr}*`);
          } else {
            pendentes.push(`• **${nomeReal}** (<@${gm.id}>)`);
          }
        }

        const embedStatus = new EmbedBuilder()
          .setTitle('📋 Status de Aceite do Termo de Ciência (LGPD)')
          .addFields(
            {
              name: `✅ Aceite Confirmado (${aceitos.length})`,
              value: aceitos.length > 0 ? aceitos.join('\n').slice(0, 1020) : 'Nenhum até o momento.',
              inline: false,
            },
            {
              name: `⏳ Aguardando Aceite (${pendentes.length})`,
              value: pendentes.length > 0 ? pendentes.join('\n').slice(0, 1020) : '🎉 Todos os membros já aceitaram!',
              inline: false,
            }
          )
          .setColor(pendentes.length === 0 ? 0x57f287 : 0x5865f2)
          .setTimestamp();

        await interaction.editReply({ embeds: [embedStatus] });
      } catch (err) {
        console.error('[meus-dados] Erro em status-aceite:', err);
        await interaction.editReply({
          content: `❌ Ocorreu um erro ao consultar o status de aceites: \`${err.message}\``,
        });
      }
      return;
    }
  },

  async handleMeusDadosInteraction(interaction) {
    if (interaction.isButton()) {
      if (interaction.customId === 'lgpd_aceite_retroativo') {
        const nomeFallback = interaction.user.globalName || interaction.user.username;
        const registro = await db.registrarAceiteTermoCiencia(interaction.user.id, nomeFallback);
        const dataHoraStr = new Date().toLocaleString('pt-BR');

        // Se foi clicado na DM (mensagem não efêmera do bot), atualiza os botões da própria mensagem
        if (!interaction.guildId) {
          await interaction.update({
            content: `✅ **Termo de Ciência e Privacidade (LGPD) aceito com sucesso!**\nSeu aceite eletrônico foi registrado em **${dataHoraStr}**. Obrigado!`,
            components: [],
          });
        } else {
          await interaction.reply({
            content: `✅ **Termo de Ciência e Privacidade (LGPD) aceito com sucesso!**\nSeu aceite eletrônico foi registrado em **${dataHoraStr}**.`,
            ephemeral: true,
          });
        }

        if (config.channelRhId) {
          try {
            const canalRh = await interaction.client.channels.fetch(config.channelRhId);
            await canalRh.send({
              content: `🛡️ **Aceite LGPD Confirmado:** O integrante **${registro?.nome || nomeFallback}** (<@${interaction.user.id}>) aceitou o Termo de Ciência e Privacidade em ${dataHoraStr}.`,
            });
          } catch {}
        }
        return true;
      }

      if (interaction.customId === 'lgpd_modal_contato') {
        const membro = await db.getMembro(interaction.user.id);
        if (!membro) {
          await interaction.reply({ content: 'Registro não encontrado.', ephemeral: true });
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId('lgpd_submit_contato')
          .setTitle('Atualizar Contato e Endereço');

        const inputEmail = new TextInputBuilder()
          .setCustomId('email')
          .setLabel('E-mail')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(membro.email || '');

        const inputTelefone = new TextInputBuilder()
          .setCustomId('telefone')
          .setLabel('Telefone (com DDD)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(membro.telefone || '');

        const inputEndereco = new TextInputBuilder()
          .setCustomId('endereco')
          .setLabel('Endereço (Rua/Av, Nº - Bairro)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(membro.endereco || '');

        const inputCidade = new TextInputBuilder()
          .setCustomId('cidade')
          .setLabel('Cidade')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(membro.cidade || '');

        const inputEstado = new TextInputBuilder()
          .setCustomId('estado')
          .setLabel('Estado (UF)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(membro.estado || '');

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputEmail),
          new ActionRowBuilder().addComponents(inputTelefone),
          new ActionRowBuilder().addComponents(inputEndereco),
          new ActionRowBuilder().addComponents(inputCidade),
          new ActionRowBuilder().addComponents(inputEstado)
        );

        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === 'lgpd_modal_academico') {
        const membro = await db.getMembro(interaction.user.id);
        if (!membro) {
          await interaction.reply({ content: 'Registro não encontrado.', ephemeral: true });
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId('lgpd_submit_academico')
          .setTitle('Atualizar Curso e Período');

        const inputCurso = new TextInputBuilder()
          .setCustomId('curso')
          .setLabel('Curso')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(membro.curso || '');

        const inputPeriodo = new TextInputBuilder()
          .setCustomId('periodo')
          .setLabel('Período / Semestre (ex: 6°)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(membro.periodo || '');

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputCurso),
          new ActionRowBuilder().addComponents(inputPeriodo)
        );

        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === 'lgpd_modal_solicitacao_rh') {
        const modal = new ModalBuilder()
          .setCustomId('lgpd_submit_solicitacao_rh')
          .setTitle('Solicitação de Privacidade / Dados ao RH');

        const inputAssunto = new TextInputBuilder()
          .setCustomId('assunto')
          .setLabel('Tipo de Solicitação (ex: Correção de Nome/RA)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const inputDetalhes = new TextInputBuilder()
          .setCustomId('detalhes')
          .setLabel('Descreva sua solicitação ou dúvida')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputAssunto),
          new ActionRowBuilder().addComponents(inputDetalhes)
        );

        await interaction.showModal(modal);
        return true;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'lgpd_submit_contato') {
        await interaction.deferReply({ ephemeral: true });

        const email = interaction.fields.getTextInputValue('email').trim();
        const telefone = interaction.fields.getTextInputValue('telefone').trim();
        const endereco = interaction.fields.getTextInputValue('endereco').trim();
        const cidade = interaction.fields.getTextInputValue('cidade').trim();
        const estado = interaction.fields.getTextInputValue('estado').trim();

        if (!validators.validarEndereco(endereco)) {
          await interaction.editReply({
            content:
              '❌ **Formato de endereço inválido.** Use o padrão `Rua/Avenida Nome, N° - Bairro` (ex: `Rua das Flores, 123 - Centro`).',
          });
          return true;
        }

        await db.atualizarDadosParciaisMembro(interaction.user.id, {
          email,
          telefone,
          endereco,
          cidade,
          estado,
        });

        const membroAtualizado = await db.getMembro(interaction.user.id);
        try {
          const { registrarMembroAtivo } = require('../../src/notionMembros');
          if (membroAtualizado && membroAtualizado.status === 'concluido') {
            await registrarMembroAtivo(membroAtualizado);
          }
        } catch (errNotion) {
          console.error('[meus-dados] Erro ao sincronizar atualização com Notion:', errNotion.message);
        }

        await interaction.editReply({
          content:
            '✅ **Seus dados de contato e endereço foram atualizados e criptografados com sucesso!** Use `/meus-dados visualizar` para conferir.',
        });
        return true;
      }

      if (interaction.customId === 'lgpd_submit_academico') {
        await interaction.deferReply({ ephemeral: true });

        const curso = interaction.fields.getTextInputValue('curso').trim();
        const periodo = interaction.fields.getTextInputValue('periodo').trim();

        await db.atualizarDadosParciaisMembro(interaction.user.id, {
          curso,
          periodo,
        });

        await interaction.editReply({
          content:
            '✅ **Seus dados acadêmicos (curso e período) foram atualizados com sucesso!** Use `/meus-dados visualizar` para conferir.',
        });
        return true;
      }

      if (interaction.customId === 'lgpd_submit_solicitacao_rh') {
        await interaction.deferReply({ ephemeral: true });

        const assunto = interaction.fields.getTextInputValue('assunto').trim();
        const detalhes = interaction.fields.getTextInputValue('detalhes').trim();
        const membro = await db.getMembro(interaction.user.id);

        if (config.channelRhId) {
          try {
            const canalRh = await interaction.client.channels.fetch(config.channelRhId);
            const embedRh = new EmbedBuilder()
              .setTitle('⚖️ Solicitação de Titular de Dados (LGPD — Art. 18)')
              .addFields(
                { name: 'Integrante', value: `<@${interaction.user.id}> (${membro?.nome || interaction.user.tag})`, inline: true },
                { name: 'RA', value: membro?.ra || '—', inline: true },
                { name: 'Assunto', value: assunto, inline: false },
                { name: 'Descrição', value: detalhes, inline: false }
              )
              .setColor(0xfee75c)
              .setTimestamp();

            await canalRh.send({ embeds: [embedRh] });
          } catch (errRh) {
            console.error('[meus-dados] Erro ao enviar solicitação LGPD ao canal do RH:', errRh.message);
          }
        }

        await interaction.editReply({
          content:
            '✅ **Sua solicitação foi encaminhada para a equipe de Recursos Humanos (RH).** Em breve o RH entrará em contato com você.',
        });
        return true;
      }
    }

    return false;
  },
};
