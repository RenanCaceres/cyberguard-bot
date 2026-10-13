'use strict';
const path = require('path');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const F = require('./fluxosCanvas');

// Insere uma figura de fluxo na largura útil, mantendo a proporção.
async function figura(doc, fig) {
  await doc.imagem(fig.buffer, {
    largura: LARGURA_UTIL,
    altura: (LARGURA_UTIL * fig.altura) / fig.largura,
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
    'Como emitir sua comprovação oficial de participação, entender o fluxo de assinatura digital com a coordenação e receber seu documento assinado.'
  );

  doc.secao('1', 'O que é a Declaração de Voluntariado e sua Validade');
  doc.paragrafo(
    'A Declaração de Voluntariado é o documento formal emitido pelo projeto de extensão CyberGuard (UTFPR - Câmpus Cornélio Procópio) que atesta a sua participação ativa no projeto, especificando a data oficial de ingresso, regime de carga horária semanal (10 horas) e o curso de graduação vinculado.'
  );
  doc.paragrafo('Principais finalidades do documento:');
  doc.listaItem('Aproveitamento em Atividades Complementares (AC) e extracurriculares na graduação da UTFPR.');
  doc.listaItem('Comprovação de experiência prática em segurança da informação para currículo profissional (LinkedIn, Lattes, portfólio).');
  doc.listaItem('Apresentação formal em processos seletivos de estágio, bolsas de pesquisa ou programas de pós-graduação.');
  doc.alerta(
    'Validade Jurídica Nacional (Gov.br)',
    'A declaração é assinada digitalmente pelo Coordenador do Projeto, Prof. André Luiz Przybysz, através do Assinador Eletrônico Oficial Gov.br (ICP-Brasil), possuindo plena eficácia e validade jurídica reconhecida pela Lei Federal nº 14.063/2020.',
    'info'
  );

  doc.secao('2', 'Requisitos Prévios para a Emissão');
  doc.paragrafo('Para que a emissão automatizada ocorra sem impedimentos, o integrante deve atender aos seguintes critérios:');
  doc.listaItem('Cadastro no Banco de Dados: ter concluído o onboarding ou possuir registro ativo com Nome, RA e Curso.');
  doc.listaItem('Data de Início Registrada: o sistema utiliza a data de início constante no seu termo de voluntariado arquivado.');
  doc.listaItem('Sem Solicitação Pendente: o sistema permite uma solicitação aberta por vez, evitando duplicidade de e-mails.');
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
    'O bot responderá de forma privada e efêmera (visível apenas para você) com o resumo dos seus dados:'
  );
  doc.listaItem('Código da Solicitação: protocolo único gerado (exemplo: #DECL-2525526-5107).');
  doc.listaItem('Nome Completo, RA e Curso vinculados.');
  doc.listaItem('Data de Início no projeto e Carga Horária semanal oficial (10 horas).');
  doc.listaItem('Aviso de envio automático ao e-mail institucional do coordenador.');

  doc.secao('4', 'Fluxo Completo de Tramitação e Assinatura');
  doc.paragrafo(
    'O diagrama abaixo apresenta todas as etapas do processo, desde a solicitação inicial até a entrega final na sua DM:'
  );

  // Inserção do fluxograma renderizado no Canvas
  await figura(doc, F.fluxoDeclaracao());

  doc.subsecao('Etapas Detalhadas:');
  doc.listaItem('Etapa 1 - Solicitação: o integrante aciona o comando /declaracao solicitar no Discord.');
  doc.listaItem('Etapa 2 - Geração: o bot preenche o template oficial da UTFPR, cria o PDF e registra o protocolo no banco.');
  doc.listaItem('Etapa 3 - Disparo por E-mail: o PDF gerado é enviado via SMTP com instruções ao Prof. André Luiz Przybysz.');
  doc.listaItem('Etapa 4 - Assinatura Gov.br: o coordenador assina digitalmente no portal Gov.br e responde o e-mail com anexo.');
  doc.listaItem('Etapa 5 - Captura IMAP: o bot checa a caixa a cada 1 minuto, localiza o e-mail pelo código e baixa o PDF.');
  doc.listaItem('Etapa 6 - Entrega e Arquivo: o bot entrega o PDF assinado na DM do aluno e notifica o RH no canal interno.');

  doc.secao('5', 'Como Acompanhar o Andamento');
  doc.paragrafo(
    'Você pode consultar o status da sua solicitação a qualquer momento usando o comando: /declaracao status'
  );
  doc.subsecao('Status Possíveis:');
  doc.listaItem('[Aguardando] Aguardando assinatura do Prof. André: o documento foi enviado e aguarda a assinatura e devolutiva por e-mail.');
  doc.listaItem('[OK] Assinada e Entregue: o coordenador já assinou, respondeu o e-mail e o documento foi enviado na sua DM.');
  doc.listaItem('[Erro] Cancelada: a solicitação foi cancelada por inconsistência de dados ou solicitação do RH.');
  doc.alerta(
    'Dica de Sincronização em Tempo Real',
    'Ao executar /declaracao status, o bot força uma verificação imediata na caixa de entrada do e-mail. Se o professor acabou de responder, seu documento será entregue no mesmo instante!',
    'sucesso'
  );

  doc.secao('6', 'Especificações Técnicas e Prazos');
  doc.tabela(
    [
      { nome: 'Parâmetro', largura: 130 },
      { nome: 'Valor / Especificação', largura: 180 },
      { nome: 'Observações', largura: 190 },
    ],
    [
      ['Carga Horária', '10 horas semanais', 'Carga padrão dos voluntários do CyberGuard'],
      ['Tipo de Assinatura', 'Digital Gov.br (ICP-Brasil)', 'Plena validade jurídica (Lei 14.063/2020)'],
      ['Ciclo de Checagem', 'A cada 1 minuto (cron)', 'Monitoramento autônomo via protocolo IMAP'],
      ['Prazo Típico', '1 a 3 dias úteis', 'Conforme disponibilidade de agenda do professor'],
      ['Canal de Entrega', 'DM (Mensagem Direta)', 'Arquivo PDF oficial pronto para download'],
    ]
  );

  doc.secao('7', 'Perguntas Frequentes (FAQ) e Solução de Problemas');
  doc.subsecao('1. "O bot informou que meus dados cadastrais não foram encontrados"');
  doc.paragrafo(
    'Isso ocorre caso você seja um membro legado ou tenha entrado no projeto por fluxo manual sem passar pelo onboarding do bot. Envie uma mensagem no canal do RH informando seu Nome Completo, RA, Curso e data aproximada de entrada para atualização no sistema.'
  );

  doc.subsecao('2. "Minha data de início está incorreta. Como corrigir?"');
  doc.paragrafo(
    'A data é extraída do termo de voluntariado formal assinado em seu ingresso. Caso identifique divergência antes da assinatura do professor, avise a equipe de Recursos Humanos para ajuste da data no banco de dados e posterior nova emissão.'
  );

  doc.subsecao('3. "O professor assinou, mas não recebi nada na minha DM do Discord"');
  doc.paragrafo(
    'Verifique as configurações de privacidade do seu Discord: vá em "Configurações do Usuário" > "Privacidade e Segurança" > marque "Permitir mensagens diretas de membros do servidor". Em seguida, digite /declaracao status para reenfileirar o aviso.'
  );

  doc.subsecao('4. "Como validar a autenticidade da assinatura digital do documento?"');
  doc.paragrafo(
    'Qualquer pessoa ou instituição pode verificar a integridade da assinatura acessando o Validador Oficial de Documentos do Governo Federal em: https://validar.iti.gov.br. Basta enviar o PDF para atestar a autenticidade da assinatura do Prof. André Luiz Przybysz.'
  );

  const caminhoSaida = path.join(__dirname, '../docs/manuais/Manual_Membro_Declaracao_Voluntariado.pdf');
  await doc.salvar(caminhoSaida);
  return caminhoSaida;
}

if (require.main === module) {
  gerarManualMembroDeclaracao().catch(console.error);
}

module.exports = { gerarManualMembroDeclaracao };
