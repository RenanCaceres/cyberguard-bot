require('dotenv').config();

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  hierarquiaChannelId: process.env.HIERARQUIA_CHANNEL_ID || '',
  presidenteId: process.env.PRESIDENTE_ID || '',
  purpleTeamId: process.env.PURPLE_TEAM_ID || '',
  roleLiderNome: process.env.ROLE_LIDER_NOME || 'Líderes',
  guildId: process.env.GUILD_ID,
  channelRhId: process.env.CHANNEL_RH_ID,
  channelBoasVindasId: process.env.CHANNEL_BOASVINDAS_ID || '',
  roleRhNome: process.env.ROLE_RH_NOME || 'Recursos Humanos',
  roleAprovadoNome: process.env.ROLE_APROVADO_NOME || '',
  areasInteresse: (process.env.AREAS_INTERESSE || '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean),
  expulsarAoRejeitar: process.env.EXPULSAR_AO_REJEITAR !== 'false',
  whatsappLink: process.env.WHATSAPP_LINK,
  whatsappLinksArea: (() => {
    try {
      return JSON.parse(process.env.WHATSAPP_LINKS_AREA || '{}');
    } catch (err) {
      console.error('WHATSAPP_LINKS_AREA no .env não é um JSON válido:', err.message);
      return {};
    }
  })(),
  googleSheets: {
    sheetId: process.env.GOOGLE_SHEET_ID || '',
    abaNome: process.env.GOOGLE_SHEET_ABA || 'Respostas ao formulário 1',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
  databaseUrl: process.env.DATABASE_URL,
  prazoDias: parseInt(process.env.PRAZO_DIAS || '7', 10),
  cronLembrete: process.env.CRON_LEMBRETE || '0 9 * * *',
  templateTermoPath: process.env.TEMPLATE_TERMO_PATH || './templates/termo_voluntariado.docx',
  tutorialGovbrPath: process.env.TUTORIAL_GOVBR_PATH || './docs/tutorial_assinatura_govbr.pdf',
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM,
    destinatarios: (process.env.EMAIL_DESTINATARIOS || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean),
  },
};
