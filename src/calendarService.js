'use strict';

const crypto = require('crypto');
const { JWT, OAuth2Client } = require('google-auth-library');
const config = require('./config');

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE_BR = 'America/Sao_Paulo';

let serviceAccountJwt = null;
let oauthCalendarClient = null;
let oauthTemEscopoCalendar = null; // null = não testado, true/false

/**
 * Faz o parse flexível de data (ex: "15/11/2026", "15/11") e horário (ex: "19:00 - 20:30", "19h às 20h30", "19:00")
 * no fuso horário America/Sao_Paulo (UTC-3).
 */
function parseDataHoraEvento(dataTexto, horarioTexto) {
  const dataLimpa = String(dataTexto || '').trim();
  const horarioLimpo = String(horarioTexto || '').trim();

  let dia;
  let mes;
  let ano;

  const matchBr = dataLimpa.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  const matchIso = dataLimpa.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  const anoAtual = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE_BR, year: 'numeric' }).format(new Date())
  );

  if (matchBr) {
    dia = parseInt(matchBr[1], 10);
    mes = parseInt(matchBr[2], 10);
    if (!matchBr[3]) {
      ano = anoAtual;
    } else if (matchBr[3].length === 2) {
      ano = 2000 + parseInt(matchBr[3], 10);
    } else {
      ano = parseInt(matchBr[3], 10);
    }
  } else if (matchIso) {
    ano = parseInt(matchIso[1], 10);
    mes = parseInt(matchIso[2], 10);
    dia = parseInt(matchIso[3], 10);
  } else {
    return {
      ok: false,
      erro: 'Formato de data inválido. Use **DD/MM/AAAA** (ex.: `15/11/2026`).',
    };
  }

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2024 || ano > 2100) {
    return {
      ok: false,
      erro: 'Data fora do intervalo válido. Verifique o dia, mês e ano informados.',
    };
  }

  // Regex para "19:00 - 20:30", "19h às 20h30", "14h às 16h", "19:00 as 21:00", "19:00", "19h"
  const matchHorario = horarioLimpo.match(
    /^(\d{1,2})(?:[:hH](\d{2})?)?\s*(?:(?:-|–|—|a|às|as|ate|até)\s*(\d{1,2})(?:[:hH](\d{2})?)?)?$/i
  );

  if (!matchHorario) {
    return {
      ok: false,
      erro: 'Formato de horário inválido. Use **HH:MM - HH:MM** (ex.: `19:00 - 20:30` ou `19:00`).',
    };
  }

  const hIni = parseInt(matchHorario[1], 10);
  const mIni = matchHorario[2] ? parseInt(matchHorario[2], 10) : 0;

  let hFim = matchHorario[3] !== undefined ? parseInt(matchHorario[3], 10) : null;
  let mFim = matchHorario[4] !== undefined ? parseInt(matchHorario[4], 10) : 0;

  if (hIni < 0 || hIni > 23 || mIni < 0 || mIni > 59) {
    return {
      ok: false,
      erro: 'Horário de início inválido (use horas entre 00:00 e 23:59).',
    };
  }

  if (hFim !== null && (hFim < 0 || hFim > 23 || mFim < 0 || mFim > 59)) {
    return {
      ok: false,
      erro: 'Horário de término inválido (use horas entre 00:00 e 23:59).',
    };
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  const inicioIso = `${ano}-${pad2(mes)}-${pad2(dia)}T${pad2(hIni)}:${pad2(mIni)}:00-03:00`;
  const inicio = new Date(inicioIso);

  if (Number.isNaN(inicio.getTime())) {
    return {
      ok: false,
      erro: 'Não foi possível interpretar a data/hora informada.',
    };
  }

  let fim;
  if (hFim === null) {
    // Duração padrão de 1 hora
    fim = new Date(inicio.getTime() + 60 * 60 * 1000);
  } else {
    const fimIsoTentativa = `${ano}-${pad2(mes)}-${pad2(dia)}T${pad2(hFim)}:${pad2(mFim)}:00-03:00`;
    fim = new Date(fimIsoTentativa);
    if (fim <= inicio) {
      // Se o horário final for menor ou igual ao inicial (ex: 23:00 - 00:30), avança 1 dia
      fim = new Date(fim.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const dataFormatada = `${pad2(dia)}/${pad2(mes)}/${ano}`;
  const horaIniFmt = `${pad2(hIni)}:${pad2(mIni)}`;
  const horaFimFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE_BR,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fim);

  return {
    ok: true,
    inicio,
    fim,
    inicioIso: inicio.toISOString(),
    fimIso: fim.toISOString(),
    dataFormatada,
    horarioFormatado: `${horaIniFmt} às ${horaFimFmt}`,
  };
}

function formatarDataUtcIcs(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escaparTextoIcs(texto) {
  return String(texto || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Gera um link direto do Google Calendar para adicionar/visualizar o evento com 1 clique.
 */
function gerarLinkTemplateGoogleCalendar({ titulo, descricao, local, inicio, fim }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `[CyberGuard] ${titulo}`,
    dates: `${formatarDataUtcIcs(inicio)}/${formatarDataUtcIcs(fim)}`,
    details: `${descricao || ''}\n\n— Evento oficial CyberGuard UTFPR`,
    location: local || 'Discord • CyberGuard UTFPR',
    ctz: TIMEZONE_BR,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Gera conteúdo iCalendar RFC 5545 com METHOD:REQUEST.
 * Quando enviado por e-mail via SMTP (Gmail) para os convidados em ATTENDEE,
 * o Google Calendar / Gmail adiciona automaticamente o evento na agenda de cada destinatário.
 */
function gerarIcsEvento({
  uid,
  titulo,
  descricao,
  local,
  inicio,
  fim,
  organizadorEmail,
  organizadorNome = 'CyberGuard UTFPR',
  emailsConvidados = [],
}) {
  const eventUid = uid || `cyberguard-evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@utfpr.edu.br`;
  const agoraUtc = formatarDataUtcIcs(new Date());
  const dtStart = formatarDataUtcIcs(inicio);
  const dtEnd = formatarDataUtcIcs(fim);
  const orgEmail = (organizadorEmail || config.smtp.user || 'bot@utfpr.edu.br').trim();

  const linhas = [
    'BEGIN:VCALENDAR',
    'PRODID:-//CyberGuard UTFPR//Agenda de Eventos//PT-BR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `DTSTAMP:${agoraUtc}`,
    `ORGANIZER;CN="${escaparTextoIcs(organizadorNome)}":mailto:${orgEmail}`,
    `UID:${eventUid}`,
  ];

  const unicos = Array.from(
    new Set(
      emailsConvidados
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e && e.includes('@'))
    )
  );

  for (const email of unicos) {
    linhas.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${email}";X-NUM-GUESTS=0:mailto:${email}`
    );
  }

  linhas.push(
    `CREATED:${agoraUtc}`,
    `DESCRIPTION:${escaparTextoIcs(descricao)}`,
    `LAST-MODIFIED:${agoraUtc}`,
    `LOCATION:${escaparTextoIcs(local || 'Discord CyberGuard UTFPR')}`,
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    `SUMMARY:${escaparTextoIcs(`[CyberGuard] ${titulo}`)}`,
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Lembrete de evento CyberGuard UTFPR',
    'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return linhas.join('\r\n');
}

/**
 * Obtém um token de acesso válido para a Google Calendar API.
 * Prioriza OAuth2 caso possua escopo de Calendar; caso contrário utiliza a Service Account.
 */
async function obterTokenCalendar() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken && oauthTemEscopoCalendar !== false) {
    try {
      if (!oauthCalendarClient) {
        oauthCalendarClient = new OAuth2Client(clientId, clientSecret);
        oauthCalendarClient.setCredentials({ refresh_token: refreshToken });
      }
      const resToken = await oauthCalendarClient.getAccessToken();
      const token = typeof resToken === 'string' ? resToken : resToken?.token;

      if (token && oauthTemEscopoCalendar === null) {
        const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (infoRes.ok) {
          const info = await infoRes.json();
          const escopos = String(info.scope || '');
          oauthTemEscopoCalendar = escopos.includes('calendar');
        } else {
          oauthTemEscopoCalendar = false;
        }
      }

      if (token && oauthTemEscopoCalendar) {
        return { token, tipo: 'oauth2' };
      }
    } catch (err) {
      oauthTemEscopoCalendar = false;
      console.warn('[calendarService] OAuth2 sem escopo de Calendar, usando Service Account:', err.message);
    }
  }

  const email = config.googleSheets?.serviceAccountEmail;
  const key = config.googleSheets?.privateKey;

  if (email && key) {
    if (!serviceAccountJwt) {
      serviceAccountJwt = new JWT({
        email,
        key,
        scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
      });
    }
    const resToken = await serviceAccountJwt.getAccessToken();
    const token = typeof resToken === 'string' ? resToken : resToken?.token;
    if (token) {
      return { token, tipo: 'service_account' };
    }
  }

  return null;
}

/**
 * Cria o evento na Google Calendar API v3 e retorna também o convite iCalendar (METHOD:REQUEST)
 * e o link direto para agenda dos membros selecionados.
 */
async function criarEventoGoogleCalendar({
  titulo,
  descricao,
  local = 'Discord • CyberGuard UTFPR',
  inicio,
  fim,
  emailsConvidados = [],
  organizadorNome = 'CyberGuard UTFPR',
  organizadorEmail = '',
}) {
  const uid = `cyberguard-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@utfpr.edu.br`;
  const linkTemplate = gerarLinkTemplateGoogleCalendar({ titulo, descricao, local, inicio, fim });
  const icsContent = gerarIcsEvento({
    uid,
    titulo,
    descricao,
    local,
    inicio,
    fim,
    organizadorEmail: organizadorEmail || config.smtp.user,
    organizadorNome,
    emailsConvidados,
  });

  const emailsValidos = Array.from(
    new Set(
      emailsConvidados
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e && e.includes('@'))
    )
  );

  let authInfo = null;
  try {
    authInfo = await obterTokenCalendar();
  } catch (errAuth) {
    console.warn('[calendarService] Falha ao obter token do Google Calendar:', errAuth.message);
  }

  if (!authInfo || !authInfo.token) {
    return {
      ok: true,
      sincronizadoApi: false,
      motivoApi: 'Credenciais do Google Calendar ausentes (usando convite iCalendar automático via e-mail).',
      eventId: null,
      htmlLink: linkTemplate,
      linkTemplate,
      icsContent,
      uid,
    };
  }

  const calendarId = encodeURIComponent(config.googleCalendarId || 'primary');
  const corpoBase = {
    summary: `[CyberGuard] ${titulo}`,
    location: local || 'Discord • CyberGuard UTFPR',
    description: `${descricao}\n\nOrganizado por: ${organizadorNome} (CyberGuard UTFPR)`,
    start: {
      dateTime: inicio.toISOString(),
      timeZone: TIMEZONE_BR,
    },
    end: {
      dateTime: fim.toISOString(),
      timeZone: TIMEZONE_BR,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 30 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };

  try {
    // 1ª tentativa: inclui os convidados diretamente no payload (funciona com OAuth2 ou Service Account com DWD)
    const incluirAttendees = emailsValidos.length > 0 && authInfo.tipo === 'oauth2';
    const urlComUpdates = `${CALENDAR_API}/calendars/${calendarId}/events${
      incluirAttendees ? '?sendUpdates=all' : ''
    }`;

    const payload1 = incluirAttendees
      ? {
          ...corpoBase,
          attendees: emailsValidos.map((email) => ({ email })),
          guestsCanSeeOtherGuests: true,
        }
      : corpoBase;

    let res = await fetch(urlComUpdates, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authInfo.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload1),
      signal: AbortSignal.timeout(15000),
    });

    // Se falhar por restrição de attendees na conta, tenta criar o evento base na agenda da API
    if (!res.ok && incluirAttendees && res.status === 403) {
      res = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authInfo.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(corpoBase),
        signal: AbortSignal.timeout(15000),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[calendarService] Google Calendar API retornou ${res.status}:`, errText.slice(0, 300));
      return {
        ok: true,
        sincronizadoApi: false,
        statusApi: res.status,
        motivoApi: errText.includes('SERVICE_DISABLED')
          ? 'A API do Google Calendar ainda precisa ser ativada no Console do Google Cloud.'
          : `Status ${res.status} na API do Google Calendar`,
        eventId: null,
        htmlLink: linkTemplate,
        linkTemplate,
        icsContent,
        uid,
      };
    }

    const dados = await res.json();
    return {
      ok: true,
      sincronizadoApi: true,
      convidadosDiretosApi: incluirAttendees,
      eventId: dados.id || null,
      htmlLink: linkTemplate,
      apiHtmlLink: dados.htmlLink || null,
      linkTemplate,
      icsContent,
      uid,
    };
  } catch (err) {
    console.error('[calendarService] Erro ao criar evento na Google Calendar API:', err.message);
    return {
      ok: true,
      sincronizadoApi: false,
      motivoApi: err.message,
      eventId: null,
      htmlLink: linkTemplate,
      linkTemplate,
      icsContent,
      uid,
    };
  }
}

module.exports = {
  TIMEZONE_BR,
  parseDataHoraEvento,
  gerarLinkTemplateGoogleCalendar,
  gerarIcsEvento,
  criarEventoGoogleCalendar,
};
