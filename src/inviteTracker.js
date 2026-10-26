const { EmbedBuilder } = require('discord.js');
const config = require('./config');

// Mapa em memória: guildId -> Map(inviteCode -> { uses, channelId, code })
const invitesCache = new Map();

/**
 * Inicializa o cache de convites ao ligar o bot e registra listeners
 * para capturar convites criados ou deletados em tempo real.
 */
async function initInviteTracker(client) {
  try {
    const guilds = await client.guilds.fetch();
    for (const [guildId] of guilds) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const invites = await guild.invites.fetch();
        const map = new Map();
        for (const inv of invites.values()) {
          map.set(inv.code, {
            uses: inv.uses ?? 0,
            channelId: inv.channelId,
            code: inv.code,
          });
        }
        invitesCache.set(guild.id, map);
        console.log(`[inviteTracker] Cache inicializado para a guild ${guild.name} (${map.size} convites ativos).`);
      } catch (errGuild) {
        console.warn(`[inviteTracker] Não foi possível carregar convites da guild ${guildId}:`, errGuild.message);
      }
    }
  } catch (err) {
    console.error('[inviteTracker] Erro ao inicializar rastreador de convites:', err.message);
  }

  client.on('inviteCreate', (invite) => {
    try {
      if (!invite.guild) return;
      const map = invitesCache.get(invite.guild.id) || new Map();
      map.set(invite.code, {
        uses: invite.uses ?? 0,
        channelId: invite.channelId,
        code: invite.code,
      });
      invitesCache.set(invite.guild.id, map);
    } catch (err) {
      console.error('[inviteTracker] Erro no inviteCreate:', err.message);
    }
  });

  client.on('inviteDelete', (invite) => {
    try {
      if (!invite.guild) return;
      const map = invitesCache.get(invite.guild.id);
      if (map) {
        map.delete(invite.code);
      }
    } catch (err) {
      console.error('[inviteTracker] Erro no inviteDelete:', err.message);
    }
  });
}

/**
 * Checa se um convite pertence ao espaço de Entusiastas:
 * 1) Por código fixo em INVITE_ENTUSIASTA_CODES / INVITE_ENTUSIASTA_CODE
 * 2) Por canal fixo em CHANNEL_ENTUSIASTA_ID
 * 3) Por categoria fixa em CATEGORIA_ENTUSIASTA_ID
 * 4) Automaticamente se o nome do canal ou da categoria contiver "entusiasta" ou "intusiasta"
 */
async function ehConviteEntusiasta(guild, convite) {
  if (!convite) return false;

  const codigo = convite.code;
  if (config.inviteEntusiastaCodes && config.inviteEntusiastaCodes.includes(codigo)) {
    return true;
  }

  const canalId = convite.channelId;
  if (config.channelEntusiastaId && canalId === config.channelEntusiastaId) {
    return true;
  }

  // Verifica se o canal ou categoria tem "entusiasta" ou "intusiasta" no nome
  try {
    const canal =
      convite.channel ||
      (canalId ? guild.channels.cache.get(canalId) ?? (await guild.channels.fetch(canalId).catch(() => null)) : null);

    if (canal) {
      const nomeCanal = (canal.name || '').toLowerCase();
      if (nomeCanal.includes('entusiasta') || nomeCanal.includes('intusiasta')) {
        return true;
      }

      const categoriaId = canal.parentId || canal.parent?.id;
      if (config.categoriaEntusiastaId && categoriaId === config.categoriaEntusiastaId) {
        return true;
      }

      const categoria =
        canal.parent ||
        (categoriaId ? guild.channels.cache.get(categoriaId) ?? (await guild.channels.fetch(categoriaId).catch(() => null)) : null);

      if (categoria) {
        const nomeCategoria = (categoria.name || '').toLowerCase();
        if (nomeCategoria.includes('entusiasta') || nomeCategoria.includes('intusiasta')) {
          return true;
        }
      }
    }
  } catch (err) {
    console.error('[inviteTracker] Erro ao validar canal do convite:', err.message);
  }

  return false;
}

/**
 * Ao entrar um novo membro, compara os usos dos convites com o cache
 * para identificar qual convite foi utilizado e se ele é de Entusiasta.
 */
async function rastrearConviteUsado(member) {
  const guild = member.guild;
  let ehEntusiasta = false;
  let codigoConvite = null;

  try {
    const invitesAtuais = await guild.invites.fetch();
    const cacheGuild = invitesCache.get(guild.id) || new Map();

    // Procura o convite que teve o contador incrementado
    let conviteUsado = invitesAtuais.find((inv) => {
      const anterior = cacheGuild.get(inv.code);
      const usesAnterior = anterior ? anterior.uses : 0;
      return (inv.uses ?? 0) > usesAnterior;
    });

    // Caso de convite de uso único consumido que não aparece mais na lista
    if (!conviteUsado) {
      for (const [code, dados] of cacheGuild.entries()) {
        if (!invitesAtuais.has(code)) {
          conviteUsado = dados;
          break;
        }
      }
    }

    // Atualiza o cache com o snapshot atual
    const novoMap = new Map();
    for (const inv of invitesAtuais.values()) {
      novoMap.set(inv.code, {
        uses: inv.uses ?? 0,
        channelId: inv.channelId,
        code: inv.code,
      });
    }
    invitesCache.set(guild.id, novoMap);

    if (conviteUsado) {
      codigoConvite = conviteUsado.code;
      ehEntusiasta = await ehConviteEntusiasta(guild, conviteUsado);
    }
  } catch (err) {
    console.error('[inviteTracker] Erro ao rastrear convite no guildMemberAdd:', err.message);
  }

  return { ehEntusiasta, codigoConvite };
}

/**
 * Atribui o cargo de Entusiasta ao novo membro e envia uma DM amigável
 * de boas-vindas sem formulários burocráticos.
 */
async function atribuirCargoEntusiasta(member) {
  const guild = member.guild;
  const nomeCargo = config.roleEntusiastaNome || 'Entusiasta';

  let role = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === nomeCargo.toLowerCase()
  );

  if (!role) {
    try {
      role = await guild.roles.create({
        name: nomeCargo,
        color: 0x2ecc71,
        reason: 'Cargo para visitantes e entusiastas da comunidade CyberGuard',
      });
      console.log(`[inviteTracker] Cargo "${nomeCargo}" criado com sucesso (ID: ${role.id}).`);
    } catch (errRole) {
      console.error(`[inviteTracker] Erro ao criar cargo "${nomeCargo}":`, errRole.message);
    }
  }

  if (role) {
    try {
      await member.roles.add(role);
      console.log(`[inviteTracker] Cargo "${role.name}" atribuído a ${member.user.tag}.`);
    } catch (errAdd) {
      console.error(`[inviteTracker] Erro ao adicionar cargo a ${member.user.tag}:`, errAdd.message);
    }
  }

  // DM amigável e acolhedora de boas-vindas
  try {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('👋 Boas-vindas ao CyberGuard!')
      .setDescription(
        `Olá, **${member.displayName || member.user.username}**!\n\n` +
          `Você acabou de entrar na nossa comunidade com o cargo de **Entusiasta** 💡.\n\n` +
          `Fique à vontade para acompanhar nossos projetos, participar dos canais de bate-papo, tirar dúvidas sobre cibersegurança e assistir aos nossos workshops e palestras abertas.\n\n` +
          `*Aqui você não precisa preencher termos, nem cumprir horas ou bater ponto. Sinta-se em casa!*\n\n` +
          `📌 *Se em algum momento você quiser se tornar um voluntário oficial da UTFPR em um dos nossos times (Hacking Ético, Design, Hardware Hacking, Recursos Humanos, Social Media), fale com a nossa liderança a qualquer momento!*`
      )
      .setFooter({ text: 'CyberGuard UTFPR — Inteligência de Ameaças & Educação Digital' });

    await member.send({ embeds: [embed] });
  } catch (errDm) {
    console.log(`[inviteTracker] DM fechada para ${member.user.tag}, não foi possível enviar boas-vindas na DM.`);
  }
}

module.exports = {
  initInviteTracker,
  rastrearConviteUsado,
  atribuirCargoEntusiasta,
  ehConviteEntusiasta,
};
