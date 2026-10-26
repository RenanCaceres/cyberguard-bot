'use strict';
// Módulo de Gestão de Membros do Workspace Notion (API v3 Interna / Sessão token_v2).
// Permite adicionar e remover membros do workspace diretamente sem limitações da API pública oficial.

const BASE_V3 = 'https://www.notion.so/api/v3';
const BASE_V1 = 'https://api.notion.com/v1';

const cfg = () => ({
  tokenV2: process.env.NOTION_TOKEN_V2,
  tokenV1: process.env.NOTION_TOKEN,
  spaceId: process.env.NOTION_SPACE_ID || '',
  activeUserId: process.env.NOTION_ACTIVE_USER_ID || '',
});

/**
 * Executa chamadas HTTP para os endpoints internos /api/v3 do Notion
 */
async function reqV3(endpoint, body = {}) {
  const { tokenV2, spaceId, activeUserId } = cfg();
  if (!tokenV2) {
    throw new Error('NOTION_TOKEN_V2 não configurado no .env.');
  }

  const res = await fetch(`${BASE_V3}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `token_v2=${tokenV2};`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'x-notion-active-user-header': activeUserId,
      'x-notion-space-id': spaceId,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorName = data?.name || 'ErroApiNotion';
    const errorMsg = data?.debugMessage || data?.message || `HTTP ${res.status}`;
    const err = new Error(`[notion-workspace] ${endpoint} (${res.status}): ${errorMsg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * Consulta a API v1 oficial para listar usuários conhecidos no workspace
 */
async function listarUsuariosV1() {
  const { tokenV1 } = cfg();
  if (!tokenV1) return [];

  try {
    const res = await fetch(`${BASE_V1}/users`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenV1}`,
        'Notion-Version': '2022-06-28',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.warn('[notion-workspace] Falha ao consultar lista de usuários v1:', err.message);
    return [];
  }
}

/**
 * Localiza ou provisiona o ID de usuário no Notion a partir do e-mail
 */
async function obterUserIdPorEmail(email) {
  if (!email || !email.includes('@')) {
    throw new Error('E-mail inválido fornecido.');
  }

  const emailNorm = email.trim().toLowerCase();

  // 1. Tenta buscar usuário existente via API pública oficial
  const usuarios = await listarUsuariosV1();
  const encontrado = usuarios.find((u) => u.person?.email?.toLowerCase() === emailNorm);
  if (encontrado?.id) {
    return encontrado.id;
  }

  // 2. Se o usuário ainda não existir no workspace, provisiona via createEmailUser (v3)
  try {
    const res = await reqV3('createEmailUser', {
      email: emailNorm,
      preferredLocaleOrigin: 'inferred_from_inviter',
      preferredLocale: 'pt-BR',
    });
    if (res?.userId) {
      return res.userId;
    }
  } catch (err) {
    // Se o usuário já tiver cadastro no Notion global, o createEmailUser pode retornar erro de validação
    // mas se tiver data.userId ele pode vir no corpo
    if (err.data?.userId) return err.data.userId;
  }

  return null;
}

/**
 * Verifica o status e permissões da sessão do token_v2
 */
async function verificarSessao() {
  const { spaceId } = cfg();
  try {
    const sub = await reqV3('getSubscriptionData', { spaceId });
    const isAdmin = sub?.type === 'subscribed_admin';
    return {
      valido: true,
      tipoAssinatura: sub?.subscriptionTier || 'plus',
      tipoPermissao: sub?.type, // 'subscribed_admin' ou 'subscribed_member'
      isAdmin,
    };
  } catch (err) {
    return {
      valido: false,
      erro: err.message,
    };
  }
}

/**
 * Adiciona um usuário como membro do Workspace no Notion
 * @param {string} email E-mail do membro a ser adicionado
 * @param {'member'|'owner'} [membershipType='member'] Nível de acesso
 */
async function adicionarMembroWorkspace(email, membershipType = 'member') {
  const { spaceId } = cfg();
  const userId = await obterUserIdPorEmail(email);

  if (!userId) {
    return {
      sucesso: false,
      motivo: 'USUARIO_NAO_ENCONTRADO',
      mensagem: `Não foi possível resolver o ID do usuário para o e-mail ${email}. Verifique se o e-mail possui conta criada no Notion.`,
    };
  }

  try {
    await reqV3('addMembersToSpace', {
      spaceId,
      userIds: [userId],
      membershipType, // 'member' (Membro padrão) ou 'owner' (Admin)
    });

    return {
      sucesso: true,
      email,
      userId,
      mensagem: `Membro ${email} adicionado com sucesso ao Workspace do Notion!`,
    };
  } catch (err) {
    if (err.status === 403) {
      return {
        sucesso: false,
        motivo: 'PERMISSAO_NEGADA',
        mensagem: 'O token_v2 configurado pertence a um membro comum. Para gerenciar membros, o dono do workspace precisa promover esta conta para "Workspace Owner" (Admin) no Notion.',
      };
    }
    return {
      sucesso: false,
      motivo: 'ERRO_API',
      mensagem: err.message,
    };
  }
}

/**
 * Remove um usuário do Workspace no Notion
 * @param {string} email E-mail do integrante a ser removido
 */
async function removerMembroWorkspace(email) {
  const { spaceId } = cfg();
  const userId = await obterUserIdPorEmail(email);

  if (!userId) {
    return {
      sucesso: false,
      motivo: 'USUARIO_NAO_ENCONTRADO',
      mensagem: `Não foi possível localizar o ID no Notion para o e-mail ${email}.`,
    };
  }

  try {
    await reqV3('removeUsersFromSpace', {
      spaceId,
      userIds: [userId],
      revokeUserTokens: false,
    });

    return {
      sucesso: true,
      email,
      userId,
      mensagem: `Usuário ${email} removido do Workspace do Notion com sucesso!`,
    };
  } catch (err) {
    if (err.status === 403) {
      return {
        sucesso: false,
        motivo: 'PERMISSAO_NEGADA',
        mensagem: 'Permissão negada ao tentar remover membro do Notion. Promova a conta para Administrador.',
      };
    }
    return {
      sucesso: false,
      motivo: 'ERRO_API',
      mensagem: err.message,
    };
  }
}

module.exports = {
  adicionarMembroWorkspace,
  removerMembroWorkspace,
  obterUserIdPorEmail,
  verificarSessao,
};
