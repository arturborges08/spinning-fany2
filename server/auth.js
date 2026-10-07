'use strict';
const crypto = require('crypto');
const SESSION_DAYS = 30;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [v, s, h] = stored.split('$'); if (v !== 's1' || !s || !h) return false;
  const calc = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(h, 'hex');
  return want.length === calc.length && crypto.timingSafeEqual(want, calc);
}
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function newSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.sessions = (db.sessions || []).filter(s => s.exp > now);
  db.sessions.push({ h: sha(token), userId, exp: now + SESSION_DAYS * 864e5 });
  return token;
}
function sessionUser(db, token) {
  if (!token) return null;
  const h = sha(token), s = (db.sessions || []).find(x => x.h === h && x.exp > Date.now());
  return s ? (db.users.find(u => u.id === s.userId) || null) : null;
}
function endSession(db, token) { if (token) { const h = sha(token); db.sessions = (db.sessions || []).filter(s => s.h !== h); } }
function endAllSessions(db, userId) { db.sessions = (db.sessions || []).filter(s => s.userId !== userId); }
function parseCookies(req) {
  const out = {}; for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function cookieHeader(token, secure, clear) {
  return `sid=${clear ? '' : token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}
/** Limite de tentativas (login/cadastro) em memória. */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), e = hits.get(key);
  if (!e || e.reset < now) { hits.set(key, { n: 0, reset: now + windowMs }); return false; }
  return e.n >= max;
}
function hit(key, windowMs) { const now = Date.now(), e = hits.get(key); if (!e || e.reset < now) hits.set(key, { n: 1, reset: now + windowMs }); else e.n++; }
function clearHits(key) { hits.delete(key); }
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 600000).unref();
/** Link de uso único (confirmar e-mail, redefinir senha). Só o hash fica guardado. */
function makeToken(db, userId, type, hours) {
  const t = crypto.randomBytes(32).toString('hex'), now = Date.now();
  db.tokens = (db.tokens || []).filter(x => x.exp > now); db.tokens.push({ h: sha(t), userId, type, exp: now + hours * 36e5 }); return t;
}
function takeToken(db, t, type) {
  const h = sha(String(t || '')), x = (db.tokens || []).find(y => y.h === h && y.type === type && y.exp > Date.now());
  if (x) db.tokens = db.tokens.filter(y => y !== x); return x || null;
}
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
module.exports = { makeToken, takeToken, hashPassword, verifyPassword, newSession, sessionUser, endSession, endAllSessions, parseCookies, cookieHeader, limited, hit, clearHits, validEmail };
