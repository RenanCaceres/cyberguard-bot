const db = require('./db');
const config = require('./config');
const { iniciarOnboarding } = require('./onboarding');
const { postarCartao } = require('./cartaoServidor');

// Status em que o onboarding já foi concluído (mesmo que rejeitado) —
// não deve ser reiniciado pra esses.
const STATUS_JA_PROCESSADO = [
  'pendente_aprovacao',
  'aguardando_assinatura',
  'revisao_manual',
  'concluido',
  'rejeitado',
];

/**
 * Roda no início do bot: procura membros que já estão no servidor mas nunca
 * passaram pelo onboarding (entraram com o bot desligado, ou começaram a
 * responder e o bot caiu no meio). Dispara o onboarding pra esses.
 *
 * Recebe `membrosAtuais` já buscado (guild.members.fetch()) em vez de
 * buscar por conta própria — ver comentário em processarSaidasPerdidas
 * sobre por que isso importa.
 */
async function processarMembrosPendentes(membrosAtuais) {
  try {
    const pendentes = [];
    for (const membro of membrosAtuais.values()) {
      if (membro.user.bot) continue;

      // Só mexe com quem ainda não tem NENHUM cargo além do @everyone — ou
      // seja, gente genuinamente nova. Membros antigos (de antes desse bot
      // existir) já têm cargos e nunca tiveram registro na tabela, então sem
      // esse filtro eles também cairiam aqui por engano.
      const temAlgumCargo = membro.roles.cache.size > 1;
      if (temAlgumCargo) continue;

      const registro = await db.getMembro(membro.id);
      const precisaOnboarding = !registro || !STATUS_JA_PROCESSADO.includes(registro.status);
      if (precisaOnboarding) {
        pendentes.push(membro);
      }
    }

    if (pendentes.length === 0) return;

    console.log(`Encontrados ${pendentes.length} membro(s) sem onboarding concluído. Processando...`);
    // Espaça as DMs pra não tomar rate limit do Discord se muita gente
    // entrou enquanto o bot estava fora do ar.
    for (const membro of pendentes) {
      iniciarOnboarding(membro).catch((err) =>
        console.error('Erro no onboarding retroativo de', membro.id, err)
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } catch (err) {
    console.error('Erro ao processar membros pendentes:', err);
  }
}

/**
 * Roda no início do bot: procura membros que a tabela `membros` ainda acha
 * que estão no servidor, mas que na verdade já saíram — geralmente porque a
 * saída aconteceu (kick, ban ou saída voluntária) num momento em que o bot
 * estava reiniciando/reconectando e perdeu o evento `guildMemberRemove` (o
 * Discord não reenvia esse evento depois, então sem essa reconciliação o
 * cartão de saída simplesmente nunca sai).
 *
 * IMPORTANTE: recebe `membrosAtuais` já buscado em vez de fazer o próprio
 * `guild.members.fetch()`. Esse fetch é um pedido de Gateway (opcode 8) e o
 * Discord rate-limita chamadas repetidas dele em sequência — se essa função
 * buscasse de novo logo depois de `processarMembrosPendentes` já ter
 * buscado, toma "GatewayRateLimitError: Request with opcode 8 was rate
 * limited". Por isso o `index.js` busca uma vez só e passa pra cá e pra
 * `processarMembrosPendentes`.
 *
 * Pra cada saída perdida, replica o que o listener `guildMemberRemove`
 * faria: arquiva como abandono se o onboarding não tinha sido concluído, e
 * posta o cartão de saída. Marca `saida_processada = true` no final pra não
 * repetir isso no próximo boot.
 */
async function processarSaidasPerdidas(client, membrosAtuais) {
  try {
    const candidatos = await db.listarMembrosParaChecarSaida();
    const saidas = candidatos.filter((registro) => !membrosAtuais.has(registro.discord_id));

    if (saidas.length === 0) return;

    console.log(`Encontrada(s) ${saidas.length} saída(s) perdida(s) (bot estava fora do ar). Processando...`);

    for (const registro of saidas) {
      // O usuário do Discord existe independente de ainda estar no
      // servidor, então dá pra buscar tag/avatar/username reais mesmo
      // depois que ele saiu — só falha se a conta tiver sido deletada.
      // Isso é um fetch de usuário individual via REST, não tem relação
      // com o rate limit de opcode 8 mencionado acima. Busca ANTES de
      // decidir o nome porque, se `registro.nome` ainda não tiver sido
      // preenchido (ex: saiu antes de terminar o formulário de
      // onboarding), queremos cair no username do Discord — igual o
      // listener ao vivo em index.js já faz — em vez de mostrar o ID cru.
      let discordTag = registro.discord_id;
      let avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      let usuario = null;
      try {
        usuario = await client.users.fetch(registro.discord_id);
        discordTag = usuario.tag;
        avatarUrl = usuario.displayAvatarURL({ extension: 'png', size: 256 });
      } catch (errUsuario) {
        console.warn(
          `Não foi possível buscar dados do usuário ${registro.discord_id} (provavelmente conta deletada):`,
          errUsuario.message
        );
      }

      const nome = registro.nome || (usuario ? usuario.username : registro.discord_id);

      if (registro.status !== 'concluido') {
        try {
          await db.registrarRecusa({
            discordId: registro.discord_id,
            nome: registro.nome,
            ra: registro.ra,
            tipo: 'abandonado',
            motivo: `Saiu do servidor antes de concluir o processo (status: ${registro.status}) — detectado retroativamente no boot`,
          });
          await db.removerMembro(registro.discord_id);
        } catch (errArquivo) {
          console.error('Erro ao arquivar abandono retroativo de', registro.discord_id, errArquivo);
        }
      }

      try {
        await postarCartao(client, config.channelBoasVindasId, {
          tipo: 'saida',
          nome,
          discordTag,
          avatarUrl,
        });
      } catch (errCartao) {
        console.error('Erro ao postar cartão de saída retroativo de', registro.discord_id, errCartao);
      }

      if (registro.status === 'concluido') {
        try {
          await db.marcarSaidaProcessada(registro.discord_id);
        } catch (errMarcar) {
          console.error('Erro ao marcar saída retroativa como processada:', errMarcar);
        }
      }

      // Espaça as postagens pra não estourar rate limit do canal.
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (err) {
    console.error('Erro ao processar saídas perdidas:', err);
  }
}

module.exports = { processarMembrosPendentes, processarSaidasPerdidas };
