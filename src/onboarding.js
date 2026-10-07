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
  { campo: 'curso', texto: 'Qual seu **curso**?', validator: validators.naoVazio },
  {
    campo: 'periodo',
    texto: 'Qual seu **período/semestre atual**? (ex: 5°)',
    validator: validators.naoVazio,
  },
  {
    campo: 'ra',
    texto: 'Qual seu **RA**? (apenas números, sem pontos ou espaços)',
    validator: validators.validarRA,
    erro: 'O RA deve conter apenas números.',
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

async function escolherCampoParaCorrigir(dm, userId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('campo_corrigir')
    .setPlaceholder('Qual informação você quer corrigir?')
    .addOptions(Object.entries(LABELS).map(([campo, label]) => ({ label, value: campo })));

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

async function iniciarOnboarding(member) {
  const { user } = member;
  let respostas = {};

  try {
    const dm = await user.createDM();
    await db.criarMembro(user.id);

    await dm.send(
      `Olá, ${user.username}! Bem-vindo(a) ao servidor do CyberGuard. ` +
        `Antes de liberar seu acesso à comunidade, preciso confirmar alguns dados com você ` +
        `Irei solicitar alguns dados sensíveis, que serão necessário ` +
        `pra já deixar o termo de voluntariado quase pronto.
        ` +
        `Esses dados apenas os admins do discord terão acesso ` + 
        `Seus dados estão seguros conosco!`
    );

    for (const pergunta of PERGUNTAS) {
      await dm.send(pergunta.texto);

      let valida = false;
      while (!valida) {
        const resposta = await coletarResposta(dm, user.id);
        if (!pergunta.validator || pergunta.validator(resposta)) {
          respostas[pergunta.campo] = resposta;
          valida = true;
        } else {
          await dm.send(pergunta.erro || 'Formato inválido, tente novamente.');
        }
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

      const campoEscolhido = await escolherCampoParaCorrigir(dm, user.id);

      if (campoEscolhido === 'area_interesse') {
        respostas.area_interesse = await coletarAreaInteresse(dm, user.id);
        continue;
      }

      const pergunta = PERGUNTAS.find((p) => p.campo === campoEscolhido);
      await dm.send(pergunta.texto);

      let valida = false;
      while (!valida) {
        const resposta = await coletarResposta(dm, user.id);
        if (!pergunta.validator || pergunta.validator(resposta)) {
          respostas[pergunta.campo] = resposta;
          valida = true;
        } else {
          await dm.send(pergunta.erro || 'Formato inválido, tente novamente.');
        }
      }
    }

    await db.atualizarDados(user.id, respostas);
    await dm.send(
      'Obrigado! Seus dados foram enviados para o RH. ' +
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
        await db.removerMembro(user.id);
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
      { name: 'CPF', value: dados.cpf || '—' },
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

module.exports = { iniciarOnboarding };
