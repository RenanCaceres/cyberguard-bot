const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { listarBackupsExpirados, limparReferenciaBackup } = require('./db');
const mainDb = require('../../src/db');

const DIAS_RETENCAO = 7;
const PASTA_BACKUPS = path.join(__dirname, '..', '..', 'backups-reuniao');
const PASTA_TEMP = path.join(__dirname, '..', '..', 'temp');
const TEMP_RETENCAO_MS = 60 * 60 * 1000; // 1 hora para arquivos temporários em ./temp/

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

function limparTempAntigos() {
  if (!fs.existsSync(PASTA_TEMP)) return;
  const agora = Date.now();

  for (const nome of fs.readdirSync(PASTA_TEMP)) {
    if (nome === '.gitkeep') continue;
    const caminhoCompleto = path.join(PASTA_TEMP, nome);
    try {
      const stat = fs.statSync(caminhoCompleto);
      if (agora - stat.mtimeMs > TEMP_RETENCAO_MS) {
        fs.rmSync(caminhoCompleto, { recursive: true, force: true });
        console.log(`[lgpd-guardiao] arquivo/pasta temporário expirado removido: ${caminhoCompleto}`);
      }
    } catch (err) {
      console.error(`[lgpd-guardiao] erro ao remover temporário ${caminhoCompleto}:`, err.message);
    }
  }
}

async function executarRotinaConformidadeLGPD() {
  try {
    limparTempAntigos();
  } catch (err) {
    console.error('[lgpd-guardiao] erro na limpeza de ./temp:', err.message);
  }
  try {
    if (typeof mainDb.criptografarDadosLegadosBanco === 'function') {
      await mainDb.criptografarDadosLegadosBanco();
    }
  } catch (err) {
    console.error('[lgpd-guardiao] erro na verificação de criptografia em repouso:', err.message);
  }
}

function iniciarLimpezaBackups() {
  cron.schedule('0 4 * * *', () => {
    limparBackupsAntigos().catch((err) =>
      console.error('[reuniao] erro na faxina de backups:', err.message)
    );
  });

  // Guardião contínuo LGPD: a cada hora limpa resíduos em ./temp/ (>1h) e garante criptografia AES-256-GCM no banco
  cron.schedule('0 * * * *', () => {
    executarRotinaConformidadeLGPD().catch((err) =>
      console.error('[lgpd-guardiao] erro na rotina horária:', err.message)
    );
  });

  limparBackupsAntigos().catch((err) =>
    console.error('[reuniao] erro na faxina de backups (boot):', err.message)
  );
  executarRotinaConformidadeLGPD().catch((err) =>
    console.error('[lgpd-guardiao] erro na rotina LGPD (boot):', err.message)
  );
}

module.exports = {
  iniciarLimpezaBackups,
  limparBackupsAntigos,
  limparTempAntigos,
  executarRotinaConformidadeLGPD,
  PASTA_BACKUPS,
  DIAS_RETENCAO,
};
