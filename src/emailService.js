const nodemailer = require('nodemailer');
const config = require('./config');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

async function encaminharTermoAssinado(membro, caminhoArquivo, nomeArquivoOriginal) {
  if (config.smtp.destinatarios.length === 0) {
    console.warn('Nenhum destinatário configurado em EMAIL_DESTINATARIOS.');
    return;
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.smtp.destinatarios.join(', '),
    subject: `Termo de voluntariado assinado - ${membro.nome}`,
    text:
      `Segue em anexo o termo de voluntariado assinado por ${membro.nome} (RA: ${membro.ra}).\n\n` +
      `Discord: ${membro.discord_id}\nCurso: ${membro.curso}\nE-mail: ${membro.email}`,
    attachments: [
      {
        filename: nomeArquivoOriginal || 'termo_assinado.pdf',
        path: caminhoArquivo,
      },
    ],
  });
}

module.exports = { encaminharTermoAssinado };
