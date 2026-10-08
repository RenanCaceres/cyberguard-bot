const { REST, Routes } = require('discord.js');
const config = require('./src/config');
const reuniaoCommand = require('./commands/reuniao/reuniaoCommand');
const advertenciaCommand = require('./commands/advertir/advertirCommand');
const minhasAdvertenciasCommand = require('./commands/minhas-advertencias/minhasAdvertenciasCommand');
const advertenciasCommand = require('./commands/advertencias/advertenciasCommand');
const painelAdvertenciasCommand = require('./commands/painel-advertencias/painelAdvertenciasCommand');
const painelPontoCommand = require('./commands/painel-ponto/painelPontoCommand');
const ajustarPontoCommand = require('./commands/ajustar-ponto/ajustarPontoCommand');
const importarHorasCommand = require('./commands/importar-horas/importarHorasCommand');

const comandos = [
  reuniaoCommand.data.toJSON(),
  advertenciaCommand.data.toJSON(),
  minhasAdvertenciasCommand.data.toJSON(),
  advertenciasCommand.data.toJSON(),
  painelAdvertenciasCommand.data.toJSON(),
  painelPontoCommand.data.toJSON(),
  ajustarPontoCommand.data.toJSON(),
  importarHorasCommand.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.discordToken);

(async () => {
  try {
    console.log(`Registrando ${comandos.length} comando(s) (guild: ${config.guildId})...`);

    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: comandos }
    );

    console.log('Comandos registrados com sucesso.');
  } catch (err) {
    console.error('Erro ao registrar comandos:', err);
  }
})();
