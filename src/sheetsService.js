const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('./config');

function dataHoraAgoraBrasil() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

async function adicionarLinhaPlanilha(membro, discordTag) {
  if (!config.googleSheets.sheetId || !config.googleSheets.serviceAccountEmail) {
    console.warn('Google Sheets não configurado (GOOGLE_SHEET_ID/GOOGLE_SERVICE_ACCOUNT_EMAIL ausentes) — pulando.');
    return;
  }

  try {
    const auth = new JWT({
      email: config.googleSheets.serviceAccountEmail,
      key: config.googleSheets.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.googleSheets.sheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle[config.googleSheets.abaNome];
    if (!sheet) {
      console.error(`Aba "${config.googleSheets.abaNome}" não encontrada na planilha.`);
      return;
    }

    await sheet.loadHeaderRow();

    await sheet.addRow({
      'Carimbo de data/hora': dataHoraAgoraBrasil(),
      'Nome completo': membro.nome,
      'RA (apenas números)': membro.ra,
      Curso: membro.curso,
      'Cargo/Função no projeto': 'Membro',
      Time: membro.area_interesse,
      'Email institucional (@alunos.utfpr.edu.br)': membro.email,
      'Nick do Discord': discordTag,
    });

    console.log(`Linha adicionada na planilha pra ${membro.nome}.`);
  } catch (err) {
    console.error('Erro ao adicionar linha na planilha do Google Sheets:', err);
  }
}

module.exports = { adicionarLinhaPlanilha };
