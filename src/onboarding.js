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
  { campo: 'email', texto: 'Qual seu **e-mail**?', validator: validators.naoVazio },
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
  email: 'E-mail',
  area_interesse: 'Área de interesse',
};

async function coletarResposta(dmChannel, userId) {
  const collected = await dmChannel.awaitMessages({
    filter: (m) => m.author.id === userId,
    max: 1,
    time: 10 * 60 * 1000,
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

  const interacao = await dm.awaitMessageComponent({
    filter: (i) => i.user.id === userId && (i.customId === 'utfpr_sim' || i.customId === 'utfpr_nao'),
    time: 10 * 60 * 1000,
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

  const interacao = await dm.awaitMessageComponent({
    filter: (i) => i.user.id === userId && i.customId === 'area_interesse',
    time: 10 * 60 * 1000,
  });

  const area = interacao.values[0];
  await interacao.update({ content: `Área escolhida: **${area}**`, components: [] });
  return area;
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

  const interacao = await dm.awaitMessageComponent({
    filter: (i) => i.user.id === userId && (i.customId === 'confirmar_dados' || i.customId === 'corrigir_dados'),
    time: 10 * 60 * 1000,
  });

  await interacao.update({ components: [] });
  return interacao.customId;
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

  const interacao = await dm.awaitMessageComponent({
    filter: (i) => i.user.id === userId && i.customId === 'campo_corrigir',
    time: 10 * 60 * 1000,
  });

  const campo = interacao.values[0];
  await interacao.update({ content: `Beleza, vamos corrigir: **${LABELS[campo]}**`, components: [] });
  return campo;
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

  const interacao = await dm.awaitMessageComponent({
    filter: (i) =>
      i.user.id === userId &&
      (i.customId === 'voluntariado_prosseguir' || i.customId === 'voluntariado_cancelar'),
    time: 10 * 60 * 1000,
  });

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

  const interacao = await dm.awaitMessageComponent({
    filter: (i) => i.user.id === userId && (i.customId === 'lgpd_aceitar' || i.customId === 'lgpd_recusar'),
    time: 10 * 60 * 1000,
  });

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

async function iniciarOnboarding(member) {
  const { user } = member;
  let respostas = {};

  try {
    const dm = await user.createDM();
    await db.criarMembro(user.id);

    // 1. Apresenta a documentação e justificativas de voluntariado e transparência
    const querProsseguir = await apresentarDocumentacaoVoluntariado(dm, user.id);
    if (!querProsseguir) {
      const regExistente = await db.getMembro(user.id);
      if (regExistente && (regExistente.nome || regExistente.cpf)) {
        await db.atualizarStatus(user.id, 'abandonado', { saida_processada: true });
      } else {
        await db.removerMembro(user.id);
      }
      return;
    }

    // 2. Apresenta o Termo formal de Ciência da LGPD
    const aceitouTermo = await solicitarTermoCiencia(dm, user.id);
    if (!aceitouTermo) {
      const regExistente = await db.getMembro(user.id);
      if (regExistente && (regExistente.nome || regExistente.cpf)) {
        await db.atualizarStatus(user.id, 'abandonado', { saida_processada: true });
      } else {
        await db.removerMembro(user.id);
      }
      return;
    }

    for (const pergunta of PERGUNTAS) {
      if (pergunta.tipo === 'botoes_utfpr') {
        await coletarEstudanteUtfpr(dm, user.id, respostas);
      } else {
        await coletarPerguntaTexto(dm, user.id, pergunta, respostas);
      }
    }

    respostas.area_interesse = await coletarAreaInteresse(dm, user.id);

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
        continue;
      }

      if (campoEscolhido === 'estudante_utfpr') {
        await coletarEstudanteUtfpr(dm, user.id, respostas);
        if (respostas.estudante_utfpr === 'Sim' && respostas.ra && !validators.validarRA(respostas.ra)) {
          const perguntaRa = PERGUNTAS.find((p) => p.campo === 'ra');
          await coletarPerguntaTexto(dm, user.id, perguntaRa, respostas);
        }
        continue;
      }

      if (campoEscolhido === 'instituicao') {
        respostas.instituicao = await coletarInstituicao(dm, user.id);
        continue;
      }

      const pergunta = PERGUNTAS.find((p) => p.campo === campoEscolhido);
      await coletarPerguntaTexto(dm, user.id, pergunta, respostas);
    }

    await db.atualizarDados(user.id, respostas);
    await dm.send(
      'Obrigado! Seus dados foram criptografados e enviados para análise do RH. ' +
        'Assim que forem aprovados, você receberá o link da comunidade e o termo para assinar.'
    );

    await enviarParaAprovacaoRH(member.guild, user.id, respostas);
  } catch (err) {
    if (err.message === 'time') {
      try {
        await db.registrarRecusa({
          discordId: user.id,
          nome: respostas.nome || user.username,
          ra: respostas.ra || null,
          tipo: 'abandonado',
          motivo: 'Não respondeu dentro do prazo durante o preenchimento dos dados',
        });
        const regExistente = await db.getMembro(user.id);
        if (regExistente && (regExistente.nome || regExistente.cpf)) {
          await db.atualizarStatus(user.id, 'abandonado', { saida_processada: true });
        } else {
          await db.removerMembro(user.id);
        }
      } catch (errArquivo) {
        console.error('Erro ao arquivar abandono por timeout de', user.id, errArquivo);
      }

      try {
        const dm = await user.createDM();
        await dm.send(
          'Tempo esgotado para responder. Se quiser tentar novamente, saia e entre no servidor novamente, ' +
            'ou fale com o RH diretamente.'
        );
      } catch (errDm) {
        console.error('Não consegui avisar por DM sobre o timeout de', user.id, errDm);
      }
    } else {
      console.error('Erro no onboarding de', user.id, err);
    }
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
      { name: 'E-mail', value: dados.email || '—', inline: true },
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

module.exports = { iniciarOnboarding, TERMO_CIENCIA_TEXTO };
