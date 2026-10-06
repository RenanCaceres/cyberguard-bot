async function popularCacheDeMembros(guild) {
  try {
    let after = '0';
    let totalCarregados = 0;

    while (true) {
      const pagina = await guild.members.list({ limit: 1000, after });
      if (pagina.size === 0) break;

      totalCarregados += pagina.size;
      after = pagina.last().id;

      if (pagina.size < 1000) break;
    }

    console.log(`[boot] cache de membros carregado via REST: ${totalCarregados} membro(s).`);
    return true;
  } catch (err) {
    console.error(
      '[boot] erro ao popular cache de membros via REST — tentando via Gateway como último recurso:',
      err.message
    );
    return fetchMembrosComRetryGateway(guild);
  }
}

async function fetchMembrosComRetryGateway(guild, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      await guild.members.fetch();
      return true;
    } catch (err) {
      const retryAfter = err?.data?.retry_after;
      if (retryAfter && i < tentativas - 1) {
        console.warn(`[boot] fetch de membros (gateway) rate limitado, tentando de novo em ${retryAfter}s`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 + 500));
      } else {
        console.error('[boot] falha ao popular cache de membros mesmo com fallback via Gateway:', err.message);
        return false;
      }
    }
  }
  return false;
}

module.exports = { popularCacheDeMembros };
