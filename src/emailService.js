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
  const destinatario = config.smtp.emailTermosDestinatario || 'natassyasilva@utfpr.edu.br';
  const copias =
    config.smtp.emailTermosCc && config.smtp.emailTermosCc.length > 0
      ? config.smtp.emailTermosCc
      : [
          'renan.2004@alunos.utfpr.edu.br',
          'andrequeiroz@alunos.utfpr.edu.br',
          'vitorprado@alunos.utfpr.edu.br',
        ];

  await transporter.sendMail({
    from: config.smtp.from || config.smtp.user,
    to: destinatario,
    cc: copias,
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
