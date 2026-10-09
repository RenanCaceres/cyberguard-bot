'use strict';
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const F = require('./fluxosCanvas');

// Insere uma figura de fluxo na largura útil, mantendo a proporção.
async function figura(doc, fig) {
  await doc.imagem(fig.buffer, { largura: LARGURA_UTIL, altura: (LARGURA_UTIL * fig.altura) / fig.largura, espacoDepois: 12 });
}
const path = require('path');

async function gerarManualMembroAdvertencias() {
  const doc = new DocBuilder(
    'Manual do Membro • Advertências',
    'CyberGuard • Sistema Disciplinar e Garantia de Direitos'
  );
  await doc.init();

  doc.cabecalhoDocumento(
    'Guia do Integrante • Direitos e Disciplina',
    'Manual do Membro: Sistema de Advertências',
    'Conheça seus direitos, garantias regimentais, prazos de defesa e como manifestar sua réplica no Discord.'
  );

  doc.secao('1', 'O que é o Sistema de Advertências e seu Propósito');
  doc.paragrafo(
    'O sistema de advertências do CyberGuard é um processo formal, transparente e estritamente ético para tratar desalinhamentos, descumprimentos de prazos ou condutas em desacordo com as diretrizes do projeto. O ponto central é a justiça do processo: o advertido sempre pode responder. Ele aceita (Ciente) ou discorda (Não concordo), e a liderança pode manter a advertência, perdoar ou responder com contra-argumentos. Tudo fica registrado no histórico auditável.'
  );
  doc.alerta(
    'Princípio Formativo e Restaurativo',
    'O objetivo do CyberGuard não é punir, mas sim desenvolver profissionais conscientes, éticos e preparados para o mercado de segurança da informação e tecnologia.',
    'info'
  );

  doc.secao('2', 'Seus Direitos Fundamentais como Voluntário');
  doc.paragrafo('Ao receber uma advertência formal, você tem assegurados os seguintes direitos:');
  doc.listaItem('Direito à Ampla Defesa: você sempre tem a opção de discordar e apresentar suas razões detalhadas.');
  doc.listaItem('Prazo Garantido de 7 Dias: você dispõe de 7 dias corridos para analisar o fato, reunir provas e responder.');
  doc.listaItem('Sigilo e Privacidade: as notificações ocorrem preferencialmente por Mensagem Direta (DM) privada.');
  doc.listaItem('Direito ao Diálogo Continuado: se você discordar e o líder apresentar contra-argumentos, você tem nova oportunidade de réplica com reinício do prazo de 7 dias.');
  doc.listaItem('Transparência do Histórico: você pode consultar todas as suas ocorrências a qualquer instante pelo comando /minhas-advertencias.');

  doc.secao('3', 'Visão Geral do Fluxo Disciplinar');
  doc.paragrafo(
    'O desenho abaixo ilustra o caminho completo de uma advertência sob a perspectiva do membro. Siga as setas a partir do topo:'
  );

  // Inserção do Fluxograma do Membro
  await figura(doc, F.fluxoAdvertencias({ visao: 'membro' }));

  doc.subsecao('Como ler o fluxo:');
  doc.listaItem('"Ciente" encerra a discussão: a advertência entra em vigência formal por 90 dias e expira automaticamente.');
  doc.listaItem('"Não concordo" abre formulário de réplica de até 1.500 caracteres, enviado ao líder para análise.');
  doc.listaItem('Contra-Argumentar devolve a conversa a você com NOVO prazo de 7 dias para você decidir novamente.');
  doc.listaItem('Se você não responder em 7 dias, a advertência passa para "Sem Resposta" e o líder decide entre reenviar ou cancelar.');

  doc.secao('4', 'Como Responder: Ciente vs. Não Concordo');
  doc.subsecao('Opção A: Botão "Ciente" (Reconhecimento do Fato)');
  doc.paragrafo(
    'Clique em Ciente quando você reconhecer que houve o equívoco apontado e concordar em ajustar sua conduta. A discussão é encerrada sem desgaste e a advertência expira após 90 dias.'
  );

  doc.subsecao('Opção B: Botão "Não concordo" (Exercício de Defesa)');
  doc.paragrafo(
    'Se você entende que a ocorrência foi indevida ou houve imprevisto de força maior justificado, clique em Não concordo. Um formulário será aberto com espaço de até 1.500 caracteres para expor seus argumentos e links de evidências.'
  );

  doc.secao('5', 'Categorias de Advertência e Regras de Reincidência');
  doc.tabela(
    [
      { nome: 'Categoria', largura: 75 },
      { nome: 'Comportamento Típico', largura: 250 },
      { nome: 'Consequência Institucional', largura: 175 },
    ],
    [
      ['Leve', 'Atraso recorrente sem aviso, ausência em reuniões ordinárias.', 'Conversa individual + plano de ajuste'],
      ['Média', 'Uso indevido de ferramentas ou desrespeito ao escopo ético.', 'Advertência formal + revisão de acessos'],
      ['Grave', 'Uso malicioso de conhecimento, assédio ou vazamento de dados.', 'Abertura de processo de desligamento'],
    ]
  );
  doc.alerta(
    'Regra Estrita de Reincidência',
    'Uma advertência só gera reincidência se você já tiver uma advertência em vigência (dentro dos 90 dias) na MESMA categoria. Reincidir em Leve eleva para Média; em Média eleva para Grave; em Grave submete decisão de expulsão à liderança.',
    'aviso'
  );

  doc.secao('6', 'Comandos Úteis para o Membro');
  doc.listaItem('/minhas-advertencias: lista todas as suas ocorrências no servidor.');
  doc.listaItem('Botão "Minhas Advertências" no painel fixado no canal de advertências: exibe o mesmo relatório em mensagem privada e efêmera.');

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Membro_Advertencias.pdf'));
}

async function gerarManualMembroPonto() {
  const doc = new DocBuilder(
    'Manual do Membro • Controle de Ponto',
    'CyberGuard • Controle de Ponto Eletrônico e Horas'
  );
  await doc.init();

  doc.cabecalhoDocumento(
    'Guia do Voluntário • Registro de Horas',
    'Manual do Membro: Controle de Ponto Eletrônico',
    'Como registrar suas atividades de forma manual e pela call de voz, nova confirmação periódica e ranking.'
  );

  doc.secao('1', 'Por que Registrar o Ponto no CyberGuard?');
  doc.paragrafo(
    'O registro de ponto é o instrumento oficial de controle de horas de voluntariado do CyberGuard. Ele comprova sua participação ativa, viabiliza o cômputo de horas complementares acadêmicas, alimenta os rankings de produtividade e garante o acompanhamento das tarefas integradas diretamente ao Notion do projeto.'
  );

  doc.secao('2', 'Visão Geral do Fluxo de Ponto');
  doc.paragrafo(
    'O fluxo abaixo apresenta a jornada do ponto eletrônico desde a abertura até a sincronização final:'
  );

  // Inserção do Fluxograma do Ponto
  await figura(doc, F.fluxoPontoAbrirFechar());

  doc.subsecao('Como funciona a jornada:');
  doc.listaItem('Abertura: pode ser feita pelo botão manual no painel ou conectando no canal de voz dedicado.');
  doc.listaItem('Seleção da Demanda: o bot consulta o Notion e você seleciona em qual tarefa vai trabalhar.');
  doc.listaItem('Fechamento e Relato: ao desconectar da call ou clicar em fechar, preencha o progresso e o que foi feito.');
  doc.listaItem('Sincronização: as horas são gravadas no Postgres, no Notion, no Google Sheets e no log do Discord.');

  doc.secao('3', 'Modo 1: Registro Manual pelo Painel de Ponto');
  doc.subsecao('Passo 1: Clicar em "Abrir ponto" (Verde)');
  doc.listaItem('O bot consulta as tarefas em aberto no Notion e exibe um menu para sua escolha.');
  doc.listaItem('Ao escolher a tarefa, seu ponto é aberto imediatamente e registrado no log do servidor.');

  doc.subsecao('Passo 2: Clicar em "Fechar ponto" (Vermelho)');
  doc.listaItem('Progresso da tarefa (0 a 100): digite a porcentagem atingida (ex.: 60 ou 100).');
  doc.listaItem('O que você fez: resumo claro e objetivo das entregas realizadas durante esse período.');
  doc.listaItem('O que falta: obrigatório se o progresso for menor que 100%. Descreva os próximos passos.');

  doc.secao('4', 'Modo 2: Ponto Automático pela Call de Ponto (Canal de Voz)');
  doc.listaItem('Entrar no canal de voz: o bot abre seu ponto automaticamente no segundo em que você conecta.');
  doc.listaItem('Escolha da tarefa por DM: o bot manda uma mensagem privada para você vincular sua demanda.');
  doc.listaItem('Sair do canal de voz: desconectar encerra seu ponto e envia a DM para relato das entregas.');
  doc.alerta(
    'Tolerância de Quedas de Conexão (Grace Period)',
    'O bot possui uma tolerância inteligente de 60 segundos. Se sua internet oscilar e você reconectar rapidamente, seu ponto não será fechado por engano.',
    'sucesso'
  );

  doc.novaPagina(); // a figura da checagem horária ocupa a página inteira junto com o texto
  doc.secao('5', 'Nova Confirmação Periódica de Atividade (A cada 1 Hora)');
  doc.paragrafo(
    'A cada 1 hora de ponto aberto, o bot envia uma mensagem privada perguntando: "Você ainda continua trabalhando?". O desenho abaixo mostra o que acontece em cada resposta:'
  );
  await figura(doc, F.fluxoPontoVerificacao());
  doc.subsecao('1. Botão "Sim, continuo trabalhando" (Verde)');
  doc.paragrafo('Clique para confirmar que está ativo. O ponto continua aberto e o contador de inatividade é zerado.');

  doc.subsecao('2. Botão "Não, já encerrei" (Vermelho)');
  doc.paragrafo('Se você já parou de trabalhar, clique neste botão. O ponto é encerrado na hora exata e o formulário de relato é liberado.');

  doc.subsecao('3. Regra dos 3 Avisos Sem Resposta (Inatividade)');
  doc.paragrafo(
    'Caso você não responda nem Sim e nem Não após 3 avisos consecutivos (3 horas sem resposta), o bot encerrará o ponto automaticamente por inatividade e enviará notificação. Se você ainda estava ativo, solicite ajuste manual ao RH.'
  );

  doc.secao('6', 'Teto Máximo e Ranking de Horas');
  doc.listaItem('Teto Máximo de 8 Horas: se esquecido aberto, o ponto encerra automaticamente em 8 horas.');
  doc.listaItem('Ranking Semanal: clique no botão "Ranking" para ver o pódio estilizado com tempos e barras.');
  doc.listaItem('Horas Integradas do KoV Ponto: sessões finalizadas no canal de logs do KoV entram de forma transparente no ranking.');

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Membro_Ponto.pdf'));
}

async function gerarManualLiderRHPonto() {
  const doc = new DocBuilder(
    'Manual do Líder e RH • Gestão de Ponto',
    'CyberGuard • Liderança, Recursos Humanos e Auditoria'
  );
  await doc.init();

  doc.cabecalhoDocumento(
    'Gestão e Liderança • Painel Administrativo',
    'Manual do Líder e RH: Gestão do Ponto Eletrônico',
    'Guia completo sobre privilégios de liderança, resumo gerencial, ajustes exclusivos do RH e governança de horas.'
  );

  doc.secao('1', 'Divisão de Papéis e Permissões');
  doc.tabela(
    [
      { nome: 'Funcionalidade', largura: 180 },
      { nome: 'Líderes de Área', largura: 160 },
      { nome: 'Recursos Humanos (RH)', largura: 160 },
    ],
    [
      ['Abrir e Fechar próprio ponto', 'Permitido (Geral)', 'Permitido (Geral)'],
      ['Visualizar Lista e Ranking', 'Permitido (Geral)', 'Permitido (Geral)'],
      ['Painel "Resumo" de Horas', 'Acesso Total', 'Acesso Total'],
      ['Histórico Detalhado por Aluno', 'Acesso Total', 'Acesso Total'],
      ['Botão "Ajustar Ponto" no Painel', 'Restrito ao RH', 'Acesso Exclusivo RH'],
      ['Comando /ajustar-ponto', 'Restrito ao RH', 'Acesso Exclusivo RH'],
      ['Comando /importar-horas (Saldos)', 'Restrito ao RH', 'Acesso Exclusivo RH'],
    ]
  );

  doc.secao('2', 'Privilégios de Líder: O Painel de Resumo');
  doc.paragrafo(
    'Ao clicar no botão "Resumo" no painel de ponto, a liderança tem acesso a uma visão consolidada de todo o time:'
  );
  doc.listaItem('Lista consolidada com o total de horas registradas por cada voluntário.');
  doc.listaItem('Indicador em tempo real de quem está trabalhando em serviço no momento.');
  doc.listaItem('Total de sessões de ponto realizadas por cada membro.');
  doc.listaItem('Menu de Detalhamento Individual: selecione qualquer membro no menu para inspecionar sessões passadas, horários, progresso e relatos.');

  doc.secao('3', 'Privilégios Exclusivos do RH: Ajuste de Ponto');
  doc.paragrafo(
    'O RH pode intervir para corrigir esquecimentos, quedas de conexão ou retificar horários através do botão "Ajustar ponto" no painel (ou comando /ajustar-ponto):'
  );

  // Inserção do Fluxograma de Ajuste do RH
  await figura(doc, F.fluxoAjusteRH());

  doc.subsecao('Passo a Passo do Ajuste pelo RH:');
  doc.listaItem('1. Clique no botão "Ajustar ponto" no painel oficial.');
  doc.listaItem('2. O bot abre o menu de seleção de usuário. Selecione o integrante desejado.');
  doc.listaItem('3. O bot busca os pontos fechados do integrante e exibe as datas, horários e durações.');
  doc.listaItem('4. Selecione o ponto que necessita de correção.');
  doc.listaItem('5. Preencha o modal com o novo horário de fechamento (dd/mm/aaaa hh:mm) e o motivo.');
  doc.alerta(
    'Notificação e Auditoria Automática',
    'Ao confirmar: (1) O ponto é atualizado no banco; (2) A linha na planilha Google Sheets é atualizada; (3) O bot envia uma DM automática ao membro comunicando o ajuste; (4) O histórico recebe a marcação [Ajustar] com o ID do RH responsável.',
    'sucesso'
  );

  doc.secao('4', 'Comando /importar-horas (RH)');
  doc.paragrafo(
    'Utilizado exclusivamente pelo RH para migrar saldos acumulados de ferramentas legadas (como o KOv Ponto antigo) ou horas comprovadas fora da plataforma:'
  );
  doc.listaItem('Permite informar dias, horas, minutos, segundos e uma observação de auditoria.');
  doc.listaItem('O saldo importado computa no total do aluno e na planilha, mas NÃO infla o ranking semanal.');

  doc.secao('5', 'Auditoria de Encerramentos Automáticos');
  doc.listaItem('Encerramento por Teto de 8h: pontos que atingem 8 horas contínuas fecham automaticamente.');
  doc.listaItem('Encerramento por Inatividade: membros que não respondem a 3 checagens horárias consecutivas têm o ponto encerrado.');

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Lider_RH_Ponto.pdf'));
}

async function gerarManualLiderAdvertenciasAtualizado() {
  const doc = new DocBuilder(
    'Manual do Líder • Advertências',
    'CyberGuard • Diretrizes Disciplinares e Liderança'
  );
  await doc.init();

  doc.cabecalhoDocumento(
    'Guia da Liderança • Aplicação e Mediação',
    'Manual do Líder: Sistema de Advertências',
    'Como abrir, fundamentar e acompanhar ocorrências no Discord com base no código e regimento oficial.'
  );

  doc.secao('1', 'O que é o Sistema de Advertências');
  doc.paragrafo(
    'É o processo formal, gerido pelo bot do Discord, para registrar uma ocorrência com um membro do projeto. O ponto central é a justiça do processo: o advertido sempre pode responder. Ele aceita (Ciente) ou discorda (Não concordo), e a liderança pode manter a advertência, perdoar ou responder com contra-argumentos. Tudo fica registrado no histórico auditável do projeto.'
  );
  doc.alerta(
    'Quem Pode Abrir Advertências',
    'Somente líderes autorizados configurados no bot (RH e Presidência). Tentativas de abertura por usuários não autorizados são bloqueadas imediatamente pelo sistema.',
    'info'
  );

  doc.secao('2', 'Visão Geral do Fluxo Disciplinar');
  doc.paragrafo(
    'O desenho abaixo mostra o caminho completo de uma advertência. Siga as setas a partir do topo:'
  );

  // Inserção do Fluxograma do Líder (Idêntico à página 2)
  await figura(doc, F.fluxoAdvertencias({ visao: 'lider' }));

  doc.subsecao('Como ler o desenho:');
  doc.listaItem('Ciente encerra a discussão: a advertência passa a valer por 90 dias.');
  doc.listaItem('Não concordo chega até você com a justificativa e três botões. É aqui que você decide o rumo.');
  doc.listaItem('Contra-Argumentar devolve a conversa ao advertido. Ela pode se repetir até alguém encerrar (ele dando Ciente, ou você escolhendo Prosseguir ou Perdoar).');
  doc.listaItem('Se o advertido não responde em 7 dias, o bot avisa você para reenviar ou cancelar.');

  doc.secao('3', 'Passo a Passo: Abrindo uma Advertência');
  doc.subsecao('Opção A: Pelo Painel (Mais Simples)');
  doc.listaItem('1. Clique no botão "Abrir Advertência" no painel fixado no canal de advertências.');
  doc.listaItem('2. Escolha o membro na lista.');
  doc.listaItem('3. Escolha a categoria (Leve, Média ou Grave).');
  doc.listaItem('4. Informe se é reincidência (Sim ou Não).');
  doc.listaItem('5. Preencha título objetivo e links de evidências.');

  doc.subsecao('Opção B: Pelo Comando Slash /advertir');
  doc.paragrafo(
    'O comando /advertir solicita diretamente os parâmetros membro, nome_real, categoria e reincidente, abrindo em seguida o mesmo modal de título e evidências.'
  );

  doc.secao('4', 'Categorias Regimentais e Reincidência');
  doc.tabela(
    [
      { nome: 'Categoria Declarada', largura: 130 },
      { nome: 'Com Reincidência Vira', largura: 150 },
      { nome: 'Consequência / Decisão', largura: 220 },
    ],
    [
      ['Leve', 'Média', 'Conversa individual + plano de ajuste'],
      ['Média', 'Grave', 'Advertência formal + revisão de acesso'],
      ['Grave', 'Grave (Decisão)', 'Bot abre votação Expulsar ou Não expulsar'],
    ]
  );
  doc.alerta(
    'Atenção à Decisão de Expulsão',
    'O bot registra a decisão formal de expulsar no banco de dados. A remoção física do servidor precisa ser feita manualmente pelos administradores.',
    'aviso'
  );

  doc.secao('5', 'Acompanhamento e Resolução de Réplicas');
  doc.subsecao('Situação 1: O advertido deu Ciente');
  doc.paragrafo('A advertência entra em vigência por 90 dias. Se houve troca de argumentos antes, o bot avisa você no canal.');

  doc.subsecao('Situação 2: O advertido não concordou');
  doc.paragrafo('Você recebe no canal a justificativa dele e três botões:');
  doc.listaItem('Contra-Argumentar: abre formulário. Seu texto vai ao advertido, que responde de novo com novo prazo de 7 dias.');
  doc.listaItem('Prosseguir: mantém a advertência em vigência por 90 dias e encerra a conversa.');
  doc.listaItem('Perdoar: encerra a advertência como perdoada sem penalidade.');

  doc.subsecao('Situação 3: 7 dias sem resposta');
  doc.paragrafo('Todo dia às 6h o bot confere os prazos. Se o advertido não respondeu em 7 dias, o bot chama você com Reenviar ou Cancelar.');

  doc.secao('6', 'Comandos Úteis');
  doc.listaItem('/painel-advertencias: publica o painel no canal atual.');
  doc.listaItem('/advertir: abre ocorrência via comando slash.');
  doc.listaItem('/advertencias [membro]: consulta histórico completo.');
  doc.listaItem('/minhas-advertencias: consulta ocorrências próprias.');

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Lider_Advertencias_Atualizado.pdf'));
}

(async () => {
  console.log('Compilando manuais em PDF com fluxogramas visuais...');
  await gerarManualMembroAdvertencias();
  await gerarManualMembroPonto();
  await gerarManualLiderRHPonto();
  await gerarManualLiderAdvertenciasAtualizado();
  console.log('Todos os 4 manuais com fluxos foram compilados com sucesso!');
})();
