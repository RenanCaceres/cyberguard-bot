'use strict';
const path = require('path');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const { simularModuloReuniao } = require('./simulacoesCanvas');

async function figura(doc, buffer, w = 920, h = 530) {
  const largura = LARGURA_UTIL;
  const altura = (largura * h) / w;
  await doc.imagem(buffer, {
    largura,
    altura,
    espacoDepois: 12,
  });
}

async function gerarManualReunioesIA() {
  const doc = new DocBuilder(
    'Manual da Liderança • Atas com IA Gemini',
    'CyberGuard UTFPR • Governança, IA Generativa e Transcrição Autônoma'
  );
  await doc.init();

  doc.cabecalhoDocumento(
    'Guia da Liderança • Inteligência Artificial & Atas',
    'Manual Operacional: Atas de Reunião com IA',
    'Como gravar reuniões por voz, garantir o direito de Opt-out (LGPD), transcrever com Google Gemini 2.5 Flash e emitir atas formais em PDF.'
  );

  doc.secao('1', 'Propósito e Arquitetura do Módulo de Reuniões');
  doc.paragrafo(
    'O módulo de Atas de Reunião do CyberGuard automatiza o registro histórico e as deliberações de equipe. Através da captura de streams de áudio individuais dos participantes conectados ao canal de voz, o sistema processa as falas em segundo plano, submete o conteúdo ao Google Gemini 2.5 Flash com prompt institucional especializado e gera uma ata formal em formato PDF distribuída aos membros.'
  );
  doc.alerta(
    'Quem Possui Autorização de Execução',
    'O início e encerramento de gravações (/reuniao iniciar e /reuniao finalizar) são privilégios restritos a Líderes de Área, Diretoria de Recursos Humanos, Presidência e Administradores do servidor.',
    'info'
  );

  doc.secao('2', 'Privacidade e Direito de Oposição (LGPD)');
  doc.paragrafo(
    'Em estrito cumprimento aos Arts. 7º e 18 da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), nenhum integrante é obrigado a ter sua voz capturada. Ao iniciar a gravação (ou no instante em que qualquer membro conecta à chamada), o bot publica uma mensagem no chat da sala de voz com o botão:'
  );
  doc.listaItem('"🔇 Não gravar minha voz (Opt-out)": ao clicar, o bot bloqueia o registro de áudio daquele participante instantaneamente, permitindo que ele continue participando da reunião sem captura.');

  doc.secao('3', 'Interface Simulada do Usuário no Discord');
  doc.paragrafo(
    'A imagem abaixo demonstra o comportamento do bot no Discord durante a abertura, aviso de Opt-out e entrega final da ata em PDF:'
  );

  // Inserção da Simulação Gráfica
  await figura(doc, simularModuloReuniao(), 920, 530);

  doc.secao('4', 'Passo a Passo de Operação');
  doc.subsecao('1. Iniciando a Gravação (/reuniao iniciar)');
  doc.listaItem('Conecte-se ao canal de voz onde ocorrerá a reunião.');
  doc.listaItem('Execute o comando /reuniao iniciar no chat do canal ou canal autorizado.');
  doc.listaItem('O bot entra na chamada, emite o sinal de gravação e publica o aviso com botão de Opt-out.');

  doc.subsecao('2. Finalizando e Gerando a Ata (/reuniao finalizar)');
  doc.listaItem('Ao término da pauta, execute /reuniao finalizar.');
  doc.listaItem('O bot encerra as escutas, converte os trechos Opus para 16kHz Mono 16-bit e concatena os arquivos com 500ms de espaçamento.');
  doc.listaItem('A IA generativa sintetiza: Tópicos Discutidos, Principais Decisões Tomadas e Próximos Passos com Responsáveis.');
  doc.listaItem('O PDF da Ata é postado diretamente no canal com download imediato.');

  doc.secao('5', 'Resiliência contra Falhas de Cota e Reprocessamento');
  doc.tabela(
    [
      { nome: 'Recurso', largura: 160 },
      { nome: 'Comportamento Técnico', largura: 190 },
      { nome: 'Ação Recomendada', largura: 150 },
    ],
    [
      ['Rate Limit (429)', 'Backoff exponencial com até 5 tentativas', 'Aguardar processamento automático'],
      ['Cota Diária Esgotada', 'Preserva áudio e manifest.json no banco', 'Executar /reuniao reprocessar amanhã'],
      ['Retenção de Backup', 'Armazenamento seguro por 7 dias corridos', 'Limpeza diária automática às 04:00'],
      ['Consulta Histórica', 'Lista últimas reuniões do servidor', 'Executar /reuniao historico'],
    ]
  );

  await doc.salvar(path.join(__dirname, '../docs/manuais/Manual_Lider_Reunioes_IA.pdf'));
  console.log('[PDF] Gerado com sucesso: docs/manuais/Manual_Lider_Reunioes_IA.pdf');
}

module.exports = { gerarManualReunioesIA };

if (require.main === module) {
  gerarManualReunioesIA().catch(console.error);
}
