const axios = require('axios');
const { loadImage } = require('@napi-rs/canvas');
const config = require('./config');
const db = require('./db');
const { renderizarHierarquia } = require('./hierarquiaRender');

const ORDEM_TIMES = [
  'Social Media & Copy',
  'Recursos Humanos',
  'Design',
  'Hardware Hacking',
  'Hacking Ético',
];

const CORES_TIME = {
  'Social Media & Copy': '#ff6ea9',
  'Recursos Humanos': '#4cd6a0',
  Design: '#f4b942',
  'Hardware Hacking': '#ff884d',
  'Hacking Ético': '#a468ff',
};

const LIDERES_TIME = {
  'Hacking Ético': '710682125074169956', // Christopher Ribeiro Paiva Oliveira
  Design: '602207814034915348', // Fernanda Menan Gomes de Oliveira
};

async function baixarAvatar(discordUser) {
  try {
    const url = discordUser.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
    const resposta = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    return await loadImage(Buffer.from(resposta.data));
  } catch (err) {
    console.error('[hierarquia] erro ao baixar avatar de', discordUser.id, err.message);
    return null;
  }
}

async function resolverNome(discordId, discordUser) {
  try {
    const membro = await db.getMembro(discordId);
    if (membro && membro.nome) return membro.nome;

    const legado = await db.getNomeLegado(discordId);
    if (legado) return legado;
  } catch (err) {
    console.error('[hierarquia] erro ao resolver nome de', discordId, err.message);
  }

  return discordUser.globalName || discordUser.username;
}

async function montarPessoa(guildMember) {
  const [nome, imagem] = await Promise.all([
    resolverNome(guildMember.id, guildMember.user),
    baixarAvatar(guildMember.user),
  ]);
  return { id: guildMember.id, nome, imagem };
}

function obterMembrosDoTime(guild, nomeSecao) {
  if (nomeSecao === 'Hacking Ético') {
    const roleIdEtico = config.roleHackingEticoId || '1502772363178147860';
    const roleEtico = guild.roles.cache.get(roleIdEtico) || guild.roles.cache.find((r) => r.name === nomeSecao);
    const roleRed = guild.roles.cache.find((r) => r.name === 'Red Team');
    const roleBlue = guild.roles.cache.find((r) => r.name === 'Blue Team');
    return guild.members.cache.filter(
      (m) =>
        (roleEtico && m.roles.cache.has(roleEtico.id)) ||
        (roleRed && m.roles.cache.has(roleRed.id)) ||
        (roleBlue && m.roles.cache.has(roleBlue.id))
    );
  }

  const role = guild.roles.cache.find((r) => r.name === nomeSecao);
  if (!role) return null;
  return guild.members.cache.filter((m) => m.roles.cache.has(role.id));
}

async function coletarDadosHierarquia(guild) {
  const roleLider = guild.roles.cache.find((r) => r.name === config.roleLiderNome);
  const presidenteMember =
    guild.members.cache.get(config.presidenteId) ??
    (await guild.members.fetch(config.presidenteId).catch(() => null));
  const presidente = presidenteMember
    ? await montarPessoa(presidenteMember)
    : { id: config.presidenteId, nome: 'Presidente', imagem: null };

  const times = [];

  for (const nomeSecao of ORDEM_TIMES) {
    const membrosDoTime = obterMembrosDoTime(guild, nomeSecao);
    if (!membrosDoTime) {
      times.push({ nome: nomeSecao, cor: CORES_TIME[nomeSecao], membros: [] });
      continue;
    }

    const pessoas = await Promise.all(
      membrosDoTime.map(async (m) => {
        const pessoa = await montarPessoa(m);
        const ehLider = (roleLider && m.roles.cache.has(roleLider.id)) || LIDERES_TIME[nomeSecao] === m.id;
        return { ...pessoa, lider: !!ehLider };
      })
    );

    pessoas.sort((a, b) => {
      if (a.lider !== b.lider) return a.lider ? -1 : 1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    times.push({ nome: nomeSecao, cor: CORES_TIME[nomeSecao], membros: pessoas });
  }

  return { presidente, times };
}

let atualizacaoPendente = null;
let atualizacaoEmAndamento = false;

function agendarAtualizacaoHierarquia(guild) {
  if (!config.hierarquiaChannelId) return;

  clearTimeout(atualizacaoPendente);
  atualizacaoPendente = setTimeout(() => {
    executarAtualizacao(guild).catch((err) =>
      console.error('[hierarquia] erro ao atualizar imagem:', err)
    );
  }, 4000);
}

async function executarAtualizacao(guild) {
  if (atualizacaoEmAndamento) {
    return;
  }
  atualizacaoEmAndamento = true;

  try {
    const dados = await coletarDadosHierarquia(guild);
    const buffer = await renderizarHierarquia(dados);

    const canal = await guild.channels.fetch(config.hierarquiaChannelId);
    const idMensagemSalva = await db.getEstado('hierarquia_message_id');

    if (idMensagemSalva) {
      try {
        const mensagem = await canal.messages.fetch(idMensagemSalva);
        await mensagem.edit({
          files: [{ attachment: buffer, name: 'hierarquia.png' }],
        });
        return;
      } catch (err) {
        console.warn('[hierarquia] mensagem antiga não encontrada, criando uma nova.');
      }
    }

    const novaMensagem = await canal.send({
      files: [{ attachment: buffer, name: 'hierarquia.png' }],
    });
    await db.salvarEstado('hierarquia_message_id', novaMensagem.id);
  } finally {
    atualizacaoEmAndamento = false;
  }
}

function cargosRelevantesMudaram(oldMember, newMember) {
  // Inclui Red Team e Blue Team aqui também, por causa do fallback
  // temporário do Hacking Ético acima — remova os dois quando apagar o
  // bloco temporário em obterMembrosDoTime().
  const nomesRelevantes = new Set([
    ...ORDEM_TIMES,
    'Red Team',
    'Blue Team',
    config.roleLiderNome,
  ]);
  const guild = newMember.guild;

  const idsRelevantes = new Set(
    guild.roles.cache.filter((r) => nomesRelevantes.has(r.name)).map((r) => r.id)
  );
  if (config.roleHackingEticoId) idsRelevantes.add(config.roleHackingEticoId);

  const antes = new Set(oldMember.roles.cache.filter((r) => idsRelevantes.has(r.id)).map((r) => r.id));
  const depois = new Set(newMember.roles.cache.filter((r) => idsRelevantes.has(r.id)).map((r) => r.id));

  if (antes.size !== depois.size) return true;
  for (const id of antes) {
    if (!depois.has(id)) return true;
  }
  return false;
}

module.exports = {
  agendarAtualizacaoHierarquia,
  cargosRelevantesMudaram,
};
