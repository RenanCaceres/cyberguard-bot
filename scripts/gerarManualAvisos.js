'use strict';
/**
 * scripts/gerarManualAvisos.js
 * Compila os manuais oficiais da Central de Avisos & Agenda de Eventos (Google Calendar):
 *  1. Manual do Líder (Diretrizes de envio, segmentação por setor, agendamento Google Calendar e tópicos restritos).
 *  2. Manual do Membro (Como funciona a central, privacidade por setor, notificações na DM/e-mail e integração Calendar).
 */
const path = require('path');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const {
  simularModuloAvisosPainel,
  simularModuloAvisosEventoCalendar,
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

/**
 * 1. MANUAL DO LÍDER: GESTÃO DE AVISOS E EVENTOS NO GOOGLE CALENDAR
 */
async function gerarManualLiderAvisos() {
  const doc = new DocBuilder(
    'Manual do Líder • Avisos & Agenda Google Calendar',
    'CyberGuard UTFPR • Guia Operacional de Liderança e Comunicação Restrita'
  );
  await doc.init();

  // Cabeçalho Principal
  doc.cabecalhoDocumento(
    'Guia da Liderança • Comunicação & Agendamento',
    'Manual do Líder: Central de Avisos e Google Calendar',
    'Procedimentos operacionais para envio de comunicados restritos por setor ou individuais, agendamento de reuniões sincronizadas com a Google Calendar API v3 e distribuição multicanal (Discord, DM e E-mail).'
  );

  // Seção 1: Visão Geral e Arquitetura do Módulo
  doc.secao('1', 'Visão Geral e Objetivos do Módulo');
  doc.paragrafo(
    'O módulo da Central de Avisos & Agenda de Eventos foi concebido para padronizar e desburocratizar a comunicação entre a liderança e as equipes do CyberGuard UTFPR. Localizado no canal fixo de avisos, ele centraliza a emissão de comunicados oficiais e a marcação de compromissos técnicos ou regimentais, garantindo entrega garantida em múltiplos canais simultâneos:'
  );
  doc.listaItem('Tópicos Privados no Discord: publicação em threads restritas no canal de avisos, acessíveis unicamente pelos destinatários designados.');
  doc.listaItem('Mensagem Direta (DM): notificação individual e privada na DM de cada participante.');
  doc.listaItem('E-mail Institucional: encaminhamento imediato em HTML responsivo para os e-mails dos membros.');
  doc.listaItem('Google Calendar Automático: geração de convites no padrão RFC 5545 (METHOD:REQUEST) e integração com a Google Calendar API v3, adicionando o evento diretamente na agenda dos membros.');

  doc.alerta(
    'Privacidade Estrita por Setor (LGPD Art. 46)',
    'Nenhum comunicado de setor é postado abertamente no canal geral. A liderança escolhe os destinatários e o bot cria uma thread privada exclusiva (sem capacidade de convite externo), protegendo dados e discussões estratégicas de cada área.',
    'info'
  );

  // Seção 2: Matriz de Permissões e Acessos
  doc.secao('2', 'Matriz de Permissões e Perfis de Acesso');
  doc.paragrafo(
    'As funcionalidades de envio são controladas de forma rigorosa pelo bot, respeitando a estrutura hierárquica do CyberGuard:'
  );

  doc.tabela(
    [
      { nome: 'Perfil / Cargo', largura: 130 },
      { nome: 'Escopo Permitido de Envio', largura: 220 },
      { nome: 'Destinatários Selecionáveis', largura: 153 },
    ],
    [
      [
        'Líder de Setor',
        'Todo o seu setor ou membros individuais do seu time.',
        'Membros vinculados ao seu próprio setor.',
      ],
      [
        'Recursos Humanos (RH)',
        'Individual, setor específico ou Todos os Setores.',
        'Qualquer membro do servidor ou equipes gerais.',
      ],
      [
        'Presidente e Vice',
        'Individual, setor específico ou Todos os Setores.',
        'Acesso irrestrito a todos os setores e membros.',
      ],
      [
        'Membros Regulares',
        'Apenas consulta ("Meus Avisos & Eventos").',
        'Não possuem permissão de envio.',
      ],
    ]
  );

  // Inserção da Simulação 1: Painel Principal
  doc.subsecao('Interface da Central de Avisos no Discord');
  doc.paragrafo('O painel permanente conta com botões intuitivos para os fluxos de trabalho:');
  await figura(doc, simularModuloAvisosPainel(), 920, 550);

  // Seção 3: Como Enviar um Aviso Oficial
  doc.secao('3', 'Passo a Passo: Como Enviar um Aviso Oficial');
  doc.paragrafo('Para enviar um comunicado oficial para a sua equipe, siga o procedimento:');
  doc.subsecao('Etapa 1: Seleção de Destinatários');
  doc.listaItem('Clique no botão "📢 Enviar Aviso" no canal de avisos.');
  doc.listaItem('Se for Líder de Setor: escolha entre o botão "Todo o Setor" ou selecione os membros no menu.');
  doc.listaItem('Se for RH ou Presidência: selecione "Todos os Setores", um setor específico ou os membros no menu.');

  doc.subsecao('Etapa 2: Preenchimento do Modal');
  doc.paragrafo('Uma janela modal será aberta na sua tela solicitando os seguintes dados:');
  doc.listaItem('Título do Aviso: resumo direto do assunto (ex.: "Alinhamento das Demandas da Sprint").');
  doc.listaItem('Corpo do Texto: mensagem completa do aviso, com orientações, prazos e links necessários.');

  doc.subsecao('Etapa 3: Distribuição Automática pelo Bot');
  doc.paragrafo(
    'Após clicar em enviar, o bot processa atomicamente a solicitação, cria o tópico privado no canal de avisos, dispara as mensagens na DM dos membros e envia os e-mails institucionais.'
  );

  // Seção 4: Como Marcar um Evento no Google Calendar
  doc.secao('4', 'Passo a Passo: Como Marcar Eventos no Google Calendar');
  doc.paragrafo(
    'O agendamento de reuniões, treinamentos ou entregas é automatizado e sincroniza com as agendas Google dos integrantes:'
  );

  doc.subsecao('Etapa 1: Iniciar o Agendamento');
  doc.listaItem('Clique no botão "📅 Marcar Evento" no painel.');
  doc.listaItem('Defina os membros participantes (todo o setor ou membros selecionados individualmente).');

  doc.subsecao('Etapa 2: Preenchimento do Formulário de Agendamento');
  doc.listaItem('Título do Evento: identificador claro da reunião (ex.: "Reunião de Alinhamento - Hacking Ético").');
  doc.listaItem('Data do Evento: formato DD/MM/AAAA (ex.: 15/11/2026).');
  doc.listaItem('Horário de Início e Fim: formato HH:MM - HH:MM (ex.: 19:00 - 20:30) ou horário único de início (ex.: 19:00 para 1h de duração).');
  doc.listaItem('Local ou Link da Call: informe a sala do Discord, link do Google Meet ou sala física na UTFPR.');
  doc.listaItem('Descrição / Pauta: tópicos a serem discutidos no encontro.');

  // Inserção da Simulação 2: Evento e Google Calendar
  doc.subsecao('Visualização do Evento e Convite Google Calendar');
  doc.paragrafo('O evento é exibido no Discord e encaminhado como convite nativo de agenda:');
  await figura(doc, simularModuloAvisosEventoCalendar(), 920, 550);

  // Seção 5: Boas Práticas para Lideranças
  doc.secao('5', 'Diretrizes Regimentais e Boas Práticas');
  doc.listaItem('Antecedência Mínima: agende reuniões ordinárias com pelo menos 48 horas de antecedência para permitir o planejamento dos voluntários.');
  doc.listaItem('Pauta Clara: descreva sempre os pontos da pauta para que os membros cheguem preparados ao encontro.');
  doc.listaItem('Uso Razoável de E-mails: evite disparos repetitivos em curtos intervalos para não sobrecarregar as caixas postais.');
  doc.listaItem('Comando de Manutenção: em caso de reinicialização ou atualização do canal, utilize o comando /painel-avisos para republicar o painel.');

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Lider_Avisos_Google_Calendar.pdf'));
  console.log('[Manual] Manual_Lider_Avisos_Google_Calendar.pdf gerado com sucesso.');
}

/**
 * 2. MANUAL DO MEMBRO: COMO FUNCIONA A CENTRAL DE AVISOS E EVENTOS
 */
async function gerarManualMembroAvisos() {
  const doc = new DocBuilder(
    'Manual do Membro • Central de Avisos & Agenda',
    'CyberGuard UTFPR • Guia de Comunicação, Eventos e Google Calendar'
  );
  await doc.init();

  // Cabeçalho Principal
  doc.cabecalhoDocumento(
    'Guia do Integrante • Avisos & Calendário',
    'Manual do Membro: Central de Avisos e Google Calendar',
    'Entenda como funciona o canal de avisos, como receber comunicados restritos do seu setor, como seus compromissos são sincronizados com o Google Calendar e como consultar seu histórico privado.'
  );

  // Seção 1: O que é a Central de Avisos
  doc.secao('1', 'O que é a Central de Avisos e seu Funcionamento');
  doc.paragrafo(
    'A Central de Avisos e Agenda de Eventos é o canal oficial de comunicados do CyberGuard UTFPR. Nela, a liderança compartilha decisões, alinhamentos semanais, avisos acadêmicos e convocações para eventos e workshops práticos.'
  );
  doc.paragrafo('Principais benefícios para o integrante:');
  doc.listaItem('Fim do ruído: você recebe apenas os avisos que dizem respeito a você ou ao seu setor técnico.');
  doc.listaItem('Organização do tempo: reuniões e eventos oficiais entram diretamente no seu calendário Google com lembretes automáticos.');
  doc.listaItem('Confidencialidade: tópicos privados garantem que conversas internas da sua equipe permaneçam seguras.');
  doc.listaItem('Registro histórico: você pode rever todos os comunicados direcionados a você a qualquer momento.');

  // Seção 2: Onde e Como Você Recebe os Avisos
  doc.secao('2', 'Como Você Recebe Avisos e Convocatórias');
  doc.paragrafo('Sempre que a liderança publica um aviso ou marca um evento, o bot aciona três vias:');

  doc.tabela(
    [
      { nome: 'Via de Entrega', largura: 130 },
      { nome: 'Onde Encontrar', largura: 220 },
      { nome: 'Finalidade', largura: 153 },
    ],
    [
      [
        'Tópico Privado no Canal',
        'Canal de avisos do Discord (aba lateral de tópicos).',
        'Debate e interação restrita com os colegas do setor.',
      ],
      [
        'Mensagem Direta (DM)',
        'DM privada enviada pelo Bot RH CyberGuard.',
        'Notificação rápida no celular ou desktop.',
      ],
      [
        'E-mail Institucional',
        'Caixa de entrada (@alunos.utfpr.edu.br).',
        'Comprovação formal e convite de calendário.',
      ],
    ]
  );

  doc.alerta(
    'Importante: Mantenha as DMs Abertas',
    'Para receber os alertas instantâneos de novos avisos e eventos, certifique-se de permitir mensagens diretas de membros do servidor nas configurações de privacidade do Discord.',
    'aviso'
  );

  // Inserção da Simulação 1: Painel do Membro
  doc.subsecao('Visão do Painel de Avisos');
  doc.paragrafo('No canal de avisos, o painel principal apresenta as opções disponíveis:');
  await figura(doc, simularModuloAvisosPainel(), 920, 550);

  // Seção 3: Integração com o Google Calendar
  doc.secao('3', 'Sua Agenda Sincronizada no Google Calendar');
  doc.paragrafo(
    'Quando a liderança agenda uma reunião ou treinamento, o bot faz a integração automática com o Google Calendar:'
  );
  doc.listaItem('Convite Automático: enviado por e-mail com anexo iCalendar (METHOD:REQUEST). O Gmail e o Google Calendar reconhecem o convite e adicionam o evento à sua grade de horários.');
  doc.listaItem('Botão de Acesso Rápido: no Discord e no e-mail, há um botão "Ver no Google Calendar" que abre o compromisso diretamente no seu navegador ou aplicativo.');
  doc.listaItem('Lembretes Inteligentes: você receberá avisos automáticos 30 minutos antes por e-mail e 10 minutos antes por notificação no celular/computador.');

  // Inserção da Simulação 2: Visualização do Evento
  doc.subsecao('Simulação do Evento Agendado e E-mail');
  doc.paragrafo('Exemplo de como o evento é apresentado no Discord e no seu e-mail:');
  await figura(doc, simularModuloAvisosEventoCalendar(), 920, 550);

  // Seção 4: Consulta Pessoal ("Meus Avisos & Eventos")
  doc.secao('4', 'Como Consultar seus Avisos ("Meus Avisos & Eventos")');
  doc.paragrafo(
    'Caso você tenha perdido alguma notificação ou deseje revisar as mensagens anteriores direcionadas ao seu perfil ou setor:'
  );
  doc.listaItem('Acesse o canal de avisos.');
  doc.listaItem('Clique no botão cinza "📬 Meus Avisos & Eventos".');
  doc.listaItem('O bot responderá imediatamente em mensagem efêmera (visível exclusivamente para você), listando os comunicados mais recentes, datas e links dos tópicos.');

  // Seção 5: Privacidade e LGPD
  doc.secao('5', 'Privacidade e Proteção de Dados (LGPD)');
  doc.paragrafo(
    'O CyberGuard adota práticas de Privacy by Design em todos os seus módulos:'
  );
  doc.listaItem('Seus contatos de e-mail são mantidos em banco de dados seguro com criptografia AES-256-GCM em repouso.');
  doc.listaItem('Os tópicos no canal de avisos são estritamente privados: membros de outras áreas não conseguem ler nem acessar comunicados do seu setor.');
  doc.listaItem('Você pode consultar ou retificar seus dados a qualquer momento usando o comando /meus-dados.');

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Membro_Avisos_Google_Calendar.pdf'));
  console.log('[Manual] Manual_Membro_Avisos_Google_Calendar.pdf gerado com sucesso.');
}

async function gerarAmbosManuais() {
  await gerarManualLiderAvisos();
  await gerarManualMembroAvisos();
}

module.exports = {
  gerarManualLiderAvisos,
  gerarManualMembroAvisos,
  gerarAmbosManuais,
};

if (require.main === module) {
  gerarAmbosManuais().catch(console.error);
}
