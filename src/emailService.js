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
  const destinatario = config.smtp.emailTermosDestinatario || config.smtp.destinatarios[0] || config.smtp.user;
  const copias =
    config.smtp.emailTermosCc && config.smtp.emailTermosCc.length > 0
      ? config.smtp.emailTermosCc
      : [];

  const nomeRef = membro.nome_social
    ? `${membro.nome_social} (Nome Civil: ${membro.nome})`
    : (membro.nome || 'Membro');
  const nomeAssunto = membro.nome_social || membro.nome || 'Membro';

  await transporter.sendMail({
    from: config.smtp.from || config.smtp.user,
    to: destinatario,
    cc: copias,
    subject: `Termo de voluntariado assinado - ${nomeAssunto}`,
    text:
      `Segue em anexo o termo de voluntariado assinado por ${nomeRef} (RA: ${membro.ra || 'N/A'}).\n\n` +
      `Discord: ${membro.discord_id}\nCurso: ${membro.curso}\nE-mail: ${membro.email}` +
      (membro.email_notion && membro.email_notion !== membro.email ? `\nE-mail Notion: ${membro.email_notion}` : ''),
    attachments: [
      {
        filename: nomeArquivoOriginal || 'termo_assinado.pdf',
        path: caminhoArquivo,
      },
    ],
  });
}

module.exports = { encaminharTermoAssinado };
