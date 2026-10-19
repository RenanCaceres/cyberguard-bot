const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const cron = require('node-cron');
const config = require('./config');
const db = require('./db');
const { fazerUploadDeclaracao } = require('./driveService');

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
      `Em anexo está o documento gerado automaticamente com início registrado em ${declaracao.data_inicio} e carga horária semanal de ${declaracao.carga_horaria || '4 horas'}.\n\n` +
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

function encontrarPartesPdf(structure) {
  const partes = [];
  function percorrer(node) {
    if (!node) return;
    const ehPdf =
      node.type === 'application/pdf' ||
      (node.dispositionParameters?.filename && node.dispositionParameters.filename.toLowerCase().endsWith('.pdf')) ||
      (node.parameters?.name && node.parameters.name.toLowerCase().endsWith('.pdf'));

    if (ehPdf && node.part) partes.push(node);
    if (Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) percorrer(child);
    }
  }
  percorrer(structure);
  return partes;
}

let isCheckingImap = false;

/**
 * Conecta ao IMAP e verifica se há respostas do professor com declarações assinadas.
 */
async function verificarRespostasDeclaracoes(client) {
  if (isCheckingImap) {
    return;
  }
  if (!config.imap.user || !config.imap.pass) {
    return;
  }

  isCheckingImap = true;
  try {
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
        // Busca e-mails que contenham 'DECL-' no assunto
        const uids = await imap.search({ subject: 'DECL-' });

        for (const uid of uids) {
          const msg = await imap.fetchOne(uid, { envelope: true, bodyStructure: true, flags: true });
          const assunto = msg.envelope?.subject || '';
          const matchCodigo = assunto.match(/#(DECL-[A-Z0-9_-]+)/i);

          if (!matchCodigo) continue;
          const codigo = matchCodigo[1].toUpperCase();

          const declaracao = declaracoesPendentes.find((d) => d.codigo.toUpperCase() === codigo);
          if (!declaracao) continue;

          const pdfParts = encontrarPartesPdf(msg.bodyStructure);
          if (pdfParts.length === 0) {
            continue;
          }

          console.log(`[declaracao-imap] Anexo PDF encontrado para ${codigo} (parte ${pdfParts[0].part})! Baixando...`);

          const downloadRes = await imap.download(uid, pdfParts[0].part);
          const chunks = [];
          for await (const chunk of downloadRes.content) {
            chunks.push(chunk);
          }
          const bufferPdf = Buffer.concat(chunks);

          if (!bufferPdf.slice(0, 4).toString('latin1').startsWith('%PDF')) {
            console.warn(`[declaracao-imap] Buffer baixado não é PDF válido para ${codigo}.`);
            continue;
          }

          const dirDestino = path.resolve('./docs/Termos-Voluntarios-Assinados/DeclaracoesAssinadas');
          fs.mkdirSync(dirDestino, { recursive: true });

          const nomeArquivo = `declaracao_assinada_${declaracao.ra}_${codigo}.pdf`;
          const caminhoPdfAssinado = path.join(dirDestino, nomeArquivo);
          fs.writeFileSync(caminhoPdfAssinado, bufferPdf);

          // Salva no Google Drive (pasta de declarações)
          try {
            const driveRes = await fazerUploadDeclaracao({
              caminhoArquivo: caminhoPdfAssinado,
              nomeArquivo,
            });
            if (driveRes) {
              console.log(`[declaracao-imap] Declaração ${codigo} sincronizada no Google Drive: ${driveRes.name}`);
            }
          } catch (errDrive) {
            console.error(`[declaracao-imap] Erro ao enviar declaração ${codigo} para o Google Drive:`, errDrive.message);
          }

          // Marca como concluída no banco de dados
          await db.atualizarDeclaracaoConcluida(codigo, caminhoPdfAssinado);

          // Marca o e-mail como lido no Gmail
          try {
            await imap.messageFlagsAdd({ uid }, ['\\Seen']);
          } catch (_) {}

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
  } finally {
    isCheckingImap = false;
  }
}

/**
 * Inicia a verificação periódica de declarações assinadas
 */
function iniciarCronDeclaracoes(client) {
  // Roda a cada 1 minuto
  cron.schedule('* * * * *', () => {
    verificarRespostasDeclaracoes(client).catch((err) =>
      console.error('[declaracao-cron] Erro na verificação periódica:', err)
    );
  });

  // Checagem inicial 10s após o boot
  setTimeout(() => {
    verificarRespostasDeclaracoes(client).catch((err) =>
      console.error('[declaracao-cron] Erro na verificação inicial pós-boot:', err)
    );
  }, 10000);
}

module.exports = {
  enviarDeclaracaoParaProfessor,
  verificarRespostasDeclaracoes,
  iniciarCronDeclaracoes,
};
