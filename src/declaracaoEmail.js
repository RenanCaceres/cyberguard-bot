const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const cron = require('node-cron');
const config = require('./config');
const db = require('./db');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

/**
 * Envia a declaração gerada para o professor coordenador assinar via e-mail.
 */
async function enviarDeclaracaoParaProfessor({ declaracao, caminhoPdf }) {
  const destinatario = config.emailProfessorCoordenador || config.smtp.destinatarios[0];
  if (!destinatario) {
    throw new Error('Nenhum destinatário de e-mail configurado para o professor (EMAIL_PROFESSOR_COORDENADOR ou EMAIL_DESTINATARIOS).');
  }

  const nomeArquivo = `Declaracao_CyberGuard_${declaracao.ra}_${(declaracao.nome || 'aluno').replace(/\s+/g, '_')}.pdf`;

  const info = await transporter.sendMail({
    from: config.smtp.from || config.smtp.user,
    to: destinatario,
    subject: `[CyberGuard] Solicitação de Declaração #${declaracao.codigo} - ${declaracao.nome}`,
    text:
      `Olá Prof. André Luiz Przybysz,\n\n` +
      `O(A) acadêmico(a) ${declaracao.nome} (RA: ${declaracao.ra}, Curso: ${declaracao.curso}) solicitou uma declaração de comprovação de participação voluntária no projeto de extensão CyberGuard.\n\n` +
      `Em anexo está o documento gerado automaticamente com início registrado em ${declaracao.data_inicio} e carga horária semanal de 10 horas.\n\n` +
      `Para assinar e concluir:\n` +
      `1. Baixe o PDF em anexo;\n` +
      `2. Assine digitalmente pelo gov.br (assinador de documentos);\n` +
      `3. Responda a este mesmo e-mail anexando o PDF assinado.\n\n` +
      `O bot do CyberGuard identificará automaticamente a resposta pelo código #${declaracao.codigo} no assunto e encaminhará o documento assinado na DM do aluno.\n\n` +
      `Atenciosamente,\n` +
      `Bot de Automação CyberGuard UTFPR`,
    attachments: [
      {
        filename: nomeArquivo,
        path: caminhoPdf,
      },
    ],
  });

  return info.messageId;
}

/**
 * Conecta ao IMAP e verifica se há respostas do professor com declarações assinadas.
 */
async function verificarRespostasDeclaracoes(client) {
  if (!config.imap.user || !config.imap.pass) {
    return;
  }

  const declaracoesPendentes = await db.listarDeclaracoesPendentes();
  if (declaracoesPendentes.length === 0) {
    return;
  }

  const imap = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.tls,
    auth: {
      user: config.imap.user,
      pass: config.imap.pass,
    },
    logger: false,
  });

  try {
    await imap.connect();
    const lock = await imap.getMailboxLock('INBOX');

    try {
      // Busca mensagens não lidas
      const mensagens = imap.fetch({ seen: false }, { envelope: true, bodyStructure: true, source: true });

      for await (const msg of mensagens) {
        const assunto = msg.envelope?.subject || '';
        const matchCodigo = assunto.match(/#(DECL-[A-Z0-9_-]+)/i);

        if (!matchCodigo) continue;
        const codigo = matchCodigo[1].toUpperCase();

        const declaracao = declaracoesPendentes.find((d) => d.codigo.toUpperCase() === codigo);
        if (!declaracao) continue;

        console.log(`[declaracao-imap] E-mail de resposta encontrado para ${codigo}! Processando anexo...`);

        // Baixa os anexos da mensagem
        const source = msg.source;
        // Para simplificar e evitar dependências pesadas de parser MIME complexo:
        // Procuramos partes de PDF no bodyStructure ou usamos simples busca de buffers
        const stream = await imap.download(msg.uid);
        const buffers = [];
        for await (const chunk of stream) {
          buffers.push(chunk);
        }
        const fullEmail = Buffer.concat(buffers);

        // Salva e-mail temporário para extrair o anexo PDF
        const caminhoEmailTemp = path.resolve('./temp', `email_${codigo}.eml`);
        fs.mkdirSync('./temp', { recursive: true });
        fs.writeFileSync(caminhoEmailTemp, fullEmail);

        // Extrai o PDF do arquivo .eml
        const caminhoPdfAssinado = await extrairPdfDeEmail(caminhoEmailTemp, codigo, declaracao);
        fs.unlink(caminhoEmailTemp, () => {});

        if (!caminhoPdfAssinado) {
          console.warn(`[declaracao-imap] Não foi encontrado um anexo PDF válido na resposta de ${codigo}.`);
          continue;
        }

        // Marca como concluída no banco de dados
        await db.atualizarDeclaracaoConcluida(codigo, caminhoPdfAssinado);

        // Marca o e-mail como lido no Gmail
        await imap.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']);

        // Envia na DM do aluno no Discord
        try {
          const usuarioDiscord = await client.users.fetch(declaracao.discord_id);
          await usuarioDiscord.send({
            content:
              `Olá, ${declaracao.nome}! 🎉\n\n` +
              `Sua **Declaração de Participação no CyberGuard** foi assinada pelo Prof. André Luiz Przybysz e está pronta!\n` +
              `Segue o documento oficial assinado em anexo.`,
            files: [
              {
                attachment: caminhoPdfAssinado,
                name: `Declaracao_CyberGuard_${declaracao.ra}_assinada.pdf`,
              },
            ],
          });
          console.log(`[declaracao-imap] Declaração ${codigo} entregue via DM para ${declaracao.nome} (<@${declaracao.discord_id}>).`);
        } catch (errDm) {
          console.error(`[declaracao-imap] Erro ao enviar DM para o aluno ${declaracao.discord_id}:`, errDm.message);
        }

        // Notifica canal do RH se configurado
        if (config.channelRhId) {
          try {
            const canalRh = await client.channels.fetch(config.channelRhId);
            await canalRh.send({
              content: `📄 **Declaração Assinada e Entregue!**\nO documento de <@${declaracao.discord_id}> (${declaracao.nome} - RA: ${declaracao.ra}) foi assinado pelo coordenador e entregue automaticamente ao aluno. (Código: \`${codigo}\`)`,
              files: [{ attachment: caminhoPdfAssinado, name: `Declaracao_${declaracao.ra}_assinada.pdf` }],
            });
          } catch (errRh) {
            console.error('[declaracao-imap] Erro ao notificar canal de RH:', errRh.message);
          }
        }
      }
    } finally {
      lock.release();
    }

    await imap.logout();
  } catch (err) {
    console.error('[declaracao-imap] Erro na verificação de e-mails IMAP:', err.message);
  }
}

/**
 * Extrai anexo PDF de um arquivo de mensagem MIME raw
 */
async function extrairPdfDeEmail(caminhoEml, codigo, declaracao) {
  const conteudo = fs.readFileSync(caminhoEml, 'utf8');

  // Localiza blocos base64 de PDF no conteúdo do e-mail
  // Procura Content-Type: application/pdf seguido de base64
  const pdfRegex = /Content-Type:\s*application\/pdf[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\r?\n--|$)/i;
  const match = conteudo.match(pdfRegex);

  if (!match) {
    return null;
  }

  const base64Data = match[1].replace(/[\r\n\s]+/g, '');
  const bufferPdf = Buffer.from(base64Data, 'base64');

  // Garante que o buffer gerado é de fato um PDF válido (começa com %PDF-)
  if (!bufferPdf.slice(0, 5).toString().startsWith('%PDF')) {
    return null;
  }

  const dirDestino = path.resolve('./docs/Termos-Voluntarios-Assinados/DeclaracoesAssinadas');
  fs.mkdirSync(dirDestino, { recursive: true });

  const nomeArquivo = `declaracao_assinada_${declaracao.ra}_${codigo}.pdf`;
  const caminhoFinal = path.join(dirDestino, nomeArquivo);
  fs.writeFileSync(caminhoFinal, bufferPdf);

  return caminhoFinal;
}

/**
 * Inicia a verificação periódica de declarações assinadas
 */
function iniciarCronDeclaracoes(client) {
  // Roda a cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    verificarRespostasDeclaracoes(client).catch((err) =>
      console.error('[declaracao-cron] Erro na verificação periódica:', err)
    );
  });

  // Checagem inicial 20s após o boot
  setTimeout(() => {
    verificarRespostasDeclaracoes(client).catch((err) =>
      console.error('[declaracao-cron] Erro na verificação inicial pós-boot:', err)
    );
  }, 20000);
}

module.exports = {
  enviarDeclaracaoParaProfessor,
  verificarRespostasDeclaracoes,
  iniciarCronDeclaracoes,
};
