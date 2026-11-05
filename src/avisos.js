'use strict';

const crypto = require('crypto');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ChannelType,
  ThreadAutoArchiveDuration,
  PermissionFlagsBits,
} = require('discord.js');
const nodemailer = require('nodemailer');
const config = require('./config');
const db = require('./db');
const { normalizarSetor, listarContatosMembrosNotion } = require('./notionMembros');
const {
  parseDataHoraEvento,
  gerarIcsEvento,
  criarEventoGoogleCalendar,
} = require('./calendarService');

const LISTA_SETORES = [
  'Hacking Ético',
  'Hardware Hacking',
  'Design',
  'Social Media & Copy',
  'Recursos Humanos',
  'Educacional',
  'Desenvolvimento',
];

const EMOJI_SETOR = {
  'Hacking Ético': '🕵️',
  'Hardware Hacking': '🔌',
  Design: '🎨',
  'Social Media & Copy': '📱',
  'Recursos Humanos': '🤝',
  Educacional: '📚',
  Desenvolvimento: '💻',
  Líderes: '👑',
};

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

// Armazena rascunhos temporários entre a seleção de destinatários e o envio do Modal
const rascunhosPendentes = new Map();

function limparRascunhosAntigos() {
  const agora = Date.now();
  for (const [token, dados] of rascunhosPendentes.entries()) {
    if (agora - dados.criadoEm > 30 * 60 * 1000) {
      rascunhosPendentes.delete(token);
    }
  }
}

function normalizarTextoComparacao(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Verifica se o membro possui permissão geral (Recursos Humanos, Presidente ou Vice-Presidente),
 * podendo enviar avisos/eventos individualmente, para um setor específico ou para todos os setores.
 */
function temPermissaoGeralAvisos(member) {
  if (!member) return false;
  const userId = member.id || member.user?.id;

  if (config.presidenteId && userId === config.presidenteId) return true;
  if (config.vicePresidenteId && userId === config.vicePresidenteId) return true;
  if (config.purpleTeamId && userId === config.purpleTeamId) return true;

  const roles = member.roles?.cache;
  if (!roles) return false;

  const rhRoleId = process.env.PONTO_ROLE_RH_ID || '';
  return roles.some((r) => {
    if (rhRoleId && r.id === rhRoleId) return true;
    const nomeNorm = normalizarTextoComparacao(r.name);
    const cfgRhNorm = normalizarTextoComparacao(config.roleRhNome || 'Recursos Humanos');
    return (
      nomeNorm === cfgRhNorm ||
      nomeNorm === 'recursos humanos' ||
      nomeNorm === 'rh cyberguard' ||
      nomeNorm === 'dona da casa'
    );
  });
}

/**
 * Verifica se o membro é Líder (ou Vice-Líder / RH / Presidente / Vice-Presidente)
 * autorizado a utilizar os botões de Enviar Aviso e Marcar Evento.
 */
function ehLiderAutorizado(member) {
  if (!member) return false;
  if (temPermissaoGeralAvisos(member)) return true;

  const userId = member.id || member.user?.id;
  if (Object.values(config.lideresTime || {}).includes(userId)) return true;

  const roles = member.roles?.cache;
  if (!roles) return false;

  const liderRoleId = process.env.PONTO_ROLE_LIDERES_ID || '';
  const viceLiderRoleId = config.roleViceLiderId || '';

  return roles.some((r) => {
    if (liderRoleId && r.id === liderRoleId) return true;
    if (viceLiderRoleId && r.id === viceLiderRoleId) return true;
    const nomeNorm = normalizarTextoComparacao(r.name);
    const cfgLiderNorm = normalizarTextoComparacao(config.roleLiderNome || 'Líderes');
    const cfgViceNorm = normalizarTextoComparacao(config.roleViceLiderNome || 'Vice-Líder');
    return (
      nomeNorm === cfgLiderNorm ||
      nomeNorm === cfgViceNorm ||
      nomeNorm === 'lideres' ||
      nomeNorm === 'lider' ||
      nomeNorm === 'vice-lider' ||
      nomeNorm === 'vice lider'
    );
  });
}

/**
 * Identifica a quais setores um membro do servidor pertence com base nos seus cargos do Discord,
 * mapeamento de líderes (LIDERES_TIME_JSON) e cadastro no banco/Notion.
 */
function identificarSetoresDoMembro(member, regDb = null, regNotion = null) {
  const setores = new Set();
  const roles = member?.roles?.cache;

  if (roles) {
    for (const r of roles.values()) {
      const n = normalizarTextoComparacao(r.name);
      if (
        (config.roleHackingEticoId && r.id === config.roleHackingEticoId) ||
        n === 'hacking etico' ||
        n === 'hackink etico' ||
        n === 'red team' ||
        n === 'blue team'
      ) {
        setores.add('Hacking Ético');
      } else if (n === 'hardware hacking') {
        setores.add('Hardware Hacking');
      } else if (n === 'design') {
        setores.add('Design');
      } else if (n === 'social media & copy' || n === 'social media') {
        setores.add('Social Media & Copy');
      } else if (
        n === 'recursos humanos' ||
        n === 'rh cyberguard' ||
        (process.env.PONTO_ROLE_RH_ID && r.id === process.env.PONTO_ROLE_RH_ID)
      ) {
        setores.add('Recursos Humanos');
      } else if ((config.roleEducacionalId && r.id === config.roleEducacionalId) || n === 'educacional') {
        setores.add('Educacional');
      } else if (
        (config.roleDesenvolvimentoId && r.id === config.roleDesenvolvimentoId) ||
        n === 'desenvolvimento'
      ) {
        setores.add('Desenvolvimento');
      }
    }
  }

  const userId = member?.id || member?.user?.id;
  if (userId && config.lideresTime) {
    for (const [setorNome, idLider] of Object.entries(config.lideresTime)) {
      if (idLider === userId) {
        const sNorm = normalizarSetor(setorNome);
        if (sNorm && LISTA_SETORES.includes(sNorm)) setores.add(sNorm);
      }
    }
  }

  if (setores.size === 0 && regDb?.area_interesse) {
    const sDb = normalizarSetor(regDb.area_interesse);
    if (sDb && LISTA_SETORES.includes(sDb)) setores.add(sDb);
  }

  if (setores.size === 0 && regNotion?.setor) {
    const sNot = normalizarSetor(regNotion.setor);
    if (sNot && LISTA_SETORES.includes(sNot)) setores.add(sNot);
  }

  return Array.from(setores);
}

/**
 * Monta um catálogo consolidado de todos os membros do servidor com seus respectivos
 * nomes reais, e-mails (Banco PostgreSQL + fallback Notion) e setores.
 */
async function obterCatalogoMembrosServidor(guild) {
  const [membrosGuild, registrosDb, mapaNomesReais, contatosNotion] = await Promise.all([
    guild.members.fetch().catch(() => guild.members.cache),
    db.listarMembrosCadastrados().catch(() => []),
    db.obterMapaNomesReais().catch(() => new Map()),
    listarContatosMembrosNotion().catch(() => []),
  ]);

  const dbPorId = new Map();
  for (const r of registrosDb) {
    if (r && r.discord_id) dbPorId.set(String(r.discord_id), r);
  }

  const notionPorRa = new Map();
  const notionPorNome = new Map();
  for (const c of contatosNotion) {
    if (c.ra) notionPorRa.set(c.ra, c);
    if (c.nome) notionPorNome.set(normalizarTextoComparacao(c.nome), c);
  }

  const catalogo = new Map();

  for (const [, m] of membrosGuild) {
    if (m.user?.bot) continue;

    const regDb = dbPorId.get(m.id) || null;
    const nomeReal =
      (regDb?.nome_social && regDb.nome_social.trim()) ||
      (regDb?.nome && regDb.nome.trim()) ||
      mapaNomesReais.get(m.id) ||
      m.displayName ||
      m.user.globalName ||
      m.user.username;

    const raLimpo = String(regDb?.ra || '').replace(/\D/g, '');
    const nomeNorm = normalizarTextoComparacao(nomeReal);

    let contatoNotion = (raLimpo && notionPorRa.get(raLimpo)) || notionPorNome.get(nomeNorm) || null;
    if (!contatoNotion && nomeNorm) {
      // Busca parcial segura pelo primeiro e último nome caso haja abreviação
      contatoNotion =
        contatosNotion.find((c) => {
          const cn = normalizarTextoComparacao(c.nome);
          return cn && (cn.includes(nomeNorm) || nomeNorm.includes(cn));
        }) || null;
    }

    const email = (regDb?.email || contatoNotion?.email || '').trim();
    const setores = identificarSetoresDoMembro(m, regDb, contatoNotion);

    const temCargoMembro = m.roles.cache.some((r) => {
      const rn = normalizarTextoComparacao(r.name);
      return (
        rn === 'membro cyberguard' ||
        rn === normalizarTextoComparacao(config.roleAprovadoNome || 'Membro') ||
        rn === 'lideres' ||
        rn === 'vice-lider'
      );
    });

    const ehEntusiastaApenas =
      !temCargoMembro &&
      setores.length === 0 &&
      m.roles.cache.some((r) => normalizarTextoComparacao(r.name) === 'entusiasta');

    const ehMembroProjeto =
      !ehEntusiastaApenas &&
      (temCargoMembro ||
        setores.length > 0 ||
        Boolean(regDb && ['concluido', 'aguardando_assinatura', 'aprovado'].includes(regDb.status)));

    catalogo.set(m.id, {
      id: m.id,
      member: m,
      nome: nomeReal,
      username: m.user.username,
      email,
      setores,
      ehLider: ehLiderAutorizado(m),
      ehMembroProjeto,
    });
  }

  return catalogo;
}

/**
 * Monta o Embed e os Botões do Painel Oficial de Avisos e Eventos no canal #📢avisos.
 */
function montarPainelAvisos() {
  const embed = new EmbedBuilder()
    .setColor(0x2563eb)
    .setTitle('📢 Central de Avisos & Agenda de Eventos • CyberGuard UTFPR')
    .setDescription(
      'Bem-vindo(a) à **Central Oficial de Comunicados e Agendamentos** do CyberGuard!\n\n' +
        'Este painel permite o envio de **Avisos Oficiais** e a marcação automática de **Eventos no Google Calendar** ' +
        'direcionados exclusivamente às equipes ou integrantes selecionados.\n\n' +
        '### 🧭 Como funciona?\n' +
        '📢 **Enviar Aviso**\n' +
        'Envia um comunicado com **Título** e **Corpo do Texto**. O aviso é publicado neste canal de forma **restrita ' +
        '(visível apenas para os membros destinatários)**, enviado na DM e encaminhado por **E-mail**.\n\n' +
        '📅 **Marcar Evento (Google Calendar)**\n' +
        'Agenda uma reunião, treinamento ou entrega com **Título**, **Data/Horário** e **Descrição**, ' +
        'adicionando o compromisso **automaticamente no Google Calendar** dos membros selecionados e notificando no Discord e por E-mail.\n\n' +
        '📬 **Meus Avisos & Eventos**\n' +
        'Consulte a qualquer momento todos os avisos e eventos enviados para você ou para o seu setor.'
    )
    .addFields({
      name: '🔐 Permissões de Envio',
      value:
        '• **Líderes de Setor:** Podem enviar avisos e marcar eventos **individualmente** (para membros do seu setor) ou para **todo o seu setor**.\n' +
        '• **Recursos Humanos, Presidente e Vice-Presidente:** Podem enviar **individualmente**, selecionar **um setor específico** ou enviar para **todos os setores**.',
    })
    .setFooter({ text: 'CyberGuard UTFPR • Comunicação Interna & Sincronização Google Calendar' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('painel_avisos_novo_aviso')
      .setLabel('Enviar Aviso')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📢'),
    new ButtonBuilder()
      .setCustomId('painel_avisos_novo_evento')
      .setLabel('Marcar Evento')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📅'),
    new ButtonBuilder()
      .setCustomId('painel_avisos_meus_avisos')
      .setLabel('Meus Avisos & Eventos')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📬')
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Garante que todos os cargos de setores e membros possam visualizar o canal #📢avisos
 * (para enxergarem o painel e os seus respectivos tópicos privados de avisos/eventos).
 */
async function sincronizarPermissoesVisualizacaoCanalAvisos(canal) {
  try {
    const guild = canal.guild;
    if (!guild) return;

    const nomesCargosPermitidos = new Set(
      [
        ...LISTA_SETORES,
        'Hackink Ético',
        'RH CyberGuard',
        'Membro CyberGuard',
        config.roleAprovadoNome,
        config.roleLiderNome,
        config.roleViceLiderNome,
        'Vice-Lider',
      ]
        .filter(Boolean)
        .map((n) => normalizarTextoComparacao(n))
    );

    const idsPermitidos = new Set(
      [
        config.roleHackingEticoId,
        config.roleEducacionalId,
        config.roleDesenvolvimentoId,
        config.roleViceLiderId,
        process.env.PONTO_ROLE_LIDERES_ID,
        process.env.PONTO_ROLE_RH_ID,
      ].filter(Boolean)
    );

    for (const [, role] of guild.roles.cache) {
      if (idsPermitidos.has(role.id) || nomesCargosPermitidos.has(normalizarTextoComparacao(role.name))) {
        const overwriteAtual = canal.permissionOverwrites?.cache?.get(role.id);
        if (!overwriteAtual || !overwriteAtual.allow.has(PermissionFlagsBits.ViewChannel)) {
          await canal.permissionOverwrites
            .edit(role.id, {
              ViewChannel: true,
              ReadMessageHistory: true,
            })
            .catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[avisos] Não foi possível sincronizar permissões do canal de avisos:', err.message);
  }
}

/**
 * Publica ou atualiza automaticamente o painel fixo no canal de avisos (CANAL_AVISOS_ID).
 */
async function garantirPainelAvisos(client, canalIdCustom = null) {
  const canalId = canalIdCustom || config.canalAvisosId;
  if (!canalId) {
    console.log('[avisos] Nenhum canal de avisos configurado (CANAL_AVISOS_ID vazio).');
    return null;
  }

  try {
    const canal = await client.channels.fetch(canalId);
    if (!canal || !canal.isTextBased()) {
      console.warn(`[avisos] Canal de avisos (${canalId}) não encontrado ou não é de texto.`);
      return null;
    }

    await sincronizarPermissoesVisualizacaoCanalAvisos(canal);

    const mensagens = await canal.messages.fetch({ limit: 25 });
    const painelExistente = mensagens.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0].title?.includes('Central de Avisos & Agenda de Eventos')
    );

    const painelData = montarPainelAvisos();

    if (painelExistente) {
      await painelExistente.edit(painelData);
      console.log(`[avisos] Painel de avisos e eventos atualizado no canal #${canal.name}.`);
      return painelExistente;
    }

    const novaMensagem = await canal.send(painelData);
    console.log(`[avisos] Novo painel de avisos e eventos publicado no canal #${canal.name}.`);
    return novaMensagem;
  } catch (err) {
    console.error('[avisos] Erro ao garantir painel de avisos:', err.message);
    return null;
  }
}

/**
 * Monta e exibe o Modal de preenchimento (Aviso ou Evento) para o rascunho selecionado.
 */
async function exibirModalParaRascunho(interaction, dadosRascunho) {
  limparRascunhosAntigos();
  const token = crypto.randomBytes(6).toString('hex');
  rascunhosPendentes.set(token, {
    ...dadosRascunho,
    criadoEm: Date.now(),
  });

  if (dadosRascunho.tipo === 'aviso') {
    const modal = new ModalBuilder()
      .setCustomId(`modal_avisos_enviar_aviso_${token}`)
      .setTitle(`📢 Aviso • ${dadosRascunho.resumoAlvo.slice(0, 32)}`);

    const inputTitulo = new TextInputBuilder()
      .setCustomId('input_aviso_titulo')
      .setLabel('Título do Aviso')
      .setPlaceholder('Ex.: Alinhamento de demandas da semana')
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(150)
      .setRequired(true);

    const inputCorpo = new TextInputBuilder()
      .setCustomId('input_aviso_corpo')
      .setLabel('Corpo do Texto (Mensagem do Aviso)')
      .setPlaceholder('Digite o conteúdo completo do comunicado que será enviado aos membros e por e-mail...')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(5)
      .setMaxLength(3500)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(inputTitulo),
      new ActionRowBuilder().addComponents(inputCorpo)
    );

    return interaction.showModal(modal);
  }

  // Modal de Evento (Google Calendar)
  const modal = new ModalBuilder()
    .setCustomId(`modal_avisos_enviar_evento_${token}`)
    .setTitle(`📅 Evento • ${dadosRascunho.resumoAlvo.slice(0, 31)}`);

  const inputTitulo = new TextInputBuilder()
    .setCustomId('input_evento_titulo')
    .setLabel('Título do Evento')
    .setPlaceholder('Ex.: Reunião de Alinhamento / Workshop do Setor')
    .setStyle(TextInputStyle.Short)
    .setMinLength(3)
    .setMaxLength(150)
    .setRequired(true);

  const inputData = new TextInputBuilder()
    .setCustomId('input_evento_data')
    .setLabel('Data do Evento (DD/MM/AAAA)')
    .setPlaceholder('Ex.: 15/11/2026')
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(20)
    .setRequired(true);

  const inputHorario = new TextInputBuilder()
    .setCustomId('input_evento_horario')
    .setLabel('Horário de Início e Fim (HH:MM - HH:MM)')
    .setPlaceholder('Ex.: 19:00 - 20:30 (ou apenas 19:00 para 1h de duração)')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(30)
    .setRequired(true);

  const inputLocal = new TextInputBuilder()
    .setCustomId('input_evento_local')
    .setLabel('Local ou Link da Reunião (Opcional)')
    .setPlaceholder('Ex.: Call do Discord / Link do Google Meet / Sala UTFPR')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  const inputDescricao = new TextInputBuilder()
    .setCustomId('input_evento_descricao')
    .setLabel('Descrição / Pauta do Evento')
    .setPlaceholder('Descreva os tópicos do evento que constarão no Google Calendar e no e-mail...')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(5)
    .setMaxLength(2500)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputTitulo),
    new ActionRowBuilder().addComponents(inputData),
    new ActionRowBuilder().addComponents(inputHorario),
    new ActionRowBuilder().addComponents(inputLocal),
    new ActionRowBuilder().addComponents(inputDescricao)
  );

  return interaction.showModal(modal);
}

/**
 * Monta o HTML institucional para envio de Aviso ou Evento por e-mail.
 */
function montarEmailHtml({
  tipo,
  titulo,
  descricao,
  escopoLabel,
  autorNome,
  nomeDestinatario,
  dadosEvento = null,
}) {
  const corPrimaria = tipo === 'evento' ? '#16a34a' : '#2563eb';
  const badgeTipo = tipo === 'evento' ? '📅 EVENTO AGENDADO • GOOGLE CALENDAR' : '📢 COMUNICADO OFICIAL';
  const descricaoHtml = String(descricao || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br/>');

  const blocoEventoHtml = dadosEvento
    ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:18px 0;">
        <div style="font-weight:700;color:#166534;font-size:15px;margin-bottom:8px;">🗓️ Detalhes do Agendamento</div>
        <div style="font-size:14px;color:#1e293b;line-height:1.6;">
          <strong>Data:</strong> ${dadosEvento.dataFormatada}<br/>
          <strong>Horário:</strong> ${dadosEvento.horarioFormatado} (Horário de Brasília)<br/>
          <strong>Local / Canal:</strong> ${dadosEvento.local || 'Discord • CyberGuard UTFPR'}
        </div>
        <div style="margin-top:14px;">
          <a href="${dadosEvento.linkTemplate}" target="_blank" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;font-size:14px;">
            📅 Visualizar no Google Calendar
          </a>
        </div>
      </div>
    `
    : '';

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:20px;background-color:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.08);">
    <div style="background:${corPrimaria};padding:22px 26px;color:#ffffff;">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.8px;opacity:0.9;">${badgeTipo}</div>
      <h1 style="margin:6px 0 0 0;font-size:21px;font-weight:700;">${titulo}</h1>
    </div>
    <div style="padding:24px 26px;color:#1e293b;">
      <p style="margin-top:0;font-size:15px;">Olá, <strong>${nomeDestinatario || 'Integrante'}</strong>!</p>
      <p style="font-size:14px;color:#475569;margin-bottom:16px;">
        Você recebeu ${tipo === 'evento' ? 'uma convocação de evento' : 'um novo aviso oficial'} no projeto <strong>CyberGuard UTFPR</strong>:
      </p>
      <div style="background:#f8fafc;border-left:4px solid ${corPrimaria};padding:12px 16px;border-radius:6px;margin-bottom:18px;font-size:13px;color:#334155;">
        <strong>Destinatários / Setor:</strong> ${escopoLabel}<br/>
        <strong>Enviado por:</strong> ${autorNome}
      </div>
      ${blocoEventoHtml}
      <div style="font-size:15px;line-height:1.65;color:#0f172a;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
        ${descricaoHtml}
      </div>
      <p style="font-size:12px;color:#64748b;margin-top:22px;margin-bottom:0;">
        Este comunicado também está disponível exclusivamente para você no canal <strong>#📢avisos</strong> do servidor do Discord do CyberGuard UTFPR.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Envia os e-mails de aviso ou evento (com convite iCalendar METHOD:REQUEST para o Google Calendar)
 * aos membros destinatários que possuem endereço de e-mail cadastrado.
 */
async function dispararEmailsDestinatarios({
  tipo,
  titulo,
  descricao,
  escopoLabel,
  autorNome,
  destinatarios,
  dadosEvento = null,
}) {
  if (!config.smtp.host || !config.smtp.user) {
    console.warn('[avisos] SMTP não configurado. Envio de e-mails ignorado.');
    return { enviados: 0, semEmail: destinatarios.length, falhas: 0 };
  }

  const comEmail = destinatarios.filter((d) => d.email && d.email.includes('@'));
  const semEmail = destinatarios.length - comEmail.length;
  let enviados = 0;
  let falhas = 0;

  const loteTamanho = 5;
  for (let i = 0; i < comEmail.length; i += loteTamanho) {
    const lote = comEmail.slice(i, i + loteTamanho);
    const resultados = await Promise.allSettled(
      lote.map(async (dest) => {
        const html = montarEmailHtml({
          tipo,
          titulo,
          descricao,
          escopoLabel,
          autorNome,
          nomeDestinatario: dest.nome,
          dadosEvento,
        });

        const textoSimples =
          `Olá, ${dest.nome}!\n\n` +
          `${tipo === 'evento' ? 'NOVO EVENTO AGENDADO' : 'NOVO AVISO OFICIAL'} — CyberGuard UTFPR\n` +
          `------------------------------------------------------------\n` +
          `Título: ${titulo}\n` +
          `Setor / Destino: ${escopoLabel}\n` +
          `Enviado por: ${autorNome}\n` +
          (dadosEvento
            ? `Data: ${dadosEvento.dataFormatada}\nHorário: ${dadosEvento.horarioFormatado}\nLocal: ${dadosEvento.local}\nGoogle Calendar: ${dadosEvento.linkTemplate}\n`
            : '') +
          `------------------------------------------------------------\n\n` +
          `${descricao}\n\n` +
          `-- CyberGuard UTFPR`;

        const mailOptions = {
          from: config.smtp.from || config.smtp.user,
          to: dest.email,
          subject:
            tipo === 'evento'
              ? `📅 [CyberGuard • ${escopoLabel}] Evento: ${titulo} (${dadosEvento.dataFormatada})`
              : `📢 [CyberGuard • ${escopoLabel}] Aviso: ${titulo}`,
          text: textoSimples,
          html,
        };

        if (tipo === 'evento' && dadosEvento) {
          // Gera o iCalendar (.ics) com METHOD:REQUEST incluindo o destinatário como ATTENDEE
          // para que o Gmail/Google Calendar adicione automaticamente na agenda do membro
          const icsIndividual = gerarIcsEvento({
            uid: dadosEvento.uid,
            titulo,
            descricao,
            local: dadosEvento.local,
            inicio: dadosEvento.inicio,
            fim: dadosEvento.fim,
            organizadorEmail: config.smtp.user,
            organizadorNome: `${autorNome} (CyberGuard UTFPR)`,
            emailsConvidados: comEmail.map((c) => c.email),
          });

          mailOptions.icalEvent = {
            filename: 'evento-cyberguard.ics',
            method: 'REQUEST',
            content: icsIndividual,
          };
        }

        await transporter.sendMail(mailOptions);
      })
    );

    for (const r of resultados) {
      if (r.status === 'fulfilled') enviados++;
      else {
        falhas++;
        console.error('[avisos] Falha ao enviar e-mail individual:', r.reason?.message || r.reason);
      }
    }
  }

  return { enviados, semEmail, falhas };
}

/**
 * Publica o aviso/evento no canal #📢avisos dentro de um Tópico Privado (PrivateThread com invitable: false)
 * onde APENAS os membros destinatários (do setor ou selecionados individualmente) são adicionados e conseguem ver.
 */
async function publicarNoCanalAvisosRestrito({
  client,
  guild,
  autorId,
  embed,
  destinatarios,
  nomeTopico,
}) {
  const canalId = config.canalAvisosId;
  if (!canalId) return null;

  try {
    const canal = await client.channels.fetch(canalId);
    if (!canal || !canal.isTextBased() || !canal.threads) return null;

    const thread = await canal.threads.create({
      name: nomeTopico.slice(0, 95),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Comunicação restrita CyberGuard: ${nomeTopico.slice(0, 60)}`,
    });

    // Adiciona o autor e exclusivamente os membros destinatários ao tópico privado
    const idsParaAdicionar = Array.from(
      new Set([autorId, ...destinatarios.map((d) => d.id)].filter(Boolean))
    );

    for (const uid of idsParaAdicionar) {
      await thread.members.add(uid).catch(() => {});
    }

    // Menciona os destinatários em blocos para notificá-los dentro do tópico privado
    const mencoes = destinatarios.map((d) => `<@${d.id}>`);
    const textoMencoes =
      mencoes.length <= 25
        ? mencoes.join(' ')
        : `${mencoes.slice(0, 25).join(' ')} (+${mencoes.length - 25} membros)`;

    await thread.send({
      content: `🔔 **Destinatários autorizados:** ${textoMencoes}`,
      embeds: [embed],
    });

    return thread;
  } catch (err) {
    console.error('[avisos] Erro ao criar tópico privado no canal de avisos:', err.message);
    return null;
  }
}

/**
 * Envia o Passo 1 (seleção de destinatários) de acordo com o cargo do usuário:
 * - Líder de setor comum: apenas Individualmente (membros do seu setor) ou Meu Setor.
 * - RH / Presidente / Vice-Presidente: Individualmente, Setor específico ou Todos os setores.
 */
async function iniciarSelecaoDestinatarios(interaction, tipo) {
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.member;
  if (!ehLiderAutorizado(member)) {
    return interaction.editReply({
      content:
        '❌ **Acesso restrito:** Apenas **Líderes de Setor**, **Recursos Humanos**, **Presidente** ou **Vice-Presidente** podem enviar avisos ou marcar eventos.',
    });
  }

  const acessoGeral = temPermissaoGeralAvisos(member);
  const catalogo = await obterCatalogoMembrosServidor(interaction.guild);
  const infoAutor = catalogo.get(interaction.user.id);
  const setoresDoLider = infoAutor?.setores || identificarSetoresDoMembro(member);

  const tituloPasso =
    tipo === 'evento'
      ? '📅 Marcar Evento no Google Calendar — Seleção de Destinatários'
      : '📢 Enviar Aviso Oficial — Seleção de Destinatários';

  if (acessoGeral) {
    const embed = new EmbedBuilder()
      .setColor(tipo === 'evento' ? 0x16a34a : 0x2563eb)
      .setTitle(tituloPasso)
      .setDescription(
        'Você possui permissão de **Acesso Geral (RH / Presidência)**.\n\n' +
          'Escolha abaixo para quem deseja enviar:\n' +
          '• **Menu 1 (Por Escopo / Setor):** Selecione **Todos os Setores** ou um **Setor Específico**.\n' +
          '• **Menu 2 (Individualmente):** Selecione **1 ou mais integrantes** diretamente.'
      );

    const selectEscopo = new StringSelectMenuBuilder()
      .setCustomId(`avisos_sel_escopo_${tipo}`)
      .setPlaceholder('🏢 Selecionar um Setor Específico ou Todos os Setores...')
      .addOptions([
        {
          label: 'Todos os Setores (Todos os Membros)',
          value: 'todos',
          description: 'Envia para todos os integrantes ativos do CyberGuard',
          emoji: '🌐',
        },
        ...LISTA_SETORES.map((setor) => ({
          label: `Setor: ${setor}`,
          value: `setor:${setor}`,
          description: `Envia exclusivamente para os integrantes de ${setor}`,
          emoji: EMOJI_SETOR[setor] || '🏢',
        })),
        {
          label: 'Somente Líderes & Vice-Líderes',
          value: 'setor:Líderes',
          description: 'Envia apenas para os líderes e vice-líderes de setores',
          emoji: '👑',
        },
      ]);

    const selectUsuarios = new UserSelectMenuBuilder()
      .setCustomId(`avisos_sel_usuarios_${tipo}`)
      .setPlaceholder('👤 Ou selecione 1 ou mais membros individualmente...')
      .setMinValues(1)
      .setMaxValues(15);

    return interaction.editReply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(selectEscopo),
        new ActionRowBuilder().addComponents(selectUsuarios),
      ],
    });
  }

  // Líder de Setor: restrito ao(s) seu(s) próprio(s) setor(es)
  if (setoresDoLider.length === 0) {
    return interaction.editReply({
      content:
        '⚠️ Você possui o cargo de Líder, mas nenhum cargo de setor específico foi identificado no seu perfil do Discord. Peça ao RH ou Presidência para vincular o cargo do seu setor.',
    });
  }

  const membrosDosMeusSetores = Array.from(catalogo.values())
    .filter((m) => m.setores.some((s) => setoresDoLider.includes(s)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const embed = new EmbedBuilder()
    .setColor(tipo === 'evento' ? 0x16a34a : 0x2563eb)
    .setTitle(tituloPasso)
    .setDescription(
      `Setor(es) sob sua liderança: **${setoresDoLider.join(', ')}**\n\n` +
        'Escolha como deseja direcionar:\n' +
        '• **Para todo o seu setor:** Clique no botão do setor abaixo.\n' +
        '• **Individualmente:** Selecione 1 ou mais membros do seu setor na lista abaixo.'
    );

  const componentes = [];

  const rowBotoesSetor = new ActionRowBuilder();
  for (const setor of setoresDoLider.slice(0, 5)) {
    rowBotoesSetor.addComponents(
      new ButtonBuilder()
        .setCustomId(`avisos_btn_setor_${tipo}_${setor}`)
        .setLabel(`Todo o Setor: ${setor}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(EMOJI_SETOR[setor] || '🏢')
    );
  }
  componentes.push(rowBotoesSetor);

  if (membrosDosMeusSetores.length > 0) {
    const opcoesMembros = membrosDosMeusSetores.slice(0, 25).map((m) => ({
      label: m.nome.slice(0, 95),
      value: m.id,
      description: `@${m.username} • ${m.setores.join(', ')}`.slice(0, 95),
      emoji: '👤',
    }));

    const selectMembrosSetor = new StringSelectMenuBuilder()
      .setCustomId(`avisos_sel_membro_setor_${tipo}`)
      .setPlaceholder(`👤 Enviar individualmente para membro(s) de ${setoresDoLider[0]}...`)
      .setMinValues(1)
      .setMaxValues(Math.min(15, opcoesMembros.length))
      .addOptions(opcoesMembros);

    componentes.push(new ActionRowBuilder().addComponents(selectMembrosSetor));
  }

  return interaction.editReply({
    embeds: [embed],
    components: componentes,
  });
}

/**
 * Exibe de forma efêmera (visível apenas para quem clicou) os avisos e eventos
 * destinados ao membro ou ao setor dele no próprio canal #📢avisos.
 */
async function exibirMeusAvisosEventos(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const catalogo = await obterCatalogoMembrosServidor(interaction.guild);
  const infoMembro = catalogo.get(interaction.user.id);
  const meusSetores = infoMembro?.setores || identificarSetoresDoMembro(interaction.member);
  if (ehLiderAutorizado(interaction.member)) {
    meusSetores.push('Líderes');
  }

  const registros = await db.listarAvisosEventosParaMembro(interaction.user.id, meusSetores, 10);

  if (!registros || registros.length === 0) {
    const embedVazio = new EmbedBuilder()
      .setColor(0x64748b)
      .setTitle('📬 Meus Avisos & Eventos • CyberGuard')
      .setDescription(
        `Olá, **${infoMembro?.nome || interaction.user.username}**!\n` +
          `Setor(es) vinculados: **${meusSetores.length ? meusSetores.join(', ') : 'Membro Geral'}**\n\n` +
          'Você ainda não possui avisos ou eventos recentes registrados para o seu perfil ou setor.'
      );
    return interaction.editReply({ embeds: [embedVazio] });
  }

  const embed = new EmbedBuilder()
    .setColor(0x2563eb)
    .setTitle('📬 Meus Avisos & Eventos Recentes')
    .setDescription(
      `Exibindo os últimos comunicados e agendamentos direcionados a **${
        infoMembro?.nome || interaction.user.username
      }** (${meusSetores.length ? meusSetores.join(', ') : 'Geral'}):`
    )
    .setFooter({ text: 'Visível apenas para você • CyberGuard UTFPR' })
    .setTimestamp();

  for (const item of registros.slice(0, 8)) {
    const icone = item.tipo === 'evento' ? '📅' : '📢';
    const escopoTxt =
      item.escopo === 'todos'
        ? 'Todos os Setores'
        : item.escopo === 'setor'
          ? `Setor: ${item.setor_alvo}`
          : 'Individual';

    let detalhes = `${item.descricao.slice(0, 280)}${item.descricao.length > 280 ? '...' : ''}`;
    if (item.tipo === 'evento' && item.data_inicio) {
      const tsIni = Math.floor(new Date(item.data_inicio).getTime() / 1000);
      detalhes = `🗓️ **Quando:** <t:${tsIni}:F> (<t:${tsIni}:R>)\n` + detalhes;
      if (item.calendar_link) {
        detalhes += `\n🔗 [Abrir no Google Calendar](${item.calendar_link})`;
      }
    }
    if (item.thread_id) {
      detalhes += `\n💬 Tópico exclusivo: <#${item.thread_id}>`;
    }
    detalhes += `\n*Por ${item.autor_nome} • ${escopoTxt}*`;

    embed.addFields({
      name: `${icone} ${item.titulo.slice(0, 200)}`,
      value: detalhes.slice(0, 1024),
    });
  }

  return interaction.editReply({ embeds: [embed] });
}

/**
 * Resolve a lista final de objetos de destinatários com base no rascunho selecionado.
 */
function resolverDestinatariosDoRascunho(catalogo, rascunho) {
  const todosMembros = Array.from(catalogo.values());

  if (rascunho.escopo === 'individual') {
    const idsAlvo = new Set(rascunho.destinatariosIds || []);
    return todosMembros.filter((m) => idsAlvo.has(m.id));
  }

  if (rascunho.escopo === 'setor') {
    if (rascunho.setorAlvo === 'Líderes') {
      return todosMembros.filter((m) => m.ehLider);
    }
    return todosMembros.filter((m) => m.setores.includes(rascunho.setorAlvo));
  }

  // escopo === 'todos'
  return todosMembros.filter((m) => m.ehMembroProjeto);
}

/**
 * Handler central de todas as interações do módulo de Avisos e Eventos.
 */
async function handleAvisosInteraction(interaction) {
  // 1. Botões do Painel Principal (#📢avisos)
  if (interaction.isButton() && interaction.customId === 'painel_avisos_novo_aviso') {
    await iniciarSelecaoDestinatarios(interaction, 'aviso');
    return true;
  }

  if (interaction.isButton() && interaction.customId === 'painel_avisos_novo_evento') {
    await iniciarSelecaoDestinatarios(interaction, 'evento');
    return true;
  }

  if (interaction.isButton() && interaction.customId === 'painel_avisos_meus_avisos') {
    await exibirMeusAvisosEventos(interaction);
    return true;
  }

  // 2. Seleção de Setor por Botão (Líder de Setor)
  if (interaction.isButton() && interaction.customId.startsWith('avisos_btn_setor_')) {
    const match = interaction.customId.match(/^avisos_btn_setor_(aviso|evento)_(.+)$/);
    if (!match) return false;
    const [, tipo, setor] = match;

    await exibirModalParaRascunho(interaction, {
      tipo,
      escopo: 'setor',
      setorAlvo: setor,
      destinatariosIds: [],
      resumoAlvo: `Setor ${setor}`,
    });
    return true;
  }

  // 3. Seleção de Escopo/Setor via Select Menu (RH / Presidente / Vice-Presidente)
  if (
    interaction.isStringSelectMenu() &&
    (interaction.customId === 'avisos_sel_escopo_aviso' ||
      interaction.customId === 'avisos_sel_escopo_evento')
  ) {
    const tipo = interaction.customId.endsWith('_evento') ? 'evento' : 'aviso';
    const escolha = interaction.values[0];

    if (escolha === 'todos') {
      await exibirModalParaRascunho(interaction, {
        tipo,
        escopo: 'todos',
        setorAlvo: 'Todos os Setores',
        destinatariosIds: [],
        resumoAlvo: 'Todos os Setores',
      });
      return true;
    }

    if (escolha.startsWith('setor:')) {
      const setor = escolha.slice('setor:'.length);
      await exibirModalParaRascunho(interaction, {
        tipo,
        escopo: 'setor',
        setorAlvo: setor,
        destinatariosIds: [],
        resumoAlvo: `Setor ${setor}`,
      });
      return true;
    }
  }

  // 4. Seleção Individual de Membros do Setor (Líder de Setor)
  if (
    interaction.isStringSelectMenu() &&
    (interaction.customId === 'avisos_sel_membro_setor_aviso' ||
      interaction.customId === 'avisos_sel_membro_setor_evento')
  ) {
    const tipo = interaction.customId.endsWith('_evento') ? 'evento' : 'aviso';
    const idsSelecionados = interaction.values;

    await exibirModalParaRascunho(interaction, {
      tipo,
      escopo: 'individual',
      setorAlvo: null,
      destinatariosIds: idsSelecionados,
      resumoAlvo:
        idsSelecionados.length === 1
          ? '1 Membro Individual'
          : `${idsSelecionados.length} Membros Selecionados`,
    });
    return true;
  }

  // 5. Seleção Individual de Usuários via UserSelectMenu (RH / Presidente / Vice-Presidente)
  if (
    interaction.isUserSelectMenu() &&
    (interaction.customId === 'avisos_sel_usuarios_aviso' ||
      interaction.customId === 'avisos_sel_usuarios_evento')
  ) {
    const tipo = interaction.customId.endsWith('_evento') ? 'evento' : 'aviso';
    const idsSelecionados = interaction.values;

    await exibirModalParaRascunho(interaction, {
      tipo,
      escopo: 'individual',
      setorAlvo: null,
      destinatariosIds: idsSelecionados,
      resumoAlvo:
        idsSelecionados.length === 1
          ? '1 Membro Individual'
          : `${idsSelecionados.length} Membros Selecionados`,
    });
    return true;
  }

  // 6. Submissão do Modal de Aviso ou Evento
  if (
    interaction.isModalSubmit() &&
    (interaction.customId.startsWith('modal_avisos_enviar_aviso_') ||
      interaction.customId.startsWith('modal_avisos_enviar_evento_'))
  ) {
    const ehEvento = interaction.customId.startsWith('modal_avisos_enviar_evento_');
    const token = interaction.customId.replace(/^modal_avisos_enviar_(aviso|evento)_/, '');
    const rascunho = rascunhosPendentes.get(token);

    await interaction.deferReply({ ephemeral: true });

    if (!rascunho) {
      return interaction.editReply({
        content: '⚠️ Sua sessão de preenchimento expirou. Por favor, clique novamente no botão do painel.',
      });
    }
    rascunhosPendentes.delete(token);

    if (!ehLiderAutorizado(interaction.member)) {
      return interaction.editReply({
        content: '❌ Você não possui permissão para executar esta ação.',
      });
    }

    const catalogo = await obterCatalogoMembrosServidor(interaction.guild);
    const infoAutor = catalogo.get(interaction.user.id);
    const autorNome = infoAutor?.nome || interaction.member?.displayName || interaction.user.username;
    const destinatarios = resolverDestinatariosDoRascunho(catalogo, rascunho);

    if (destinatarios.length === 0) {
      return interaction.editReply({
        content:
          '⚠️ Nenhum integrante ativo foi encontrado para o destino selecionado. Verifique se os membros possuem o cargo do setor correspondente.',
      });
    }

    const escopoLabel =
      rascunho.escopo === 'todos'
        ? 'Todos os Setores (Geral)'
        : rascunho.escopo === 'setor'
          ? `Setor: ${rascunho.setorAlvo}`
          : destinatarios.length === 1
            ? `Individual (${destinatarios[0].nome})`
            : `Individual (${destinatarios.length} membros)`;

    if (!ehEvento) {
      // --- ENVIO DE AVISO ---
      const titulo = interaction.fields.getTextInputValue('input_aviso_titulo').trim();
      const corpo = interaction.fields.getTextInputValue('input_aviso_corpo').trim();

      const embedAviso = new EmbedBuilder()
        .setColor(0x2563eb)
        .setTitle(`📢 ${titulo}`)
        .setDescription(corpo)
        .addFields(
          { name: '🎯 Destino / Setor', value: escopoLabel, inline: true },
          { name: '👤 Enviado por', value: `${autorNome} (<@${interaction.user.id}>)`, inline: true }
        )
        .setFooter({ text: 'CyberGuard UTFPR • Comunicado Oficial Restrito ao Setor/Destinatários' })
        .setTimestamp();

      const etiquetaTopico =
        rascunho.escopo === 'todos'
          ? 'Geral'
          : rascunho.escopo === 'setor'
            ? rascunho.setorAlvo
            : 'Individual';

      const thread = await publicarNoCanalAvisosRestrito({
        client: interaction.client,
        guild: interaction.guild,
        autorId: interaction.user.id,
        embed: embedAviso,
        destinatarios,
        nomeTopico: `📢 [${etiquetaTopico}] ${titulo}`,
      });

      // Envia também na DM de cada membro selecionado (best-effort)
      let dmsEnviadas = 0;
      await Promise.allSettled(
        destinatarios.map(async (d) => {
          await d.member.send({
            content: thread
              ? `📢 Você recebeu um novo aviso no canal <#${config.canalAvisosId}> (tópico exclusivo: <#${thread.id}>):`
              : `📢 Você recebeu um novo aviso oficial do **CyberGuard UTFPR**:`,
            embeds: [embedAviso],
          });
          dmsEnviadas++;
        })
      );

      // Envia por E-mail
      const statsEmail = await dispararEmailsDestinatarios({
        tipo: 'aviso',
        titulo,
        descricao: corpo,
        escopoLabel,
        autorNome,
        destinatarios,
      });

      await db.criarAvisoOuEvento({
        tipo: 'aviso',
        escopo: rascunho.escopo,
        setorAlvo: rascunho.setorAlvo,
        destinatariosIds: destinatarios.map((d) => d.id),
        titulo,
        descricao: corpo,
        threadId: thread?.id || null,
        autorId: interaction.user.id,
        autorNome,
        emailsEnviados: statsEmail.enviados,
      });

      const embedResumo = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('✅ Aviso Enviado com Sucesso!')
        .setDescription(
          `O comunicado **${titulo}** foi entregue exclusivamente aos membros selecionados.\n\n` +
            `• **Escopo:** ${escopoLabel}\n` +
            `• **Destinatários no Discord:** ${destinatarios.length} membro(s)\n` +
            `• **Tópico Restrito no Canal de Avisos:** ${thread ? `<#${thread.id}> *(visível apenas para os selecionados)*` : 'Salvo no painel individual'}\n` +
            `• **Notificações via DM:** ${dmsEnviadas}/${destinatarios.length} entregue(s)\n` +
            `• **E-mails Enviados:** ${statsEmail.enviados} enviado(s)` +
            (statsEmail.semEmail > 0 ? ` *(${statsEmail.semEmail} sem e-mail cadastrado)*` : '')
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embedResumo] });
    }

    // --- MARCAR EVENTO (GOOGLE CALENDAR) ---
    const titulo = interaction.fields.getTextInputValue('input_evento_titulo').trim();
    const dataInput = interaction.fields.getTextInputValue('input_evento_data').trim();
    const horarioInput = interaction.fields.getTextInputValue('input_evento_horario').trim();
    const localInput =
      (interaction.fields.getTextInputValue('input_evento_local') || '').trim() ||
      'Discord • CyberGuard UTFPR';
    const descricao = interaction.fields.getTextInputValue('input_evento_descricao').trim();

    const parsedData = parseDataHoraEvento(dataInput, horarioInput);
    if (!parsedData.ok) {
      return interaction.editReply({
        content: `❌ **Erro na data ou horário do evento:** ${parsedData.erro}`,
      });
    }

    const emailsConvidados = destinatarios
      .map((d) => d.email)
      .filter((e) => e && e.includes('@'));

    const resCalendar = await criarEventoGoogleCalendar({
      titulo,
      descricao,
      local: localInput,
      inicio: parsedData.inicio,
      fim: parsedData.fim,
      emailsConvidados,
      organizadorNome: autorNome,
      organizadorEmail: infoAutor?.email || config.smtp.user,
    });

    const tsIni = Math.floor(parsedData.inicio.getTime() / 1000);
    const tsFim = Math.floor(parsedData.fim.getTime() / 1000);

    const embedEvento = new EmbedBuilder()
      .setColor(0x16a34a)
      .setTitle(`📅 Evento Agendado: ${titulo}`)
      .setDescription(descricao)
      .addFields(
        {
          name: '🗓️ Data e Horário',
          value: `<t:${tsIni}:F> até <t:${tsFim}:t> (<t:${tsIni}:R>)`,
          inline: false,
        },
        { name: '📍 Local / Canal', value: localInput, inline: true },
        { name: '🎯 Participantes', value: escopoLabel, inline: true },
        { name: '👤 Organizador(a)', value: `${autorNome} (<@${interaction.user.id}>)`, inline: true },
        {
          name: '📆 Google Calendar',
          value: `O convite automático foi enviado para o seu e-mail institucional/pessoal cadastrado.\n🔗 **[Clique aqui para visualizar no Google Calendar](${resCalendar.linkTemplate})**`,
          inline: false,
        }
      )
      .setFooter({ text: 'CyberGuard UTFPR • Sincronização Automática Google Calendar' })
      .setTimestamp();

    const etiquetaTopico =
      rascunho.escopo === 'todos'
        ? 'Geral'
        : rascunho.escopo === 'setor'
          ? rascunho.setorAlvo
          : 'Individual';

    const thread = await publicarNoCanalAvisosRestrito({
      client: interaction.client,
      guild: interaction.guild,
      autorId: interaction.user.id,
      embed: embedEvento,
      destinatarios,
      nomeTopico: `📅 [${etiquetaTopico}] ${parsedData.dataFormatada} • ${titulo}`,
    });

    let dmsEnviadas = 0;
    await Promise.allSettled(
      destinatarios.map(async (d) => {
        await d.member.send({
          content: thread
            ? `📅 Um novo evento foi marcado para você no canal <#${config.canalAvisosId}> (tópico exclusivo: <#${thread.id}>):`
            : `📅 Um novo evento do **CyberGuard UTFPR** foi agendado no seu Google Calendar:`,
          embeds: [embedEvento],
        });
        dmsEnviadas++;
      })
    );

    const statsEmail = await dispararEmailsDestinatarios({
      tipo: 'evento',
      titulo,
      descricao,
      escopoLabel,
      autorNome,
      destinatarios,
      dadosEvento: {
        inicio: parsedData.inicio,
        fim: parsedData.fim,
        dataFormatada: parsedData.dataFormatada,
        horarioFormatado: parsedData.horarioFormatado,
        local: localInput,
        linkTemplate: resCalendar.linkTemplate,
        uid: resCalendar.uid,
      },
    });

    await db.criarAvisoOuEvento({
      tipo: 'evento',
      escopo: rascunho.escopo,
      setorAlvo: rascunho.setorAlvo,
      destinatariosIds: destinatarios.map((d) => d.id),
      titulo,
      descricao,
      dataInicio: parsedData.inicio,
      dataFim: parsedData.fim,
      localEvento: localInput,
      calendarEventId: resCalendar.eventId,
      calendarLink: resCalendar.linkTemplate,
      threadId: thread?.id || null,
      autorId: interaction.user.id,
      autorNome,
      emailsEnviados: statsEmail.enviados,
    });

    const statusApiTxt = resCalendar.sincronizadoApi
      ? '✅ Registrado na API do Google Calendar + Convite automático `.ics` enviado'
      : `📨 Convite automático Google Calendar (\`METHOD:REQUEST\`) enviado por e-mail (${resCalendar.motivoApi || 'API pendente'})`;

    const embedResumo = new EmbedBuilder()
      .setColor(0x16a34a)
      .setTitle('📅 Evento Marcado com Sucesso!')
      .setDescription(
        `O evento **${titulo}** foi agendado e enviado para os membros selecionados.\n\n` +
          `• **Data e Horário:** ${parsedData.dataFormatada} • ${parsedData.horarioFormatado}\n` +
          `• **Escopo:** ${escopoLabel} (${destinatarios.length} membro(s))\n` +
          `• **Tópico Restrito no Canal de Avisos:** ${thread ? `<#${thread.id}> *(visível apenas para os selecionados)*` : 'Salvo no painel individual'}\n` +
          `• **Google Calendar:** ${statusApiTxt}\n` +
          `• **Agendas / E-mails Enviados:** ${statsEmail.enviados} convite(s) entregue(s)` +
          (statsEmail.semEmail > 0 ? ` *(${statsEmail.semEmail} sem e-mail cadastrado)*` : '') +
          `\n• **Notificações via DM:** ${dmsEnviadas}/${destinatarios.length} entregue(s)`
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embedResumo] });
  }

  return false;
}

module.exports = {
  LISTA_SETORES,
  temPermissaoGeralAvisos,
  ehLiderAutorizado,
  montarPainelAvisos,
  garantirPainelAvisos,
  handleAvisosInteraction,
};
