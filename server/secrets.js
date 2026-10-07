'use strict';
const crypto = require('crypto'), core = require('./core');
function secret() {
  const s = core.db.settings;
  if (!s.tokenSecret) { s.tokenSecret = crypto.randomBytes(32).toString('hex'); core.hooks.save(); }
  return s.tokenSecret;
}
const sign = msg => crypto.createHmac('sha256', secret()).update(String(msg)).digest('hex').slice(0, 40);
const check = (msg, sig) => { const a = Buffer.from(sign(msg)), b = Buffer.from(String(sig || '')); return a.length === b.length && crypto.timingSafeEqual(a, b); };
/** Pacote assinado e com validade (usado no login com Google para completar o cadastro). */
function pack(obj, minutes) { const p = Buffer.from(JSON.stringify({ ...obj, exp: Date.now() + minutes * 60e3 })).toString('base64url'); return p + '.' + sign(p); }
function unpack(tok) { const [p, sig] = String(tok || '').split('.'); if (!p || !check(p, sig)) return null; try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch (e) { return null; } }
module.exports = { sign, check, pack, unpack };
