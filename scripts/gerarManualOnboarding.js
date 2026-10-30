'use strict';
const path = require('path');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const { simularModuloOnboarding } = require('./simulacoesCanvas');

async function figura(doc, buffer, w = 920, h = 530) {
  const largura = LARGURA_UTIL;
  const altura = (largura * h) / w;
  await doc.imagem(buffer, {
    largura,
    altura,
    espacoDepois: 12,
  });
}

async function gerarManualMembroOnboarding() {
  const doc = new DocBuilder(
    'Manual do Voluntário • Onboarding e Termo Gov.br',
    'CyberGuard UTFPR • Regularização Documental e Assinatura ICP-Brasil'
  );
  await doc.init();

  doc.cabecalhoDocumento(
    'Guia do Ingressante • Regularização Jurídica',
    'Manual do Membro: Onboarding e Assinatura Gov.br',
    'Passo a passo completo desde a entrada no servidor, formulário interativo de 13 etapas, assinatura digital no portal Gov.br e validação criptográfica.'
  );

  doc.secao('1', 'O que é o Onboarding e sua Necessidade Legal');
  doc.paragrafo(
    'O processo de onboarding do CyberGuard assegura a conformidade jurídica com a Lei Federal do Voluntariado (Lei nº 9.608/1998) e as diretrizes da Diretoria de Relações Empresariais e Comunitárias (DIREC) da UTFPR. Todo voluntário ativo do projeto deve possuir Termo de Adesão homologado e assinado digitalmente.'
  );
  doc.alerta(
    'Trilha da Comunidade (Entusiastas)',
    'Estudantes e interessados que entram no servidor exclusivamente para networking, workshops e comunidade sem compromisso de voluntariado formal recebem o cargo Entusiasta de forma automática e são totalmente dispensados do processo de onboarding.',
    'info'
  );

  doc.secao('2', 'Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018)');
  doc.paragrafo(
    'Antes de qualquer coleta de dados, o bot solicita seu consentimento expresso através do Termo de Ciência e Privacidade na DM. Asseguramos que:'
  );
  doc.listaItem('Finalidade Exclusiva: os dados são usados unicamente para confecção do termo institucional e registros acadêmicos.');
  doc.listaItem('Criptografia AES-256-GCM: dados sensíveis (CPF, data de nascimento, endereço e telefone) são cifrados com chave dedicada antes de serem salvos no banco de dados.');
  doc.listaItem('Mascaramento e Sanitização: no canal do RH, seus dados são exibidos de forma mascarada e os arquivos temporários são deletados com segurança.');

  doc.secao('3', 'Interface Simulada do Processo no Discord');
  doc.paragrafo(
    'A ilustração a seguir apresenta o fluxo de interação na DM do bot, aprovação pelo RH e validação da assinatura Gov.br:'
  );

  // Inserção da Simulação
  await figura(doc, simularModuloOnboarding(), 920, 530);

  doc.secao('4', 'Jornada Passo a Passo do Integrante');
  doc.subsecao('Passo 1: Aceite da LGPD e Coleta Guiada (13 Etapas)');
  doc.paragrafo(
    'Ao entrar no Discord, você receberá uma Mensagem Direta do CyberGuard Bot. Clique em "Concordo" para iniciar. O bot solicitará Nome Completo, CPF (com validação de dígitos), Data de Nascimento, RA acadêmico, Curso, Período, Endereço e Área de Interesse (Hacking Ético, Design, Hardware Hacking, Recursos Humanos ou Social Media).'
  );

  doc.subsecao('Passo 2: Revisão do RH e Geração do PDF');
  doc.paragrafo(
    'A diretoria de RH analisa seu cadastro. Após a aprovação, o bot preenche automaticamente o modelo oficial da UTFPR e envia o PDF na sua DM com um campo de data preenchível ("data_assinatura") ao lado de "Local: Cornélio Procópio".'
  );

  doc.subsecao('Passo 3: Assinatura Digital no Portal Gov.br');
  doc.listaItem('1. Acesse o portal oficial: assinador.iti.br (ou aplicativo Gov.br no smartphone).');
  doc.listaItem('2. Faça login com sua conta prata ou ouro do Gov.br.');
  doc.listaItem('3. Faça upload do PDF enviado pelo bot.');
  doc.listaItem('4. Posicione o carimbo da assinatura exatamente sobre a linha "Voluntário(a)" da tabela de aceite.');
  doc.listaItem('5. Baixe o PDF assinado gerado pelo Gov.br.');

  doc.subsecao('Passo 4: Envio do Termo Assinado e Validação Instantânea');
  doc.paragrafo(
    'Arraste o PDF assinado na DM do bot. O sistema realiza a validação criptográfica do certificado ICP-Brasil em menos de 3 segundos. Estando tudo correto, o cargo oficial "Membro CyberGuard" é concedido e você é provisionado no Notion Workspace do projeto.'
  );

  doc.secao('5', 'Principais Motivos de Reprovação Automática');
  doc.tabela(
    [
      { nome: 'Problema Detectado', largura: 165 },
      { nome: 'Causa Provável', largura: 175 },
      { nome: 'Como Solucionar', largura: 160 },
    ],
    [
      ['Sem assinatura ICP-Brasil', 'PDF impresso ou salvo sem certificado digital', 'Assinar via assinador.iti.br'],
      ['Assinatura fora de posição', 'Carimbo colocado sobre o texto ou na página errada', 'Assinar sobre a linha "Voluntário(a)"'],
      ['Data em branco ou futura', 'Aluno não informou a data em Cornélio Procópio', 'Preencher data real até 90 dias'],
      ['Arquivo corrompido / não PDF', 'Envio de foto ou documento danificado', 'Reenviar arquivo .pdf original'],
    ]
  );

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Membro_Onboarding_GovBr.pdf'));
  console.log('[PDF] Gerado com sucesso: docs/manuais/Manual_Membro_Onboarding_GovBr.pdf');
}

module.exports = { gerarManualMembroOnboarding };

if (require.main === module) {
  gerarManualMembroOnboarding().catch(console.error);
}
