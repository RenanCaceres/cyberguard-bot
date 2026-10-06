const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const config = require('./src/config');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(config.guildId);
    await guild.members.fetch();

    const nomesRelevantes = [config.roleAprovadoNome, ...config.areasInteresse].filter(Boolean);
    const rolesRelevantes = guild.roles.cache.filter((r) => nomesRelevantes.includes(r.name));

    if (rolesRelevantes.size === 0) {
      console.error('Nenhum dos cargos relevantes foi encontrado no servidor:', nomesRelevantes);
      process.exit(1);
    }

    const membros = guild.members.cache.filter((m) =>
      m.roles.cache.some((role) => rolesRelevantes.has(role.id))
    );

    const linhas = ['discord_id,username,display_name,nickname,cargos'];
    for (const membro of membros.values()) {
      const username = membro.user.username || '';
      const displayName = membro.user.globalName || '';
      const nickname = membro.nickname || '';
      const cargosDoMembro = membro.roles.cache
        .filter((r) => rolesRelevantes.has(r.id))
        .map((r) => r.name)
        .join('; ');
      linhas.push(`${membro.id},"${username}","${displayName}","${nickname}","${cargosDoMembro}"`);
    }

    fs.writeFileSync('membros_atuais.csv', linhas.join('\n'), 'utf-8');
    console.log(`OK — ${membros.size} membro(s) com algum cargo relevante salvos em membros_atuais.csv`);
  } catch (err) {
    console.error('Erro ao listar membros:', err);
  } finally {
    process.exit(0);
  }
});

client.login(config.discordToken);
