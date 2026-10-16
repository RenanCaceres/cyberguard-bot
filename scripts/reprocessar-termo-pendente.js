require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const config = require('../src/config');
const db = require('../src/db');
const { encaminharParaRevisaoManual } = require('../src/recepcaoTermo');

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await client.login(config.discordToken);
  console.log(`Conectado ao Discord como ${client.user.tag}`);

  if (!config.channelRhId) {
    console.error('CHANNEL_RH_ID não configurado no .env.');
    process.exit(1);
  }

  const canalRh = await client.channels.fetch(config.channelRhId);
  const mensagens = await canalRh.messages.fetch({ limit: 50 });

  console.log('Buscando mensagens antigas de termos pendentes sem botões...');
  let processados = 0;

  for (const [, msg] of mensagens) {
    // Procura mensagens antigas do bot avisando de termo pendente sem componentes
    if (
      msg.author.id === client.user.id &&
      msg.attachments.size > 0 &&
      msg.components.length === 0 &&
      msg.content.includes('não pôde ser validado automaticamente')
    ) {
      const anexo = msg.attachments.first();
      if (!anexo.name.toLowerCase().endsWith('.pdf')) continue;

      const match = msg.content.match(/<@!?(\d+)>/);
      if (!match) continue;

      const discordId = match[1];
      const membro = await db.getMembro(discordId);
      if (!membro) {
        console.log(`Membro ID ${discordId} não localizado na tabela membros.`);
        continue;
      }

      if (membro.status === 'concluido') {
        console.log(`Membro ${membro.nome} (${discordId}) já está concluído. Pulando.`);
        continue;
      }

      console.log(`Reprocessando termo de: ${membro.nome} (@${discordId}) - Arquivo: ${anexo.name}`);
      const dirTemp = path.resolve('./temp');
      fs.mkdirSync(dirTemp, { recursive: true });
      const caminhoLocal = path.join(dirTemp, `pendente_termo_${discordId}.pdf`);

      const resp = await axios.get(anexo.url, { responseType: 'arraybuffer' });
      fs.writeFileSync(caminhoLocal, resp.data);

      await db.atualizarStatus(discordId, 'revisao_manual', {
        termo_arquivo_path: caminhoLocal,
      });

      await encaminharParaRevisaoManual(
        client,
        membro,
        caminhoLocal,
        anexo.name,
        'Data de assinatura não preenchida ou não confirmada automaticamente.'
      );

      console.log(`✅ Mensagem com botões de Aprovar/Reprovar postada para ${membro.nome}!`);
      processados++;
    }
  }

  if (processados === 0) {
    console.log('Nenhuma mensagem antiga pendente encontrada para atualizar.');
  } else {
    console.log(`Total de ${processados} termo(s) atualizado(s) com os novos botões.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao executar reprocessamento:', err);
  process.exit(1);
});
