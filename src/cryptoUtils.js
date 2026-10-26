'use strict';
const crypto = require('crypto');

const PREFIXO = 'enc:v1:';
const ALGORITMO = 'aes-256-gcm';

const CAMPOS_SENSIVEIS_MEMBRO = [
  'cpf',
  'data_nascimento',
  'nacionalidade',
  'endereco',
  'cidade',
  'estado',
  'telefone',
];

function obterChaveCriptografia() {
  const chaveEnv = process.env.DATA_ENCRYPTION_KEY;
  if (chaveEnv && /^[0-9a-fA-F]{64}$/.test(chaveEnv.trim())) {
    return Buffer.from(chaveEnv.trim(), 'hex');
  }
  const segredoBase =
    chaveEnv ||
    process.env.DATABASE_URL ||
    process.env.DISCORD_TOKEN ||
    'cyberguard-utfpr-default-fallback-key';
  return crypto.createHash('sha256').update(String(segredoBase)).digest();
}

function estaCriptografado(valor) {
  return typeof valor === 'string' && valor.startsWith(PREFIXO);
}

function criptografar(texto) {
  if (texto === null || texto === undefined) return null;
  const str = String(texto);
  if (str === '' || estaCriptografado(str)) return str;

  const chave = obterChaveCriptografia();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITMO, chave, iv);

  const criptografado = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIXO}${iv.toString('hex')}:${authTag.toString('hex')}:${criptografado.toString('hex')}`;
}

function descriptografar(valor) {
  if (valor === null || valor === undefined) return null;
  const str = String(valor);
  if (!estaCriptografado(str)) return str;

  try {
    const semPrefixo = str.slice(PREFIXO.length);
    const partes = semPrefixo.split(':');
    if (partes.length !== 3) return str;

    const [ivHex, authTagHex, conteudoHex] = partes;
    const chave = obterChaveCriptografia();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const conteudo = Buffer.from(conteudoHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITMO, chave, iv);
    decipher.setAuthTag(authTag);

    const decifrado = Buffer.concat([decipher.update(conteudo), decipher.final()]);
    return decifrado.toString('utf8');
  } catch (err) {
    console.error('[crypto] Falha ao descriptografar valor:', err.message);
    return str;
  }
}

function criptografarObjetoMembro(dados = {}) {
  const copia = { ...dados };
  for (const campo of CAMPOS_SENSIVEIS_MEMBRO) {
    if (campo in copia && copia[campo] !== undefined && copia[campo] !== null) {
      copia[campo] = criptografar(copia[campo]);
    }
  }
  return copia;
}

function descriptografarMembro(row) {
  if (!row) return null;
  const copia = { ...row };
  for (const campo of CAMPOS_SENSIVEIS_MEMBRO) {
    if (copia[campo]) {
      copia[campo] = descriptografar(copia[campo]);
    }
  }
  return copia;
}

function mascararCPF(cpf) {
  if (!cpf) return '—';
  const limpo = descriptografar(cpf).replace(/\D/g, '');
  if (limpo.length !== 11) return '***.***.***-**';
  return `***.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-**`;
}

module.exports = {
  PREFIXO,
  CAMPOS_SENSIVEIS_MEMBRO,
  estaCriptografado,
  criptografar,
  descriptografar,
  criptografarObjetoMembro,
  descriptografarMembro,
  mascararCPF,
};
