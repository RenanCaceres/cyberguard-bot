const { EndBehaviorType } = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BIT_DEPTH = 16;
const TAMANHO_MINIMO_BYTES = SAMPLE_RATE * CHANNELS * 2 * 0.3; // ~0.3s, descarta ruído/silêncio

class MeetingRecorder {
  constructor(connection, tempDir) {
    this.connection = connection;
    this.tempDir = tempDir;
    this.utterances = []; // { userId, filePath, startTime }
    this.activeStreams = new Set();
    this._onSpeakingStart = this._onSpeakingStart.bind(this);
  }

  start() {
    fs.mkdirSync(this.tempDir, { recursive: true });
    this.connection.receiver.speaking.on('start', this._onSpeakingStart);
  }

  _onSpeakingStart(userId) {
    if (this.activeStreams.has(userId)) return; // já gravando esse usuário
    this.activeStreams.add(userId);

    const startTime = Date.now();
    const opusStream = this.connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
    });

    const decoder = new prism.opus.Decoder({
      rate: SAMPLE_RATE,
      channels: CHANNELS,
      frameSize: 960,
    });

    const filePath = path.join(this.tempDir, `${userId}_${startTime}.pcm`);
    const outStream = fs.createWriteStream(filePath);

    pipeline(opusStream, decoder, outStream, (err) => {
      this.activeStreams.delete(userId);

      if (err) {
        console.error(`[reuniao] erro ao gravar áudio de ${userId}:`, err.message);
        fs.rmSync(filePath, { force: true });
        return;
      }

      const stats = fs.statSync(filePath);
      if (stats.size < TAMANHO_MINIMO_BYTES) {
        fs.rmSync(filePath, { force: true });
        return;
      }

      const wavPath = this._pcmToWav(filePath);
      this.utterances.push({ userId, filePath: wavPath, startTime });
    });
  }

  _pcmToWav(pcmPath) {
    const wavPath = pcmPath.replace(/\.pcm$/, '.wav');
    const pcmData = fs.readFileSync(pcmPath);
    const header = this._buildWavHeader(pcmData.length);
    fs.writeFileSync(wavPath, Buffer.concat([header, pcmData]));
    fs.rmSync(pcmPath, { force: true });
    return wavPath;
  }

  _buildWavHeader(dataLength) {
    const byteRate = SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8);
    const blockAlign = CHANNELS * (BIT_DEPTH / 8);
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(CHANNELS, 22);
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(BIT_DEPTH, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
  }

  /** Para a gravação e retorna os trechos capturados, ordenados por horário. */
  async stop() {
    this.connection.receiver.speaking.removeListener('start', this._onSpeakingStart);

    // espera terminar quem estiver falando no momento do /finalizar
    const limite = Date.now() + 5000;
    while (this.activeStreams.size > 0 && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 200));
    }

    return this.utterances.sort((a, b) => a.startTime - b.startTime);
  }
}

module.exports = MeetingRecorder;
