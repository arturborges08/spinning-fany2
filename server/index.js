'use strict';
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';          // horários das aulas sempre em Brasília
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const core = require('./core'), store = require('./store'), auth = require('./auth'), pay = require('./payments');
const { A, sendVerify } = require('./actions'), { stateFor } = require('./views');
const mailer = require('./mailer'), secrets = require('./secrets'), google = require('./google');

/* ── banco ── */
let lastJson = '';
function persist() { lastJson = JSON.stringify(core.db); store.save(core.db); }
function migrate(db) {
  db.sessions = db.sessions || []; db.specials = db.specials || [core.defaultSpecial()]; db.audit = db.audit || []; db.notes = db.notes || [];
  db.settings = Object.assign({ gifts: true, infinitepayHandle: '' }, db.settings);
  for (const p of db.packages) if (p.highlight === undefined) p.highlight = p.sort === 3 || p.kind === 'subscription';
  for (const u of db.users) if (!u.role) u.role = 'client';
  db.tokens = db.tokens || []; db.outbox = db.outbox || []; db.campaigns = db.campaigns || [];
  for (const u of db.users) { if (u.emailVerified === undefined) u.emailVerified = u.role !== 'client' || !u.pw; if (u.notifyEmail === undefined) u.notifyEmail = true; }
  // v5: layouts da sala, temas editáveis e grade (forma) guardada em cada aula
  if (!db.themes || !db.themes.length) db.themes = core.defaultThemes();
  for (const t of core.defaultThemes()) if (!db.themes.some(x => x.id === t.id)) db.themes.push(t);
  if (!db.layouts || !db.layouts.length) {
    db.layouts = [{ id: 'lay-323', name: 'Sala 3-2-3', rows: ['XXX', 'XX', 'XXX'] }, { id: 'lay-antigo', name: 'Sala 2+2 (antiga)', rows: core.autoGrid(db.settings.maxBikes || 8) }];
    db.settings.layoutId = 'lay-323';
    const old = db.layouts[1], now = new Date();
    for (const c of db.classes) {
      if (Array.isArray(c.grid)) continue;
      const same = c.maxBikes === 8 && !c.event && c.active && new Date(c.start) > now;       // aulas futuras de 8 bikes passam para o layout 3-2-3 (as reservas mantêm o número da bike)
      if (same) { c.grid = ['XXX', 'XX', 'XXX']; c.layoutId = 'lay-323'; } else { c.grid = core.autoGrid(c.maxBikes); c.layoutId = c.event ? null : (c.maxBikes === (db.settings.maxBikes || 8) ? old.id : null); }
    }
    db.settings.maxBikes = 8;
  }
  for (const t of db.specials) { if (t.layoutId === undefined) t.layoutId = null; if (!db.themes.some(x => x.id === t.theme)) t.theme = 'gold'; }
  for (const c of db.classes) { if (!Array.isArray(c.grid)) c.grid = core.autoGrid(c.maxBikes); if (c.event && !db.themes.some(x => x.id === c.event.theme)) c.event.theme = 'gold'; }
  db.schema = 5; return db;
}
function ensureOwner() {
  const db = core.db, email = (process.env.OWNER_EMAIL || '').trim().toLowerCase(), pw = process.env.OWNER_PASSWORD || '';
  const owner = db.users.find(u => u.role === 'owner'), force = process.env.OWNER_FORCE_RESET === '1';
  if (!owner) {
    if (!auth.validEmail(email) || pw.length < 8) { console.error('\n[ATENÇÃO] Ninguém consegue entrar como dona. Defina as variáveis OWNER_EMAIL e OWNER_PASSWORD (mínimo 8 caracteres) e reinicie.\n'); return; }
    const ex = db.users.find(u => u.email === email);
    if (ex) { ex.role = 'owner'; ex.pw = auth.hashPassword(pw); } else db.users.push({ id: core.uid(), name: process.env.OWNER_NAME || 'Fany', email, phone: '', role: 'owner', pw: auth.hashPassword(pw), credits: 0, blocked: false, createdAt: new Date().toISOString(), termsAt: new Date().toISOString() });
    console.log('[ok] Conta da dona criada:', email); persist();
  } else if (force && pw.length >= 8) {
    owner.pw = auth.hashPassword(pw); if (auth.validEmail(email)) owner.email = email; auth.endAllSessions(db, owner.id); console.log('[ok] Senha da dona redefinida pelas variáveis de ambiente.'); persist();
  }
}
const loaded = store.load();
core.setDb(migrate(loaded || core.freshDb()));
core.hooks.save = persist;
if (process.env.OFFER_TEST_MS) core.hooks.offerMs = () => Number(process.env.OFFER_TEST_MS);
/** Todo aviso do sistema também vira e-mail (se o envio estiver ligado e a aluna confirmou o e-mail). */
core.hooks.notify = (userId, title, body, opts) => {
  const u = core.usr(userId); if (!u || !u.email || u.emailVerified === false || !mailer.enabled()) return;
  if (u.notifyEmail === false && !opts.important) return;
  mailer.enqueueTx(u, title, body, { button: opts.button });
};
ensureOwner(); core.expireHolds(); core.expireCredits(); persist();
setInterval(() => { try { core.expireHolds(); if (core.expireOffers()) persist(); } catch (e) { console.error(e); } }, 20e3).unref();
setInterval(() => { mailer.tick(); }, Number(process.env.EMAIL_TICK_MS) || 1500).unref();
setInterval(() => { try { core.expireCredits(); persist(); } catch (e) { console.error(e); } }, 6 * 36e5).unref();

/* ── arquivos estáticos (em memória, com gzip) ── */
const PUB = path.join(__dirname, '..', 'public');
const TYPES = { '.webmanifest': 'application/manifest+json', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const files = new Map();
for (const f of fs.readdirSync(PUB)) { const buf = fs.readFileSync(path.join(PUB, f)), t = TYPES[path.extname(f)] || 'application/octet-stream'; files.set('/' + f, { buf, gz: /^(text|application)/.test(t) ? zlib.gzipSync(buf) : null, type: t }); }
files.set('/', files.get('/index.html'));

const G = !!process.env.GOOGLE_CLIENT_ID;
const CSP = `default-src 'self'; script-src 'self'${G ? ' https://accounts.google.com/gsi/client' : ''}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${G ? ' https://accounts.google.com/gsi/style' : ''}; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'${G ? ' https://accounts.google.com/gsi/' : ''}; frame-src ${G ? 'https://accounts.google.com/gsi/' : "'none'"}; form-action 'self'; frame-ancestors 'none'; base-uri 'self'`;
function headers(extra) { return Object.assign({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': CSP, 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' }, extra || {}); }
const json = (res, code, obj, extra) => { const b = JSON.stringify(obj); res.writeHead(code, headers(Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra))); res.end(b); };
// atrás do proxy da hospedagem, o ÚLTIMO endereço é o que o proxy confirmou (o primeiro pode ser inventado por quem faz o pedido)
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').map(x => x.trim()).filter(Boolean).pop() || '';
const isHttps = req => req.headers['x-forwarded-proto'] === 'https' || /^https:/.test(process.env.PUBLIC_URL || '');
function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return (isHttps(req) ? 'https' : 'http') + '://' + (/^[a-z0-9.-]+(:\d+)?$/i.test(host) ? host : 'localhost');
}
function readBody(req, max = 200000) {
  return new Promise((resolve, reject) => { let n = 0; const chunks = []; req.on('data', c => { n += c.length; if (n > max) { reject(Object.assign(new Error('Pedido grande demais'), { status: 413 })); req.destroy(); } else chunks.push(c); }); req.on('end', () => { try { const t = Buffer.concat(chunks).toString('utf8'); resolve(t ? JSON.parse(t) : {}); } catch (e) { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); } }); req.on('error', reject); });
}
const srv = { handle: pay.handle, publicUrl: () => process.env.PUBLIC_URL || '', mail: mailer };
const roleOf = u => (u.role === 'owner' ? 'owner' : u.role === 'admin' ? 'admin' : 'student');
const isInternal = e => e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError || e instanceof SyntaxError;

async function handle(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  const cookies = auth.parseCookies(req), token = cookies.sid;
  core.expireHolds(); if (core.expireOffers()) persist();
  const user = auth.sessionUser(core.db, token);
  const ip = clientIp(req);

  if (req.method === 'GET' && p === '/healthz') return json(res, 200, { ok: true });
  if (req.method === 'GET' && files.has(p)) {
    const f = files.get(p), gz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, headers({ 'Content-Type': f.type, 'Cache-Control': 'no-cache', 'Vary': 'Accept-Encoding', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) })); return res.end(gz ? f.gz : f.buf);
  }
  /* link do e-mail: confirmar o endereço */
  if (req.method === 'GET' && p === '/api/verify') {
    const t = auth.takeToken(core.db, url.searchParams.get('t'), 'verify'); let to = '/#/entrar?ok=erro';
    const u = t && core.usr(t.userId); if (u) { u.emailVerified = true; persist(); to = '/#/entrar?ok=verificado'; }
    res.writeHead(302, headers({ Location: to })); return res.end();
  }
  /* link do e-mail promocional: não quero mais receber */
  if (req.method === 'GET' && p === '/api/unsub') {
    const uid_ = url.searchParams.get('u') || '', u = secrets.check('unsub|' + uid_, url.searchParams.get('t')) && core.usr(uid_);
    if (u) { u.mktOptIn = false; persist(); }
    res.writeHead(u ? 200 : 400, headers({ 'Content-Type': 'text/html; charset=utf-8' }));
    return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spinning Fany</title><body style="margin:0;background:#070707;color:#f4f4f1;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div><h1 style="color:#f5c518">🚴 Spinning Fany</h1><p style="font-size:18px">${u ? 'Pronto! Você não vai mais receber nossas promoções.' : 'Link inválido.'}</p><p style="color:#a09f98">${u ? 'Os avisos importantes da sua conta (vagas, pagamentos) continuam chegando.' : ''}</p><p><a style="color:#f5c518" href="/">Voltar ao site</a></p></div>`);
  }
  /* página para onde a InfinitePay devolve a cliente depois de pagar */
  if (req.method === 'GET' && p === '/pago') {
    const q = url.searchParams, order = q.get('order_nsu') || '';
    if (order && !auth.limited('pago|' + ip, 40, 60e3)) {
      auth.hit('pago|' + ip, 60e3);
      try { await pay.confirm({ orderNsu: order, transactionNsu: q.get('transaction_nsu'), slug: q.get('slug') }); persist(); } catch (e) { if (e.code !== 'NOT_FOUND') console.log('[pago]', e.message); }
    }
    res.writeHead(302, headers({ Location: '/#/pago?o=' + encodeURIComponent(order) })); return res.end();
  }
  if (!p.startsWith('/api/')) { res.writeHead(404, headers({ 'Content-Type': 'text/plain; charset=utf-8' })); return res.end('Página não encontrada'); }

  /* ── webhook da InfinitePay (sem login; protegido por segredo + conferência na InfinitePay) ── */
  if (req.method === 'POST' && p === '/api/webhooks/infinitepay') {
    if (!pay.safeEq(url.searchParams.get('k') || '', pay.webhookSecret())) return json(res, 401, { success: false, message: 'não autorizado' });
    if (auth.limited('wh|' + ip, 300, 60e3)) return json(res, 429, { success: false, message: 'muitas chamadas' });
    auth.hit('wh|' + ip, 60e3);
    let b; try { b = await readBody(req); } catch (e) { return json(res, 400, { success: false, message: e.message }); }
    try { const r = await pay.confirm({ orderNsu: String(b.order_nsu || ''), transactionNsu: String(b.transaction_nsu || ''), slug: String(b.invoice_slug || b.slug || '') }); persist(); return json(res, 200, { success: true, message: null, status: r.status }); }
    catch (e) { console.log('[webhook]', e.message); return json(res, 400, { success: false, message: e.message }); }
  }

  /* ── tudo abaixo: origem confiável para POST ── */
  if (req.method === 'POST') {
    const o = req.headers.origin; if (o) { try { if (new URL(o).host !== (req.headers['x-forwarded-host'] || req.headers.host)) return json(res, 403, { error: 'Origem não permitida' }); } catch (e) { return json(res, 403, { error: 'Origem inválida' }); } }
  }
  const state = u => stateFor(u, srv);

  if (req.method === 'GET' && p === '/api/state') return json(res, 200, state(user));
  if (req.method === 'GET' && p === '/api/backup') {
    if (!user || user.role !== 'owner') return json(res, 403, { error: 'Só a dona pode baixar a cópia.' });
    const copy = Object.assign({}, core.db, { sessions: [] });
    res.writeHead(200, headers({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="spinning-fany-copia-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' })); return res.end(JSON.stringify(copy));
  }
  const om = p.match(/^\/api\/order\/([A-Za-z0-9]+)$/);
  if (req.method === 'GET' && om) {
    if (!user) return json(res, 401, { error: 'Entre na sua conta' });
    const pu = core.db.purchases.find(x => x.id === om[1]); if (!pu || (pu.userId !== user.id && user.role === 'client')) return json(res, 404, { error: 'Pedido não encontrado' });
    return json(res, 200, { status: pu.status, kind: pu.kind || 'package', needsAction: !!pu.needsAction, expired: !!pu.expired, state: state(user) });
  }
  if (req.method !== 'POST') return json(res, 404, { error: 'Não encontrado' });

  let body; try { body = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: e.message }); }

  const login = (u, extraState) => { const t = auth.newSession(core.db, u.id); persist(); return json(res, 200, Object.assign(state(u), extraState || {}), { 'Set-Cookie': auth.cookieHeader(t, isHttps(req)) }); };
  const checkProfile = (db, body) => {
    const phone = core.normPhone(body.phone), cpf = core.digits(body.cpf);
    if (!core.validPhone(phone)) throw new Error('WhatsApp inválido. Use DDD + número, ex: (18) 99667-6637');
    if (!core.isValidCpf(cpf)) throw new Error('CPF inválido. Confira os números.');
    if (body.acceptTerms !== true) throw new Error('Aceite o termo de responsabilidade para criar a conta');
    if (db.users.some(u => u.phone === phone)) throw new Error('Esse WhatsApp já tem cadastro. Se você já é aluna, entre; se foi cadastrada pelo estúdio ou esqueceu a senha, fale com a Fany.');
    if (db.users.some(u => u.cpf === cpf)) throw new Error('Esse CPF já tem cadastro. Entre na sua conta (ou use “Esqueci a senha”).');
    return { phone, cpf };
  };
  if (p === '/api/signup') {
    if (auth.limited('su|' + ip, 8, 36e5)) return json(res, 429, { error: 'Muitos cadastros por aqui. Tente mais tarde.' }); auth.hit('su|' + ip, 36e5);
    try {
      const db = core.db, email = String(body.email || '').trim().toLowerCase(), name = core.clean(body.name, 120);
      if (name.length < 2) throw new Error('Informe seu nome'); if (!auth.validEmail(email)) throw new Error('E-mail inválido');
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw new Error('A senha precisa ter de 8 a 128 caracteres');
      if (db.users.some(u => u.email === email)) throw new Error('Esse e-mail já tem cadastro. Entre na sua conta.');
      const { phone, cpf } = checkProfile(db, body);
      const u = { id: core.uid(), name, email, phone, cpf, role: 'client', pw: auth.hashPassword(body.password), emailVerified: !mailer.enabled(), mktOptIn: body.mktOptIn === true, notifyEmail: true, credits: 0, blocked: false, createdAt: new Date().toISOString(), termsAt: new Date().toISOString() };
      db.users.push(u); if (mailer.enabled()) { u.verifySentAt = Date.now(); sendVerify(u); }
      return login(u);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/login') {
    const ident = String(body.email || '').trim().toLowerCase(), key = 'lg|' + ip + '|' + ident, kip = 'lgip|' + ip;
    if (auth.limited(key, 8, 15 * 60e3) || auth.limited(kip, 40, 15 * 60e3)) return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' });
    const cpf = ident.includes('@') ? '' : core.digits(ident);
    const u = core.db.users.find(x => (ident.includes('@') ? x.email === ident : (cpf.length === 11 && x.cpf === cpf)));
    if (!u || !auth.verifyPassword(String(body.password || ''), u.pw)) { auth.hit(key, 15 * 60e3); auth.hit(kip, 15 * 60e3); return json(res, 400, { error: 'E-mail/CPF ou senha incorretos' }); }
    auth.clearHits(key); return login(u);
  }
  /* esqueci a senha: manda um link por e-mail (a resposta é sempre a mesma, para não revelar quem tem conta) */
  if (p === '/api/forgot') {
    const email = String(body.email || '').trim().toLowerCase(), key = 'fg|' + ip + '|' + email;
    if (!mailer.enabled()) return json(res, 400, { error: 'A recuperação por e-mail ainda não está ativa. Chame a Fany no WhatsApp para criar uma senha nova.' });
    if (auth.limited(key, 4, 36e5)) return json(res, 429, { error: 'Muitos pedidos. Tente mais tarde.' }); auth.hit(key, 36e5);
    const u = core.db.users.find(x => x.email === email);
    if (u) { const t = auth.makeToken(core.db, u.id, 'reset', 2); mailer.enqueueTx(u, 'Criar uma senha nova', `Oi ${String(u.name).split(' ')[0]}! Recebemos o pedido para trocar sua senha. O link vale por 2 horas.`, { button: { label: 'Criar senha nova', url: `${mailer.baseUrl()}/#/redefinir?t=${t}` }, footer: 'Se não foi você, ignore este e-mail: sua senha continua a mesma.' }); persist(); }
    return json(res, 200, { ok: true });
  }
  if (p === '/api/reset') {
    if (auth.limited('rs|' + ip, 20, 36e5)) return json(res, 429, { error: 'Muitas tentativas.' }); auth.hit('rs|' + ip, 36e5);
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return json(res, 400, { error: 'A senha precisa ter de 8 a 128 caracteres' });
    const t = auth.takeToken(core.db, body.token, 'reset'), u = t && core.usr(t.userId); if (!u) return json(res, 400, { error: 'Link inválido ou vencido. Peça um novo em “Esqueci a senha”.' });
    u.pw = auth.hashPassword(body.password); u.emailVerified = true; auth.endAllSessions(core.db, u.id); persist(); return json(res, 200, { ok: true });
  }
  /* entrar com Google (só aparece se GOOGLE_CLIENT_ID estiver configurado) */
  if (p === '/api/google') {
    const cid = process.env.GOOGLE_CLIENT_ID; if (!cid) return json(res, 404, { error: 'Login com Google não está ativo.' });
    if (auth.limited('gg|' + ip, 30, 15 * 60e3)) return json(res, 429, { error: 'Muitas tentativas.' }); auth.hit('gg|' + ip, 15 * 60e3);
    try {
      const g = await google.verifyIdToken(body.credential, cid), db = core.db;
      const u = db.users.find(x => x.googleSub === g.sub) || db.users.find(x => x.email === g.email);
      if (u) { if (!u.googleSub) u.googleSub = g.sub; u.emailVerified = true; return login(u); }
      return json(res, 200, { needsProfile: true, pending: secrets.pack({ sub: g.sub, email: g.email, name: g.name }, 15), name: g.name, email: g.email });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/google/complete') {
    const d = secrets.unpack(body.pending); if (!d) return json(res, 400, { error: 'A sessão expirou. Entre com o Google de novo.' });
    try {
      const db = core.db; if (db.users.some(u => u.email === d.email)) throw new Error('Esse e-mail já tem cadastro. Entre com o Google de novo.');
      const { phone, cpf } = checkProfile(db, body);
      const u = { id: core.uid(), name: core.clean(d.name, 120) || d.email, email: d.email, phone, cpf, role: 'client', pw: '', googleSub: d.sub, emailVerified: true, mktOptIn: body.mktOptIn === true, notifyEmail: true, credits: 0, blocked: false, createdAt: new Date().toISOString(), termsAt: new Date().toISOString() };
      db.users.push(u); return login(u);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/logout') { auth.endSession(core.db, token); persist(); return json(res, 200, state(null), { 'Set-Cookie': auth.cookieHeader('', isHttps(req), true) }); }

  const am = p.match(/^\/api\/act\/([A-Za-z]+)$/);
  if (am) {
    const a = A[am[1]]; if (!a) return json(res, 404, { error: 'Ação desconhecida' });
    if (!user) return json(res, 401, { error: 'Entre na sua conta para continuar.' });
    const role = roleOf(user);
    if ((a.lvl === 'admin' && role === 'student') || (a.lvl === 'owner' && role !== 'owner')) return json(res, 403, { error: 'Você não tem permissão para isso.' });
    const ctx = { user, role, base: baseUrl(req), newSession: false }, isAsync = a.fn.constructor.name === 'AsyncFunction';
    try {
      const out = (await a.fn(ctx, body)) || {}; persist();
      const extra = {}; if (ctx.newSession) extra['Set-Cookie'] = auth.cookieHeader(auth.newSession(core.db, user.id), isHttps(req)), persist();
      return json(res, 200, Object.assign({ ok: true }, out, { state: state(user) }), extra);
    } catch (e) {
      if (!isAsync && lastJson) core.setDb(JSON.parse(lastJson));      // ação síncrona que falhou: volta ao último estado salvo (nada fica pela metade)
      if (isInternal(e)) { console.error('[erro interno]', am[1], e); return json(res, 500, { error: 'Erro interno. Tente de novo.' }); }
      return json(res, 400, { error: e.message || 'Algo deu errado', state: state(core.db.users.find(x => x.id === user.id) || null) });
    }
  }
  return json(res, 404, { error: 'Não encontrado' });
}

const server = http.createServer((req, res) => { handle(req, res).catch(e => { console.error('[erro]', e); if (!res.headersSent) json(res, 500, { error: 'Erro interno' }); else res.end(); }); });
const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`Spinning Fany no ar na porta ${PORT} · dados em ${store.DIR}`));
  const bye = () => { try { persist(); } catch (e) { /* ok */ } process.exit(0); };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
}
module.exports = { server, persist, core };
