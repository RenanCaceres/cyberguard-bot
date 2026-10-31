'use strict';
/**
 * scripts/gerarManualSuporteDuvidas.js
 * Compila o manual oficial do membro para a Central de Apoio & Dúvidas,
 * documentação interativa e tira-dúvidas com IA Gemini e Liderança.
 */
const path = require('path');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const {
  simularModuloSuportePainel,
  simularModuloSuporteIA,
  simularModuloSuporteLideranca,
} = require('./simulacoesCanvas');

async function figura(doc, buffer, w = 920, h = 550) {
  const largura = LARGURA_UTIL;
  const altura = (largura * h) / w;
  await doc.imagem(buffer, {
    largura,
    altura,
    espacoDepois: 12,
  });
}

async function gerarManualCentralSuporteDuvidas() {
  const doc = new DocBuilder(
    'Manual do Membro • Central de Apoio & Dúvidas',
    'CyberGuard UTFPR • Guia de Atendimento ao Integrante, IA e Manuais'
  );
  await doc.init();

  // 1. Cabeçalho Principal
  doc.cabecalhoDocumento(
    'Guia do Integrante • Suporte e Atendimento',
    'Manual do Membro: Central de Apoio, Manuais e Dúvidas com IA',
    'Conheça a Central de Dúvidas (#dúvidas): como consultar regras e manuais em PDF, tirar dúvidas em tempo real com a Inteligência Artificial (Gemini 3.8-Flash) e enviar chamados com protocolo direto para a Liderança com resposta na sua DM do Discord.'
  );

  // 2. Seção 1: O que é a Central de Apoio
  doc.secao('1', 'O que é a Central de Apoio & Dúvidas e seu Objetivo');
  doc.paragrafo(
    'O CyberGuard é um projeto de extensão universitária voltado à Inteligência de Ameaças Cibernéticas e Segurança Ofensiva (UTFPR - Câmpus Cornélio Procópio). Com o crescimento do time e a implementação de múltiplos módulos autônomos (Ponto Eletrônico, Declarações de Voluntariado, Termos Onboarding Gov.br, Reuniões e LGPD), foi criada a Central de Apoio & Dúvidas com a finalidade de desburocratizar o suporte ao integrante, garantindo respostas rápidas, padronizadas e confidenciais.'
  );
  doc.paragrafo('Principais objetivos da Central:');
  doc.listaItem('Disponibilizar manuais e regras oficiais em PDF de qualquer módulo com apenas um clique.');
  doc.listaItem('Fornecer atendimento autônomo 24 horas por dia através de Inteligência Artificial contextualizada com o regimento do projeto.');
  doc.listaItem('Garantir um canal direto, rastreável e seguro com a coordenação quando houver situações particulares ou necessidade de análise humana.');
  doc.listaItem('Assegurar privacidade absoluta: todas as dúvidas tiradas pelo painel são privadas (mensagens efêmeras) e não expõem o integrante.');

  doc.alerta(
    'Onde encontrar a Central de Atendimento?',
    'A Central fica fixada no canal permanente #dúvidas do servidor do Discord. Além disso, o catálogo de documentações pode ser acessado de qualquer lugar usando o comando /documentacao.',
    'info'
  );

  // 3. Seção 2: Estrutura do Painel e as 3 Vias de Atendimento
  doc.secao('2', 'Estrutura do Painel e as Três Vias de Atendimento');
  doc.paragrafo(
    'O painel oficial conta com três botões interativos, cada um planejado para um nível específico de suporte:'
  );

  doc.tabela(
    [
      { nome: 'Opção do Painel', largura: 130 },
      { nome: 'Quando Utilizar', largura: 220 },
      { nome: 'Tempo de Resposta', largura: 153 },
    ],
    [
      [
        'Regras e Manuais (PDF)',
        'Consultar o passo a passo ilustrado, fluxos operacionais e baixar PDFs oficiais dos módulos.',
        'Instantâneo (Download direto)',
      ],
      [
        'Tirar Dúvida com IA',
        'Tirar dúvidas sobre regras gerais, prazos, cálculo de horas de voluntariado, faltas e LGPD.',
        '1 a 3 segundos (Tempo real)',
      ],
      [
        'Dúvidas com a Liderança',
        'Casos particulares, correções de horas, alinhamentos regimentais ou justificativas complexas.',
        'Assíncrono (Via e-mail -> DM)',
      ],
    ]
  );

  doc.subsecao('Interface Visual da Central no Discord');
  doc.paragrafo(
    'A imagem abaixo demonstra o painel de atendimento que permanece fixado no canal de suporte:'
  );

  // Inserção do Mockup 1: Painel Principal
  await figura(doc, simularModuloSuportePainel(), 920, 550);

  // 4. Seção 3: Módulo de Regras e Manuais em PDF
  doc.secao('3', 'Como Consultar Regras e Baixar Manuais Oficiais');
  doc.paragrafo(
    'Ao clicar no botão "Regras e Manuais (PDF)" ou ao executar o comando /documentacao, o bot abre um menu de seleção interativo (Select Menu) com os seguintes módulos disponíveis:'
  );

  doc.listaItem('Ponto Eletrônico & Gestão de Horas: registro de expediente, vínculo com demandas no Notion, limites de segurança e checagem horária.');
  doc.listaItem('Declaração de Voluntariado: solicitação de horas para AC, cálculo automático (4h, 8h ou 10h) e trâmite com assinatura Gov.br do coordenador.');
  doc.listaItem('Processo Disciplinar & Advertências: regras de conduta, ampla defesa, prazos de 7 dias para contraditório e expiração após 90 dias.');
  doc.listaItem('Onboarding & Termo Gov.br: fluxo completo em 13 etapas, assinatura digital ICP-Brasil e trilha de entusiastas.');
  doc.listaItem('Atas de Reunião com IA: gravação por participante, direito de opt-out LGPD e síntese executiva em PDF.');
  doc.listaItem('Portal LGPD & Meus Dados: consulta privada de dados pessoais e retificação cadastral via formulário interativo.');

  doc.alerta(
    'Entrega Privada e Efêmera',
    'Tanto a prévia das regras quanto o arquivo PDF anexado são entregues em modo efêmero ("Só você pode ver esta mensagem"). Dessa forma, o canal permanece limpo e organizado.',
    'sucesso'
  );

  // 5. Seção 4: Tira-Dúvidas com Inteligência Artificial (Gemini 3.8-Flash)
  doc.secao('4', 'Tira-Dúvidas Instantâneo com Inteligência Artificial');
  doc.paragrafo(
    'O CyberGuard Bot integra o modelo de linguagem Gemini 3.8-Flash do Google, alimentado com uma base de conhecimento detalhada contendo todas as diretrizes institucionais do projeto, regimentos da UTFPR e normas da LGPD.'
  );

  doc.subsecao('Como Utilizar o Assistente IA:');
  doc.listaItem('1. Clique no botão "Tirar Dúvida com IA (Gemini)" no painel do canal #dúvidas.');
  doc.listaItem('2. Uma janela (Modal) será aberta na tela com um campo de até 1.000 caracteres.');
  doc.listaItem('3. Escreva sua dúvida em linguagem natural (ex: "Como justifico uma falta?", "Por que preciso assinar o termo Gov.br?").');
  doc.listaItem('4. Clique em "Enviar". Em até 3 segundos o bot retornará a orientação oficial completa.');

  doc.subsecao('Demonstração Visual do Atendimento com IA');
  doc.paragrafo(
    'A imagem abaixo ilustra a janela do formulário interativo e o cartão de resposta gerado pela IA:'
  );

  // Inserção do Mockup 2: Modal IA e Resposta
  await figura(doc, simularModuloSuporteIA(), 920, 560);

  doc.subsecao('Exemplos de Dúvidas que a IA Resolve:');
  doc.listaItem('Horas de Atividades Complementares: "Quantas horas semanais recebo como membro ou vice-líder?"');
  doc.listaItem('Privacidade e LGPD: "Por que o bot pede meu CPF e endereço no onboarding?"');
  doc.listaItem('Regras de Ponto: "O que acontece se eu esquecer o ponto aberto ou minha conexão cair?"');
  doc.listaItem('Advertências e Recursos: "Qual é o meu prazo para recorrer de uma advertência?"');

  doc.alerta(
    'Limitações Éticas da IA',
    'A Inteligência Artificial atua como assistente consultivo e informativo. Ela não pode alterar pontos, cancelar advertências ou aprovar horas no Notion. Para essas ações, utilize o canal da Liderança.',
    'aviso'
  );

  // 6. Seção 5: Atendimento com a Liderança (E-mail & Discord)
  doc.secao('5', 'Atendimento com a Liderança (Integração E-mail & Discord)');
  doc.paragrafo(
    'Quando sua dúvida exigir análise da coordenação, revisão de histórico de atividades ou alinhamento confidencial, você pode acionar a liderança diretamente pelo Discord com envio transparente por e-mail.'
  );

  doc.subsecao('Passo a Passo do Fluxo de Chamado:');
  doc.listaItem('1. Clique no botão "Tirar Dúvidas Comigo (Liderança)" no canal #dúvidas.');
  doc.listaItem('2. Preencha o Assunto (tópico principal) e Descreva sua Dúvida com clareza.');
  doc.listaItem('3. O bot gera imediatamente um Protocolo Único de Atendimento (ex: #DUVIDA-0000).');
  doc.listaItem('4. Um e-mail seguro é disparado automaticamente para a coordenação do projeto via SMTP.');
  doc.listaItem('5. A liderança recebe a mensagem e pode responder diretamente pelo seu e-mail (Gmail, celular ou webmail).');
  doc.listaItem('6. O bot monitora a caixa postal (IMAP a cada 60s), extrai a resposta e entrega diretamente na sua Mensagem Direta (DM) do Discord!');

  doc.subsecao('Demonstração Visual do Fluxo de Chamado e Resposta');
  doc.paragrafo(
    'A simulação abaixo demonstra o registro do chamado e a entrega automatizada na DM do integrante:'
  );

  // Inserção do Mockup 3: Chamado e DM
  await figura(doc, simularModuloSuporteLideranca(), 920, 560);

  doc.alerta(
    'Garantia de Entrega (Fallback de DM Fechada)',
    'Caso suas mensagens diretas (DMs) estejam configuradas como privadas no Discord, o bot não descartará a resposta: ele enviará uma notificação segura no canal #dúvidas marcando seu usuário para que você não perca o retorno da coordenação.',
    'sucesso'
  );

  // 7. Seção 6: Segurança da Informação e LGPD
  doc.secao('6', 'Privacidade, Segurança da Informação e LGPD');
  doc.paragrafo(
    'Todo o fluxo de atendimento da Central de Apoio foi arquitetado em estrita conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018):'
  );

  doc.listaItem('Efemeridade das Interações: todas as consultas a manuais e interações com a IA utilizam flags efêmeras. Nenhum outro membro no Discord tem acesso ao conteúdo das suas pesquisas.');
  doc.listaItem('Criptografia em Repouso: os registros e protocolos de suporte no banco de dados mantêm seus dados pessoais protegidos sob padrão AES-256-GCM.');
  doc.listaItem('Sanitização de E-mails: as respostas de e-mail capturadas pelo IMAP passam por filtros de segurança que removem tags de rastreamento, scripts e rodapés institucionais desnecessários.');
  doc.listaItem('Scanner LGPD-Guard Ativo: todo o código-fonte do bot e os geradores de documentação passam por auditoria automática contínua em CI/CD.');

  // 8. Seção 7: Resumo dos Comandos Úteis
  doc.secao('7', 'Resumo de Comandos Rápidos do Integrante');
  doc.tabela(
    [
      { nome: 'Comando Slash', largura: 160 },
      { nome: 'Finalidade / O que faz', largura: 220 },
      { nome: 'Disponibilidade', largura: 123 },
    ],
    [
      ['/documentacao', 'Abre a central de manuais, resumos em PDF e tira-dúvidas.', 'Todos os canais'],
      ['/documentacao [modulo]', 'Abre diretamente o módulo escolhido com o PDF em anexo.', 'Todos os canais'],
      ['/documentacao [duvida]', 'Envia a dúvida digitada direto para o Gemini responder.', 'Todos os canais'],
      ['/painel-duvidas', 'Atualiza e fixa o painel de suporte no canal #dúvidas.', 'Apenas Liderança/RH'],
      ['/meus-dados visualizar', 'Consulta de dados cadastrais salvos de forma confidencial.', 'Mensagem efêmera'],
    ]
  );

  const caminhoSaida = path.join(__dirname, '../docs/manuais/Manual_Membro_Central_Suporte_Duvidas.pdf');
  await doc.salvar(caminhoSaida);
  console.log(`[PDF] Manual da Central de Apoio gerado com sucesso: ${caminhoSaida}`);
}

module.exports = { gerarManualCentralSuporteDuvidas };

if (require.main === module) {
  gerarManualCentralSuporteDuvidas().catch(console.error);
}
