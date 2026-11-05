const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const db = require('./db');
const config = require('./config');
const validators = require('./validators');
const { mascararCPF } = require('./cryptoUtils');

const sessoesAtivas = new Set();
const coletoresAtivos = new Set();

async function buscarMembroGuild(client, userId) {
  try {
    const guildId = config.guildId || process.env.GUILD_ID;
    if (!guildId) return null;
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return null;
    return await guild.members.fetch(userId).catch(() => null);
  } catch (err) {
    console.error('[onboarding] Erro ao buscar guild/membro:', err);
    return null;
  }
}

async function encerrarOnboardingCancelado(userId) {
  try {
    const regExistente = await db.getMembro(userId);
    if (regExistente && (regExistente.nome || regExistente.cpf)) {
      await db.atualizarStatus(userId, 'abandonado', { saida_processada: true });
    } else {
      await db.removerMembro(userId);
    }
  } catch (err) {
    console.error('[onboarding] Erro ao encerrar onboarding cancelado:', err);
  }
}

const TERMO_CIENCIA_TEXTO =
  'Em conformidade com a **Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018)**, ' +
  'informamos como seus dados pessoais serão tratados pelo **Projeto CyberGuard (UTFPR)**:\n\n' +
  '📌 **1. Finalidade Exclusiva (Art. 6º, I da LGPD):**\n' +
  'Os dados solicitados a seguir serão utilizados **apenas para fins de registros e acadêmicos** ' +
  '(formalização do Termo de Adesão ao Serviço Voluntário conforme a Lei nº 9.608/1998, emissão de declarações/certificados ' +
  'de horas de extensão junto à UTFPR e controle interno de membros), **vedando qualquer outro tipo de uso**.\n\n' +
  '🔒 **2. Segurança, Criptografia e Arquivamento (Art. 16 e Art. 46 da LGPD):**\n' +
  'Seus dados cadastrais (como CPF, data de nascimento, endereço e telefone) são armazenados com **criptografia de ponta (AES-256-GCM)** ' +
  'no banco de dados e **permanecerão arquivados de forma segura** para fins de registro histórico institucional e comprovação ' +
  'acadêmica, mesmo após eventual saída ou desligamento do projeto.\n\n' +
  '👥 **3. Acesso Restrito:**\n' +
  'O acesso às informações e aos termos assinados é restrito **exclusivamente ao Presidente (André) e ao Diretor de RH (Renan Cáceres Anselmo)**, ' +
  'com apoio do membro de RH Conrado Henrique Lima da Mata para conferência e atendimento. ' +
  'Nenhum integrante de outras diretorias possui acesso aos seus documentos.\n\n' +
  '⚖️ **4. Direitos do Titular (Art. 18 da LGPD):**\n' +
  'A qualquer momento no servidor, você poderá utilizar o comando `/meus-dados` (100% privado) para visualizar seus dados, ' +
  'atualizar informações cadastrais ou entrar em contato com o RH sobre sua privacidade.';

const PERGUNTAS = [
  { campo: 'nome', texto: 'Qual seu **nome completo**?', validator: validators.naoVazio },
  {
    campo: 'data_nascimento',
    texto: 'Qual sua **data de nascimento**? (formato dd/mm/aaaa, ex: 10/08/2004)',
    validator: validators.validarData,
    erro: 'Data inválida. Use o formato dd/mm/aaaa (ex: 10/08/2004).',
  },
  { campo: 'nacionalidade', texto: 'Qual sua **nacionalidade**?', validator: validators.naoVazio },
  {
    campo: 'cpf',
    texto: 'Qual seu **CPF**? (formato 111.222.333-44)',
    validator: validators.validarCPF,
    erro: 'Formato inválido. Use exatamente 111.222.333-44 (com pontos e traço).',
  },
  { campo: 'estudante_utfpr', tipo: 'botoes_utfpr' },
  { campo: 'curso', texto: 'Qual seu **curso**?', validator: validators.naoVazio },
  {
    campo: 'periodo',
    texto: 'Qual seu **período/semestre atual**? (ex: 5°)',
    validator: validators.naoVazio,
  },
  {
    campo: 'ra',
    texto: (respostas) =>
      respostas.estudante_utfpr === 'Não'
        ? 'Qual seu **RA ou matrícula**? (sem espaços)'
        : 'Qual seu **RA**? (apenas números, sem pontos ou espaços)',
    validator: (valor, respostas) =>
      respostas.estudante_utfpr === 'Não'
        ? validators.validarRAOuMatricula(valor)
        : validators.validarRA(valor),
    erro: (respostas) =>
      respostas.estudante_utfpr === 'Não'
        ? 'Informe um RA/matrícula válido (letras e/ou números, sem espaços).'
        : 'O RA deve conter apenas números.',
  },
  {
    campo: 'endereco',
    texto: 'Qual seu **endereço**? (formato: Rua/Avenida Nome, N° - Bairro)',
    validator: validators.validarEndereco,
    erro: 'Formato inválido. Use: Rua/Avenida Nome, N° - Bairro (ex: Rua das Flores, 123 - Centro).',
  },
  { campo: 'cidade', texto: 'Qual sua **cidade**?', validator: validators.naoVazio },
  { campo: 'estado', texto: 'Qual seu **estado** (UF)?', validator: validators.naoVazio },
  { campo: 'telefone', texto: 'Qual seu **telefone**? (com DDD)', validator: validators.naoVazio },
  {
    campo: 'email',
    texto:
      'Qual seu **e-mail institucional/oficial**? (ex: seu e-mail `@alunos.utfpr.edu.br` ou e-mail pessoal principal para comunicação e emissão de documentos oficiais e certificados da UTFPR)',
    validator: validators.validarEmail,
    erro: 'Por favor, informe um endereço de e-mail válido (ex: exemplo@alunos.utfpr.edu.br).',
  },
  {
    campo: 'email_notion',
    tipo: 'botoes_notion_email',
  },
];

const LABELS = {
  nome: 'Nome completo',
  data_nascimento: 'Data de nascimento',
  nacionalidade: 'Nacionalidade',
  cpf: 'CPF',
  estudante_utfpr: 'Estudante da UTFPR',
  instituicao: 'Instituição',
  curso: 'Curso',
  periodo: 'Período/semestre',
  ra: 'RA',
  endereco: 'Endereço',
  cidade: 'Cidade',
  estado: 'Estado (UF)',
  telefone: 'Telefone',
  email: 'E-mail oficial/institucional',
  email_notion: 'E-mail vinculado ao Notion',
  area_interesse: 'Área de interesse',
};

async function coletarResposta(dmChannel, userId) {
  const collected = await dmChannel.awaitMessages({
    filter: (m) => m.author.id === userId,
    max: 1,
    time: 30 * 60 * 1000,
    errors: ['time'],
  });
  return collected.first().content.trim();
}

async function coletarInstituicao(dm, userId) {
  await dm.send('Qual o nome da sua **instituição de ensino**?');
  while (true) {
    const resposta = await coletarResposta(dm, userId);
    if (validators.naoVazio(resposta)) {
      return resposta;
    }
    await dm.send('Por favor, informe o nome da sua instituição.');
  }
}

async function coletarEstudanteUtfpr(dm, userId, respostas) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('utfpr_sim')
      .setLabel('Sim')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('utfpr_nao')
      .setLabel('Não')
      .setStyle(ButtonStyle.Secondary)
  );

  await dm.send({
    content: 'Você é **estudante da UTFPR**?',
    components: [row],
  });

  coletoresAtivos.add(userId);
  try {
    const interacao = await dm.awaitMessageComponent({
      filter: (i) => i.user.id === userId && (i.customId === 'utfpr_sim' || i.customId === 'utfpr_nao'),
      time: 30 * 60 * 1000,
    });

    const ehUtfpr = interacao.customId === 'utfpr_sim';
    respostas.estudante_utfpr = ehUtfpr ? 'Sim' : 'Não';

    await interacao.update({
      content: `Você é **estudante da UTFPR**? **${respostas.estudante_utfpr}**`,
      components: [],
    });

    if (ehUtfpr) {
      respostas.instituicao = 'UTFPR';
    } else {
      respostas.instituicao = await coletarInstituicao(dm, userId);
    }
  } finally {
    coletoresAtivos.delete(userId);
  }
}

async function coletarEmailNotion(dm, userId, respostas) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('notion_email_mesmo')
      .setLabel('✅ É o mesmo e-mail')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('notion_email_outro')
      .setLabel('📧 Uso outro e-mail no Notion')
      .setStyle(ButtonStyle.Primary)
  );

  await dm.send({
    content:
      'Sobre seu acesso ao **Notion** (onde gerenciamos os projetos, tarefas e a equipe):\n' +
      `Você utiliza o **mesmo e-mail** (\`${respostas.email}\`) na sua conta do Notion ou prefere vincular outro?`,
    components: [row],
  });

  coletoresAtivos.add(userId);
  let interacao;
  try {
    interacao = await dm.awaitMessageComponent({
      filter: (i) =>
        i.user.id === userId &&
        (i.customId === 'notion_email_mesmo' || i.customId === 'notion_email_outro'),
      time: 30 * 60 * 1000,
    });
  } finally {
    coletoresAtivos.delete(userId);
  }

  if (interacao.customId === 'notion_email_mesmo') {
    respostas.email_notion = respostas.email;
    await interacao.update({
      content: `Acesso ao Notion configurado para o mesmo e-mail: **${respostas.email_notion}**`,
      components: [],
    });
    return respostas.email_notion;
  }

  await interacao.update({
    content:
      'Qual o **e-mail vinculado à sua conta do Notion**?\n' +
      '*(Se ainda não tem conta no Notion, informe o e-mail que você prefere utilizar para criá-la):*',
    components: [],
  });

  while (true) {
    const resposta = await coletarResposta(dm, userId);
    if (validators.validarEmail(resposta)) {
      respostas.email_notion = resposta;
      await dm.send(`Acesso ao Notion configurado para o e-mail: **${respostas.email_notion}**`);
      return respostas.email_notion;
    }
    await dm.send('Por favor, informe um endereço de e-mail válido para a sua conta do Notion.');
  }
}

async function coletarPerguntaTexto(dm, userId, pergunta, respostas) {
  const textoPergunta =
    typeof pergunta.texto === 'function' ? pergunta.texto(respostas) : pergunta.texto;
  await dm.send(textoPergunta);

  let valida = false;
  while (!valida) {
    const resposta = await coletarResposta(dm, userId);
    if (!pergunta.validator || pergunta.validator(resposta, respostas)) {
      respostas[pergunta.campo] = resposta;
      valida = true;
    } else {
      const msgErro =
        typeof pergunta.erro === 'function'
          ? pergunta.erro(respostas)
          : pergunta.erro || 'Formato inválido, tente novamente.';
      await dm.send(msgErro);
    }
  }
}

async function coletarAreaInteresse(dm, userId) {
  if (config.areasInteresse.length === 0) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('area_interesse')
    .setPlaceholder('Escolha uma área')
    .addOptions(config.areasInteresse.map((area) => ({ label: area, value: area })));

  const row = new ActionRowBuilder().addComponents(menu);
  await dm.send({ content: 'Por último: pra qual **área de interesse** você quer solicitar entrada?', components: [row] });

  coletoresAtivos.add(userId);
  try {
    const interacao = await dm.awaitMessageComponent({
      filter: (i) => i.user.id === userId && i.customId === 'area_interesse',
      time: 30 * 60 * 1000,
    });

    const area = interacao.values[0];
    await interacao.update({ content: `Área escolhida: **${area}**`, components: [] });
    return area;
  } finally {
    coletoresAtivos.delete(userId);
  }
}

function montarResumo(respostas) {
  return Object.entries(LABELS)
    .filter(([campo]) => campo !== 'instituicao' || respostas.estudante_utfpr === 'Não')
    .map(([campo, label]) => `**${label}:** ${respostas[campo] || '—'}`)
    .join('\n');
}

async function pedirConfirmacao(dm, userId, respostas) {
  const resumo = montarResumo(respostas);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirmar_dados')
      .setLabel('✅ Está tudo certo')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('corrigir_dados')
      .setLabel('✏️ Quero corrigir algo')
      .setStyle(ButtonStyle.Secondary)
  );

  await dm.send({
    content: `Antes de mandar pro RH, confere se está tudo certo:\n\n${resumo}`,
    components: [row],
  });

  coletoresAtivos.add(userId);
  try {
    const interacao = await dm.awaitMessageComponent({
      filter: (i) => i.user.id === userId && (i.customId === 'confirmar_dados' || i.customId === 'corrigir_dados'),
      time: 30 * 60 * 1000,
    });

    await interacao.update({ components: [] });
    return interacao.customId;
  } finally {
    coletoresAtivos.delete(userId);
  }
}

async function escolherCampoParaCorrigir(dm, userId, respostas) {
  const opcoes = Object.entries(LABELS)
    .filter(([campo]) => campo !== 'instituicao' || respostas.estudante_utfpr === 'Não')
    .map(([campo, label]) => ({ label, value: campo }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('campo_corrigir')
    .setPlaceholder('Qual informação você quer corrigir?')
    .addOptions(opcoes);

  const row = new ActionRowBuilder().addComponents(menu);
  await dm.send({ content: 'Qual dado você quer corrigir?', components: [row] });

  coletoresAtivos.add(userId);
  try {
    const interacao = await dm.awaitMessageComponent({
      filter: (i) => i.user.id === userId && i.customId === 'campo_corrigir',
      time: 30 * 60 * 1000,
    });

    const campo = interacao.values[0];
    await interacao.update({ content: `Beleza, vamos corrigir: **${LABELS[campo]}**`, components: [] });
    return campo;
  } finally {
    coletoresAtivos.delete(userId);
  }
}

async function apresentarDocumentacaoVoluntariado(dm, userId) {
  const embed = new EmbedBuilder()
    .setTitle('🛡️ CyberGuard UTFPR • Informações sobre o Voluntariado e seus Dados')
    .setDescription(
      'Olá! Seja bem-vindo(a) ao **CyberGuard UTFPR (Câmpus Cornélio Procópio)**.\n\n' +
      'Antes de coletarmos qualquer informação, queremos esclarecer com total transparência **o porquê dos dados solicitados** e **como funciona o seu vínculo voluntário**:\n\n' +
      '🏛️ **1. Projeto de Extensão Universitária Oficial:**\n' +
      'O CyberGuard é registrado institucionalmente na UTFPR. Conforme a **Lei Federal nº 9.608/1998** e a **Deliberação nº 01/2011 do COUNI**, ' +
      'a universidade exige a formalização prévia do **Termo de Adesão ao Serviço Voluntário** para qualquer membro discente.\n\n' +
      '📋 **2. Para que seus dados servem (Finalidade Exclusiva):**\n' +
      'Os dados solicitados a seguir (Nome, CPF, RA, Endereço, etc.) são exigidos pela **DIREC/DEPEX** da UTFPR exclusivamente para:\n' +
      '• Elaboração e homologação do seu **Termo de Voluntariado** perante a Reitoria;\n' +
      '• Ativação da **Apólice de Seguro contra Acidentes Pessoais** custeada pela UTFPR;\n' +
      '• Emissão de **Certificado Oficial** e lançamento de **Horas de Atividades Complementares (HAC)** no seu histórico acadêmico.\n\n' +
      '🔒 **3. Sigilo e Acesso Restrito (LGPD):**\n' +
      'O acesso aos seus dados é restrito **exclusivamente ao Presidente (André) e ao Diretor de RH (Renan Cáceres Anselmo)**, ' +
      'com apoio de conferência do membro de RH **Conrado**. Nenhum membro de outras diretorias (Hacking, Design, etc.) acessa seus documentos. ' +
      'Todos os dados são criptografados com **AES-256-GCM**.\n\n' +
      '⚠️ **4. Riscos da Não Adesão:**\n' +
      'Sem o Termo homologado, suas horas **não terão validade acadêmica na UTFPR**, a instituição não poderá emitir certificados oficiais e você não contará com cobertura do seguro universitário.'
    )
    .setColor(0x0099ff)
    .setFooter({ text: 'UTFPR Câmpus Cornélio Procópio • DIREC / DEPEX' });

  const botoes = [
    new ButtonBuilder()
      .setCustomId('voluntariado_prosseguir')
      .setLabel('Prosseguir ➡️')
      .setStyle(ButtonStyle.Success),
  ];

  if (config.notionVoluntariadoUrl) {
    botoes.push(
      new ButtonBuilder()
        .setLabel('📖 Ver Página no Notion')
        .setStyle(ButtonStyle.Link)
        .setURL(config.notionVoluntariadoUrl)
    );
  }

  botoes.push(
    new ButtonBuilder()
      .setCustomId('voluntariado_cancelar')
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Secondary)
  );

  const row = new ActionRowBuilder().addComponents(botoes);

  await dm.send({
    embeds: [embed],
    components: [row],
  });

  coletoresAtivos.add(userId);
  let interacao;
  try {
    interacao = await dm.awaitMessageComponent({
      filter: (i) =>
        i.user.id === userId &&
        (i.customId === 'voluntariado_prosseguir' || i.customId === 'voluntariado_cancelar'),
      time: 24 * 60 * 60 * 1000,
    });
  } finally {
    coletoresAtivos.delete(userId);
  }

  if (interacao.customId === 'voluntariado_cancelar') {
    await interacao.update({
      content:
        '❌ **Onboarding cancelado.** Se tiver qualquer dúvida sobre o projeto ou a privacidade dos seus dados, entre em contato com a equipe de RH (Renan ou Conrado) no servidor!',
      embeds: [],
      components: [],
    });
    return false;
  }

  await interacao.update({
    content: '👍 **Informações compreendidas!** A seguir, leia o Termo de Ciência da LGPD para confirmar seu aceite e iniciar o cadastro:',
    embeds: [],
    components: [],
  });
  return true;
}

async function solicitarTermoCiencia(dm, userId) {
  const embed = new EmbedBuilder()
    .setTitle('🛡️ Termo de Ciência e Privacidade de Dados (LGPD)')
    .setDescription(TERMO_CIENCIA_TEXTO)
    .setColor(0x2b2d31)
    .setFooter({ text: 'Lei Geral de Proteção de Dados Pessoais — Lei nº 13.709/2018' });

  const botoes = [
    new ButtonBuilder()
      .setCustomId('lgpd_aceitar')
      .setLabel('✅ Aceito a LGPD e concordo em fornecer meus dados')
      .setStyle(ButtonStyle.Success),
  ];

  if (config.notionVoluntariadoUrl) {
    botoes.push(
      new ButtonBuilder()
        .setLabel('📖 Documentação Completa')
        .setStyle(ButtonStyle.Link)
        .setURL(config.notionVoluntariadoUrl)
    );
  }

  botoes.push(
    new ButtonBuilder()
      .setCustomId('lgpd_recusar')
      .setLabel('❌ Recusar')
      .setStyle(ButtonStyle.Danger)
  );

  const row = new ActionRowBuilder().addComponents(botoes);

  await dm.send({
    embeds: [embed],
    components: [row],
  });

  coletoresAtivos.add(userId);
  let interacao;
  try {
    interacao = await dm.awaitMessageComponent({
      filter: (i) => i.user.id === userId && (i.customId === 'lgpd_aceitar' || i.customId === 'lgpd_recusar'),
      time: 24 * 60 * 60 * 1000,
    });
  } finally {
    coletoresAtivos.delete(userId);
  }

  if (interacao.customId === 'lgpd_recusar') {
    await interacao.update({
      content:
        '❌ **Termo de Ciência recusado.** Como os dados solicitados são estritamente necessários para a emissão do Termo de Adesão ao Serviço Voluntário e registros acadêmicos na UTFPR, o cadastro não pôde ser prosseguido. Caso mude de ideia, entre em contato com o RH (Renan ou Conrado).',
      embeds: [],
      components: [],
    });
    return false;
  }

  await interacao.update({
    content: '✅ **Termo de Ciência e Privacidade aceito!** Vamos iniciar o preenchimento dos seus dados cadastrais para o Termo de Adesão.',
    embeds: [],
    components: [],
  });
  await db.registrarAceiteTermoCiencia(userId);
  return true;
}

async function executarColetaDados(member, dm, respostasIniciais = {}) {
  const { user } = member;

  // Carrega respostas já salvas anteriormente no banco para não perder o progresso se houver retomada
  const salvo = await db.getMembro(user.id);
  const respostas = {
    nome: salvo?.nome || null,
    data_nascimento: salvo?.data_nascimento || null,
    nacionalidade: salvo?.nacionalidade || null,
    cpf: salvo?.cpf || null,
    estudante_utfpr: salvo?.estudante_utfpr || null,
    instituicao: salvo?.instituicao || null,
    curso: salvo?.curso || null,
    periodo: salvo?.periodo || null,
    ra: salvo?.ra || null,
    endereco: salvo?.endereco || null,
    cidade: salvo?.cidade || null,
    estado: salvo?.estado || null,
    telefone: salvo?.telefone || null,
    email: salvo?.email || null,
    email_notion: salvo?.email_notion || null,
    area_interesse: salvo?.area_interesse || null,
    ...respostasIniciais,
  };

  for (const pergunta of PERGUNTAS) {
    if (respostas[pergunta.campo]) {
      continue;
    }

    if (pergunta.tipo === 'botoes_utfpr') {
      await coletarEstudanteUtfpr(dm, user.id, respostas);
      await db.salvarProgressoOnboarding(user.id, {
        estudante_utfpr: respostas.estudante_utfpr,
        instituicao: respostas.instituicao,
      });
    } else if (pergunta.tipo === 'botoes_notion_email') {
      await coletarEmailNotion(dm, user.id, respostas);
      await db.salvarProgressoOnboarding(user.id, {
        email_notion: respostas.email_notion,
      });
    } else {
      await coletarPerguntaTexto(dm, user.id, pergunta, respostas);
      await db.salvarProgressoOnboarding(user.id, {
        [pergunta.campo]: respostas[pergunta.campo],
      });
    }
  }

  if (!respostas.area_interesse) {
    respostas.area_interesse = await coletarAreaInteresse(dm, user.id);
    await db.salvarProgressoOnboarding(user.id, {
      area_interesse: respostas.area_interesse,
    });
  }

  let confirmado = false;
  while (!confirmado) {
    const escolha = await pedirConfirmacao(dm, user.id, respostas);

    if (escolha === 'confirmar_dados') {
      confirmado = true;
      break;
    }

    const campoEscolhido = await escolherCampoParaCorrigir(dm, user.id, respostas);

    if (campoEscolhido === 'area_interesse') {
      respostas.area_interesse = await coletarAreaInteresse(dm, user.id);
      await db.salvarProgressoOnboarding(user.id, { area_interesse: respostas.area_interesse });
      continue;
    }

    if (campoEscolhido === 'email_notion') {
      await coletarEmailNotion(dm, user.id, respostas);
      await db.salvarProgressoOnboarding(user.id, { email_notion: respostas.email_notion });
      continue;
    }

    if (campoEscolhido === 'estudante_utfpr') {
      await coletarEstudanteUtfpr(dm, user.id, respostas);
      if (respostas.estudante_utfpr === 'Sim' && respostas.ra && !validators.validarRA(respostas.ra)) {
        const perguntaRa = PERGUNTAS.find((p) => p.campo === 'ra');
        await coletarPerguntaTexto(dm, user.id, perguntaRa, respostas);
      }
      await db.salvarProgressoOnboarding(user.id, {
        estudante_utfpr: respostas.estudante_utfpr,
        instituicao: respostas.instituicao,
        ra: respostas.ra,
      });
      continue;
    }

    if (campoEscolhido === 'instituicao') {
      respostas.instituicao = await coletarInstituicao(dm, user.id);
      await db.salvarProgressoOnboarding(user.id, { instituicao: respostas.instituicao });
      continue;
    }

    const pergunta = PERGUNTAS.find((p) => p.campo === campoEscolhido);
    await coletarPerguntaTexto(dm, user.id, pergunta, respostas);
    await db.salvarProgressoOnboarding(user.id, { [campoEscolhido]: respostas[campoEscolhido] });
  }

  await db.atualizarDados(user.id, respostas);
  await dm.send(
    'Obrigado! Seus dados foram criptografados e enviados para análise do RH. ' +
      'Assim que forem aprovados, você receberá o link da comunidade e o termo para assinar.'
  );

  await enviarParaAprovacaoRH(member.guild, user.id, respostas);
}

async function tratarErroOnboarding(member, user, err) {
  const isTimeout =
    err?.code === 'InteractionCollectorError' ||
    err?.message === 'time' ||
    err?.message?.includes('reason: time') ||
    (err && typeof err.size === 'number' && err.size === 0);

  if (isTimeout) {
    console.log(`[onboarding] Inatividade/timeout no onboarding de ${user.tag || user.username} (${user.id}).`);
    try {
      const reg = await db.getMembro(user.id);
      if (reg && reg.nome) {
        await db.registrarRecusa({
          discordId: user.id,
          nome: reg.nome || user.username,
          ra: reg.ra || null,
          tipo: 'abandonado',
          motivo: 'Não respondeu dentro do prazo durante o preenchimento dos dados',
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('onboarding_reiniciar')
          .setLabel('🔄 Continuar Cadastro')
          .setStyle(ButtonStyle.Primary)
      );
      const dm = await user.createDM();
      await dm.send({
        content:
          '⏳ **Tempo limite atingido por inatividade.** Seus dados preenchidos estão seguros e salvos.\n' +
          'Quando estiver pronto(a) para continuar de onde parou, clique no botão abaixo:',
        components: [row],
      });
    } catch (errDm) {
      console.error('Não consegui avisar por DM sobre o timeout de', user.id, errDm);
    }
  } else {
    console.error('Erro no onboarding de', user.id, err);
  }
}

async function iniciarOnboarding(member) {
  const { user } = member;
  if (sessoesAtivas.has(user.id)) {
    console.log(`[onboarding] Sessão de onboarding já em andamento para ${user.id}`);
    return;
  }
  sessoesAtivas.add(user.id);
  try {
    const dm = await user.createDM();
    await db.criarMembro(user.id);

    const regExistente = await db.getMembro(user.id);
    if (!regExistente?.termo_ciencia_aceito_em) {
      // 1. Apresenta a documentação e justificativas de voluntariado e transparência
      const querProsseguir = await apresentarDocumentacaoVoluntariado(dm, user.id);
      if (!querProsseguir) {
        await encerrarOnboardingCancelado(user.id);
        return;
      }

      // 2. Apresenta o Termo formal de Ciência da LGPD
      const aceitouTermo = await solicitarTermoCiencia(dm, user.id);
      if (!aceitouTermo) {
        await encerrarOnboardingCancelado(user.id);
        return;
      }
    }

    await executarColetaDados(member, dm);
  } catch (err) {
    await tratarErroOnboarding(member, user, err);
  } finally {
    sessoesAtivas.delete(user.id);
  }
}

async function prosseguirAposVoluntariado(member) {
  const { user } = member;
  if (sessoesAtivas.has(user.id)) return;
  sessoesAtivas.add(user.id);
  try {
    const dm = await user.createDM();
    await db.criarMembro(user.id);

    const regExistente = await db.getMembro(user.id);
    if (!regExistente?.termo_ciencia_aceito_em) {
      const aceitouTermo = await solicitarTermoCiencia(dm, user.id);
      if (!aceitouTermo) {
        await encerrarOnboardingCancelado(user.id);
        return;
      }
    }

    await executarColetaDados(member, dm);
  } catch (err) {
    await tratarErroOnboarding(member, user, err);
  } finally {
    sessoesAtivas.delete(user.id);
  }
}

async function prosseguirAposTermoCiencia(member) {
  const { user } = member;
  if (sessoesAtivas.has(user.id)) return;
  sessoesAtivas.add(user.id);
  try {
    const dm = await user.createDM();
    await db.criarMembro(user.id);

    await executarColetaDados(member, dm);
  } catch (err) {
    await tratarErroOnboarding(member, user, err);
  } finally {
    sessoesAtivas.delete(user.id);
  }
}

async function handleOnboardingInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return false;
  if (interaction.replied || interaction.deferred) return false;

  const { customId, user } = interaction;
  const orphanOnboardingIds = [
    'voluntariado_prosseguir',
    'voluntariado_cancelar',
    'lgpd_aceitar',
    'lgpd_recusar',
    'onboarding_reiniciar',
  ];

  if (!orphanOnboardingIds.includes(customId)) return false;

  // Se já há um coletor ativo ouvindo este usuário, deixa o awaitMessageComponent tratar
  if (coletoresAtivos.has(user.id)) {
    return false;
  }

  // Não há coletor ativo (tempo expirou ou bot reiniciou)
  try {
    if (customId === 'voluntariado_prosseguir') {
      await interaction.update({
        content: '👍 **Informações compreendidas!** A seguir, leia o Termo de Ciência da LGPD para confirmar seu aceite e iniciar o cadastro:',
        embeds: [],
        components: [],
      });

      const member = await buscarMembroGuild(interaction.client, user.id);
      if (!member) {
        await interaction.followUp({
          content: '⚠️ Não foi possível localizar seu usuário no servidor da CyberGuard. Por favor, entre em contato com o RH.',
          ephemeral: true,
        });
        return true;
      }

      prosseguirAposVoluntariado(member).catch((err) =>
        console.error('[onboarding] Erro ao prosseguir após voluntariado:', err)
      );
      return true;
    }

    if (customId === 'voluntariado_cancelar') {
      await interaction.update({
        content:
          '❌ **Onboarding cancelado.** Se tiver qualquer dúvida sobre o projeto ou a privacidade dos seus dados, entre em contato com a equipe de RH (Renan ou Conrado) no servidor!',
        embeds: [],
        components: [],
      });
      await encerrarOnboardingCancelado(user.id);
      return true;
    }

    if (customId === 'lgpd_aceitar') {
      await interaction.update({
        content: '✅ **Termo de Ciência e Privacidade aceito!** Vamos iniciar o preenchimento dos seus dados cadastrais para o Termo de Adesão.',
        embeds: [],
        components: [],
      });
      await db.registrarAceiteTermoCiencia(user.id);

      const member = await buscarMembroGuild(interaction.client, user.id);
      if (!member) return true;

      prosseguirAposTermoCiencia(member).catch((err) =>
        console.error('[onboarding] Erro ao prosseguir após aceite de LGPD:', err)
      );
      return true;
    }

    if (customId === 'lgpd_recusar') {
      await interaction.update({
        content:
          '❌ **Termo de Ciência recusado.** Como os dados solicitados são estritamente necessários para a emissão do Termo de Adesão ao Serviço Voluntário e registros acadêmicos na UTFPR, o cadastro não pôde ser prosseguido. Caso mude de ideia, entre em contato com o RH (Renan ou Conrado).',
        embeds: [],
        components: [],
      });
      await encerrarOnboardingCancelado(user.id);
      return true;
    }

    if (customId === 'onboarding_reiniciar') {
      await interaction.update({
        content: '🔄 **Continuando seu cadastro de onde você parou...**',
        components: [],
      });
      const member = await buscarMembroGuild(interaction.client, user.id);
      if (!member) return true;
      sessoesAtivas.delete(user.id);
      iniciarOnboarding(member).catch((err) =>
        console.error('[onboarding] Erro ao reiniciar onboarding:', err)
      );
      return true;
    }

    return false;
  } catch (errInteracao) {
    console.error('[onboarding] Erro ao tratar interação órfã:', errInteracao);
    return true;
  }
}

async function enviarParaAprovacaoRH(guild, discordId, dados) {
  const canalRh = await guild.channels.fetch(config.channelRhId);

  const recusasAnteriores = await db.buscarRecusasAnteriores({
    discordId,
    nome: dados.nome,
    ra: dados.ra,
  });

  const embed = new EmbedBuilder()
    .setTitle('Nova solicitação de entrada')
    .addFields(
      { name: 'Discord', value: `<@${discordId}>` },
      { name: 'Nome', value: dados.nome || '—' },
      { name: 'Data de nascimento', value: dados.data_nascimento || '—', inline: true },
      { name: 'Nacionalidade', value: dados.nacionalidade || '—', inline: true },
      { name: 'CPF (Mascarado LGPD)', value: mascararCPF(dados.cpf) },
      { name: 'Estudante da UTFPR', value: dados.estudante_utfpr || 'Sim', inline: true },
      { name: 'Instituição', value: dados.instituicao || 'UTFPR', inline: true },
      { name: 'Curso', value: dados.curso || '—' },
      { name: 'Período', value: dados.periodo || '—', inline: true },
      { name: 'RA', value: dados.ra || '—', inline: true },
      { name: 'Endereço', value: dados.endereco || '—' },
      { name: 'Cidade/UF', value: `${dados.cidade || '—'} / ${dados.estado || '—'}` },
      { name: 'Telefone', value: dados.telefone || '—', inline: true },
      { name: 'E-mail Oficial', value: dados.email || '—', inline: true },
      { name: 'E-mail Notion', value: dados.email_notion || dados.email || '—', inline: true },
      { name: 'Área solicitada', value: dados.area_interesse || '—' }
    )
    .setColor(0x5865f2)
    .setTimestamp();

  if (recusasAnteriores.length > 0) {
    const linhas = recusasAnteriores.map((r) => {
      const data = new Date(r.criado_em).toLocaleDateString('pt-BR');
      const tipoLabel = r.tipo === 'rejeitado' ? 'Reprovado pelo RH' : 'Abandonou o processo';
      return `• ${data} — **${tipoLabel}**: ${r.motivo || 'sem motivo registrado'}`;
    });

    embed.addFields({
      name: `⚠️ Já apareceu aqui antes (${recusasAnteriores.length}x) — visível só pro RH`,
      value: linhas.join('\n'),
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aprovar_${discordId}`)
      .setLabel('Aprovar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rejeitar_${discordId}`)
      .setLabel('Rejeitar')
      .setStyle(ButtonStyle.Danger)
  );

  await canalRh.send({ embeds: [embed], components: [row] });
}

module.exports = {
  iniciarOnboarding,
  handleOnboardingInteraction,
  TERMO_CIENCIA_TEXTO,
};
