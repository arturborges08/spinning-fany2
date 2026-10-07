'use strict';
/** Envio de e-mails (Brevo ou Resend, por API) com fila: nada se perde se o servidor reiniciar. */
const core = require('./core');
const { esc } = core;

const provider = () => (process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : null);
function fromAddr() {
  const raw = String(process.env.EMAIL_FROM || '').trim(), m = raw.match(/^(.*)<([^>]+)>$/);
  const email = (m ? m[2] : raw).trim(), name = (m ? m[1] : '').replace(/["']/g, '').trim() || 'Spinning Fany';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { name, email } : { name, email: '' };
}
const enabled = () => !!provider() && !!fromAddr().email;
const baseUrl = () => (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const dailyLimit = () => Number(process.env.EMAIL_DAILY_LIMIT) || (provider() === 'resend' ? 90 : 250);
const brtHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
const today = () => new Date().toISOString().slice(0, 10);

/* ── layout dos e-mails (visual do estúdio) ── */
function layout({ title, text, button, footer }) {
  const body = esc(text).replace(/\n/g, '<br>');
  const btn = button && button.url ? `<tr><td style="padding:6px 28px 26px"><a href="${esc(button.url)}" style="display:inline-block;background:#f5c518;color:#141100;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:15px">${esc(button.label || 'Abrir o site')}</a></td></tr>` : '';
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#070707"><table width="100%" cellpadding="0" cellspacing="0" style="background:#070707"><tr><td align="center" style="padding:24px 12px"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#101010;border:1px solid #272727;border-radius:18px;font-family:Arial,Helvetica,sans-serif">
<tr><td style="padding:24px 28px 8px;color:#f5c518;font-weight:800;font-size:18px;letter-spacing:.5px">🚴 SPINNING FANY</td></tr>
<tr><td style="padding:8px 28px 6px;color:#f4f4f1;font-size:21px;font-weight:700;line-height:1.25">${esc(title)}</td></tr>
<tr><td style="padding:6px 28px 20px;color:#cfcfc8;font-size:15px;line-height:1.6">${body}</td></tr>${btn}
<tr><td style="padding:16px 28px 24px;border-top:1px solid #272727;color:#8d8d86;font-size:12px;line-height:1.5">${footer || 'Você recebeu este e-mail porque tem conta no site do Spinning Fany.'}</td></tr>
</table></td></tr></table></body></html>`;
  const plain = `${title}\n\n${text}${button && button.url ? `\n\n${button.label || 'Abrir'}: ${button.url}` : ''}\n\n— Spinning Fany`;
  return { html, text: plain };
}
const unsubLink = userId => `${baseUrl()}/api/unsub?u=${encodeURIComponent(userId)}&t=${require('./secrets').sign('unsub|' + userId)}`;

/* ── fila ── */
function push(msg) {
  const db = core.db; db.outbox = db.outbox || [];
  db.outbox.push(Object.assign({ id: core.uid(), status: 'pending', tries: 0, due: Date.now(), createdAt: new Date().toISOString() }, msg));
  if (db.outbox.length > 6000) db.outbox = db.outbox.filter(m => m.status === 'pending').concat(db.outbox.filter(m => m.status !== 'pending').slice(-3000));
}
/** E-mail de aviso/transação (confirmação, vaga liberada, senha…). */
function enqueueTx(user, subject, text, opts = {}) {
  const url = opts.button && opts.button.path ? baseUrl() + opts.button.path : (opts.button && opts.button.url) || baseUrl();
  const m = layout({ title: subject, text, button: { label: (opts.button && opts.button.label) || 'Abrir o site', url }, footer: opts.footer });
  push({ kind: 'tx', userId: user.id || null, to: user.email, name: user.name || '', subject, html: m.html, text: m.text });
}
/** E-mail promocional: sempre com link de descadastro. */
function enqueuePromo(user, subject, text, button, campaignId) {
  const unsub = unsubLink(user.id);
  const m = layout({ title: subject, text, button, footer: `Você recebe este e-mail porque aceitou novidades do Spinning Fany. <a href="${esc(unsub)}" style="color:#f5c518">Não quero mais receber</a>.` });
  push({ kind: 'promo', userId: user.id, to: user.email, name: user.name || '', subject, html: m.html, text: m.text + `\n\nPara parar de receber: ${unsub}`, campaignId, unsub });
}

async function sendNow(m) {
  const from = fromAddr(), prov = provider(); const headers = m.unsub ? { 'List-Unsubscribe': `<${m.unsub}>` } : undefined;
  let url, init;
  if (prov === 'brevo') {
    url = process.env.EMAIL_API_URL || 'https://api.brevo.com/v3/smtp/email';
    init = { method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ sender: { name: from.name, email: from.email }, to: [{ email: m.to, name: m.name || undefined }], subject: m.subject, htmlContent: m.html, textContent: m.text, headers }) };
  } else {
    url = process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
    init = { method: 'POST', headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers }) };
  }
  try {
    const r = await fetch(url, Object.assign(init, { signal: AbortSignal.timeout(15000) }));
    if (r.ok) return { ok: true };
    const t = (await r.text()).slice(0, 200); return { ok: false, retry: r.status >= 500 || r.status === 429, err: `${r.status} ${t}` };
  } catch (e) { return { ok: false, retry: true, err: e.message }; }
}

let running = false;
/** Envia 1 e-mail por vez (respeita o limite diário e não manda promoção de madrugada). */
async function tick() {
  if (running || !enabled() || !core.db) return; running = true;
  try {
    const db = core.db; db.mailStats = db.mailStats || { day: today(), n: 0 };
    if (db.mailStats.day !== today()) db.mailStats = { day: today(), n: 0 };
    if (db.mailStats.n >= dailyLimit()) return;
    const now = Date.now(), h = brtHour(), night = process.env.EMAIL_PROMO_ANYTIME === '1' ? false : (h < 8 || h >= 21);
    const m = (db.outbox || []).filter(x => x.status === 'pending' && x.due <= now && (x.kind === 'tx' || !night)).sort((a, b) => (a.kind === 'tx' ? 0 : 1) - (b.kind === 'tx' ? 0 : 1) || a.due - b.due)[0];
    if (!m) return;
    const r = await sendNow(m); m.tries++;
    if (r.ok) { m.status = 'sent'; m.sentAt = new Date().toISOString(); db.mailStats.n++; const c = m.campaignId && (db.campaigns || []).find(x => x.id === m.campaignId); if (c) c.sent++; m.html = m.text = ''; }
    else if (r.retry && m.tries < 4) m.due = Date.now() + Math.pow(2, m.tries) * 60e3;
    else { m.status = 'failed'; m.err = r.err; m.html = m.text = ''; const c = m.campaignId && (db.campaigns || []).find(x => x.id === m.campaignId); if (c) c.failed++; console.error('[e-mail] falhou:', m.to, r.err); }
    core.hooks.save();
  } catch (e) { console.error('[e-mail] erro', e.message); } finally { running = false; }
}
const stats = () => { const db = core.db, o = db.outbox || [], t = today(); return { enabled: enabled(), provider: provider(), from: fromAddr().email, pending: o.filter(m => m.status === 'pending').length, sentToday: db.mailStats && db.mailStats.day === t ? db.mailStats.n : 0, failed: o.filter(m => m.status === 'failed').length, limit: dailyLimit() }; };
module.exports = { enabled, provider, enqueueTx, enqueuePromo, tick, stats, layout, push, unsubLink, baseUrl };
