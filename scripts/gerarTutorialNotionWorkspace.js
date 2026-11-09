'use strict';
const path = require('path');
const fs = require('fs');
const { DocBuilder } = require('./pdfDocBuilder');

async function gerarTutorialNotionWorkspace() {
  const doc = new DocBuilder(
    'Tutorial • Acesso ao Workspace Notion',
    'CyberGuard UTFPR • Guia de Navegação no Workspace Oficial'
  );
  await doc.init();

  // ==========================================
  // PÁGINA 1: Introdução e Passo 1
  // ==========================================
  doc.cabecalhoDocumento(
    'Guia Prático do Membro • Notion',
    'Como Acessar o Workspace do CyberGuard sem Depender de Links',
    'Passo a passo visual e ilustrado para localizar e alternar entre o seu espaço pessoal e o Workspace Oficial do CyberGuard no Notion.'
  );

  doc.secao('1', 'Visão Geral e Contexto');
  doc.paragrafo(
    'Ao criar ou acessar uma conta no Notion, é padrão que a plataforma abra inicialmente o seu Espaço Pessoal (geralmente nomeado como "Notion de SeuNome..."). ' +
    'Muitos voluntários acreditam que não receberam acesso ou ficam dependendo de links externos enviados na DM do bot para conseguir abrir os projetos.'
  );
  doc.paragrafo(
    'Uma vez que o seu acesso tenha sido liberado pelo CyberGuard Bot (ou pelo RH), o Workspace oficial fica permanentemente vinculado à sua conta. ' +
    'Você pode alternar entre seus espaços a qualquer momento em 3 passos rápidos.'
  );

  doc.alerta(
    'Requisito Obrigatório: E-mail Correspondente',
    'Para que o Workspace do CyberGuard apareça no seu menu, você deve estar logado no Notion exatamente com o e-mail cadastrado no onboarding do bot (seja o institucional @alunos.utfpr.edu.br ou o e-mail pessoal informado).',
    'aviso'
  );

  doc.secao('2', 'Passo 1: Abrir o Menu de Espaços de Trabalho');
  doc.paragrafo(
    'No canto inferior esquerdo da barra lateral do Notion, localize o botão que contém a sua foto de perfil e o nome do espaço de trabalho atual. ' +
    'Clique exatamente sobre esse botão destacado em vermelho para abrir a lista suspensa de contas e workspaces:'
  );

  const img1 = fs.readFileSync(path.join(__dirname, '../docs/manuais/assets/passo1_clicar_menu.png'));
  await doc.imagem(img1, { largura: 135, altura: 270, espacoDepois: 10 });

  // ==========================================
  // PÁGINA 2: Passo 2 e Gestão de Contas
  // ==========================================
  doc.novaPagina();

  doc.secao('3', 'Passo 2: Selecionar o Workspace "CyberGuard"');
  doc.paragrafo(
    'Após clicar no botão do canto inferior esquerdo, uma janela suspensa se abrirá exibindo todas as contas e espaços associados ao seu aplicativo. ' +
    'Localize o item "CyberGuard" (acompanhado do ícone de escudo azul) e clique sobre ele para alternar imediatamente:'
  );

  const img2 = fs.readFileSync(path.join(__dirname, '../docs/manuais/assets/passo2_selecionar_cyberguard.png'));
  await doc.imagem(img2, { largura: 160, altura: 215, espacoDepois: 14 });

  doc.subsecao('Diferença entre Espaço Pessoal e Workspace CyberGuard');
  doc.paragrafo(
    'No Notion, um único usuário pode participar de múltiplos workspaces ao mesmo tempo:'
  );
  doc.listaItem('Espaço Pessoal: Ambiente privado de anotações individuais do aluno. Ninguém mais tem acesso.');
  doc.listaItem('Workspace CyberGuard: Ambiente corporativo e acadêmico da equipe onde ficam as tarefas, sprints, atas de reunião e materiais setoriais.');

  doc.alerta(
    'Não encontrou o CyberGuard na lista?',
    'Se a opção "CyberGuard" não aparecer, clique em "Adicionar conta" no mesmo menu e faça login com o e-mail que você cadastrou no bot. Se ainda assim não aparecer, utilize o comando /meus-dados no Discord ou solicite suporte com o comando /help.',
    'info'
  );

  // ==========================================
  // PÁGINA 3: Passo 3 e Dicas de Produtividade
  // ==========================================
  doc.novaPagina();

  doc.secao('4', 'Passo 3: Acessar a Página Central com o Escudo');
  doc.paragrafo(
    'Ao selecionar o CyberGuard, a barra lateral recarregará com a árvore completa de documentos e setores da equipe. ' +
    'Na seção "Espaços de equipe", clique na página central "CyberGuard" (com o ícone do escudo azul destacado) para abrir o painel principal do projeto:'
  );

  const img3 = fs.readFileSync(path.join(__dirname, '../docs/manuais/assets/passo3_pagina_escudo.png'));
  await doc.imagem(img3, { largura: 75, altura: 325, espacoDepois: 14 });

  doc.secao('5', 'Dicas de Produtividade e Acesso Rápido');
  doc.listaItem('Fixar nos Favoritos: Passe o mouse sobre a página "CyberGuard" na barra lateral e clique na estrelinha para mantê-la sempre no topo.');
  doc.listaItem('Atalho no Navegador: Pressione Ctrl + D enquanto estiver na página inicial para salvá-la nos favoritos do seu navegador.');
  doc.listaItem('Aplicativo para Computador: Caso utilize o Notion Desktop (Windows/Mac/Linux), a alternância de espaços fica memorizada.');

  doc.subsecao('Atalhos Úteis do Teclado no Notion');
  doc.tabela(
    [
      { nome: 'Atalho', largura: 130 },
      { nome: 'Ação no Notion', largura: 220 },
      { nome: 'Utilidade', largura: 150 },
    ],
    [
      ['Ctrl + K / Ctrl + P', 'Busca rápida de páginas', 'Encontrar qualquer tarefa em 1 segundo'],
      ['Ctrl + \\', 'Recolher/expandir barra lateral', 'Mais espaço de leitura na tela'],
      ['Ctrl + Shift + L', 'Alternar modo Claro / Escuro', 'Conforto visual'],
    ]
  );

  const caminhoDestino = path.join(__dirname, '../docs/manuais/Tutorial_Acesso_Workspace_Notion.pdf');
  await doc.salvar(caminhoDestino);

  if (process.env.ARTIFACT_DIR && fs.existsSync(process.env.ARTIFACT_DIR)) {
    fs.copyFileSync(caminhoDestino, path.join(process.env.ARTIFACT_DIR, 'Tutorial_Acesso_Workspace_Notion.pdf'));
  }
}

if (require.main === module) {
  gerarTutorialNotionWorkspace().catch((err) => {
    console.error('Erro ao gerar tutorial PDF:', err);
    process.exit(1);
  });
}

module.exports = { gerarTutorialNotionWorkspace };
