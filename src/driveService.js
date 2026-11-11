'use strict';

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { JWT, OAuth2Client } = require('google-auth-library');
const config = require('./config');

if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

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

/**
 * Extrai metadados do aluno (Nome, RA) da página 1 do Termo de Voluntariado em PDF
 * e contabiliza quantas assinaturas digitais ICP-Brasil (/ByteRange) o arquivo possui.
 */
async function extrairMetadadosTermoPdf(buffer, nomeArquivoFallback = '') {
  const numAssinaturas = (buffer.toString('latin1').match(/\/ByteRange\s*\[/g) || []).length;
  let nome = '';
  let ra = '';

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    }).promise;

    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const texto = content.items.map((i) => i.str).join(' ');

    const matchRa = texto.match(/RA:\s*(?:a)?(\d{5,10})/i);
    if (matchRa) {
      ra = normalizarRaChave(matchRa[1]);
    }

    const matchNome =
      texto.match(/Dados do\(a\) Volunt[áa]rio\(a\)\s*Nome:\s*(.+?)\s*Data nascimento:/i) ||
      texto.match(/Volunt[áa]rio\(a\)[\s\S]{0,60}?Nome:\s*(.+?)\s*Data nascimento:/i);
    if (matchNome) {
      nome = matchNome[1].trim();
    }
  } catch (err) {
    console.warn(`[driveService] Aviso ao ler texto do PDF (${nomeArquivoFallback}):`, err.message);
  }

  if (!nome && nomeArquivoFallback) {
    const limpo = nomeArquivoFallback
      .replace(/\.pdf$/i, '')
      .replace(/^Termo[_\s-]*(?:Voluntariado|Assinado)[_\s-]*/i, '')
      .replace(/[_\s-]*(?:assinado|signed|\d{10,}|\d+)$/gi, '')
      .replace(/_/g, ' ')
      .trim();
    if (limpo) nome = limpo;
  }

  return {
    nome,
    nomeChave: normalizarChaveTexto(nome),
    ra,
    numAssinaturas,
  };
}

async function baixarArquivoDrive(fileId, token) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar arquivo ${fileId} do Drive (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

let sincronizandoDrive = false;
const CAMINHO_CACHE_META_DRIVE = path.join(__dirname, '..', 'temp', 'drive_termos_meta_cache.json');

function carregarCacheMetaDrive() {
  try {
    if (fs.existsSync(CAMINHO_CACHE_META_DRIVE)) {
      return JSON.parse(fs.readFileSync(CAMINHO_CACHE_META_DRIVE, 'utf8'));
    }
  } catch {}
  return {};
}

function salvarCacheMetaDrive(cache) {
  try {
    const dir = path.dirname(CAMINHO_CACHE_META_DRIVE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CAMINHO_CACHE_META_DRIVE, JSON.stringify(cache, null, 2), 'utf8');
  } catch {}
}

/**
 * Sincroniza local `docs/Termos-Voluntarios-Assinados/<Subpasta>/` com o PDF vencedor do aluno,
 * removendo versões antigas duplicadas daquele mesmo aluno na pasta local.
 */
function atualizarTermoLocalSincronizado({ subpastaNome, nomeArquivo, buffer, nomeChave, ra }) {
  try {
    const dirSetor = path.join(__dirname, '..', 'docs', 'Termos-Voluntarios-Assinados', subpastaNome);
    if (!fs.existsSync(dirSetor)) {
      fs.mkdirSync(dirSetor, { recursive: true });
    }

    const arquivosLocais = fs.readdirSync(dirSetor).filter((f) => f.toLowerCase().endsWith('.pdf'));
    for (const arq of arquivosLocais) {
      if (arq === nomeArquivo) continue;
      const arqChave = normalizarChaveTexto(arq);
      const mesmoRa = ra && arq.replace(/\D/g, '').includes(ra);
      const mesmoNome = nomeChave && nomeChave.split(' ').length >= 2 && arqChave.includes(nomeChave);
      if (mesmoRa || mesmoNome) {
        try {
          fs.unlinkSync(path.join(dirSetor, arq));
        } catch {}
      }
    }

    fs.writeFileSync(path.join(dirSetor, nomeArquivo), buffer);
  } catch (err) {
    console.warn('[driveService] Aviso ao atualizar cópia local do termo:', err.message);
  }
}

/**
 * Varre a pasta de Termos Assinados no Google Drive (raiz e subpastas de setores).
 * Quando um novo PDF é enviado (ex: versão co-assinada pela coordenadora do projeto),
 * identifica automaticamente o aluno pelo conteúdo do PDF (RA / Nome na Página 1) e
 * substitui a versão anterior daquele aluno, mantendo apenas o PDF atualizado/co-assinado.
 */
async function sincronizarSubstituicoesDrive() {
  if (sincronizandoDrive) return { ignorado: true, motivo: 'Sincronização já em andamento' };

  const pastaRaizTermos = config.googleDrive?.termosFolderId;
  if (!pastaRaizTermos || !obterAuth()) {
    return { ignorado: true, motivo: 'Drive não configurado' };
  }

  sincronizandoDrive = true;
  const substituidos = [];

  try {
    const token = await obterToken();
    const metaCache = carregarCacheMetaDrive();
    let cacheAlterado = false;

    // 1. Lista todos os itens na raiz da pasta de Termos
    const qRaiz = `'${pastaRaizTermos}' in parents and trashed = false`;
    const resRaiz = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(qRaiz)}&pageSize=200&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&spaces=drive`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) }
    );
    if (!resRaiz.ok) {
      throw new Error(`Erro ao listar pasta raiz de termos (${resRaiz.status})`);
    }
    const dataRaiz = await resRaiz.json();
    const itensRaiz = dataRaiz.files || [];

    const subpastas = itensRaiz.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
    const pdfsRaiz = itensRaiz.filter((f) => f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

    // 2. Lista os PDFs dentro de cada subpasta de setor
    const arquivosPorSubpasta = new Map();
    for (const sp of subpastas) {
      folderCache.set(`${pastaRaizTermos}:${sp.name}`, sp.id);
      const qSub = `'${sp.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
      const resSub = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(qSub)}&pageSize=200&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&spaces=drive`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) }
      );
      if (resSub.ok) {
        const dataSub = await resSub.json();
        const pdfs = (dataSub.files || []).filter(
          (f) => f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        );
        arquivosPorSubpasta.set(sp.name, { folderId: sp.id, files: pdfs });
      }
    }

    // Helper para obter metadados (com cache por fileId + modifiedTime)
    async function obterMetaArquivo(file, forcarBuffer = false) {
      const chaveCache = `${file.id}:${file.modifiedTime}`;
      if (!forcarBuffer && metaCache[chaveCache]) {
        return { ...metaCache[chaveCache], buffer: null };
      }
      const buffer = await baixarArquivoDrive(file.id, token);
      const meta = await extrairMetadadosTermoPdf(buffer, file.name);
      metaCache[chaveCache] = meta;
      cacheAlterado = true;
      return { ...meta, buffer };
    }

    // 3. Processa eventuais PDFs soltos na raiz (identifica o setor do aluno e move/substitui na subpasta)
    if (pdfsRaiz.length > 0) {
      let membrosDb = [];
      try {
        const db = require('./db');
        membrosDb = await db.listarTodosMembros();
      } catch {}

      for (const arqRaiz of pdfsRaiz) {
        try {
          const infoRaiz = await obterMetaArquivo(arqRaiz, true);
          let subpastaAlvo = null;

          // Procura se o aluno já possui arquivo em alguma subpasta
          for (const [nomeSp, dadosSp] of arquivosPorSubpasta.entries()) {
            for (const fSub of dadosSp.files) {
              const infoSub = await obterMetaArquivo(fSub, false);
              const mesmoRa = infoRaiz.ra && infoSub.ra && infoRaiz.ra === infoSub.ra;
              const mesmoNome = infoRaiz.nomeChave && infoSub.nomeChave && infoRaiz.nomeChave === infoSub.nomeChave;
              if (mesmoRa || mesmoNome) {
                subpastaAlvo = nomeSp;
                break;
              }
            }
            if (subpastaAlvo) break;
          }

          // Se não achou na subpasta, consulta o banco de dados de membros
          if (!subpastaAlvo && membrosDb.length > 0) {
            const mEncontrado = membrosDb.find((m) => {
              const mRa = normalizarRaChave(m.ra);
              const mNome = normalizarChaveTexto(m.nome);
              return (infoRaiz.ra && mRa === infoRaiz.ra) || (infoRaiz.nomeChave && mNome === infoRaiz.nomeChave);
            });
            if (mEncontrado) {
              subpastaAlvo = normalizarAreaSubpasta(mEncontrado.area_interesse);
            }
          }

          if (!subpastaAlvo) subpastaAlvo = 'Geral';

          const pastaDestinoId = await obterOuCriarSubpasta(pastaRaizTermos, subpastaAlvo);
          const nomeLimpoArquivo = infoRaiz.nome
            ? `Termo_Assinado_${infoRaiz.nome.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '_').replace(/_+/g, '_')}.pdf`
            : arqRaiz.name;

          await uploadArquivo({
            buffer: infoRaiz.buffer,
            nomeArquivo: nomeLimpoArquivo,
            pastaDestinoId,
            raAluno: infoRaiz.ra,
            nomeAluno: infoRaiz.nome,
          });

          atualizarTermoLocalSincronizado({
            subpastaNome: subpastaAlvo,
            nomeArquivo: nomeLimpoArquivo,
            buffer: infoRaiz.buffer,
            nomeChave: infoRaiz.nomeChave,
            ra: infoRaiz.ra,
          });

          // Remove o PDF avulso da raiz após alocar na subpasta correta
          await fetch(`${DRIVE_API}/files/${arqRaiz.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
          }).catch(() => {});

          substituidos.push({
            aluno: infoRaiz.nome || arqRaiz.name,
            ra: infoRaiz.ra,
            subpasta: subpastaAlvo,
            origem: 'raiz->subpasta',
            assinaturas: infoRaiz.numAssinaturas,
          });
          console.log(
            `[driveService] Termo na raiz identificado (${infoRaiz.nome || arqRaiz.name} | RA: ${infoRaiz.ra || 'N/A'}) -> substituído na subpasta ${subpastaAlvo}.`
          );
        } catch (errRaizItem) {
          console.error(`[driveService] Erro ao processar PDF da raiz (${arqRaiz.name}):`, errRaizItem.message);
        }
      }
    }

    // 4. Dentro de cada subpasta de setor, agrupa por aluno (RA ou Nome) e substitui duplicatas mantendo o co-assinado / mais recente
    for (const [nomeSp, dadosSp] of arquivosPorSubpasta.entries()) {
      const { files } = dadosSp;
      if (!files || files.length < 2) continue;

      const enriquecidos = [];
      for (const f of files) {
        try {
          const meta = await obterMetaArquivo(f, false);
          enriquecidos.push({ file: f, meta });
        } catch (errMeta) {
          console.warn(`[driveService] Erro ao ler metadados de ${f.name}:`, errMeta.message);
        }
      }

      // Agrupa arquivos que pertencem ao mesmo aluno (por RA ou por Nome completo normalizado)
      const grupos = [];
      for (const item of enriquecidos) {
        let grupoExistente = grupos.find((g) => {
          if (item.meta.ra && g.ra && item.meta.ra === g.ra) return true;
          if (item.meta.nomeChave && g.nomeChave && item.meta.nomeChave === g.nomeChave) return true;
          return false;
        });

        if (!grupoExistente) {
          grupoExistente = {
            ra: item.meta.ra || '',
            nomeChave: item.meta.nomeChave || '',
            nome: item.meta.nome || item.file.name,
            itens: [],
          };
          grupos.push(grupoExistente);
        } else {
          if (!grupoExistente.ra && item.meta.ra) grupoExistente.ra = item.meta.ra;
          if (!grupoExistente.nomeChave && item.meta.nomeChave) grupoExistente.nomeChave = item.meta.nomeChave;
        }
        grupoExistente.itens.push(item);
      }

      for (const grupo of grupos) {
        if (grupo.itens.length < 2) continue;

        // Ordena: maior número de assinaturas digitais (co-assinado pela coordenadora = 2) primeiro;
        // em caso de empate, o arquivo enviado/modificado mais recentemente vence.
        grupo.itens.sort((a, b) => {
          if (b.meta.numAssinaturas !== a.meta.numAssinaturas) {
            return b.meta.numAssinaturas - a.meta.numAssinaturas;
          }
          return new Date(b.file.modifiedTime) - new Date(a.file.modifiedTime);
        });

        const vencedor = grupo.itens[0];
        const perdedores = grupo.itens.slice(1);

        try {
          const bufferVencedor = await baixarArquivoDrive(vencedor.file.id, token);
          atualizarTermoLocalSincronizado({
            subpastaNome: nomeSp,
            nomeArquivo: vencedor.file.name,
            buffer: bufferVencedor,
            nomeChave: grupo.nomeChave,
            ra: grupo.ra,
          });
        } catch (errSyncLocal) {
          console.warn(`[driveService] Aviso ao baixar vencedor (${vencedor.file.name}):`, errSyncLocal.message);
        }

        for (const p of perdedores) {
          try {
            const resDel = await fetch(`${DRIVE_API}/files/${p.file.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(15000),
            });
            if (resDel.ok || resDel.status === 404) {
              console.log(
                `[driveService] Substituição automática (${nomeSp}): mantido "${vencedor.file.name}" (${vencedor.meta.numAssinaturas} assinatura(s)) e removido anterior "${p.file.name}" (${p.meta.numAssinaturas} assinatura(s)) do aluno ${grupo.nome}.`
              );
              substituidos.push({
                aluno: grupo.nome,
                ra: grupo.ra,
                subpasta: nomeSp,
                mantido: vencedor.file.name,
                assinaturasMantido: vencedor.meta.numAssinaturas,
                removido: p.file.name,
                assinaturasRemovido: p.meta.numAssinaturas,
              });
            }
          } catch (errDel) {
            console.error(`[driveService] Falha ao remover duplicata ${p.file.name}:`, errDel.message);
          }
        }
      }
    }

    if (cacheAlterado) {
      salvarCacheMetaDrive(metaCache);
    }

    return { ok: true, substituidos };
  } catch (err) {
    console.error('[driveService] Erro na sincronização de termos do Drive:', err.message);
    return { ok: false, erro: err.message, substituidos };
  } finally {
    sincronizandoDrive = false;
  }
}

let cronDriveIniciado = false;

/**
 * Inicia o monitoramento periódico da pasta de Termos no Google Drive
 * para identificar e substituir automaticamente termos co-assinados recém-enviados.
 */
function iniciarMonitoramentoDriveTermos() {
  if (cronDriveIniciado) return;
  cronDriveIniciado = true;

  setTimeout(() => {
    sincronizarSubstituicoesDrive().catch((err) =>
      console.error('[driveService] Erro na varredura inicial do Drive:', err.message)
    );
  }, 15000);

  cron.schedule('*/2 * * * *', () => {
    sincronizarSubstituicoesDrive().catch((err) =>
      console.error('[driveService] Erro no cron de sincronização do Drive:', err.message)
    );
  });
}

module.exports = {
  fazerUploadTermo,
  fazerUploadDeclaracao,
  fazerUploadComprovante,
  uploadArquivo,
  obterOuCriarSubpasta,
  verificarAcessoDrive,
  normalizarAreaSubpasta,
  extrairMetadadosTermoPdf,
  sincronizarSubstituicoesDrive,
  iniciarMonitoramentoDriveTermos,
};
