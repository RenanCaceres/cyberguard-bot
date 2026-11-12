'use strict';

const net = require('net');
const axios = require('axios');
const { PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const db = require('./db');

const WEBHOOK_NOME = 'CyberGuard Links';
const CACHE_WEBHOOK_TTL_MS = 15 * 60 * 1000;
const CACHE_CONFIG_TTL_MS = 30 * 1000;
const CACHE_URL_MAX = 500;
const MAX_URLS_POR_MENSAGEM = 5;
const LIMITE_ANEXO_BYTES = 25 * 1024 * 1024;

const DOMINIOS_JA_ENCURTADOS = new Set([
  'is.gd',
  'v.gd',
  'tinyurl.com',
  'bit.ly',
  't.co',
  'goo.gl',
  'ow.ly',
  'buff.ly',
  'rebrand.ly',
  'shorturl.at',
  'cutt.ly',
  'rb.gy',
  'tiny.cc',
  'shrtco.de',
  's.id',
  'lnkd.in',
  'youtu.be',
]);

const DOMINIOS_DISCORD_E_MIDIA = new Set([
  'discord.com',
  'discordapp.com',
  'discord.gg',
  'discord.new',
  'cdn.discordapp.com',
  'media.discordapp.net',
  'images-ext-1.discordapp.net',
  'images-ext-2.discordapp.net',
  'tenor.com',
  'media.tenor.com',
  'giphy.com',
  'media.giphy.com',
  'klipy.com',
]);

const cacheUrls = new Map();
const cacheWebhooks = new Map();
let cacheConfigDinamica = null;

function ehIpPrivadoOuLocal(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }

  const tipoIp = net.isIP(host);
  if (tipoIp === 4) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  } else if (tipoIp === 6) {
    if (host === '::1' || host === '::') return true;
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;
  }
  return false;
}

function validarUrlHttp(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valida: false, motivo: 'Informe uma URL válida.' };
  }

  const texto = rawUrl.trim();
  if (texto.length > 2048) {
    return { valida: false, motivo: 'A URL excede o limite de 2048 caracteres.' };
  }

  let parsed;
  try {
    parsed = new URL(texto);
  } catch {
    return { valida: false, motivo: 'Formato de URL inválido. Use `https://...` ou `http://...`.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valida: false, motivo: 'Apenas links `http://` ou `https://` são suportados.' };
  }

  if (!parsed.hostname || !parsed.hostname.includes('.') || ehIpPrivadoOuLocal(parsed.hostname)) {
    return { valida: false, motivo: 'Domínio inválido ou restrito (rede local/privada não é permitida).' };
  }

  return {
    valida: true,
    url: parsed.toString(),
    hostname: parsed.hostname.toLowerCase(),
  };
}

function correspondeDominio(hostname, dominioBase) {
  return hostname === dominioBase || hostname.endsWith(`.${dominioBase}`);
}

function deveIgnorarDominio(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (const d of DOMINIOS_JA_ENCURTADOS) {
    if (correspondeDominio(host, d)) return true;
  }
  for (const d of DOMINIOS_DISCORD_E_MIDIA) {
    if (correspondeDominio(host, d)) return true;
  }
  for (const d of config.encurtador.dominiosIgnorados || []) {
    if (d && correspondeDominio(host, d)) return true;
  }
  return false;
}

function limparUrlExtraida(bruta) {
  let url = bruta;
  const pontuacaoFinal = /[.,!?;:\]}"'>]+$/;

  while (url.length > 0) {
    if (url.endsWith(')')) {
      const abre = (url.match(/\(/g) || []).length;
      const fecha = (url.match(/\)/g) || []).length;
      if (fecha > abre) {
        url = url.slice(0, -1);
        continue;
      }
      break;
    }
    if (pontuacaoFinal.test(url)) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }

  return url;
}

function dividirSegmentosCodigo(texto) {
  const segmentos = [];
  const regexCodigo = /(```[\s\S]*?```|`[^`\n]*`)/g;
  let ultimoIndice = 0;
  let match;

  while ((match = regexCodigo.exec(texto)) !== null) {
    if (match.index > ultimoIndice) {
      segmentos.push({ texto: texto.slice(ultimoIndice, match.index), ehCodigo: false });
    }
    segmentos.push({ texto: match[0], ehCodigo: true });
    ultimoIndice = match.index + match[0].length;
  }

  if (ultimoIndice < texto.length) {
    segmentos.push({ texto: texto.slice(ultimoIndice), ehCodigo: false });
  }

  return segmentos;
}

function extrairUrlsParaAutoEncurtar(texto, minTamanho = config.encurtador.minTamanho) {
  if (!texto || typeof texto !== 'string') return [];

  const segmentos = dividirSegmentosCodigo(texto);
  const encontradas = [];
  const vistas = new Set();
  const regexUrl = /https?:\/\/[^\s<>]+/gi;

  for (const seg of segmentos) {
    if (seg.ehCodigo) continue;
    let m;
    while ((m = regexUrl.exec(seg.texto)) !== null) {
      const limpa = limparUrlExtraida(m[0]);
      if (!limpa || limpa.length < minTamanho || vistas.has(limpa)) continue;

      const check = validarUrlHttp(limpa);
      if (!check.valida || deveIgnorarDominio(check.hostname)) continue;

      vistas.add(limpa);
      encontradas.push({ originalNaMensagem: limpa, urlNormalizada: check.url });
      if (encontradas.length >= MAX_URLS_POR_MENSAGEM) return encontradas;
    }
  }

  return encontradas;
}

function substituirUrlsNoTexto(texto, mapaSubstituicoes) {
  const segmentos = dividirSegmentosCodigo(texto);
  return segmentos
    .map((seg) => {
      if (seg.ehCodigo) return seg.texto;
      return seg.texto.replace(/https?:\/\/[^\s<>]+/gi, (bruta) => {
        const limpa = limparUrlExtraida(bruta);
        const curta = mapaSubstituicoes.get(limpa);
        if (!curta) return bruta;
        const sufixo = bruta.slice(limpa.length);
        return `${curta}${sufixo}`;
      });
    })
    .join('');
}

function salvarCacheUrl(urlNormalizada, resultado) {
  if (cacheUrls.size >= CACHE_URL_MAX) {
    const primeiraChave = cacheUrls.keys().next().value;
    if (primeiraChave) cacheUrls.delete(primeiraChave);
  }
  cacheUrls.set(urlNormalizada, resultado);
}

async function encurtarViaIsGd(urlNormalizada, apelido = null) {
  const params = { format: 'json', url: urlNormalizada };
  if (apelido) params.shorturl = apelido;

  const { data } = await axios.get('https://is.gd/create.php', {
    params,
    timeout: 6000,
    headers: { 'User-Agent': 'CyberGuardBot/1.0' },
  });

  if (data && data.shorturl) {
    return { urlEncurtada: String(data.shorturl).trim(), provedor: 'is.gd' };
  }

  const errCode = Number(data?.errorcode || 0);
  const errMsg = data?.errormessage || 'Erro desconhecido no provedor is.gd';
  const erro = new Error(errMsg);
  erro.isGdErrorCode = errCode;
  throw erro;
}

async function encurtarViaTinyUrl(urlNormalizada, apelido = null) {
  const params = { url: urlNormalizada };
  if (apelido) params.alias = apelido;

  const { data } = await axios.get('https://tinyurl.com/api-create.php', {
    params,
    timeout: 6000,
    responseType: 'text',
    headers: { 'User-Agent': 'CyberGuardBot/1.0' },
  });

  const resposta = String(data || '').trim();
  if (!/^https?:\/\/tinyurl\.com\/[A-Za-z0-9_-]+$/i.test(resposta)) {
    throw new Error(resposta || 'TinyURL retornou uma resposta inválida.');
  }

  return { urlEncurtada: resposta, provedor: 'tinyurl' };
}

async function encurtarUrl(rawUrl, { apelido = null } = {}) {
  const check = validarUrlHttp(rawUrl);
  if (!check.valida) {
    throw new Error(check.motivo);
  }

  const apelidoLimpo = apelido ? String(apelido).trim() : null;
  if (apelidoLimpo && !/^[a-zA-Z0-9_]{5,30}$/.test(apelidoLimpo)) {
    throw new Error('O apelido deve conter entre 5 e 30 caracteres (apenas letras, números e `_`).');
  }

  if (!apelidoLimpo) {
    const emMemoria = cacheUrls.get(check.url);
    if (emMemoria) {
      return { urlOriginal: check.url, ...emMemoria, emCache: true };
    }

    try {
      const emBanco = await db.buscarLinkEncurtadoCache(check.url);
      if (emBanco?.url_encurtada) {
        const resCache = { urlEncurtada: emBanco.url_encurtada, provedor: emBanco.provedor || 'is.gd' };
        salvarCacheUrl(check.url, resCache);
        return { urlOriginal: check.url, ...resCache, emCache: true };
      }
    } catch {
      // Cache do banco é opcional; segue para o provedor externo
    }
  }

  try {
    const res = await encurtarViaIsGd(check.url, apelidoLimpo);
    if (!apelidoLimpo) salvarCacheUrl(check.url, res);
    return { urlOriginal: check.url, ...res, emCache: false };
  } catch (errIsGd) {
    // Error code 2 no is.gd indica apelido personalizado já em uso ou indisponível
    if (apelidoLimpo && errIsGd.isGdErrorCode === 2) {
      try {
        const resTiny = await encurtarViaTinyUrl(check.url, apelidoLimpo);
        return { urlOriginal: check.url, ...resTiny, emCache: false };
      } catch {
        throw new Error(`O apelido \`${apelidoLimpo}\` já está em uso ou não está disponível. Tente outro.`);
      }
    }

    const resTiny = await encurtarViaTinyUrl(check.url, apelidoLimpo);
    if (!apelidoLimpo) salvarCacheUrl(check.url, resTiny);
    return { urlOriginal: check.url, ...resTiny, emCache: false };
  }
}

async function obterConfigDinamica() {
  const agora = Date.now();
  if (cacheConfigDinamica && agora < cacheConfigDinamica.expiraEm) {
    return cacheConfigDinamica.dados;
  }

  let autoAtivo = config.encurtador.autoAtivo;
  const canaisIgnoradosSet = new Set(config.encurtador.canaisIgnorados || []);
  if (config.kov?.logChannelId) canaisIgnoradosSet.add(config.kov.logChannelId);

  try {
    const [estadoAuto, estadoCanais] = await Promise.all([
      db.getEstado('encurtador_auto_ativo'),
      db.getEstado('encurtador_canais_ignorados'),
    ]);

    if (estadoAuto === 'true' || estadoAuto === 'false') {
      autoAtivo = estadoAuto === 'true';
    }
    if (estadoCanais) {
      const lista = JSON.parse(estadoCanais);
      if (Array.isArray(lista)) {
        for (const id of lista) {
          if (id) canaisIgnoradosSet.add(String(id));
        }
      }
    }
  } catch {
    // Mantém valores padrão do .env se o banco estiver indisponível
  }

  const dados = {
    autoAtivo,
    minTamanho: config.encurtador.minTamanho,
    canaisIgnorados: Array.from(canaisIgnoradosSet),
    dominiosIgnorados: config.encurtador.dominiosIgnorados || [],
  };

  cacheConfigDinamica = { dados, expiraEm: agora + CACHE_CONFIG_TTL_MS };
  return dados;
}

async function definirAutoAtivo(ativo) {
  await db.salvarEstado('encurtador_auto_ativo', ativo ? 'true' : 'false');
  cacheConfigDinamica = null;
  return obterConfigDinamica();
}

async function alternarCanalIgnorado(canalId, ignorar) {
  const id = String(canalId);
  let listaAtual = [];
  try {
    const bruto = await db.getEstado('encurtador_canais_ignorados');
    if (bruto) {
      const parsed = JSON.parse(bruto);
      if (Array.isArray(parsed)) listaAtual = parsed.map(String);
    }
  } catch {
    listaAtual = [];
  }

  const conjunto = new Set(listaAtual);
  if (ignorar) {
    conjunto.add(id);
  } else {
    conjunto.delete(id);
  }

  await db.salvarEstado('encurtador_canais_ignorados', JSON.stringify(Array.from(conjunto)));
  cacheConfigDinamica = null;
  return obterConfigDinamica();
}

async function obterOuCriarWebhookCanal(canalBase, client) {
  if (!canalBase || typeof canalBase.fetchWebhooks !== 'function') return null;

  const emCache = cacheWebhooks.get(canalBase.id);
  if (emCache && Date.now() < emCache.expiraEm) {
    return emCache.webhook;
  }

  try {
    const webhooks = await canalBase.fetchWebhooks();
    let webhook = webhooks.find((w) => w.owner?.id === client.user?.id && w.name === WEBHOOK_NOME && w.token);

    if (!webhook) {
      webhook = await canalBase.createWebhook({
        name: WEBHOOK_NOME,
        reason: 'Encurtamento automático de links no Discord',
      });
    }

    cacheWebhooks.set(canalBase.id, { webhook, expiraEm: Date.now() + CACHE_WEBHOOK_TTL_MS });
    return webhook;
  } catch {
    return null;
  }
}

async function repostarMensagemEncurtada(client, message, novoConteudo, linksCurtosInfo) {
  const ehThread = message.channel.isThread();
  const canalBase = ehThread ? message.channel.parent : message.channel;
  const me = message.guild.members.me;
  const permsMensagem = me ? me.permissionsIn(message.channel) : null;
  const permsWebhook = canalBase && me ? me.permissionsIn(canalBase) : null;

  const podeApagar = Boolean(permsMensagem?.has(PermissionFlagsBits.ManageMessages));
  const podeWebhook = Boolean(permsWebhook?.has(PermissionFlagsBits.ManageWebhooks));

  const anexosValidos = [];
  let anexoExcedeLimite = false;
  for (const att of message.attachments.values()) {
    if (att.size > LIMITE_ANEXO_BYTES) {
      anexoExcedeLimite = true;
      break;
    }
    anexosValidos.push({ attachment: att.url, name: att.name });
  }

  // Se não podemos apagar a mensagem original (ou há anexo maior que o limite de reupload), apenas responde com os links curtos
  if (!podeApagar || anexoExcedeLimite) {
    const lista = linksCurtosInfo.map((l) => `🔗 <${l.urlEncurtada}> (\`${l.urlEncurtada}\`)`).join('\n');
    await message.reply({
      content: `🔗 **Link(s) encurtado(s):**\n${lista}`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const nomeAutor = message.member?.displayName || message.author.globalName || message.author.username;
  const avatarAutor = message.author.displayAvatarURL({ extension: 'png', size: 256 });
  let conteudoFinal = novoConteudo;

  if (message.reference?.messageId && message.reference?.channelId) {
    const urlResposta = `https://discord.com/channels/${message.guild.id}/${message.reference.channelId}/${message.reference.messageId}`;
    const prefixo = `> ↩️ Em resposta a ${urlResposta}\n`;
    if (prefixo.length + conteudoFinal.length <= 2000) {
      conteudoFinal = `${prefixo}${conteudoFinal}`;
    }
  }

  let repostado = false;
  if (podeWebhook) {
    const webhook = await obterOuCriarWebhookCanal(canalBase, client);
    if (webhook) {
      try {
        await webhook.send({
          content: conteudoFinal,
          username: nomeAutor.slice(0, 80),
          avatarURL: avatarAutor,
          files: anexosValidos,
          allowedMentions: { parse: ['users'] },
          ...(ehThread ? { threadId: message.channel.id } : {}),
        });
        repostado = true;
      } catch (errWh) {
        if (errWh?.code === 10015) cacheWebhooks.delete(canalBase.id);
      }
    }
  }

  if (!repostado) {
    const cabecalho = `🔗 **${nomeAutor}** (<@${message.author.id}>):\n`;
    const textoBot = cabecalho.length + novoConteudo.length <= 2000
      ? `${cabecalho}${novoConteudo}`
      : novoConteudo;

    await message.channel.send({
      content: textoBot,
      files: anexosValidos,
      allowedMentions: { parse: [] },
      ...(message.reference?.messageId
        ? { reply: { messageReference: message.reference.messageId, failIfNotExists: false } }
        : {}),
    });
  }

  await message.delete().catch((errDel) => {
    console.warn(`[encurtador] Não foi possível apagar mensagem original (${message.id}):`, errDel.message);
  });
}

async function handleMensagemLink(client, message) {
  if (!message || !message.guild) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;
  if (!message.content || !/https?:\/\//i.test(message.content)) return false;

  const cfg = await obterConfigDinamica();
  if (!cfg.autoAtivo) return false;

  const canaisIgnorados = new Set(cfg.canaisIgnorados);
  if (canaisIgnorados.has(message.channelId)) return false;
  if (message.channel?.parentId && canaisIgnorados.has(message.channel.parentId)) return false;

  const candidatas = extrairUrlsParaAutoEncurtar(message.content, cfg.minTamanho);
  if (candidatas.length === 0) return false;

  const mapaSubstituicoes = new Map();
  const linksEncurtadosInfo = [];

  for (const item of candidatas) {
    try {
      const resultado = await encurtarUrl(item.urlNormalizada);
      if (resultado.urlEncurtada.length < item.originalNaMensagem.length) {
        mapaSubstituicoes.set(item.originalNaMensagem, resultado.urlEncurtada);
        linksEncurtadosInfo.push({
          urlOriginal: resultado.urlOriginal,
          urlEncurtada: resultado.urlEncurtada,
          provedor: resultado.provedor,
        });
      }
    } catch (errEncurtar) {
      console.warn(`[encurtador] Falha ao encurtar ${item.urlNormalizada}:`, errEncurtar.message);
    }
  }

  if (mapaSubstituicoes.size === 0) return false;

  const novoConteudo = substituirUrlsNoTexto(message.content, mapaSubstituicoes);
  if (!novoConteudo || novoConteudo === message.content) return false;

  await repostarMensagemEncurtada(client, message, novoConteudo, linksEncurtadosInfo);

  for (const info of linksEncurtadosInfo) {
    await db
      .registrarLinkEncurtado({
        discordId: message.author.id,
        canalId: message.channelId,
        urlOriginal: info.urlOriginal,
        urlEncurtada: info.urlEncurtada,
        provedor: info.provedor,
        origem: 'auto',
      })
      .catch(() => {});
  }

  return true;
}

module.exports = {
  validarUrlHttp,
  deveIgnorarDominio,
  extrairUrlsParaAutoEncurtar,
  encurtarUrl,
  obterConfigDinamica,
  definirAutoAtivo,
  alternarCanalIgnorado,
  handleMensagemLink,
};
