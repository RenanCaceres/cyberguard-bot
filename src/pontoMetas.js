'use strict';
// Regras de negócio de ponto por metas semanais (Voluntário: 4h, Vice-Líder: 8h, Líder: 10h),
// fechamento e disparo semanal por setor para membros e líderes,
// e histórico completo de semanas desde a entrada do voluntário.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('./config');
const db = require('./db');
const pdb = require('./pontoDb');

const EPH = MessageFlags.Ephemeral;
const TZ = 'America/Sao_Paulo';

// Formata segundos em XhYY (ex: 4h30)
const fmtDur = (seg) => {
  const s = Math.max(0, Math.floor(seg || 0));
  const min = Math.floor(s / 60);
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SETORES_PADRAO = [
  'Hacking Ético',
  'Educacional',
  'Desenvolvimento',
  'Social Media & Copy',
  'Recursos Humanos',
  'Design',
  'Hardware Hacking',
];

/**
 * Normaliza o nome do setor/área para os padrões conhecidos.
 */
function normalizarSetor(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if ((s.includes('hack') && s.includes('etic')) || s.includes('red team') || s.includes('blue team') || s.includes('observatorio')) {
    return 'Hacking Ético';
  }
  if (s.includes('educacion')) {
    return 'Educacional';
  }
  if (s.includes('desenvolv')) {
    return 'Desenvolvimento';
  }
  if (s.includes('social media') || s.includes('copy')) {
    return 'Social Media & Copy';
  }
  if (s.includes('recursos humanos') || s === 'rh') {
    return 'Recursos Humanos';
  }
  if (s.includes('design')) {
    return 'Design';
  }
  if (s.includes('hardware')) {
    return 'Hardware Hacking';
  }
  return str.trim();
}

/**
 * Determina a carga horária semanal esperada para o integrante com base no cargo:
 * - Voluntário: 4 horas semanais (14.400s)
 * - Vice-líder: 8 horas semanais (28.800s)
 * - Líder / Presidência: 10 horas semanais (36.000s)
 */
async function obterCargaHoraria(client, member, discordId) {
  // Presidente tem regime de Líder (10 horas)
  if (discordId === config.presidenteId) {
    return {
      cargoLabel: 'Presidência',
      cargaHoraria: '10 horas',
      cargaHorariaExtenso: '10 horas semanais',
      metaHoras: 10,
      metaSegundos: 36000,
    };
  }

  try {
    let guildMember = member;
    if (!guildMember && client && config.guildId) {
      const guild = client.guilds.cache.get(config.guildId) || (await client.guilds.fetch(config.guildId).catch(() => null));
      if (guild) {
        guildMember = guild.members.cache.get(discordId) || (await guild.members.fetch(discordId).catch(() => null));
      }
    }

    if (guildMember?.roles?.cache) {
      const pontoLiderRole = process.env.PONTO_ROLE_LIDERES_ID;
      const roleViceLiderId = config.roleViceLiderId;
      const rolesArray = Array.from(guildMember.roles.cache.values());

      // 1. Líderes (10 horas semanais)
      const ehLider = rolesArray.some(
        (r) =>
          r.name === config.roleLiderNome ||
          r.name === 'Líderes' ||
          r.name === 'Lideres' ||
          r.name === 'Líder' ||
          r.name === 'Lider' ||
          (pontoLiderRole && r.id === pontoLiderRole)
      );

      if (ehLider) {
        return {
          cargoLabel: 'Líder',
          cargaHoraria: '10 horas',
          cargaHorariaExtenso: '10 horas semanais',
          metaHoras: 10,
          metaSegundos: 36000,
        };
      }

      // 2. Vice-Líderes (8 horas semanais)
      const ehViceLider = rolesArray.some(
        (r) =>
          (roleViceLiderId && r.id === roleViceLiderId) ||
          r.name === config.roleViceLiderNome ||
          r.name === 'Vice-Líder' ||
          r.name === 'Vice-Lider' ||
          r.name === 'Vice-Líderes' ||
          r.name === 'Vice-Lideres' ||
          r.name === 'Vice Líder' ||
          r.name === 'Vice Lider' ||
          r.name === 'Vice Líderes' ||
          r.name === 'Vice Lideres'
      );

      if (ehViceLider) {
        return {
          cargoLabel: 'Vice-Líder',
          cargaHoraria: '8 horas',
          cargaHorariaExtenso: '8 horas semanais',
          metaHoras: 8,
          metaSegundos: 28800,
        };
      }
    }
  } catch (err) {
    console.error('[pontoMetas] Erro ao identificar cargo do membro:', err.message);
  }

  // 3. Voluntário padrão (4 horas semanais)
  return {
    cargoLabel: 'Voluntário',
    cargaHoraria: '4 horas',
    cargaHorariaExtenso: '4 horas semanais',
    metaHoras: 4,
    metaSegundos: 14400,
  };
}

/**
 * Identifica o setor do membro a partir dos cargos do Discord ou dados cadastrais do banco.
 */
function obterSetorDoMembro(guildMember, membroDb) {
  if (guildMember?.roles?.cache) {
    // Verifica IDs de setor fixos
    if (config.roleHackingEticoId && guildMember.roles.cache.has(config.roleHackingEticoId)) return 'Hacking Ético';
    if (config.roleEducacionalId && guildMember.roles.cache.has(config.roleEducacionalId)) return 'Educacional';
    if (config.roleDesenvolvimentoId && guildMember.roles.cache.has(config.roleDesenvolvimentoId)) return 'Desenvolvimento';
    if (process.env.PONTO_ROLE_RH_ID && guildMember.roles.cache.has(process.env.PONTO_ROLE_RH_ID)) return 'Recursos Humanos';

    // Verifica nomes dos cargos do Discord
    for (const [, role] of guildMember.roles.cache) {
      const normalizado = normalizarSetor(role.name);
      if (SETORES_PADRAO.includes(normalizado)) {
        return normalizado;
      }
    }
  }

  // Fallback: cadastro no banco (área de interesse preenchida no termo)
  if (membroDb?.area_interesse) {
    const normalizado = normalizarSetor(membroDb.area_interesse);
    if (normalizado) return normalizado;
  }

  return 'Geral';
}

/**
 * Identifica os líderes de um determinado setor.
 */
async function identificarLideresSetor(guild, nomeSetor) {
  const lideres = [];
  const liderConfigId = config.lideresTime ? config.lideresTime[nomeSetor] : null;
  const roleLiderNome = config.roleLiderNome || 'Líderes';
  const roleLiderId = process.env.PONTO_ROLE_LIDERES_ID;

  for (const [, member] of guild.members.cache) {
    if (member.user?.bot) continue;

    const rolesArray = member.roles?.cache ? Array.from(member.roles.cache.values()) : [];
    const temRoleLider = rolesArray.some(
      (r) =>
        r.name === roleLiderNome ||
        r.name === 'Líderes' ||
        r.name === 'Lideres' ||
        r.name === 'Líder' ||
        r.name === 'Lider' ||
        (roleLiderId && r.id === roleLiderId)
    );

    if (temRoleLider) {
      const setorMembro = obterSetorDoMembro(member);
      if (setorMembro === nomeSetor) {
        lideres.push(member);
      }
    } else if (liderConfigId && member.id === liderConfigId) {
      lideres.push(member);
    }
  }

  // Fallback para líder explícito em LIDERES_TIME_JSON
  if (liderConfigId && !lideres.some((m) => m.id === liderConfigId)) {
    const m = guild.members.cache.get(liderConfigId) || (await guild.members.fetch(liderConfigId).catch(() => null));
    if (m) lideres.push(m);
  }

  return lideres;
}

/**
 * Resolve o nome de exibição mais completo do membro.
 */
async function resolverNomeCompleto(discordId, fallbackUser) {
  try {
    const membro = await db.getMembro(discordId).catch(() => null);
    if (membro && membro.nome) return membro.nome.trim();

    const legado = await db.getNomeLegado(discordId).catch(() => null);
    if (legado) return legado.trim();
  } catch (err) {
    console.error('[pontoMetas] Erro ao resolver nome de', discordId, err.message);
  }

  return fallbackUser?.displayName ?? fallbackUser?.globalName ?? fallbackUser?.username ?? fallbackUser?.user?.username ?? 'Membro';
}

/**
 * Converte diferentes formatos de texto de data para Date.
 */
function parseDataString(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();

  // MM/YYYY (ex: 05/2026)
  const m1 = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m1) {
    return new Date(parseInt(m1[2], 10), parseInt(m1[1], 10) - 1, 1);
  }

  // DD/MM/YYYY (ex: 15/04/2026)
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    return new Date(parseInt(m2[3], 10), parseInt(m2[2], 10) - 1, parseInt(m2[1], 10));
  }

  // YYYY-MM ou YYYY-MM-DD
  const m3 = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m3) {
    return new Date(parseInt(m3[1], 10), parseInt(m3[2], 10) - 1, m3[3] ? parseInt(m3[3], 10) : 1);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Descobre quando o integrante entrou no projeto para iniciar o histórico.
 */
async function obterDataInicioMembro(discordId, guildMember) {
  let membroDb = null;
  try {
    membroDb = await db.getMembro(discordId);
  } catch {
    membroDb = null;
  }

  if (membroDb?.data_inicio) {
    const parsed = parseDataString(membroDb.data_inicio);
    if (parsed) return parsed;
  }

  if (membroDb?.data_aprovacao) {
    const d = new Date(membroDb.data_aprovacao);
    if (!isNaN(d.getTime())) return d;
  }

  if (guildMember?.joinedAt) {
    return guildMember.joinedAt;
  }

  try {
    const res = await db.pool.query(
      'SELECT MIN(aberto_em) AS min_data FROM pontos WHERE discord_id = $1',
      [discordId]
    );
    if (res.rows[0]?.min_data) {
      return new Date(res.rows[0].min_data);
    }
  } catch {}

  if (membroDb?.created_at) {
    const d = new Date(membroDb.created_at);
    if (!isNaN(d.getTime())) return d;
  }

  return new Date();
}

/**
 * Envia mensagem direta ao usuário com tratamento de erro e log.
 */
async function enviarDM(client, userId, payload) {
  try {
    const user = await client.users.fetch(userId);
    return await user.send(payload);
  } catch (e) {
    console.error(`[pontoMetas] DM falhou para ${userId}:`, e.message);
    return null;
  }
}

/**
 * Envia embed para o canal de logs do ponto.
 */
async function logarPonto(client, embed) {
  const canalId = process.env.PONTO_LOG_CHANNEL_ID;
  if (!canalId) return;
  try {
    const canal = await client.channels.fetch(canalId);
    if (canal) await canal.send({ embeds: [embed] });
  } catch (e) {
    console.error('[pontoMetas] Erro ao enviar log:', e.message);
  }
}

/**
 * Executa o fechamento semanal de ponto:
 * 1. Calcula as horas de cada usuário na semana encerrada.
 * 2. Compara com a meta (Voluntário 4h, Vice-Líder 8h, Líder 10h).
 * 3. Envia disparo privado (DM) para cada integrante informando se completou ou não.
 * 4. Agrupa os membros por setor e envia um relatório detalhado para o líder de cada setor.
 * 5. Registra o relatório geral no canal de logs do ponto.
 */
async function executarFechamentoSemanal(client, semanasAtras = 1, opcoes = {}) {
  const periodo = await pdb.periodoSemana(semanasAtras);
  if (!periodo) throw new Error('Não foi possível obter o período da semana.');

  const chaveMeta = `fechamento_semana_${periodo.ini.replace(/\//g, '-')}_${periodo.fim.replace(/\//g, '-')}`;
  if (!opcoes.forcar) {
    const jaExecutado = await pdb.getMeta(chaveMeta);
    if (jaExecutado) {
      console.log(`[pontoMetas] Fechamento da semana ${periodo.ini} a ${periodo.fim} já foi executado anteriormente (${jaExecutado}).`);
      return { executado: false, motivo: 'ja_executado', periodo };
    }
  }

  console.log(`[pontoMetas] Iniciando fechamento semanal (${periodo.ini} a ${periodo.fim})...`);

  // Horas trabalhadas registradas no banco nessa semana
  const rowsTotais = await pdb.totaisSemana(semanasAtras);
  const mapaHoras = new Map(rowsTotais.map((r) => [r.discord_id, r.seg]));

  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) {
    console.error('[pontoMetas] Servidor Discord (GUILD_ID) não encontrado.');
    return { executado: false, motivo: 'guild_nao_encontrada' };
  }

  const guildMembers = await guild.members.fetch();
  const membrosDb = await db.pool
    .query('SELECT discord_id, status, area_interesse FROM membros')
    .then((r) => r.rows)
    .catch(() => []);
  const mapaMembrosDb = new Map(membrosDb.map((m) => [m.discord_id, m]));

  const roleAprovadoNome = config.roleAprovadoNome || 'Membro';
  const roleLiderNome = config.roleLiderNome || 'Líderes';
  const pontoLiderRole = process.env.PONTO_ROLE_LIDERES_ID;
  const roleViceLiderId = config.roleViceLiderId;

  // Participantes do projeto
  const participantes = [];
  for (const [, member] of guildMembers) {
    if (member.user.bot) continue;

    const temRoleMembro = member.roles.cache.some((r) => r.name === roleAprovadoNome);
    const temRoleLider = member.roles.cache.some(
      (r) =>
        r.name === roleLiderNome ||
        r.name === 'Líderes' ||
        r.name === 'Lideres' ||
        (pontoLiderRole && r.id === pontoLiderRole)
    );
    const temRoleVice = member.roles.cache.some(
      (r) => (roleViceLiderId && r.id === roleViceLiderId) || r.name === config.roleViceLiderNome
    );
    const dbMembro = mapaMembrosDb.get(member.id);
    const estaNoDbAtivo = dbMembro && dbMembro.status !== 'abandonado' && dbMembro.status !== 'rejeitado';
    const temPontos = mapaHoras.has(member.id);

    if (temRoleMembro || temRoleLider || temRoleVice || estaNoDbAtivo || temPontos) {
      participantes.push({ member, dbMembro });
    }
  }

  const setoresMap = new Map();
  for (const s of SETORES_PADRAO) {
    setoresMap.set(s, []);
  }
  setoresMap.set('Geral', []);

  let totalDisparosUsuarios = 0;
  let dmsComFalha = 0;

  // 1. Processa cada integrante e envia DM individual
  for (const { member, dbMembro } of participantes) {
    const cargoInfo = await obterCargaHoraria(client, member, member.id);
    const setor = obterSetorDoMembro(member, dbMembro);
    const segTrabalhados = mapaHoras.get(member.id) || 0;
    const metaSeg = cargoInfo.metaSegundos;
    const atingiu = segTrabalhados >= metaSeg;
    const nome = await resolverNomeCompleto(member.id, member);

    const dadosMembro = {
      discordId: member.id,
      nome,
      member,
      cargoInfo,
      setor,
      segTrabalhados,
      metaSeg,
      atingiu,
    };

    if (!setoresMap.has(setor)) {
      setoresMap.set(setor, []);
    }
    setoresMap.get(setor).push(dadosMembro);

    // Constrói embed individual do membro
    const embedUsuario = new EmbedBuilder()
      .setColor(atingiu ? 0x2ecc71 : 0xe74c3c)
      .setTitle('⏱️ Fechamento Semanal de Ponto — CyberGuard')
      .setDescription(
        `Olá, **${nome}**!\n` +
          `Segue o balanço da sua carga horária na semana de **${periodo.ini} a ${periodo.fim}**:\n\n` +
          (atingiu
            ? `🎉 **Parabéns! Você completou a sua meta de horas desta semana!**\nObrigado pela sua dedicação e contribuição ao projeto.`
            : `⚠️ **Atenção: Você não atingiu a sua meta de horas nesta semana.**\n` +
              `Faltaram **${fmtDur(metaSeg - segTrabalhados)}** para completar sua meta. Organize-se com a liderança do seu setor caso precise compensar ou justificar.`)
      )
      .addFields(
        { name: 'Setor', value: setor, inline: true },
        { name: 'Regime / Cargo', value: `${cargoInfo.cargoLabel} (${cargoInfo.cargaHoraria})`, inline: true },
        { name: 'Resultado', value: atingiu ? '✅ Meta Atingida' : '❌ Não Atingida', inline: true },
        { name: 'Horas Realizadas', value: `**${fmtDur(segTrabalhados)}**`, inline: true },
        { name: 'Meta Estabelecida', value: `**${fmtDur(metaSeg)}**`, inline: true },
        {
          name: 'Saldo',
          value: atingiu ? `+${fmtDur(segTrabalhados - metaSeg)}` : `-${fmtDur(metaSeg - segTrabalhados)}`,
          inline: true,
        }
      )
      .setFooter({ text: 'Em caso de dúvidas ou divergência no registro das horas, procure o Líder do seu setor ou o RH.' });

    if (!opcoes.apenasSimulacao) {
      const dmOk = await enviarDM(client, member.id, { embeds: [embedUsuario] });
      if (dmOk) totalDisparosUsuarios++;
      else dmsComFalha++;
      await sleep(250); // Evita bater nos limites de rate limit do Discord
    }
  }

  // 2. Dispara relatórios para os líderes de cada setor
  let totalRelatoriosLideres = 0;
  const relatoriosSetor = [];

  for (const [nomeSetor, lista] of setoresMap.entries()) {
    if (lista.length === 0) continue;

    const totalMembros = lista.length;
    const atingiram = lista.filter((m) => m.atingiu).length;
    const naoAtingiram = totalMembros - atingiram;
    const totalSegSetor = lista.reduce((acc, m) => acc + m.segTrabalhados, 0);
    const taxaSucesso = Math.round((atingiram / (totalMembros || 1)) * 100);

    const membrosAtingiram = lista.filter((m) => m.atingiu);
    const membrosNaoAtingiram = lista.filter((m) => !m.atingiu);

    const formatarLista = (arr, ehSucesso) => {
      if (arr.length === 0) return '_Nenhum integrante nesta categoria._';
      return arr
        .map((m) => {
          const saldo = ehSucesso
            ? `(+${fmtDur(m.segTrabalhados - m.metaSeg)})`
            : `(Faltaram ${fmtDur(m.metaSeg - m.segTrabalhados)})`;
          return `• <@${m.discordId}> (**${m.nome}**) — ${m.cargoInfo.cargoLabel}: **${fmtDur(m.segTrabalhados)}** / ${fmtDur(m.metaSeg)} ${saldo}`;
        })
        .join('\n');
    };

    const descLider =
      `📅 **Período:** ${periodo.ini} a ${periodo.fim}\n` +
      `📊 **Resumo Geral:**\n` +
      `• Total de Integrantes: **${totalMembros}**\n` +
      `• Atingiram a Meta: **${atingiram}** (${taxaSucesso}%)\n` +
      `• Não Atingiram a Meta: **${naoAtingiram}**\n` +
      `• Total de Horas do Setor: **${fmtDur(totalSegSetor)}**\n\n` +
      `**✅ Integrantes que atingiram a meta (${membrosAtingiram.length}):**\n` +
      `${formatarLista(membrosAtingiram, true)}\n\n` +
      `**⚠️ Integrantes que NÃO atingiram a meta (${membrosNaoAtingiram.length}):**\n` +
      `${formatarLista(membrosNaoAtingiram, false)}`;

    const embedLider = new EmbedBuilder()
      .setColor(naoAtingiram === 0 ? 0x2ecc71 : 0xe67e22)
      .setTitle(`📋 Relatório Semanal de Carga Horária — Setor: ${nomeSetor}`)
      .setDescription(descLider.length > 4000 ? descLider.slice(0, 3990) + '…' : descLider)
      .setFooter({ text: 'CyberGuard • Fechamento Semanal de Ponto' });

    relatoriosSetor.push({ nomeSetor, embed: embedLider, totalMembros, atingiram, naoAtingiram });

    if (!opcoes.apenasSimulacao) {
      const lideresSetor = await identificarLideresSetor(guild, nomeSetor);
      if (lideresSetor.length > 0) {
        for (const lider of lideresSetor) {
          const enviado = await enviarDM(client, lider.id, { embeds: [embedLider] });
          if (enviado) totalRelatoriosLideres++;
          await sleep(250);
        }
      } else {
        // Se o setor não tem líder identificado, direciona o relatório ao canal do RH
        console.warn(`[pontoMetas] Setor "${nomeSetor}" sem líder identificado. Encaminhando ao RH.`);
        if (config.channelRhId) {
          const canalRh = await client.channels.fetch(config.channelRhId).catch(() => null);
          if (canalRh) {
            await canalRh.send({
              content: `⚠️ **Aviso:** O setor **${nomeSetor}** não possui um Líder identificado no servidor para receber o relatório semanal.`,
              embeds: [embedLider],
            });
          }
        }
      }
    }
  }

  // 3. Posta log consolidado no canal de logs do ponto
  const embedConsolidado = new EmbedBuilder()
    .setColor(0x1f6feb)
    .setTitle('📊 Fechamento Semanal de Ponto Concluído')
    .setDescription(
      `📅 **Semana:** ${periodo.ini} a ${periodo.fim}\n` +
        `👥 **Integrantes Avaliados:** ${participantes.length}\n` +
        `📨 **DMs Enviadas:** ${totalDisparosUsuarios} (Falhas: ${dmsComFalha})\n` +
        `📋 **Relatórios para Líderes:** ${totalRelatoriosLideres}\n\n` +
        `**Resumo por Setor:**\n` +
        relatoriosSetor
          .map((r) => `• **${r.nomeSetor}**: ${r.atingiram}/${r.totalMembros} atingiram (${r.naoAtingiram} pendentes)`)
          .join('\n')
    )
    .setTimestamp();

  if (!opcoes.apenasSimulacao) {
    await logarPonto(client, embedConsolidado);
    await pdb.setMeta(chaveMeta, new Date().toISOString());
  }

  console.log(`[pontoMetas] Fechamento semanal concluído com sucesso.`);
  return {
    executado: true,
    periodo,
    totalParticipantes: participantes.length,
    totalDisparosUsuarios,
    dmsComFalha,
    totalRelatoriosLideres,
    relatoriosSetor,
    embedConsolidado,
  };
}

/**
 * Consulta e monta o histórico de todas as semanas de um usuário desde a sua entrada.
 */
async function obterRelatorioSemanasMembro(client, discordId, pagina = 0, porPagina = 6) {
  let guildMember = null;
  if (client && config.guildId) {
    const guild = client.guilds.cache.get(config.guildId) || (await client.guilds.fetch(config.guildId).catch(() => null));
    if (guild) {
      guildMember = guild.members.cache.get(discordId) || (await guild.members.fetch(discordId).catch(() => null));
    }
  }

  const nomeCompleto = await resolverNomeCompleto(discordId, guildMember);
  const dataInicio = await obterDataInicioMembro(discordId, guildMember);
  const cargoInfo = await obterCargaHoraria(client, guildMember, discordId);
  const rowsSemanas = await pdb.historicoSemanasAluno(discordId, dataInicio);
  const semanaAtualId = await pdb.semanaAtual();

  const totalSemanas = rowsSemanas.length;
  const totalPaginas = Math.max(1, Math.ceil(totalSemanas / porPagina));
  pagina = Math.min(Math.max(pagina, 0), totalPaginas - 1);

  const metaSeg = cargoInfo.metaSegundos;
  const semanasConcluidas = rowsSemanas.filter((r) => r.semana_id !== semanaAtualId);
  const totalAtingidas = semanasConcluidas.filter((r) => r.seg >= metaSeg).length;
  const taxaSucesso = semanasConcluidas.length > 0 ? Math.round((totalAtingidas / semanasConcluidas.length) * 100) : 100;
  const totalHorasAcumuladas = rowsSemanas.reduce((acc, r) => acc + r.seg, 0);

  const fatia = rowsSemanas.slice(pagina * porPagina, (pagina + 1) * porPagina);

  const formatarData = (d) =>
    new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

  return {
    discordId,
    nomeCompleto,
    dataInicioFmt: formatarData(dataInicio),
    cargoInfo,
    metaSeg,
    totalSemanas,
    totalPaginas,
    paginaAtual: pagina,
    totalAtingidas,
    totalConcluidas: semanasConcluidas.length,
    taxaSucesso,
    totalHorasAcumuladas,
    semanaAtualId,
    fatiaSemanas: fatia,
  };
}

/**
 * Renderiza o embed paginado e os botões de navegação do relatório semanal do integrante.
 */
function renderizarEmbedSemanas(dados, opcoes = {}) {
  const {
    discordId,
    nomeCompleto,
    dataInicioFmt,
    cargoInfo,
    metaSeg,
    totalPaginas,
    paginaAtual,
    totalAtingidas,
    totalConcluidas,
    taxaSucesso,
    totalHorasAcumuladas,
    semanaAtualId,
    fatiaSemanas,
  } = dados;

  const blocos = fatiaSemanas.map((s) => {
    const ehSemanaAtual = s.semana_id === semanaAtualId;
    const atingiu = s.seg >= metaSeg;

    let statusTexto;
    if (atingiu) {
      statusTexto = '✅ **Meta Atingida**';
    } else if (ehSemanaAtual) {
      statusTexto = '⏳ **Em andamento**';
    } else {
      statusTexto = '❌ **Meta Não Atingida**';
    }

    let saldoTexto;
    if (atingiu) {
      saldoTexto = `(+${fmtDur(s.seg - metaSeg)})`;
    } else if (ehSemanaAtual) {
      saldoTexto = `(Faltam ${fmtDur(metaSeg - s.seg)})`;
    } else {
      saldoTexto = `(Faltaram ${fmtDur(metaSeg - s.seg)})`;
    }

    return (
      `📅 **Semana ${s.ini_fmt} a ${s.fim_fmt}**${ehSemanaAtual ? ' *(Semana Atual)*' : ''}\n` +
      `> ${statusTexto} • **${fmtDur(s.seg)}** / **${fmtDur(metaSeg)}** ${saldoTexto}\n` +
      `> Registros: ${s.pontos_qtd} ponto(s)`
    );
  });

  const embed = new EmbedBuilder()
    .setColor(taxaSucesso >= 70 ? 0x2ecc71 : 0xe67e22)
    .setTitle(`📅 Histórico Semanal de Ponto — ${nomeCompleto}`)
    .setDescription(
      `👤 **Membro:** <@${discordId}>\n` +
        `🏷️ **Regime Atual:** ${cargoInfo.cargoLabel} (${cargoInfo.cargaHoraria})\n` +
        `📆 **Entrada no Projeto:** ${dataInicioFmt}\n` +
        `📊 **Desempenho Geral:** **${totalAtingidas}** de **${totalConcluidas}** semanas com meta atingida (**${taxaSucesso}%**)\n` +
        `⏱️ **Horas Totais Acumuladas:** **${fmtDur(totalHorasAcumuladas)}**\n\n` +
        (blocos.length > 0 ? blocos.join('\n\n') : '_Nenhuma semana registrada até o momento._')
    )
    .setFooter({
      text: `Página ${paginaAtual + 1} de ${totalPaginas} • Semanas completas desde o ingresso no CyberGuard`,
    });

  const componentes = [];
  const linhaBotoes = new ActionRowBuilder();

  linhaBotoes.addComponents(
    new ButtonBuilder()
      .setCustomId(`ponto:semanas_pag:${discordId}:${paginaAtual - 1}`)
      .setLabel('◀ Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paginaAtual === 0),
    new ButtonBuilder()
      .setCustomId('ponto:semanas_info')
      .setLabel(`${paginaAtual + 1}/${totalPaginas}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`ponto:semanas_pag:${discordId}:${paginaAtual + 1}`)
      .setLabel('Próxima ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paginaAtual >= totalPaginas - 1)
  );

  if (opcoes.origemResumo) {
    linhaBotoes.addComponents(
      new ButtonBuilder()
        .setCustomId(`ponto:det:${discordId}:0`)
        .setLabel('Voltar aos Pontos')
        .setStyle(ButtonStyle.Primary)
    );
  }

  componentes.push(linhaBotoes);
  return { embeds: [embed], components: componentes };
}

/**
 * Trata interações de exibição e paginação do relatório semanal.
 */
async function renderizarOuAtualizarRelatorioSemanas(interaction, alvoId, pagina = 0, atualizar = false, opcoes = {}) {
  const dados = await obterRelatorioSemanasMembro(interaction.client, alvoId, pagina, 6);
  const payload = renderizarEmbedSemanas(dados, opcoes);

  if (atualizar) {
    return await interaction.update(payload);
  }

  if (interaction.deferred || interaction.replied) {
    return await interaction.editReply(payload);
  }

  return await interaction.reply({ ...payload, flags: interaction.inGuild() ? EPH : undefined });
}

module.exports = {
  fmtDur,
  obterCargaHoraria,
  obterSetorDoMembro,
  identificarLideresSetor,
  obterDataInicioMembro,
  executarFechamentoSemanal,
  obterRelatorioSemanasMembro,
  renderizarEmbedSemanas,
  renderizarOuAtualizarRelatorioSemanas,
};
