const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const { concatenarWavsComSilencio } = require('./audioBatch');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

if (!process.env.GEMINI_API_KEY) {
  console.warn('[reuniao] atenção: variável GEMINI_API_KEY não configurada.');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ehCotaDiariaEsgotada(err) {
  const mensagem = err.message || '';
  return mensagem.includes('PerDay') || mensagem.includes('GenerateRequestsPerDayPerProjectPerModel');
}

async function comRetry(fn, { tentativas = 5, esperaBaseMs = 4000 } = {}) {
  let ultimoErro;
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;

      if (ehCotaDiariaEsgotada(err)) {
        console.warn('[reuniao] cota diária do Gemini esgotada — desistindo sem retry (só volta amanhã).');
        throw err;
      }

      const mensagem = err.message || '';
      const ehRateLimit = mensagem.includes('429') || mensagem.includes('RESOURCE_EXHAUSTED');
      const ehSobrecarga = mensagem.includes('503');

      if (!ehRateLimit && !ehSobrecarga) {
        throw err;
      }

      const espera = esperaBaseMs * 2 ** tentativa + Math.random() * 1000;
      console.warn(
        `[reuniao] ${ehRateLimit ? 'rate limit' : 'modelo sobrecarregado'} — tentativa ${tentativa + 1}/${tentativas}, ` +
          `esperando ${Math.round(espera / 1000)}s antes de tentar de novo.`
      );
      await esperar(espera);
    }
  }
  throw ultimoErro;
}

async function transcreverAudio(wavPath) {
  return comRetry(async () => {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const audioReduzido = concatenarWavsComSilencio([wavPath]);

    const result = await model.generateContent([
      { inlineData: { mimeType: 'audio/wav', data: audioReduzido.toString('base64') } },
      {
        text:
          'Transcreva este áudio em português do Brasil. Responda apenas com o texto ' +
          'transcrito, sem comentários, sem marcações e sem timestamps. Se o áudio estiver ' +
          'vazio, for só ruído ou inaudível, responda apenas "[inaudível]".',
      },
    ]);

    return result.response.text().trim();
  });
}

async function transcreverLote(wavPaths) {
  const n = wavPaths.length;
  if (n === 0) return [];
  if (n === 1) return [await transcreverAudio(wavPaths[0])];

  const audioCombinado = concatenarWavsComSilencio(wavPaths, 500);

  const prompt =
    `Este áudio contém ${n} trechos de fala diferentes, gravados em sequência e separados ` +
    `por um pequeno silêncio entre cada um. Transcreva CADA trecho individualmente, em ` +
    `português do Brasil, na ordem em que aparecem.\n\n` +
    `Responda EXATAMENTE no formato abaixo, uma linha por trecho, sem nenhum texto ` +
    `adicional antes ou depois, sem markdown:\n` +
    `1: [transcrição do trecho 1]\n` +
    `2: [transcrição do trecho 2]\n` +
    `...\n` +
    `${n}: [transcrição do trecho ${n}]\n\n` +
    `Se algum trecho estiver vazio, for só ruído ou inaudível, responda "[inaudível]" ` +
    `naquele número. Não pule nenhum número, mesmo que esteja em branco.`;

  const textoResposta = await comRetry(async () => {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent([
      { inlineData: { mimeType: 'audio/wav', data: audioCombinado.toString('base64') } },
      { text: prompt },
    ]);
    return result.response.text().trim();
  });

  const porNumero = new Map();
  for (const linha of textoResposta.split('\n')) {
    const m = linha.match(/^\s*(\d+)\s*[:.\-]\s*(.*)$/);
    if (m) {
      porNumero.set(parseInt(m[1], 10), m[2].trim());
    }
  }

  const textos = [];
  for (let i = 1; i <= n; i++) {
    textos.push(porNumero.get(i) || '[erro na transcrição]');
  }
  return textos;
}

async function gerarAta(transcricaoFormatada, tituloReuniao) {
  const prompt = `Você é um assistente que gera atas de reunião a partir de uma transcrição bruta.

Reunião: ${tituloReuniao}

Transcrição (com falante e horário):
"""
${transcricaoFormatada}
"""

Gere uma ata estruturada em português, em Markdown, com as seções:

## Resumo
(um parágrafo curto resumindo o que foi discutido)

## Decisões
(lista com bullet points; se não houver decisões claras, escreva "Nenhuma decisão registrada")

## Itens de ação
(lista no formato "- [ ] Responsável: tarefa"; se não for possível identificar o responsável, deixe genérico)

## Pontos discutidos
(lista dos principais tópicos abordados, na ordem em que surgiram)

Seja objetivo e não invente informações que não estejam na transcrição.`;

  return comRetry(async () => {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  });
}

module.exports = { transcreverAudio, transcreverLote, gerarAta, esperar, ehCotaDiariaEsgotada };
