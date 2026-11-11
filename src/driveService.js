'use strict';

const fs = require('fs');
const path = require('path');
const { JWT, OAuth2Client } = require('google-auth-library');
const config = require('./config');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let authClient = null;
let oauthClient = null;
const folderCache = new Map();

function normalizarAreaSubpasta(area) {
  if (!area) return 'Geral';
  const a = area.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (a.includes('hardware')) return 'HardwareHacking';
  if (a.includes('etico') || a.includes('hack') || a.includes('red') || a.includes('blue')) return 'HackingEtico';
  if (a.includes('design')) return 'Design';
  if (a.includes('humano') || a.includes('rh')) return 'Recursos Humanos';
  if (a.includes('social') || a.includes('copy')) return 'SocialMedia';
  if (a.includes('lider')) return 'Líderes';
  if (a.includes('observatorio')) return 'Observatorio';
  if (a.includes('educacion')) return 'Educacional';
  if (a.includes('desenvolv')) return 'Desenvolvimento';
  return 'Geral';
}

function obterAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  // 1. Prioridade: OAuth2 do usuário (com cota normal de armazenamento no Meu Drive)
  if (clientId && clientSecret && refreshToken) {
    if (!oauthClient) {
      oauthClient = new OAuth2Client(clientId, clientSecret);
      oauthClient.setCredentials({ refresh_token: refreshToken });
    }
    return oauthClient;
  }

  // 2. Fallback: Service Account (para Shared Drives / Sheets)
  const email = config.googleSheets?.serviceAccountEmail;
  const key = config.googleSheets?.privateKey;

  if (email && key) {
    if (!authClient) {
      authClient = new JWT({
        email,
        key,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
    }
    return authClient;
  }

  return null;
}

async function obterToken() {
  const client = obterAuth();
  if (!client) {
    throw new Error('Nenhuma credencial do Google configurada (OAuth2 ou Service Account).');
  }
  const res = await client.getAccessToken();
  return typeof res === 'string' ? res : res?.token;
}

/**
 * Procura ou cria uma subpasta no Google Drive dentro de uma pasta pai.
 */
async function obterOuCriarSubpasta(pastaPaiId, nomeSubpasta) {
  const chaveCache = `${pastaPaiId}:${nomeSubpasta}`;
  if (folderCache.has(chaveCache)) {
    return folderCache.get(chaveCache);
  }

  const token = await obterToken();
  const q = `'${pastaPaiId}' in parents and name = '${nomeSubpasta.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const urlBusca = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;

  const resBusca = await fetch(urlBusca, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });

  if (!resBusca.ok) {
    const errText = await resBusca.text();
    throw new Error(`Erro ao buscar subpasta "${nomeSubpasta}" no Drive (${resBusca.status}): ${errText}`);
  }

  const dataBusca = await resBusca.json();
  if (dataBusca.files && dataBusca.files.length > 0) {
    const folderId = dataBusca.files[0].id;
    folderCache.set(chaveCache, folderId);
    return folderId;
  }

  // Cria a subpasta se não existir
  const resCriacao = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: nomeSubpasta,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [pastaPaiId],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!resCriacao.ok) {
    const errText = await resCriacao.text();
    throw new Error(`Erro ao criar subpasta "${nomeSubpasta}" no Drive (${resCriacao.status}): ${errText}`);
  }

  const novaPasta = await resCriacao.json();
  folderCache.set(chaveCache, novaPasta.id);
  return novaPasta.id;
}

/**
 * Monta corpo multipart para upload no Google Drive.
 */
function criarMultipartBody(boundary, metadata, fileBuffer, mimeType) {
  const dnl = '\r\n';
  const prefix = Buffer.from(
    `--${boundary}${dnl}` +
      `Content-Type: application/json; charset=UTF-8${dnl}${dnl}` +
      `${JSON.stringify(metadata)}${dnl}` +
      `--${boundary}${dnl}` +
      `Content-Type: ${mimeType}${dnl}${dnl}`
  );
  const suffix = Buffer.from(`${dnl}--${boundary}--${dnl}`);
  return Buffer.concat([prefix, fileBuffer, suffix]);
}

/**
 * Normaliza texto para comparação de nomes de alunos.
 */
function normalizarChaveTexto(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizarRaChave(ra) {
  const limpo = String(ra || '').replace(/\D/g, '').replace(/^0+/, '');
  return limpo.length >= 5 ? limpo : '';
}

/**
 * Envia um arquivo para uma pasta no Google Drive. Se já existir um arquivo com o mesmo nome
 * (ou pertencente ao mesmo aluno por RA/nome quando informado), atualiza o arquivo existente
 * e remove duplicatas antigas.
 */
async function uploadArquivo({
  caminhoArquivo,
  buffer,
  nomeArquivo,
  pastaDestinoId,
  mimeType = 'application/pdf',
  raAluno = null,
  nomeAluno = null,
}) {
  if (!pastaDestinoId) {
    throw new Error('ID da pasta de destino no Google Drive não informado.');
  }

  const fileBuffer = buffer || fs.readFileSync(caminhoArquivo);
  const token = await obterToken();
  const nomeFinal = nomeArquivo || (caminhoArquivo ? path.basename(caminhoArquivo) : 'arquivo.pdf');

  let existenteId = null;
  const duplicadosParaRemover = [];

  const raLimpo = normalizarRaChave(raAluno);
  const nomeLimpo = normalizarChaveTexto(nomeAluno);

  if (raLimpo || nomeLimpo) {
    // Lista todos os arquivos da pasta para identificar versões anteriores do mesmo aluno
    const qTodos = `'${pastaDestinoId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    const urlTodos = `${DRIVE_API}/files?q=${encodeURIComponent(qTodos)}&pageSize=200&fields=files(id,name,size,webViewLink,modifiedTime)&spaces=drive`;
    const resTodos = await fetch(urlTodos, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });

    if (resTodos.ok) {
      const dataTodos = await resTodos.json();
      const candidatos = (dataTodos.files || []).filter((f) => {
        if (f.name === nomeFinal) return true;
        const nArq = normalizarChaveTexto(f.name);
        if (raLimpo && f.name.replace(/\D/g, '').includes(raLimpo)) return true;
        if (nomeLimpo && nomeLimpo.split(' ').length >= 2 && nArq.includes(nomeLimpo)) return true;
        return false;
      });

      if (candidatos.length > 0) {
        existenteId = candidatos[0].id;
        for (let i = 1; i < candidatos.length; i++) {
          duplicadosParaRemover.push(candidatos[i].id);
        }
      }
    }
  }

  if (!existenteId) {
    // Fallback: busca por nome exato
    const q = `'${pastaDestinoId}' in parents and name = '${nomeFinal.replace(/'/g, "\\'")}' and trashed = false`;
    const urlBusca = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,webViewLink)&spaces=drive`;

    const resBusca = await fetch(urlBusca, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });

    if (resBusca.ok) {
      const dataBusca = await resBusca.json();
      if (dataBusca.files && dataBusca.files.length > 0) {
        existenteId = dataBusca.files[0].id;
        for (let i = 1; i < dataBusca.files.length; i++) {
          duplicadosParaRemover.push(dataBusca.files[i].id);
        }
      }
    }
  }

  const boundary = `-------CyberGuardBoundary${Date.now()}`;
  let resultado;

  if (existenteId) {
    // Atualiza arquivo existente
    const multipartBody = criarMultipartBody(boundary, { name: nomeFinal }, fileBuffer, mimeType);
    const urlUpload = `${DRIVE_UPLOAD_API}/files/${existenteId}?uploadType=multipart&fields=id,name,webViewLink`;

    const resUpdate = await fetch(urlUpload, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
      signal: AbortSignal.timeout(60000),
    });

    if (!resUpdate.ok) {
      const errText = await resUpdate.text();
      throw new Error(`Erro ao atualizar arquivo "${nomeFinal}" no Drive (${resUpdate.status}): ${errText}`);
    }

    const data = await resUpdate.json();
    resultado = { id: data.id, name: data.name, webViewLink: data.webViewLink, atualizado: true };
  } else {
    // Cria novo arquivo
    const metadata = {
      name: nomeFinal,
      parents: [pastaDestinoId],
    };
    const multipartBody = criarMultipartBody(boundary, metadata, fileBuffer, mimeType);
    const urlUpload = `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`;

    const resUpload = await fetch(urlUpload, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
      signal: AbortSignal.timeout(60000),
    });

    if (!resUpload.ok) {
      const errText = await resUpload.text();
      throw new Error(`Erro ao enviar arquivo "${nomeFinal}" no Drive (${resUpload.status}): ${errText}`);
    }

    const data = await resUpload.json();
    resultado = { id: data.id, name: data.name, webViewLink: data.webViewLink, atualizado: false };
  }

  for (const dupId of duplicadosParaRemover) {
    await fetch(`${DRIVE_API}/files/${dupId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    }).catch(() => {});
  }

  return resultado;
}

/**
 * Envia um Termo de Voluntariado assinado para a pasta do Google Drive,
 * criando/alocando automaticamente na subpasta da respectiva área e substituindo versão anterior do aluno.
 */
async function fazerUploadTermo({ caminhoArquivo, buffer, nomeArquivo, area, ra = null, nomeAluno = null }) {
  const pastaRaizTermos = config.googleDrive?.termosFolderId;
  if (!pastaRaizTermos) {
    console.warn('[driveService] GOOGLE_DRIVE_TERMOS_FOLDER_ID não configurado. Upload ignorado.');
    return null;
  }

  if (!obterAuth()) {
    console.warn('[driveService] Credenciais do Google não configuradas. Upload ignorado.');
    return null;
  }

  const subpastaNome = normalizarAreaSubpasta(area);
  const pastaDestinoId = await obterOuCriarSubpasta(pastaRaizTermos, subpastaNome);

  return uploadArquivo({
    caminhoArquivo,
    buffer,
    nomeArquivo,
    pastaDestinoId,
    raAluno: ra,
    nomeAluno,
  });
}

/**
 * Envia uma Declaração de Voluntariado assinada para a pasta de declarações no Google Drive.
 */
async function fazerUploadDeclaracao({ caminhoArquivo, buffer, nomeArquivo }) {
  const pastaDeclaracoes = config.googleDrive?.declaracoesFolderId;
  if (!pastaDeclaracoes) {
    console.warn('[driveService] GOOGLE_DRIVE_DECLARACOES_FOLDER_ID não configurado. Upload ignorado.');
    return null;
  }

  if (!obterAuth()) {
    console.warn('[driveService] Credenciais do Google não configuradas. Upload ignorado.');
    return null;
  }

  return uploadArquivo({
    caminhoArquivo,
    buffer,
    nomeArquivo,
    pastaDestinoId: pastaDeclaracoes,
  });
}

/**
 * Torna um arquivo legível para qualquer pessoa com o link no Google Drive.
 */
async function tornarArquivoPublico(fileId) {
  try {
    const token = await obterToken();
    await fetch(`${DRIVE_API}/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.warn('[driveService] falha ao ajustar permissões públicas do arquivo:', err.message);
  }
}

/**
 * Envia um Comprovante de Entrega para a pasta de comprovantes no Google Drive.
 */
async function fazerUploadComprovante({ caminhoArquivo, buffer, nomeArquivo, mimeType }) {
  const pastaComprovantes = config.googleDrive?.comprovantesFolderId || process.env.GOOGLE_DRIVE_COMPROVANTES_FOLDER_ID || '';
  if (!pastaComprovantes) {
    console.warn('[driveService] GOOGLE_DRIVE_COMPROVANTES_FOLDER_ID não configurado. Upload ignorado.');
    return null;
  }

  if (!obterAuth()) {
    console.warn('[driveService] Credenciais do Google não configuradas. Upload ignorado.');
    return null;
  }

  const res = await uploadArquivo({
    caminhoArquivo,
    buffer,
    nomeArquivo,
    pastaDestinoId: pastaComprovantes,
    mimeType: mimeType || 'application/octet-stream',
  });

  if (res?.id) {
    await tornarArquivoPublico(res.id);
  }

  return res;
}

/**
 * Testa e valida o acesso às pastas do Google Drive.
 */
async function verificarAcessoDrive() {
  const auth = obterAuth();
  if (!auth) {
    return { ok: false, motivo: 'Credenciais da Service Account do Google não configuradas.' };
  }

  try {
    const token = await obterToken();
    const resultados = [];

    const pastas = [
      { nome: 'Termos Assinados', id: config.googleDrive?.termosFolderId },
      { nome: 'Declarações Assinadas', id: config.googleDrive?.declaracoesFolderId },
      { nome: 'Comprovantes de Entrega', id: config.googleDrive?.comprovantesFolderId || process.env.GOOGLE_DRIVE_COMPROVANTES_FOLDER_ID },
    ];

    for (const p of pastas) {
      if (!p.id) {
        resultados.push({ nome: p.nome, id: null, ok: false, erro: 'ID não configurado' });
        continue;
      }

      const res = await fetch(`${DRIVE_API}/files/${p.id}?fields=id,name,capabilities`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const text = await res.text();
        resultados.push({ nome: p.nome, id: p.id, ok: false, status: res.status, erro: text });
      } else {
        const data = await res.json();
        resultados.push({ nome: p.nome, id: p.id, ok: true, data });
      }
    }

    const todosOk = resultados.every((r) => r.ok);
    return { ok: todosOk, resultados };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

module.exports = {
  fazerUploadTermo,
  fazerUploadDeclaracao,
  fazerUploadComprovante,
  uploadArquivo,
  obterOuCriarSubpasta,
  verificarAcessoDrive,
  normalizarAreaSubpasta,
};
