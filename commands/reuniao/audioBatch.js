const fs = require('fs');

const SAMPLE_RATE_ORIGINAL = 48000;
const CHANNELS_ORIGINAL = 2;
const BIT_DEPTH = 16;

const SAMPLE_RATE_GEMINI = 16000;
const CHANNELS_GEMINI = 1;
const FATOR_DECIMACAO = SAMPLE_RATE_ORIGINAL / SAMPLE_RATE_GEMINI;

function buildWavHeader(dataLength, sampleRate, channels) {
  const byteRate = sampleRate * channels * (BIT_DEPTH / 8);
  const blockAlign = channels * (BIT_DEPTH / 8);
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

function downsamplePara16kMono(pcmEstereo48k) {
  const bytesPorFrame = CHANNELS_ORIGINAL * (BIT_DEPTH / 8);
  const totalFrames = Math.floor(pcmEstereo48k.length / bytesPorFrame);
  const framesSaida = Math.floor(totalFrames / FATOR_DECIMACAO);
  const saida = Buffer.alloc(framesSaida * 2);

  for (let i = 0; i < framesSaida; i++) {
    let soma = 0;
    for (let k = 0; k < FATOR_DECIMACAO; k++) {
      const frameIdx = i * FATOR_DECIMACAO + k;
      const offset = frameIdx * bytesPorFrame;
      const l = pcmEstereo48k.readInt16LE(offset);
      const r = pcmEstereo48k.readInt16LE(offset + 2);
      soma += (l + r) / 2;
    }
    const media = Math.round(soma / FATOR_DECIMACAO);
    saida.writeInt16LE(Math.max(-32768, Math.min(32767, media)), i * 2);
  }

  return saida;
}

function lerWavReduzido(caminhoWav) {
  const bruto = fs.readFileSync(caminhoWav);
  const pcmOriginal = bruto.subarray(44);
  return downsamplePara16kMono(pcmOriginal);
}

function concatenarWavsComSilencio(wavPaths, silencioMs = 500) {
  const bytesPorAmostraGemini = CHANNELS_GEMINI * (BIT_DEPTH / 8);
  const bytesSilencio = Math.round(SAMPLE_RATE_GEMINI * bytesPorAmostraGemini * (silencioMs / 1000));
  const silencio = Buffer.alloc(bytesSilencio);

  const partes = [];
  wavPaths.forEach((caminho, i) => {
    partes.push(lerWavReduzido(caminho));
    if (i < wavPaths.length - 1) partes.push(silencio);
  });

  const pcmTotal = Buffer.concat(partes);
  const header = buildWavHeader(pcmTotal.length, SAMPLE_RATE_GEMINI, CHANNELS_GEMINI);
  return Buffer.concat([header, pcmTotal]);
}

module.exports = { concatenarWavsComSilencio };
