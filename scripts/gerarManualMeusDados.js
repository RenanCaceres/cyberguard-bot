'use strict';
const path = require('path');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const { simularModuloMeusDados } = require('./simulacoesCanvas');

async function figura(doc, buffer, w = 920, h = 510) {
  const largura = LARGURA_UTIL;
  const altura = (largura * h) / w;
  await doc.imagem(buffer, {
    largura,
    altura,
    espacoDepois: 12,
  });
}

async function gerarManualLGPDMeusDados() {
  const doc = new DocBuilder(
    'Manual do Membro • Privacidade e LGPD',
    'CyberGuard UTFPR • Portal do Titular de Dados e Direitos Fundamentais'
  );
  await doc.init();

  doc.cabecalhoDocumento(
    'Guia do Integrante • Privacidade e Direitos do Titular',
    'Manual do Membro: Portal LGPD e /meus-dados',
    'Como consultar seus dados cadastrais de forma 100% privada e efêmera, retificar informações de contato e exercer seus direitos sob a LGPD (Lei nº 13.709/2018).'
  );

  doc.secao('1', 'Compromisso Institucional com a LGPD');
  doc.paragrafo(
    'O CyberGuard adota práticas rigorosas de segurança da informação e governança em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018). Todos os dados pessoais tratados pelo projeto possuem finalidade legítima e acadêmica, respaldada pelas bases legais de cumprimento de obrigação legal e execução de contrato de voluntariado (Arts. 7º e 11 da LGPD).'
  );

  doc.secao('2', 'Seus Direitos como Titular de Dados (Art. 18)');
  doc.paragrafo('O integrante dispõe dos seguintes mecanismos autônomos integrados ao bot:');
  doc.listaItem('Direito de Acesso e Transparência: consultar a qualquer momento todos os dados cadastrais mantidos nos registros.');
  doc.listaItem('Direito de Retificação: atualizar telefone, e-mail, curso, período ou endereço sem burocracia através de modais interativos.');
  doc.listaItem('Direito de Oposição e Revogação: solicitar a exclusão de dados não obrigatórios ou revogar consentimentos.');
  doc.listaItem('Direito à Segurança: proteção com criptografia de ponta a ponta (AES-256-GCM) em repouso.');

  doc.secao('3', 'Interface Simulada do Portal no Discord');
  doc.paragrafo(
    'A imagem abaixo demonstra o painel privado (efêmero) exibido ao executar o comando /meus-dados visualizar:'
  );

  // Inserção da Simulação
  await figura(doc, simularModuloMeusDados(), 920, 510);

  doc.secao('4', 'Comandos do Portal de Privacidade');
  doc.subsecao('1. /meus-dados visualizar');
  doc.paragrafo(
    'Exibe um card de resumo exclusivo para o seu usuário (mensagem efêmera que ninguém mais no servidor pode visualizar). Nele constam seu RA, Nome, CPF mascarado, curso, área e o total de horas registradas no Ponto Eletrônico.'
  );

  doc.subsecao('2. /meus-dados atualizar');
  doc.paragrafo(
    'Abre uma janela de formulário (Modal) permitindo a edição imediata de: novo e-mail, telefone de contato, endereço residencial e curso/período. Ao salvar, os dados são re-criptografados no banco e um log de auditoria é encaminhado ao canal do RH.'
  );

  doc.subsecao('3. /meus-dados privacidade');
  doc.paragrafo(
    'Exibe na íntegra o Termo de Ciência e Privacidade LGPD acordado no onboarding e disponibiliza botões diretos para envio de solicitações formais à diretoria de Recursos Humanos.'
  );

  doc.secao('5', 'Políticas de Retenção e Segurança Técnica');
  doc.tabela(
    [
      { nome: 'Elemento de Segurança', largura: 170 },
      { nome: 'Tecnologia Utilizada', largura: 160 },
      { nome: 'Finalidade / Garantia', largura: 170 },
    ],
    [
      ['Criptografia em Repouso', 'AES-256-GCM com IV aleatório', 'Proteção de CPF, endereço e contatos'],
      ['Privacidade de Mensagem', 'Discord Ephemeral Flags', 'Respostas visíveis apenas para o titular'],
      ['Auditoria Contínua', 'LGPD-Guard CI/CD Scanner', 'Bloqueio de vazamentos e logs indevidos'],
      ['Desligamento Seguro', 'Revogação Notion + Arquivo Criptografado', 'Histórico institucional protegido'],
    ]
  );

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Membro_LGPD_MeusDados.pdf'));
  console.log('[PDF] Gerado com sucesso: docs/manuais/Manual_Membro_LGPD_MeusDados.pdf');
}

module.exports = { gerarManualLGPDMeusDados };

if (require.main === module) {
  gerarManualLGPDMeusDados().catch(console.error);
}
