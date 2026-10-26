'use strict';
require('dotenv').config();
const { verificarSessao, obterUserIdPorEmail, adicionarMembroWorkspace, removerMembroWorkspace } = require('../src/notionWorkspace');

async function main() {
  console.log('=== TESTE DO MÓDULO DE GESTÃO DO WORKSPACE NOTION (API v3) ===\n');

  console.log('1. Verificando sessão do token_v2...');
  const sessao = await verificarSessao();
  console.log('Resultado da sessão:', sessao);

  if (!sessao.valido) {
    console.error('❌ Falha ao autenticar com o token_v2:', sessao.erro);
    return;
  }

  console.log('\n2. Detalhes da Permissão no Workspace CyberGuard:');
  console.log(`- Plano Detectado: ${sessao.tipoAssinatura}`);
  console.log(`- Papel da Conta: ${sessao.tipoPermissao}`);
  console.log(`- É Administrador do Workspace?: ${sessao.isAdmin ? 'SIM ✅' : 'NÃO ⚠️ (Atualmente é Membro comum)'}`);

  if (!sessao.isAdmin) {
    console.log('\n⚠️ AVISO DE PERMISSÃO:');
    console.log('Para adicionar novos membros ao workspace, a sua conta precisa ser Administradora (Workspace Owner).');
    console.log('Peça para o André (ou quem criou o workspace) ir em Settings & Members e mudar seu cargo para Workspace Owner.');
  }

  // Teste de consulta de usuário
  console.log('\n3. Testando resolução de ID de usuário por e-mail:');
  const emailTeste = process.env.TEST_NOTION_EMAIL || 'exemplo@alunos.utfpr.edu.br';
  const userId = await obterUserIdPorEmail(emailTeste);
  console.log(`- E-mail: ${emailTeste} -> Notion User ID: ${userId || 'Não encontrado'}`);

  console.log('\n=== TESTE CONCLUÍDO COM SUCESSO ===');
}

main().catch(console.error);
