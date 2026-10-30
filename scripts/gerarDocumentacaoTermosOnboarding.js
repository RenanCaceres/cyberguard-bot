'use strict';
const path = require('path');
const fs = require('fs');
const { DocBuilder, LARGURA_UTIL } = require('./pdfDocBuilder');
const F = require('./fluxosCanvas');

// Insere uma figura de fluxo na largura útil, mantendo a proporção.
async function figura(doc, fig, escala = 0.57) {
  const larg = LARGURA_UTIL * escala;
  await doc.imagem(fig.buffer, {
    largura: larg,
    altura: (larg * fig.altura) / fig.largura,
    espacoDepois: 8,
  });
}

async function gerarDocumentoFluxoTermosOnboarding() {
  const doc = new DocBuilder(
    'Proposta Tecnica • Automacao de Termos de Voluntariado',
    'CyberGuard UTFPR • Arquitetura de Software e Automacao do Onboarding'
  );
  await doc.init();

  // =========================================================================
  // PÁGINA 1: CABEÇALHO INSTITUCIONAL, CONTEXTO E DIAGNÓSTICO DO PROBLEMA
  // =========================================================================
  doc.cabecalhoDocumento(
    'PROPOSTA TECNICA E ARQUITETURA DE FLUXO • ONBOARDING v2.0',
    'Automacao do Circuito de Assinatura de Termos de Voluntariado',
    'Especificacao do fluxo ponta a ponta com protocolo rastreavel (#TERMO-), co-assinatura da Coordenacao (Profª Natassya), captura autonoma via IMAP e sincronizacao direta no Google Drive.'
  );

  doc.secao('1', 'Contexto, Diagnostico e Justificativa da Otimizacao');
  doc.paragrafo(
    'O Termo de Adesao ao Servico Voluntario e o instrumento juridico formal que regulariza a integracao de novos academicos ao projeto de extensao CyberGuard (UTFPR - Campus Cornelio Procopio), em estrito cumprimento a Lei Federal nº 9.608/1998 e as normativas da Diretoria de Relacoes Empresariais e Comunitarias (DIREC).'
  );
  doc.paragrafo(
    'Atualmente, o processo inicial de onboarding e conduzido com alta assertividade pelo bot no Discord: o candidato responde as 13 etapas cadastrais por DM particular, o perfil e submetido e aprovado pela equipe de Recursos Humanos no canal institucional, e o sistema compila o Termo personalizado em formato PDF com os campos AcroForm injetados. Em seguida, o estudante assina digitalmente no portal Gov.br (primeira assinatura) e envia o documento assinado na DM do bot, que valida com precisao criptografica a autenticidade do certificado ICP-Brasil e o preenchimento dos campos.'
  );

  doc.subsecao('1.1. O Gargalo Operacional: Trabalho Manual Pos-Assinatura do Aluno');
  doc.paragrafo(
    'Apesar do sucesso na primeira fase, para que o termo tenha plena validade institucional perante a Reitoria da UTFPR e a DIREC, e compulsoria a assinatura da Coordenadora do Projeto, a Profª Natassya. O fluxo operacional pos-assinatura do aluno opera hoje de forma intensamente manual, gerando um expressivo retrabalho operacional para a equipe:'
  );
  doc.listaItem('1. O bot envia um e-mail simples (sem identificador ou protocolo indexavel no assunto) para a coordenacao contendo o PDF assinado pelo aluno.');
  doc.listaItem('2. A Profª Natassya abre o e-mail, realiza o download do arquivo e assina digitalmente no portal Gov.br (segunda assinatura - Coordenacao/DIREC).');
  doc.listaItem('3. A professora redige uma resposta de e-mail e devolve o arquivo com as duas assinaturas validas para a equipe de gestao e RH do CyberGuard.');
  doc.listaItem('4. Um membro da equipe precisa monitorar periodicamente a caixa postal institucional, identificar a resposta, baixar o anexo, conferir os dados e renomear o arquivo.');
  doc.listaItem('5. Esse mesmo integrante precisa abrir o Google Drive institucional, navegar manualmente pela hierarquia de pastas ate a area de atuacao do voluntario (ex.: Hacking Etico, Design, Hardware Hacking, Recursos Humanos, Social Media ou Lideres) e realizar o upload manual do PDF.');

  doc.alerta(
    'Riscos e Custos do Modelo Manual Atual',
    'Esse modelo gera sobrecarga operacional desnecessaria, retarda a conclusao do onboarding, depende de acompanhamento humano constante e cria riscos severos de arquivos esquecidos na caixa de entrada ou termos subidos ao Google Drive apenas com a assinatura do aluno.',
    'aviso'
  );

  // =========================================================================
  // PÁGINA 2: COMPARATIVO AS-IS / TO-BE, ARQUITETURA E DIAGRAMA CANVAS
  // =========================================================================
  doc.novaPagina();
  doc.subsecao('1.2. Quadro Comparativo: Fluxo Atual (As-Is) vs. Fluxo Proposto (To-Be)');
  doc.tabela(
    [
      { nome: 'Etapa / Dimensao', largura: 110 },
      { nome: 'Fluxo Atual (Manual)', largura: 185 },
      { nome: 'Fluxo Proposto Otimizado (To-Be)', largura: 205 },
    ],
    [
      ['Identificacao e Rastreio', 'E-mail generico sem protocolo indexavel no assunto.', 'Protocolo exclusivo #TERMO-<RA>-<HASH> no assunto e no banco.'],
      ['Acao da Coordenacao', 'Baixa o PDF, assina no Gov.br e devolve e-mail a equipe.', 'Assina no Gov.br e responde o proprio e-mail daquele protocolo.'],
      ['Captura do Arquivo', 'Manual: membro da equipe precisa vigiar caixa postal.', 'Autonoma: bot monitora IMAP a cada 1 min e baixa o anexo.'],
      ['Upload no Google Drive', 'Manual: equipe navega nas pastas e faz upload do PDF.', '100% Automatico: bot mapeia a area e sobe via API do Drive.'],
      ['Envio ao Academico', 'Manual ou inexistente (desnecessario para o estudante).', 'Dispensado: documento e restrito ao Drive institucional e RH.'],
      ['Auditoria do RH', 'Controle informal por mensagens ou planilhas.', 'Notificacao completa no canal do RH com protocolo e arquivo.'],
    ]
  );

  doc.secao('2', 'Visao Geral da Arquitetura Proposta e Diagrama de Tramitacao');
  doc.paragrafo(
    'A solucao proposta reproduz a arquitetura de alta confiabilidade implementada com sucesso no modulo de Declaracoes (#DECL-). Ao gerar um protocolo unico (#TERMO-), o bot gerencia todo o ciclo de vida documental conectando Aluno, Coordenacao (Profª Natassya), Servidor de Correio e Google Drive de forma 100% autonoma:'
  );

  // Inserção da Figura do Canvas com proporção exata
  await figura(doc, F.fluxoTermosOnboarding(), 0.56);

  doc.subsecao('2.1. Os Quatro Atores Integrados no Circuito');
  doc.listaItem('1. Aluno (Voluntario): assina via Gov.br na DM do bot na 1ª etapa; nao necessita receber o arquivo co-assinado ao final.');
  doc.listaItem('2. CyberGuard Bot: valida assinaturas, gera o protocolo, envia e-mails SMTP, monitora a INBOX IMAP e executa a sincronizacao no Drive.');
  doc.listaItem('3. Coordenacao (Profª Natassya): assina no Gov.br e apenas responde ao e-mail recebido, sem necessidade de acessar o Discord.');
  doc.listaItem('4. Google Drive e Canal do RH: repositorio institucional categorizado em nuvem e auditoria com recibo formal no canal privado do RH.');

  // =========================================================================
  // PÁGINA 3: DETALHAMENTO OPERACIONAL PASSO A PASSO (ETAPAS 1 A 6)
  // =========================================================================
  doc.novaPagina();
  doc.secao('3', 'Detalhamento Operacional Passo a Passo');
  doc.paragrafo(
    'Abaixo estao descritas as 6 etapas operacionais que estruturam o novo ciclo de tramitacao do termo de voluntariado:'
  );

  doc.subsecao('Etapa 1 - Recepcao do Termo e Validacao Criptografica (Discord DM)');
  doc.paragrafo(
    'O aluno envia o arquivo .pdf assinado na DM do bot. O motor de inspecao (src/dataAssinatura.js) valida 6 criterios objetivos: (1) objeto criptografico /Sig autentico do Gov.br; (2) deteccao precisa da pagina e coordenadas do selo; (3) presenca na celula "Voluntario(a)" sem invadir a celula da Coordenacao; (4) preenchimento obrigatorio do campo interativo "Data:"; (5) compatibilidade com a janela de 90 dias; e (6) integridade estrutural. Caso haja inconformidade, o aluno e notificado imediatamente com instrucoes exatas para correcao.'
  );

  doc.subsecao('Etapa 2 - Protocolo #TERMO- e Transicao de Estado no PostgreSQL');
  doc.paragrafo(
    'Com o termo validado na primeira assinatura, o bot gera um identificador unico e indexavel no padrao #TERMO-<RA>-<4_DIGITOS> (ex.: #TERMO-0000000-1234). O status do membro e alterado para "aguardando_assinatura_professora", salvando o arquivo preliminar em docs/Termos-Voluntarios-Assinados/Pendentes/ e registrando o timestamp de envio. Nesse momento, o onboarding NAO e encerrado prematuramente.'
  );

  doc.subsecao('Etapa 3 - Disparo de E-mail Estruturado para a Profª Natassya (SMTP)');
  doc.paragrafo(
    'O bot conecta ao servidor SMTP autenticado e dispara o e-mail oficial para a Profª Natassya com copias configuradas (CC): assunto padronizado [CyberGuard] Termo de Voluntariado #${codigo} - ${membro.nome}, dados cadastrais do voluntario (Nome, RA, Curso, Area) e instrucoes objetivas para: (1) Baixar o anexo; (2) Co-assinar no Gov.br na celula da Coordenacao/DIREC; e (3) Responder ao proprio e-mail anexando o PDF co-assinado.'
  );

  doc.subsecao('Etapa 4 - Co-assinatura da Coordenacao no Gov.br e Resposta por E-mail');
  doc.paragrafo(
    'A Profª Natassya recebe o e-mail em seu cliente habitual (Outlook, Gmail ou webmail da UTFPR), realiza o download do termo, adiciona a assinatura digital Gov.br institucional e clica em "Responder" ao e-mail, mantendo o assunto original e anexando o arquivo co-assinado. Nao ha necessidade de efetuar login em outros sistemas nem de acessar o Discord.'
  );

  doc.subsecao('Etapa 5 - Escuta IMAP Autonoma e Inspecao de Arquivo');
  doc.paragrafo(
    'Um worker em segundo plano (src/termoEmail.js) varre a caixa postal a cada 1 minuto e 15s apos o boot: conecta-se via ImapFlow, busca mensagens com "TERMO-" no assunto, extrai o protocolo via regex /#(TERMO-[A-Z0-9_-]+)/i, localiza o membro no banco, baixa o anexo, valida o cabecalho binario (%PDF) e confirma a presenca de multiplos certificados digitais (/Sig).'
  );

  doc.subsecao('Etapa 6 - Upload no Google Drive, Arquivamento e Notificacoes Finais');
  doc.paragrafo(
    'Com o documento co-assinado validado, o bot executa em cascata a conclusao documental:'
  );
  doc.listaItem('Arquivamento Local: copia o PDF para docs/Termos-Voluntarios-Assinados/<SubpastaArea>/termo_assinado_<RA>_<Nome>_assinado.pdf.');
  doc.listaItem('Sincronizacao Google Drive: chama fazerUploadTermo(), enviando o arquivo para a subpasta da area via API do Drive.');
  doc.listaItem('Atualizacao de Status: altera o status do membro para "concluido", salvando o caminho do documento definitivo.');
  doc.listaItem('Marcacao no E-mail: aplica a flag \\Seen na mensagem do servidor de correio para evitar reprocessamento.');
  doc.listaItem('Aviso ao RH: publica confirmacao no canal do RH com o protocolo, link do Drive e copia do termo para arquivo (sem envio desnecessario a DM do aluno).');

  // =========================================================================
  // PÁGINA 4: ESPECIFICAÇÕES TÉCNICAS E MAPEAMENTO DO DRIVE
  // =========================================================================
  doc.novaPagina();
  doc.secao('4', 'Especificacoes Tecnicas de Banco de Dados e Software');
  doc.paragrafo(
    'A arquitetura do sistema foi projetada para garantir modularidade, rastreabilidade e minima intervencao em componentes ja homologados:'
  );

  doc.subsecao('4.1. Esquema Relacional e Migrations (PostgreSQL)');
  doc.paragrafo('Na tabela "membros", serao criados novos campos para controle da tramitacao:');
  doc.listaItem('codigo_termo TEXT UNIQUE: protocolo no padrao TERMO-<RA>-<4_DIGITOS> com indice para buscas ultrarrapidas.');
  doc.listaItem('status = "aguardando_assinatura_professora": status transicional que impede o fechamento prematuro do cadastro.');
  doc.listaItem('termo_aluno_path TEXT: caminho local do PDF preliminar com a assinatura do acadêmico.');
  doc.listaItem('termo_final_path TEXT: caminho local do PDF definitivo contendo ambas as assinaturas validas.');
  doc.listaItem('termo_enviado_professora_em TIMESTAMPTZ e termo_assinado_professora_em TIMESTAMPTZ: auditoria temporal.');

  doc.subsecao('4.2. Novos Modulos e Refatoracoes de Codigo');
  doc.tabela(
    [
      { nome: 'Modulo / Arquivo', largura: 135 },
      { nome: 'Escopo da Intervencao', largura: 135 },
      { nome: 'Finalidade Operacional', largura: 230 },
    ],
    [
      ['src/termoEmail.js', 'Criacao de novo modulo', 'Contem enviarTermoParaProfessora(), verificarRespostasTermos() e iniciarCronTermos().'],
      ['src/recepcaoTermo.js', 'Refatoracao pontual', 'Atualiza concluirTermoAssinado() para acionar a tramitacao em vez de upload prematuro.'],
      ['src/driveService.js', 'Reutilizacao integral', 'Funcao fazerUploadTermo() mapeia subpastas e faz o upload com o PDF final.'],
      ['src/db.js', 'Novas consultas SQL', 'Metodos para buscar membros por codigo_termo e atualizar os novos status e caminhos.'],
      ['src/config.js & .env', 'Configuracao de e-mails', 'Define EMAIL_PROFESSORA_TERMOS e EMAIL_TERMOS_CC a partir do arquivo .env.'],
      ['src/index.js', 'Inicializacao de Cron', 'Inicia o servico periodico de verificacao de termos juntamente com as declaracoes.'],
    ]
  );

  doc.subsecao('4.3. Mapeamento Automatizado de Pastas do Google Drive');
  doc.paragrafo(
    'O bot analisa o campo "area_interesse" do membro e aloca o documento automaticamente na subpasta correspondente no Drive:'
  );
  doc.tabela(
    [
      { nome: 'Area de Interesse Declarada', largura: 210 },
      { nome: 'Subpasta no Repositorio Local e Google Drive', largura: 290 },
    ],
    [
      ['Hacking Etico / Red Team / Blue Team', 'docs/Termos-Voluntarios-Assinados/HackingEtico/'],
      ['Design', 'docs/Termos-Voluntarios-Assinados/Design/'],
      ['Hardware Hacking', 'docs/Termos-Voluntarios-Assinados/HardwareHacking/'],
      ['Recursos Humanos', 'docs/Termos-Voluntarios-Assinados/Recursos Humanos/'],
      ['Social Media & Copy', 'docs/Termos-Voluntarios-Assinados/SocialMedia/'],
      ['Lideres e Presidencia', 'docs/Termos-Voluntarios-Assinados/Lideres/'],
      ['Outras areas ou nao identificada', 'docs/Termos-Voluntarios-Assinados/Geral/'],
    ]
  );

  // =========================================================================
  // PÁGINA 5: RESILIÊNCIA, HOMOLOGAÇÃO E PRONTIDÃO
  // =========================================================================
  doc.novaPagina();
  doc.secao('5', 'Tratamento de Excecoes, Resiliencia e Casos de Borda');
  doc.subsecao('5.1. Protecao contra Concorrencia (Mutex em Memoria)');
  doc.paragrafo(
    'A checagem IMAP e controlada pela flag isCheckingImapTermos. Se uma checagem estiver em andamento, iteracoes subsequentes do agendador sao descartadas ate a conclusao da primeira, eliminando qualquer risco de processamento duplicado ou concorrencia de I/O.'
  );

  doc.subsecao('5.2. Respostas sem Anexo ou com Formato Invalido');
  doc.paragrafo(
    'Caso o e-mail seja respondido sem arquivo anexado ou com extensao nao-PDF, o bot registra alerta em log e mantem o estado "aguardando_assinatura_professora" inalterado, sem marcar a mensagem como lida (\\Seen), permitindo o envio correto do documento.'
  );

  doc.subsecao('5.3. Validacao Rigorosa das Duas Assinaturas Digitais');
  doc.paragrafo(
    'Antes de concluir o onboarding e subir o PDF no Google Drive, o validador confere se o arquivo contem ao menos dois objetos /Sig validos, garantindo matematicamente que o termo arquivado na nuvem institucional possui as assinaturas do aluno e da professora.'
  );

  doc.subsecao('5.4. Lembretes Automaticos de Pendencia a Coordenacao');
  doc.paragrafo(
    'Caso uma solicitacao permaneca pendente por mais de 5 dias uteis sem resposta por e-mail, o sistema emite uma notificacao amigavel no canal do RH do Discord, permitindo que a lideranca verifique eventuais impedimentos ou realize contato institucional.'
  );

  doc.secao('6', 'Plano de Implementacao e Checklist de Homologacao');
  doc.tabela(
    [
      { nome: 'Fase', largura: 60 },
      { nome: 'Etapa de Desenvolvimento', largura: 210 },
      { nome: 'Criterio de Aceite e Homologacao', largura: 230 },
    ],
    [
      ['Fase 1', 'Migrations de Banco e Modelos SQL', 'Campos criados na tabela membros com indices de busca.'],
      ['Fase 2', 'Gerador de Protocolo e Disparo SMTP', 'E-mail com anexo e codigo #TERMO- entregue com sucesso.'],
      ['Fase 3', 'Parser IMAP e Sincronizacao Drive', 'Leitura da resposta, download do PDF e upload no Google Drive.'],
      ['Fase 4', 'Auditoria no Discord e Teste E2E', 'Notificacao no canal do RH com o recibo do Drive (sem DM ao aluno).'],
    ]
  );

  doc.alerta(
    'Prontidao para Implementacao',
    'A solucao proposta elimina 100% do esforco manual de triagem e upload, padroniza o arquivamento institucional e confere agilidade superior ao onboarding de novos voluntarios.',
    'sucesso'
  );

  // =========================================================================
  // SALVAR O DOCUMENTO PDF
  // =========================================================================
  const pastaDocs = path.resolve('./docs');
  const pastaManuais = path.resolve('./docs/manuais');
  if (!fs.existsSync(pastaDocs)) fs.mkdirSync(pastaDocs, { recursive: true });
  if (!fs.existsSync(pastaManuais)) fs.mkdirSync(pastaManuais, { recursive: true });

  const caminhoDocs = path.join(pastaDocs, 'Fluxo_Otimizacao_Termos_Assinados_Onboarding.pdf');
  const caminhoManuais = path.join(pastaManuais, 'Fluxo_Otimizacao_Termos_Assinados_Onboarding.pdf');

  await doc.salvar(caminhoDocs);
  fs.copyFileSync(caminhoDocs, caminhoManuais);
  console.log(`[Copia] Arquivo tambem salvo em: ${caminhoManuais}`);

  return caminhoDocs;
}

if (require.main === module) {
  gerarDocumentoFluxoTermosOnboarding()
    .then((caminho) => {
      console.log('Documento gerado com sucesso em:', caminho);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Erro ao gerar documento PDF:', err);
      process.exit(1);
    });
}

module.exports = { gerarDocumentoFluxoTermosOnboarding };
