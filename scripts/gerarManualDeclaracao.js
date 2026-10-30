'use strict';
const path = require('path');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const F = require('./fluxosCanvas');
const { simularModuloDeclaracao } = require('./simulacoesCanvas');

// Insere uma figura de fluxo na largura útil, mantendo a proporção.
async function figura(doc, fig, escala = 1.0) {
  const largura = LARGURA_UTIL * escala;
  const altura = (largura * fig.altura) / fig.largura;
  await doc.imagem(fig.buffer, {
    largura,
    altura,
    espacoDepois: 12,
  });
}

async function gerarManualMembroDeclaracao() {
  const doc = new DocBuilder(
    'Manual do Membro | Declaração de Voluntariado',
    'CyberGuard UTFPR | Emissão Automatizada de Documentos e Horas'
  );
  await doc.init();

  doc.cabecalhoDocumento(
    'Guia do Integrante | Documentos Oficiais',
    'Manual do Membro: Declaração de Voluntariado',
    'Como emitir sua comprovação oficial de participação, regras de carga horária (Membros, Vice-Líderes e Líderes), fluxo de assinatura digital no Gov.br e entrega automática por DM.'
  );

  doc.secao('1', 'O que é a Declaração de Voluntariado e sua Validade');
  doc.paragrafo(
    'A Declaração de Voluntariado é o documento formal emitido pelo projeto de extensão CyberGuard (UTFPR - Câmpus Cornélio Procópio) que atesta a sua participação ativa no projeto, especificando a data oficial de ingresso, o curso de graduação vinculado e o regime de carga horária semanal correspondente à sua função (4 horas semanais para membros regulares, 8 horas semanais para vice-líderes ou 10 horas semanais para líderes).'
  );
  doc.paragrafo('Principais finalidades do documento:');
  doc.listaItem('Aproveitamento em Atividades Complementares (AC) e horas de extensão na graduação da UTFPR.');
  doc.listaItem('Comprovação de experiência prática em segurança da informação para currículo profissional (LinkedIn, Lattes, portfólio).');
  doc.listaItem('Apresentação formal em processos seletivos de estágio, bolsas de pesquisa ou programas de pós-graduação.');
  doc.alerta(
    'Validade Jurídica Nacional (Gov.br)',
    'A declaração é assinada digitalmente pelo Coordenador do Projeto, Prof. André Luiz Przybysz, através do Assinador Eletrônico Oficial Gov.br (ICP-Brasil), possuindo plena eficácia e validade jurídica reconhecida pela Lei Federal nº 14.063/2020.',
    'info'
  );

  doc.secao('2', 'Requisitos Prévios e Regra de Carga Horária (4h, 8h e 10h)');
  doc.paragrafo('Para que a emissão automatizada ocorra sem impedimentos, o integrante deve atender aos seguintes critérios:');
  doc.listaItem('Cadastro no Banco de Dados: ter concluído o onboarding ou possuir registro ativo na tabela de membros com Nome Completo e RA.');
  doc.listaItem('Data de Início Registrada: o sistema utiliza a data de início extraída do seu termo de voluntariado assinado (ou 05/2026 como padrão institucional caso não informada).');
  doc.listaItem('Sem Solicitação Pendente: o sistema permite apenas 1 solicitação aberta por vez (status "aguardando_assinatura_professor"), evitando duplicidade de e-mails ao coordenador.');
  doc.subsecao('Cálculo Automático da Carga Horária Semanal:');
  doc.listaItem('Membros Regulares (4 horas semanais): atribuída automaticamente aos integrantes das áreas técnicas e operacionais.');
  doc.listaItem('Vice-Líderes (8 horas semanais): atribuída automaticamente a quem possui o cargo de vice-liderança (ROLE_VICE_LIDER_ID / ROLE_VICE_LIDER_NOME) no Discord.');
  doc.listaItem('Líderes e Presidência (10 horas semanais): atribuída automaticamente a quem possui o cargo de liderança ("Líderes" / "Lideres") ou Presidência no servidor do Discord.');
  doc.alerta(
    'Dados Cadastrais Incompletos?',
    'Se ao executar o comando o bot informar que seus dados não foram localizados, entre em contato imediatamente com o RH no canal institucional do servidor para cadastramento ou retificação cadastral.',
    'aviso'
  );

  doc.secao('3', 'Passo a Passo: Como Solicitar no Discord');
  doc.subsecao('1. Executando o Comando');
  doc.paragrafo(
    'No servidor do CyberGuard, acesse qualquer canal de comandos ou texto e digite: /declaracao solicitar'
  );
  doc.subsecao('2. Confirmação de Dados e Protocolo');
  doc.paragrafo(
    'O bot verificará seu cadastro e seu cargo no servidor, responderá de forma privada e efêmera (visível apenas para você) e exibirá o resumo oficial da emissão:'
  );
  doc.listaItem('Código da Solicitação: protocolo único rastreável no formato #DECL-<RA>-<4 dígitos> (ex.: #DECL-0000000-1234).');
  doc.listaItem('Aluno, RA e Curso vinculados ao seu registro institucional.');
  doc.listaItem('Início no Projeto e Carga Horária semanal calculada automaticamente (4 horas, 8 horas ou 10 horas semanais).');
  doc.listaItem('Confirmação do envio imediato ao e-mail institucional do coordenador.');

  doc.subsecao('3. Simulação Visual no Discord (Comando e Entrega em DM)');
  doc.paragrafo('A imagem abaixo demonstra o card oficial emitido e o recebimento do documento assinado:');
  const simDecl = simularModuloDeclaracao();
  await doc.imagem(simDecl, { largura: LARGURA_UTIL, altura: (LARGURA_UTIL * 520) / 920, espacoDepois: 12 });

  doc.secao('4', 'Fluxo Completo de Tramitação e Assinatura');
  doc.paragrafo(
    'O diagrama abaixo apresenta todas as etapas do processo, desde a solicitação inicial até a entrega final na sua DM e arquivamento no RH:'
  );

  // Inserção do fluxograma renderizado no Canvas
  await figura(doc, F.fluxoDeclaracao(), 0.70);

  doc.subsecao('Etapas Detalhadas:');
  doc.listaItem('Etapa 1 - Solicitação: o integrante aciona o comando /declaracao solicitar no Discord.');
  doc.listaItem('Etapa 2 - Geração: o bot identifica a carga horária (4h, 8h ou 10h), preenche o template oficial da UTFPR com a data por extenso, converte para PDF via LibreOffice e registra o protocolo no PostgreSQL.');
  doc.listaItem('Etapa 3 - Disparo por E-mail: o PDF gerado é enviado via SMTP com instruções ao Prof. André Luiz Przybysz.');
  doc.listaItem('Etapa 4 - Assinatura Gov.br: o coordenador assina digitalmente no portal Gov.br e responde ao mesmo e-mail anexando o PDF assinado.');
  doc.listaItem('Etapa 5 - Captura IMAP: o bot monitora a caixa de entrada a cada 1 minuto (e sob demanda), localiza a resposta pelo código #DECL-, valida o cabeçalho binário (%PDF) e arquiva o documento.');
  doc.listaItem('Etapa 6 - Entrega e Arquivo: o bot envia o PDF assinado na DM do aluno, marca o e-mail como lido e posta cópia comprobatória no canal do RH.');

  doc.secao('5', 'Como Acompanhar o Andamento (/declaracao status)');
  doc.paragrafo(
    'Você pode consultar o histórico das suas últimas 10 solicitações (incluindo status, data de início, carga horária registrada e RA) a qualquer momento usando o comando: /declaracao status'
  );
  doc.subsecao('Status Possíveis:');
  doc.listaItem('[Aguardando] Aguardando assinatura do Prof. André: o documento foi enviado e aguarda a assinatura e resposta por e-mail.');
  doc.listaItem('[OK] Assinada e Entregue: o coordenador já assinou, respondeu ao e-mail e o documento foi enviado na sua DM.');
  doc.listaItem('[Erro] Cancelada: a solicitação foi cancelada por inconsistência de dados ou solicitação do RH.');
  doc.alerta(
    'Sincronização Instantânea Sob Demanda',
    'Ao executar /declaracao status, o bot força uma varredura IMAP imediata na caixa de entrada do e-mail antes de exibir a resposta. Se o professor acabou de responder, seu documento será baixado e entregue na sua DM no mesmo instante!',
    'sucesso'
  );

  doc.secao('6', 'Especificações Técnicas e Prazos');
  doc.tabela(
    [
      { nome: 'Parâmetro', largura: 130 },
      { nome: 'Valor / Especificação', largura: 175 },
      { nome: 'Observações', largura: 195 },
    ],
    [
      ['Carga Horária (Membro)', '4 horas semanais', 'Padrão para membros regulares das áreas'],
      ['Carga Horária (Vice-Líder)', '8 horas semanais', 'Atribuída ao cargo de Vice-Líder (ROLE_VICE_LIDER_ID)'],
      ['Carga Horária (Líder)', '10 horas semanais', 'Atribuída automaticamente a Líderes e Presidente'],
      ['Tipo de Assinatura', 'Digital Gov.br (ICP-Brasil)', 'Plena validade jurídica (Lei 14.063/2020)'],
      ['Ciclo de Checagem', 'A cada 1 min + sob demanda', 'Monitoramento autônomo via protocolo IMAP'],
      ['Prazo Típico', '1 a 3 dias úteis', 'Conforme disponibilidade de agenda do coordenador'],
      ['Canal de Entrega', 'DM do Aluno + Canal do RH', 'PDF assinado entregue no privado e arquivado'],
    ]
  );

  doc.secao('7', 'Perguntas Frequentes (FAQ) e Solução de Problemas');
  doc.subsecao('1. "O bot informou que meus dados cadastrais não foram encontrados"');
  doc.paragrafo(
    'Isso ocorre caso você seja um membro legado ou tenha entrado no projeto sem registro completo de Nome e RA na tabela de membros. Envie uma mensagem ao RH informando seu Nome Completo, RA, Curso e data de entrada para atualização no banco.'
  );

  doc.subsecao('2. "Sou líder ou vice-líder, mas minha declaração saiu com 4 horas (ou vice-versa). Como proceder?"');
  doc.paragrafo(
    'O bot verifica seus cargos no Discord no exato momento da solicitação: Líderes recebem 10 horas semanais, Vice-Líderes (ROLE_VICE_LIDER_ID) recebem 8 horas semanais, e Membros regulares recebem 4 horas semanais. Caso seu cargo ainda não estivesse atribuído no servidor quando você executou o comando, peça ao RH para atribuir seu cargo e cancelar a solicitação anterior antes de emitir uma nova.'
  );

  doc.subsecao('3. "Minha data de início está incorreta. Como corrigir?"');
  doc.paragrafo(
    'A data de início é extraída automaticamente do seu termo de voluntariado assinado (mês/ano). Caso identifique divergência, avise a equipe de Recursos Humanos para atualização no banco de dados e nova emissão.'
  );

  doc.subsecao('4. "O professor assinou, mas não recebi nada na minha DM do Discord"');
  doc.paragrafo(
    'Verifique se suas Mensagens Diretas estão abertas para membros do servidor ("Configurações do Usuário" > "Privacidade e Segurança"). Mesmo que sua DM estivesse fechada no momento da captura, uma cópia fica arquivada com o RH no servidor e na pasta institucional de declarações assinadas.'
  );

  doc.subsecao('5. "Como validar a autenticidade da assinatura digital do documento?"');
  doc.paragrafo(
    'Qualquer pessoa ou instituição pode verificar a integridade da assinatura acessando o Validador Oficial do Governo Federal (ITI) em: https://validar.iti.gov.br. Basta enviar o PDF recebido para atestar a assinatura do Prof. André Luiz Przybysz.'
  );

  const caminhoSaida = path.join(__dirname, '../docs/manuais/Manual_Membro_Declaracao_Voluntariado.pdf');
  await doc.salvar(caminhoSaida);
  return caminhoSaida;
}

if (require.main === module) {
  gerarManualMembroDeclaracao().catch(console.error);
}

module.exports = { gerarManualMembroDeclaracao };
