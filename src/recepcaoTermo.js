const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { encaminharTermoAssinado } = require('./emailService');
const { validarTermoDevolvido } = require('./dataAssinatura');

async function baixarAnexo(url, destino) {
  const resposta = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(destino, resposta.data);
  return destino;
}

async function encaminharParaRevisaoManual(client, membro, caminhoArquivo, nomeOriginal) {
  if (!config.channelRhId) return;
  const canalRh = await client.channels.fetch(config.channelRhId);
  await canalRh.send({
    content:
      `⚠️ O termo de <@${membro.discord_id}> (${membro.nome}) não pôde ser validado ` +
      `automaticamente. Confira manualmente se a data de assinatura está correta.`,
    files: [{ attachment: caminhoArquivo, name: nomeOriginal }],
  });
}

async function handleMensagemDM(message) {
  if (message.author.bot) return;
  if (message.channel.type !== 1) return; // 1 = DM
  if (message.attachments.size === 0) return;

  const membro = await db.getMembro(message.author.id);
  if (!membro || membro.status !== 'aguardando_assinatura') return;

  const anexo = message.attachments.first();
  const extensao = path.extname(anexo.name).toLowerCase();

  if (extensao !== '.pdf') {
    await message.reply(
      'Preciso que o termo já assinado seja enviado em **.pdf** (o arquivo que sai da assinatura ' +
        'pelo gov.br). Envie o PDF assinado, não o Word.'
    );
    return;
  }

  const caminhoLocal = path.resolve('./temp', `assinado_${message.author.id}${extensao}`);
  await baixarAnexo(anexo.url, caminhoLocal);

  const validacao = await validarTermoDevolvido(caminhoLocal);

  if (!validacao.valido) {
    if (validacao.revisarManualmente) {
      await encaminharParaRevisaoManual(message.client, membro, caminhoLocal, anexo.name);
      await db.atualizarStatus(message.author.id, 'revisao_manual');
      await message.reply(
        'Recebi o termo, mas não consegui confirmar automaticamente a data de assinatura. ' +
          'Encaminhei para o RH revisar manualmente — aguarde a confirmação.'
      );
      fs.unlink(caminhoLocal, () => {});
      return;
    }

    fs.unlink(caminhoLocal, () => {});
    await message.reply(validacao.motivo);
    return;
  }

  await encaminharTermoAssinado(membro, caminhoLocal, anexo.name);
  await db.atualizarStatus(message.author.id, 'concluido');
  fs.unlink(caminhoLocal, () => {});

  await message.reply(
    'Termo recebido e validado! Encaminhei para o RH e seu cadastro está concluído. Bem-vindo(a) ao CyberGuard! 🎉'
  );
}

module.exports = { handleMensagemDM };
