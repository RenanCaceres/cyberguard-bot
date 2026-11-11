'use strict';

/**
 * CyberGuard UTFPR — Atividades e Cronograma Semestral de Voluntariado
 * Mapeamento institucional formal por setor e função (Membro vs Líder).
 * Cada termo possui vigência estrita de 6 meses, com cronograma distribuído nos Meses 1 a 6.
 */

const SETORES_PADRAO = [
  'Hacking Ético',
  'Hardware Hacking',
  'Design',
  'Copy',
  'Recursos Humanos',
  'Educacional',
  'Desenvolvimento',
];

const ATIVIDADES_POR_SETOR = {
  'Hacking Ético': {
    nomeExibicao: 'Hacking Ético',
    membro: {
      atividades: [
        '1 - Pesquisa e Simulação de Vetores de Ataque: Estudo prático de metodologias defensivas e ofensivas éticas (OWASP, MITRE ATT&CK), resolução de laboratórios controlados e desenvolvimento de competências em segurança de sistemas e redes.',
        '2 - Execução de Análises de Vulnerabilidades: Realização de varreduras técnicas, auditorias de segurança em ambientes simulados de laboratório (CTFs) e identificação de falhas de segurança em consonância estrita com princípios éticos e legais.',
        '3 - Análise de Inteligência de Ameaças (Threat Intelligence): Coleta, estudo e documentação de incidentes cibernéticos contemporâneos, malwares e vetores de exploração para municiar a base de conhecimento do projeto.',
        '4 - Documentação e Relatórios Técnicos: Redação de relatórios técnicos de vulnerabilidades (PoC - Prova de Conceito), contendo métricas de severidade (CVSS) e planos de mitigação e remediação recomendados.',
        '5 - Capacitação Técnica e Alinhamento com a Equipe: Participação assídua em treinamentos internos, estudos dirigidos do setor e repasse de conhecimento prático aos demais integrantes do projeto.',
      ],
      cronograma: [
        [1, 2],       // Ativ 1: 2 meses
        [2, 3, 4],    // Ativ 2: 3 meses
        [3, 4, 5],    // Ativ 3: 3 meses
        [4, 5, 6],    // Ativ 4: 3 meses
        [5, 6],       // Ativ 5: 2 meses
      ],
    },
    lider: {
      atividades: [
        '1 - Planejamento Técnico e Arquitetura de Laboratórios: Definição da trilha de capacitação técnica, montagem e gestão da infraestrutura de simulação (CTFs, máquinas vulneráveis e ranges de teste) para o setor.',
        '2 - Supervisão Metodológica e Revisão de Relatórios: Validação técnica de todas as análises de vulnerabilidade produzidas pela equipe, garantindo conformidade com padrões de mercado e integridade ética do projeto.',
        '3 - Coordenação de Simulações e Exercícios de Defesa: Direcionamento e acompanhamento de exercícios de simulação de resposta a incidentes e exercícios colaborativos alinhados aos objetivos da ação de extensão.',
        '4 - Mentoria Técnica e Desenvolvimento de Pessoas: Condução de alinhamentos técnicos periódicos, nivelamento do conhecimento dos membros e identificação de potenciais de pesquisa no time.',
        '5 - Governança do Setor e Alinhamento Intersetorial: Controle do cronograma de entregas técnicas, integração contínua com os setores de Hardware Hacking e Desenvolvimento, e prestação de contas à Coordenação.',
      ],
      cronograma: [
        [1, 2],          // Ativ 1: 2 meses
        [2, 3, 4, 5],    // Ativ 2: 4 meses
        [3, 4, 5],       // Ativ 3: 3 meses
        [2, 3, 4, 5, 6], // Ativ 4: 5 meses
        [4, 5, 6],       // Ativ 5: 3 meses
      ],
    },
  },

  'Design': {
    nomeExibicao: 'Design',
    membro: {
      atividades: [
        '1 - Produção Visual e Criação Gráfica: Criação de peças gráficas, ilustrações, infográficos educativos e layouts para publicações digitais, materiais institucionais e divulgação de eventos do projeto.',
        '2 - Materialização Visual de Conteúdo Educativo: Desdobramento visual dos roteiros e pautas elaborados pelo setor de Copy, traduzindo conceitos técnicos de cibersegurança em artes visuais atrativas, claras e intuitivas.',
        '3 - Design de Interfaces e Experiência do Usuário (UI/UX): Prototipação de telas, fluxos de navegação e componentes visuais para os sistemas, portais web e plataformas desenvolvidas pelo CyberGuard.',
        '4 - Aplicação e Padronização da Identidade Visual: Observância rigorosa do manual de marca do projeto e das diretrizes institucionais da UTFPR, garantindo consistência em cores, tipografia e acessibilidade visual.',
        '5 - Preparação e Otimização de Ativos Digitais: Exportação, organização e catalogação de arquivos gráficos nos formatos ideais para web, mídias sociais e materiais de apresentação acadêmica.',
      ],
      cronograma: [
        [2, 3, 4, 5],    // Ativ 1: 4 meses
        [2, 3, 4, 5, 6], // Ativ 2: 5 meses
        [3, 4, 5],       // Ativ 3: 3 meses
        [1, 2],          // Ativ 4: 2 meses
        [5, 6],          // Ativ 5: 2 meses
      ],
    },
    lider: {
      atividades: [
        '1 - Direção de Arte e Estratégia Visual: Definição do conceito visual e da linguagem estética das campanhas do projeto, assegurando padrão visual profissional de nível institucional.',
        '2 - Gestão do Fluxo de Demandas Intersetoriais: Triagem, priorização e distribuição de tarefas visuais solicitadas pelos setores de Copy, Desenvolvimento e Educacional, gerindo prazos de entrega.',
        '3 - Revisão de Qualidade Gráfica e Brand Guidelines: Validação técnica e estética de todas as peças produzidas antes da publicação final, garantindo contraste, legibilidade e alinhamento à identidade visual.',
        '4 - Manutenção do Design System do Projeto: Governança do repositório central de ativos visuais, templates padronizados, paletas e elementos gráficos reutilizáveis da equipe.',
        '5 - Mentoria Técnica e Capacitação de Designers: Treinamento dos membros em ferramentas de design vetorial e prototipagem (Figma, Photoshop, Illustrator) e princípios avançados de composição visual.',
      ],
      cronograma: [
        [1, 2],          // Ativ 1: 2 meses
        [2, 3, 4, 5],    // Ativ 2: 4 meses
        [2, 3, 4, 5, 6], // Ativ 3: 5 meses
        [1, 2, 3],       // Ativ 4: 3 meses
        [3, 4, 5, 6],    // Ativ 5: 4 meses
      ],
    },
  },

  'Copy': {
    nomeExibicao: 'Copy (Social Media & Comunicação)',
    membro: {
      atividades: [
        '1 - Redação e Divulgação Científica em Cibersegurança: Redação de textos, artigos e comunicados educativos, traduzindo terminologias técnicas complexas em linguagem acessível e engajadora para o público geral.',
        '2 - Elaboração de Roteiros e Briefings para Design: Criação de pautas estruturadas, copies para carrosséis e especificações criativas para orientar a produção visual da equipe de Design.',
        '3 - Gestão Operacional de Redes Sociais: Agendamento de postagens, monitoramento de interações da comunidade externa, resposta a comentários e aplicação de boas práticas de engajamento digital.',
        '4 - Cobertura de Eventos e Projetos de Extensão: Produção de registros textuais de oficinas presenciais, palestras, participações em congressos e realizações dos membros para registro histórico e divulgação institucional.',
        '5 - Monitoramento de Tendências e Atualidades (Newsjacking): Acompanhamento do noticiário global sobre incidentes de segurança e vazamentos de dados para gerar conteúdo ágil de conscientização pública.',
      ],
      cronograma: [
        [2, 3, 4, 5],    // Ativ 1: 4 meses
        [2, 3, 4, 5],    // Ativ 2: 4 meses
        [2, 3, 4, 5, 6], // Ativ 3: 5 meses
        [3, 4, 5, 6],    // Ativ 4: 4 meses
        [1, 2],          // Ativ 5: 2 meses
      ],
    },
    lider: {
      atividades: [
        '1 - Planejamento Editorial e Estratégia de Conteúdo: Elaboração do cronograma editorial mensal, alinhamento dos pilares de comunicação com a Coordenação e definição dos temas prioritários de conscientização.',
        '2 - Gestão e Revisão Textual do Tom de Voz: Validação de todas as redações e pautas antes da publicação, garantindo rigor conceitual, correção gramatical e conformidade com o tom de voz do projeto.',
        '3 - Diagnóstico de Métricas e Performance de Audiência: Acompanhamento de indicadores de alcance, retenção e engajamento das redes sociais, propondo ajustes contínuos na estratégia de divulgação.',
        '4 - Articulação com Design e Diretoria: Sincronização direta com a liderança de Design para alinhamento de cronogramas e execução de campanhas especiais (processo seletivo, eventos, oficinas).',
        '5 - Capacitação e Mentoria em Redação Digital: Orientação dos membros em técnicas de copywriting, storytelling, SEO para mídias sociais e comunicação pública de ciência e tecnologia.',
      ],
      cronograma: [
        [1, 2],          // Ativ 1: 2 meses
        [2, 3, 4, 5, 6], // Ativ 2: 5 meses
        [3, 4, 5, 6],    // Ativ 3: 4 meses
        [2, 3, 4, 5],    // Ativ 4: 4 meses
        [1, 2, 3],       // Ativ 5: 3 meses
      ],
    },
  },

  'Desenvolvimento': {
    nomeExibicao: 'Desenvolvimento',
    membro: {
      atividades: [
        '1 - Engenharia de Software e Desenvolvimento Web: Programação, manutenção e evolução de portais, plataformas web e páginas institucionais do projeto, adotando padrões de código limpo e acessibilidade.',
        '2 - Automação de Processos e Serviços de Apoio: Desenvolvimento e sustentação de rotinas automatizadas, bots operacionais (como o CyberGuard Bot) e integrações de API para produtividade das equipes.',
        '3 - Implementação de Segurança em Código (AppSec) e LGPD: Aplicação de práticas de codificação segura, tratamento adequado de dados sensíveis e criptografia de ponta a ponta em repouso e em trânsito.',
        '4 - Versionamento, Testes e Documentação Técnica: Gestão de branches via Git, escrita de testes automatizados, resolução de bugs e documentação clara dos sistemas desenvolvidos.',
        '5 - Suporte a Demandas Técnicas Intersetoriais: Colaboração com os setores de RH, Educacional e Hacking Ético na implementação de ferramentas sob medida para as atividades de extensão.',
      ],
      cronograma: [
        [2, 3, 4, 5],    // Ativ 1: 4 meses
        [2, 3, 4],       // Ativ 2: 3 meses
        [1, 2, 3],       // Ativ 3: 3 meses
        [3, 4, 5, 6],    // Ativ 4: 4 meses
        [4, 5, 6],       // Ativ 5: 3 meses
      ],
    },
    lider: {
      atividades: [
        '1 - Arquitetura de Sistemas e Definição de Tecnologias: Planejamento arquitetural das soluções de software do projeto, garantindo escalabilidade, segurança e aderência aos padrões técnicos da UTFPR.',
        '2 - Revisão de Código (Code Review) e Qualidade: Inspeção rigorosa de Pull Requests, orientando o time quanto a boas práticas de segurança, legibilidade, desacoplamento e desempenho.',
        '3 - Gestão de Infraestrutura e Implantação Contínua (CI/CD): Manutenção dos ambientes de produção, pipelines de deploy automatizado e monitoramento de estabilidade dos sistemas e bots.',
        '4 - Gestão Ágil e Distribuição de Demandas: Estruturação do backlog de desenvolvimento, definição de sprints técnicas, estimativa de esforço e acompanhamento contínuo das entregas dos desenvolvedores.',
        '5 - Mentoria Técnica e Capacitação de Desenvolvedores: Apoio individual aos voluntários em resolução de problemas complexos de lógica, arquitetura de APIs e governança de software livre.',
      ],
      cronograma: [
        [1, 2],          // Ativ 1: 2 meses
        [2, 3, 4, 5, 6], // Ativ 2: 5 meses
        [1, 2, 3, 4],    // Ativ 3: 4 meses
        [2, 3, 4, 5],    // Ativ 4: 4 meses
        [3, 4, 5, 6],    // Ativ 5: 4 meses
      ],
    },
  },

  'Educacional': {
    nomeExibicao: 'Educacional',
    membro: {
      atividades: [
        '1 - Condução Direta de Aulas e Oficinas Comunitárias: Ministração presencial e remota de treinamentos em segurança digital, proteção de senhas e prevenção a golpes cibernéticos para escolas e comunidade externa.',
        '2 - Elaboração de Material Didático e Planos de Aula: Criação de apostilas, slides interativos, roteiros de dinâmicas práticas e cartilhas educativas adaptadas para diferentes faixas etárias.',
        '3 - Mediação Pedagógica Intersetorial: Fornecimento de suporte didático para membros dos setores técnicos (Hacking Ético e Hardware Hacking) durante apresentações e demonstrações públicas.',
        '4 - Coleta de Evidências e Avaliação de Aprendizagem: Aplicação de questionários de assimilação e pesquisas de satisfação aos alunos participantes para verificação de eficácia dos conteúdos ministrados.',
        '5 - Estudo e Aplicação de Metodologias Ativas: Pesquisa contínua sobre abordagens pedagógicas dinâmicas (gamificação, estudos de caso) para facilitar o entendimento de temas complexos de segurança.',
      ],
      cronograma: [
        [3, 4, 5],       // Ativ 1: 3 meses
        [1, 2, 3],       // Ativ 2: 3 meses
        [3, 4, 5, 6],    // Ativ 3: 4 meses
        [4, 5, 6],       // Ativ 4: 3 meses
        [1, 2],          // Ativ 5: 2 meses
      ],
    },
    lider: {
      atividades: [
        '1 - Planejamento Pedagógico e Desenho Curricular: Estruturação das trilhas formativas de extensão, alinhando a matriz de conteúdos às diretrizes pedagógicas e aos objetivos comunitários da UTFPR.',
        '2 - Articulação Institucional com Parceiros Externos: Contato e alinhamento com escolas públicas, secretarias e entidades sociais para agendamento de oficinas e levantamento de necessidades pedagógicas.',
        '3 - Acompanhamento e Qualificação de Instrutores: Observação das aulas ministradas pelos membros, fornecimento de feedbacks didáticos de oratória e estruturação de ensaios prévios.',
        '4 - Consolidação de Indicadores de Impacto Educacional: Tabulação de métricas de alunos impactados, escolas atendidas e relatórios quantitativos e qualitativos exigidos pela DIREC.',
        '5 - Gestão Operacional de Eventos e Oficinas: Organização da escala de voluntários, logística de materiais pedagógicos e supervisão do cumprimento do cronograma de visitas comunitárias.',
      ],
      cronograma: [
        [1, 2],          // Ativ 1: 2 meses
        [2, 3, 4],       // Ativ 2: 3 meses
        [3, 4, 5],       // Ativ 3: 3 meses
        [5, 6],          // Ativ 4: 2 meses
        [2, 3, 4, 5, 6], // Ativ 5: 5 meses
      ],
    },
  },

  'Recursos Humanos': {
    nomeExibicao: 'Recursos Humanos',
    membro: {
      atividades: [
        '1 - Operação de Processos Seletivos: Triagem de inscrições de voluntários, agendamento de entrevistas, suporte nas etapas de seleção e acompanhamento dos canais de recepção de candidatos.',
        '2 - Integração e Acompanhamento de Novos Voluntários: Apoio nas jornadas de acolhimento (onboarding), conferência do preenchimento de termos de adesão e orientação sobre a estrutura do projeto.',
        '3 - Auditoria de Frequência e Controle de Carga Horária: Acompanhamento semanal dos registros de horas no sistema, análise de justificativas de ausência e envio de lembretes amigáveis para regularização.',
        '4 - Execução de Ações de Clima e Integração: Apoio na organização de confraternizações, dinâmicas de acolhimento, comemoração de datas importantes e incentivo à convivência saudável entre setores.',
        '5 - Manutenção de Cadastros e Governança de Dados (LGPD): Alimentação e higienização contínua das planilhas e bases do Notion/PostgreSQL, assegurando absoluto sigilo das informações pessoais.',
      ],
      cronograma: [
        [1, 2],          // Ativ 1: 2 meses
        [1, 2, 3],       // Ativ 2: 3 meses
        [2, 3, 4, 5, 6], // Ativ 3: 5 meses
        [2, 3, 4, 5],    // Ativ 4: 4 meses
        [3, 4, 5, 6],    // Ativ 5: 4 meses
      ],
    },
    lider: {
      atividades: [
        '1 - Planejamento Estratégico e Aquisição de Talentos: Definição da metodologia de recrutamento e seleção, estruturação dos fluxos de entrada (onboarding) e mapeamento das competências necessárias para as vagas.',
        '2 - Facilitação de Clima e Cultura Organizacional: Mediação de conflitos, manutenção da harmonia da equipe, facilitação da integração contínua entre setores e preservação dos valores do CyberGuard.',
        '3 - Gestão de Desempenho e Ciclos de Avaliação: Condução de avaliações periódicas de desempenho (reviews individuais e de setor), mapeamento de pontos de melhoria e suporte ao plano de desenvolvimento dos voluntários.',
        '4 - Governança de Pessoas e Auditoria Regulatória: Auditoria de conformidade das horas registradas, supervisão do arquivamento seguro dos termos de voluntariado e garantia do cumprimento irrestrito da LGPD.',
        '5 - Emissão de Relatórios Executivos à Coordenação: Consolidação estatística dos dados de permanência, engajamento e retenção da equipe para municiar os relatórios de avaliação institucional da UTFPR.',
      ],
      cronograma: [
        [1, 2],          // Ativ 1: 2 meses
        [1, 2, 3, 4, 5, 6], // Ativ 2: 6 meses (contínuo)
        [3, 4, 5],       // Ativ 3: 3 meses
        [3, 4, 5, 6],    // Ativ 4: 4 meses
        [5, 6],          // Ativ 5: 2 meses
      ],
    },
  },

  'Hardware Hacking': {
    nomeExibicao: 'Hardware Hacking',
    membro: {
      atividades: [
        '1 - Montagem e Manutenção de Circuitos de Teste: Montagem de protótipos em bancada, desenvolvimento de circuitos com microcontroladores (ESP32, Arduino, Raspberry Pi) e preparação de dispositivos para estudos.',
        '2 - Estudo Prático de Barramentos e Segurança Física: Análise de vulnerabilidades em protocolos e barramentos de comunicação física (UART, I2C, SPI, BLE, RFID/NFC, Wi-Fi) em ambiente supervisionado.',
        '3 - Prototipagem de Ferramentas e Kits Didáticos: Execução de solda eletrônica, testes elétricos de continuidade e montagem física de kits práticos para demonstrações em eventos de extensão.',
        '4 - Documentação de Esquemáticos e Manuais Técnicos: Registro de pinagens, esquemáticos elétricos e confecção de guias passo a passo de montagem para viabilizar a replicação segura dos protótipos.',
        '5 - Suporte Operacional em Demonstrações Práticas: Preparação, transporte seguro e montagem de equipamentos eletrônicos durante exposições, palestras e visitas com o setor Educacional.',
      ],
      cronograma: [
        [2, 3, 4],    // Ativ 1: 3 meses
        [1, 2, 3],    // Ativ 2: 3 meses
        [3, 4, 5],    // Ativ 3: 3 meses
        [4, 5, 6],    // Ativ 4: 3 meses
        [5, 6],       // Ativ 5: 2 meses
      ],
    },
    lider: {
      atividades: [
        '1 - Gestão do Laboratório de Bancada e Patrimônio: Controle de inventário de componentes eletrônicos, placas, sensores e ferramentas de medição (osciloscópios, multímetros), zelando pela integridade dos equipamentos.',
        '2 - Planejamento de Projetos e Especificação de Hardware: Definição da arquitetura e dos escopos dos dispositivos de pesquisa e kits didáticos a serem construídos pelo setor ao longo do semestre.',
        '3 - Protocolos de Segurança Operacional em Bancada: Estabelecimento e fiscalização de normas de segurança elétrica (prevenção a curto-circuitos, uso seguro de ferros de solda e baterias).',
        '4 - Mentoria Técnica em Sistemas Embarcados e Firmware: Orientação dos membros em programação de baixo nível (C/C++, MicroPython), análise de sinais e engenharia reversa de hardware.',
        '5 - Interface Intersetorial e Relatórios de Pesquisa: Alinhamento de projetos conjuntos com os setores de Hacking Ético e Desenvolvimento, e consolidação de relatórios de inovação para a Coordenação.',
      ],
      cronograma: [
        [1, 2],          // Ativ 1: 2 meses
        [1, 2, 3],       // Ativ 2: 3 meses
        [1, 2],          // Ativ 3: 2 meses
        [2, 3, 4, 5],    // Ativ 4: 4 meses
        [4, 5, 6],       // Ativ 5: 3 meses
      ],
    },
  },
};

/**
 * Normaliza o nome do setor para os nomes canônicos do CyberGuard.
 */
function normalizarNomeSetor(nome) {
  if (!nome || typeof nome !== 'string') return 'Recursos Humanos';
  const clean = nome.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (clean.includes('hardware')) return 'Hardware Hacking';
  if (
    clean.includes('hack') ||
    clean.includes('etico') ||
    clean.includes('red') ||
    clean.includes('blue') ||
    clean.includes('observat')
  ) {
    return 'Hacking Ético';
  }
  if (clean.includes('design') || clean.includes('desing')) return 'Design';
  if (clean.includes('copy') || clean.includes('social') || clean.includes('comunic')) return 'Copy';
  if (
    clean.includes('desenv') ||
    clean.includes('dev') ||
    clean.includes('software') ||
    clean.includes('program')
  ) {
    return 'Desenvolvimento';
  }
  if (clean.includes('educ') || clean.includes('pedag') || clean.includes('aula')) return 'Educacional';
  if (clean.includes('rh') || clean.includes('humano') || clean.includes('pessoas')) return 'Recursos Humanos';

  return 'Recursos Humanos';
}

/**
 * Retorna as atividades e cronograma configurados para o setor e função.
 */
function obterAtividadesECronograma(setorRaw, ehLider = false) {
  const setor = normalizarNomeSetor(setorRaw);
  const dadosSetor = ATIVIDADES_POR_SETOR[setor] || ATIVIDADES_POR_SETOR['Recursos Humanos'];
  const papelKey = ehLider ? 'lider' : 'membro';
  const configPapel = dadosSetor[papelKey];

  return {
    setorNome: dadosSetor.nomeExibicao,
    ehLider: Boolean(ehLider),
    papelLabel: ehLider ? 'Líder' : 'Membro',
    atividades: [...configPapel.atividades],
    cronograma: configPapel.cronograma.map((m) => [...m]),
  };
}

/**
 * Calcula o período de vigência de 6 meses a partir de uma data de referência (ex: entrada / assinatura).
 * Formato retornado: MM/AAAA para INÍCIO e FIM.
 */
function calcularPeriodo6Meses(dataReferencia = new Date()) {
  const dInicio = dataReferencia instanceof Date && !isNaN(dataReferencia.getTime())
    ? new Date(dataReferencia)
    : new Date();

  const mesInicio = dInicio.getMonth() + 1;
  const anoInicio = dInicio.getFullYear();

  // Vigência de 6 meses
  const dFim = new Date(dInicio);
  dFim.setMonth(dFim.getMonth() + 6);
  const mesFim = dFim.getMonth() + 1;
  const anoFim = dFim.getFullYear();

  const fmt = (m, a) => `${String(m).padStart(2, '0')}/${a}`;

  return {
    inicioStr: fmt(mesInicio, anoInicio),
    fimStr: fmt(mesFim, anoFim),
    dataInicio: dInicio,
    dataFim: dFim,
  };
}

/**
 * Injeta dinamicamente as 5 atividades do setor e o cronograma semestral no XML do DOCX (word/document.xml).
 */
function aplicarAtividadesECronogramaNoXml(xmlOriginal, setorRaw, ehLider = false, dataReferencia = new Date(), atividadesCustom = null) {
  const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
  const { setorNome, papelLabel, atividades: ativPadrao, cronograma } = obterAtividadesECronograma(setorRaw, ehLider);
  const atividades = (Array.isArray(atividadesCustom) && atividadesCustom.length === 5)
    ? atividadesCustom
    : ativPadrao;
  const { inicioStr, fimStr } = calcularPeriodo6Meses(dataReferencia);

  const doc = new DOMParser().parseFromString(xmlOriginal, 'text/xml');
  const wNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // 1. Heading da seção de síntese
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  for (const p of paragraphs) {
    if (p.textContent.includes('Síntese das atividades a serem desenvolvidas')) {
      const texts = Array.from(p.getElementsByTagName('w:t'));
      if (texts.length > 0) {
        texts[0].textContent = `Síntese das atividades a serem desenvolvidas pelo(a) voluntário(a) — ${setorNome} (${papelLabel})`;
        for (let i = 1; i < texts.length; i++) texts[i].textContent = '';
      }
      break;
    }
  }

  // 2. Localização das tabelas de atividades e cronograma
  const tables = Array.from(doc.getElementsByTagName('w:tbl'));
  let tbl5 = null;
  let tbl6 = null;
  let tbl7 = null;

  for (const tbl of tables) {
    const txt = tbl.textContent;
    if (txt.includes('Planejamento Estratégico') || txt.includes('1 - ')) tbl5 = tbl;
    if (txt.includes('Consolidação de Relatórios') || txt.includes('social; além') || txt.includes('4 - ') || txt.includes('5 - ')) tbl6 = tbl;
    if (txt.includes('PERÍODO') && txt.includes('ATIVIDADES')) tbl7 = tbl;
  }

  function formatarCelulaAtividade(tr, texto) {
    const tc = tr.getElementsByTagName('w:tc')[0];
    if (!tc) return;
    const tcPr = tc.getElementsByTagName('w:tcPr')[0];
    while (tc.firstChild) tc.removeChild(tc.firstChild);
    if (tcPr) tc.appendChild(tcPr);

    const p = doc.createElementNS(wNs, 'w:p');
    const pPr = doc.createElementNS(wNs, 'w:pPr');
    const pStyle = doc.createElementNS(wNs, 'w:pStyle');
    pStyle.setAttribute('w:val', 'TableParagraph');
    pPr.appendChild(pStyle);

    const spacing = doc.createElementNS(wNs, 'w:spacing');
    spacing.setAttribute('w:lineRule', 'exact');
    spacing.setAttribute('w:line', '230');
    spacing.setAttribute('w:before', '2');
    spacing.setAttribute('w:after', '2');
    pPr.appendChild(spacing);

    const ind = doc.createElementNS(wNs, 'w:ind');
    ind.setAttribute('w:left', '105');
    ind.setAttribute('w:right', '150');
    pPr.appendChild(ind);
    p.appendChild(pPr);

    if (texto.includes(':')) {
      const idx = texto.indexOf(':');
      const titulo = texto.slice(0, idx + 1);
      const desc = texto.slice(idx + 1);

      // Título numerado em negrito
      const r1 = doc.createElementNS(wNs, 'w:r');
      const rPr1 = doc.createElementNS(wNs, 'w:rPr');
      rPr1.appendChild(doc.createElementNS(wNs, 'w:b'));
      const sz1 = doc.createElementNS(wNs, 'w:sz');
      sz1.setAttribute('w:val', '20');
      rPr1.appendChild(sz1);
      r1.appendChild(rPr1);
      const t1 = doc.createElementNS(wNs, 'w:t');
      t1.textContent = titulo;
      r1.appendChild(t1);
      p.appendChild(r1);

      // Descrição em fonte regular
      const r2 = doc.createElementNS(wNs, 'w:r');
      const rPr2 = doc.createElementNS(wNs, 'w:rPr');
      const sz2 = doc.createElementNS(wNs, 'w:sz');
      sz2.setAttribute('w:val', '20');
      rPr2.appendChild(sz2);
      r2.appendChild(rPr2);
      const t2 = doc.createElementNS(wNs, 'w:t');
      t2.setAttribute('xml:space', 'preserve');
      t2.textContent = desc;
      r2.appendChild(t2);
      p.appendChild(r2);
    } else {
      const r = doc.createElementNS(wNs, 'w:r');
      const rPr = doc.createElementNS(wNs, 'w:rPr');
      const sz = doc.createElementNS(wNs, 'w:sz');
      sz.setAttribute('w:val', '20');
      rPr.appendChild(sz);
      r.appendChild(rPr);
      const t = doc.createElementNS(wNs, 'w:t');
      t.textContent = texto;
      r.appendChild(t);
      p.appendChild(r);
    }

    tc.appendChild(p);
  }

  // 3. Popula atividades 1, 2 e 3 na tabela da página 1 (tbl5)
  if (tbl5) {
    const trs = Array.from(tbl5.getElementsByTagName('w:tr'));
    if (trs.length > 3) {
      for (let i = 3; i < trs.length; i++) tbl5.removeChild(trs[i]);
    }
    if (trs[0]) formatarCelulaAtividade(trs[0], atividades[0]);
    if (trs[1]) formatarCelulaAtividade(trs[1], atividades[1]);
    if (trs[2]) formatarCelulaAtividade(trs[2], atividades[2]);
  }

  // 4. Popula atividades 4 e 5 na tabela da página 2 (tbl6)
  if (tbl6) {
    const trs = Array.from(tbl6.getElementsByTagName('w:tr'));
    if (trs[0]) formatarCelulaAtividade(trs[0], atividades[3]);
    if (trs[1]) formatarCelulaAtividade(trs[1], atividades[4]);
  }

  // 5. Atualiza o cronograma semestral (tbl7)
  if (tbl7) {
    const trs = Array.from(tbl7.getElementsByTagName('w:tr'));
    // Linha 0: INÍCIO (MM/AAAA) e FIM (MM/AAAA)
    if (trs[0]) {
      const cells = Array.from(trs[0].getElementsByTagName('w:tc'));
      if (cells[2]) {
        const t = cells[2].getElementsByTagName('w:t')[0];
        if (t) t.textContent = inicioStr;
      }
      if (cells[4]) {
        const t = cells[4].getElementsByTagName('w:t')[0];
        if (t) t.textContent = fimStr;
      }
    }

    // Linha 2: Números dos meses 1 a 12
    if (trs[2]) {
      const cells = Array.from(trs[2].getElementsByTagName('w:tc'));
      for (let m = 1; m <= 12; m++) {
        const tc = cells[m];
        if (!tc) continue;
        let p = tc.getElementsByTagName('w:p')[0];
        if (!p) {
          p = doc.createElementNS(wNs, 'w:p');
          tc.appendChild(p);
        }
        let r = p.getElementsByTagName('w:r')[0];
        if (!r) {
          r = doc.createElementNS(wNs, 'w:r');
          const rPr = doc.createElementNS(wNs, 'w:rPr');
          const sz = doc.createElementNS(wNs, 'w:sz');
          sz.setAttribute('w:val', '16');
          rPr.appendChild(sz);
          r.appendChild(rPr);
          p.appendChild(r);
        }
        let t = r.getElementsByTagName('w:t')[0];
        if (!t) {
          t = doc.createElementNS(wNs, 'w:t');
          r.appendChild(t);
        }
        t.textContent = String(m);
      }
    }

    // Linhas 3 a 7: Atividades 1 a 5 com 'x' nos meses vigentes (1 a 6)
    for (let ativIdx = 0; ativIdx < 5; ativIdx++) {
      const tr = trs[3 + ativIdx];
      if (!tr) continue;
      const cells = Array.from(tr.getElementsByTagName('w:tc'));
      const mesesAtivos = cronograma[ativIdx] || [];

      for (let m = 1; m <= 12; m++) {
        const tc = cells[m];
        if (!tc) continue;
        let p = tc.getElementsByTagName('w:p')[0];
        if (!p) {
          p = doc.createElementNS(wNs, 'w:p');
          tc.appendChild(p);
        }
        // Limpa runs existentes
        const runs = Array.from(p.getElementsByTagName('w:r'));
        for (const r of runs) p.removeChild(r);

        if (mesesAtivos.includes(m)) {
          const r = doc.createElementNS(wNs, 'w:r');
          const rPr = doc.createElementNS(wNs, 'w:rPr');
          const sz = doc.createElementNS(wNs, 'w:sz');
          sz.setAttribute('w:val', '18');
          rPr.appendChild(sz);
          r.appendChild(rPr);
          const t = doc.createElementNS(wNs, 'w:t');
          t.textContent = 'x';
          r.appendChild(t);
          p.appendChild(r);
        }
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}

module.exports = {
  SETORES_PADRAO,
  ATIVIDADES_POR_SETOR,
  normalizarNomeSetor,
  obterAtividadesECronograma,
  calcularPeriodo6Meses,
  aplicarAtividadesECronogramaNoXml,
};
