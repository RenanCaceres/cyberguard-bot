const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { listarBackupsExpirados, limparReferenciaBackup } = require('./db');

const DIAS_RETENCAO = 7;
const PASTA_BACKUPS = path.join(__dirname, '..', '..', 'backups-reuniao');

async function limparBackupsAntigos() {
  try {
    const expirados = await listarBackupsExpirados();
    for (const ata of expirados) {
      try {
        fs.rmSync(ata.pasta_audio_backup, { recursive: true, force: true });
        console.log(`[reuniao] backup de áudio expirado removido: ${ata.pasta_audio_backup}`);
      } catch (err) {
        console.error(`[reuniao] erro ao remover backup da ata #${ata.id}:`, err.message);
      }
      await limparReferenciaBackup(ata.id).catch(() => {});
    }
  } catch (err) {
    console.error('[reuniao] erro ao consultar backups expirados no banco:', err.message);
  }

  if (!fs.existsSync(PASTA_BACKUPS)) return;

  const limiteMs = DIAS_RETENCAO * 24 * 60 * 60 * 1000;
  const agora = Date.now();

  for (const nome of fs.readdirSync(PASTA_BACKUPS)) {
    const caminhoCompleto = path.join(PASTA_BACKUPS, nome);
    try {
      const stat = fs.statSync(caminhoCompleto);
      if (stat.isDirectory() && agora - stat.mtimeMs > limiteMs) {
        fs.rmSync(caminhoCompleto, { recursive: true, force: true });
        console.log(`[reuniao] pasta de backup órfã/antiga removida: ${caminhoCompleto}`);
      }
    } catch (err) {
      console.error(`[reuniao] erro ao checar/remover ${caminhoCompleto}:`, err.message);
    }
  }
}

function iniciarLimpezaBackups() {
  cron.schedule('0 4 * * *', () => {
    limparBackupsAntigos().catch((err) =>
      console.error('[reuniao] erro na faxina de backups:', err.message)
    );
  });

  limparBackupsAntigos().catch((err) =>
    console.error('[reuniao] erro na faxina de backups (boot):', err.message)
  );
}

module.exports = { iniciarLimpezaBackups, limparBackupsAntigos, PASTA_BACKUPS, DIAS_RETENCAO };
