const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

// ── Cálculo de datas (puro, sem depender do fuso do runtime) ──────────────

function hojeSaoPaulo() {
  // en-CA formata como YYYY-MM-DD, já no formato usado no resto do app.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function parseISO(dataISO) {
  const [y, m, d] = dataISO.split('-').map(Number);
  return { y, m, d };
}

function dateFromParts(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

// Próximo aniversário (dia/mês de dataNascISO) a partir de hojeISO -- esse
// ano se ainda não passou, senão o do ano que vem.
function proximoAniversario(dataNascISO, hojeISO) {
  const { m, d } = parseISO(dataNascISO);
  const { y: anoHoje } = parseISO(hojeISO);
  let candidato = dateFromParts(anoHoje, m, d);
  if (toISO(candidato) < hojeISO) candidato = dateFromParts(anoHoje + 1, m, d);
  return candidato;
}

// Subtrai N dias úteis (só pula sáb/dom -- feriados não entram nesta v1).
function subtrairDiasUteis(date, quantidade) {
  const d = new Date(date.getTime());
  let restante = quantidade;
  while (restante > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const diaSemana = d.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restante--;
  }
  return d;
}

function formatarDataBR(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Apuração + envio ───────────────────────────────────────────────────

async function apurarAniversariantesEEnviar() {
  const hojeISO = hojeSaoPaulo();

  const configSnap = await db.doc('config/geral').get();
  const diasAlerta = configSnap.exists ? (configSnap.data().diasUteisAlertaAniversario ?? 2) : 2;

  const colaboradoresSnap = await db.collection('colaboradores').where('ativo', '==', true).get();
  const aniversariantes = [];
  colaboradoresSnap.forEach((doc) => {
    const c = doc.data();
    if (!c.dataNascimento) return;
    const aniversario = proximoAniversario(c.dataNascimento, hojeISO);
    const dataAlerta = toISO(subtrairDiasUteis(aniversario, diasAlerta));
    if (dataAlerta === hojeISO) aniversariantes.push({ nome: c.nome, data: toISO(aniversario) });
  });

  if (aniversariantes.length === 0) {
    return { enviado: false, quantidade: 0, motivo: 'Nenhum aniversariante na janela de alerta hoje.' };
  }

  const emailsSnap = await db.collection('emailsAlerta').get();
  const destinatarios = emailsSnap.docs.map((d) => d.data().email).filter(Boolean);
  if (destinatarios.length === 0) {
    return { enviado: false, quantidade: aniversariantes.length, motivo: 'Nenhum e-mail cadastrado em Parâmetros.' };
  }

  await enviarEmail(destinatarios, montarHtmlEmail(aniversariantes, diasAlerta));
  return { enviado: true, quantidade: aniversariantes.length, destinatarios: destinatarios.length };
}

function montarHtmlEmail(lista, diasAlerta) {
  const linhas = lista
    .map((a) => `<li>${a.nome} — ${formatarDataBR(a.data)}</li>`)
    .join('');
  return `
    <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:linear-gradient(105deg,#0B2355 0%,#1A3F7A 55%,#2E8CC7 100%);color:#fff;padding:16px 20px;border-radius:8px;display:flex;align-items:center;gap:12px">
        <img src="https://agil-aduaneira.github.io/sistema-va-vt-agil/logo-agil.png" width="36" height="36" alt="Agil Aduaneira">
        <div>
          <div style="font-weight:700;font-size:14px">Setor Pessoal — Agil Aduaneira</div>
          <div style="font-size:13px;margin-top:2px">Aniversariantes chegando (${diasAlerta} dias úteis de antecedência)</div>
        </div>
      </div>
      <ul style="padding:16px 24px;color:#152438;font-family:'Segoe UI',system-ui,sans-serif">${linhas}</ul>
    </div>
  `;
}

async function enviarEmail(destinatarios, html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value() },
  });
  await transporter.sendMail({
    from: `Setor Pessoal — Agil Aduaneira <${GMAIL_USER.value()}>`,
    to: destinatarios.join(','),
    subject: 'Aniversariantes chegando — Setor Pessoal',
    html,
  });
}

// ── Gatilhos ───────────────────────────────────────────────────────────

exports.alertaAniversarios = onSchedule(
  { schedule: 'every day 08:00', timeZone: 'America/Sao_Paulo', secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async () => {
    const resultado = await apurarAniversariantesEEnviar();
    logger.info('alertaAniversarios', resultado);
  }
);

// Dispara a mesma lógica sob demanda (botão "Testar envio agora" em
// Parâmetros) -- não é um modo de teste separado, roda exatamente a mesma
// checagem de data; só existe pra não depender de esperar o cron rodar.
exports.testarAlertaAniversarios = onRequest(
  { secrets: [GMAIL_USER, GMAIL_APP_PASSWORD], cors: true },
  async (req, res) => {
    try {
      const authHeader = req.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token) { res.status(401).json({ erro: 'Token ausente.' }); return; }
      await admin.auth().verifyIdToken(token);
      const resultado = await apurarAniversariantesEEnviar();
      res.status(200).json(resultado);
    } catch (err) {
      logger.error(err);
      res.status(401).json({ erro: 'Não autorizado ou falha no envio: ' + err.message });
    }
  }
);
