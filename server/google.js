'use strict';
/** Confere o "Entrar com Google" no servidor (assinatura RS256 do token + destinatário + validade). */
const crypto = require('crypto');
let cache = { at: 0, keys: [] };
async function keys() {
  if (Date.now() - cache.at < 36e5 && cache.keys.length) return cache.keys;
  const r = await fetch(process.env.GOOGLE_CERTS_URL || 'https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('Não consegui falar com o Google agora.');
  cache = { at: Date.now(), keys: (await r.json()).keys || [] }; return cache.keys;
}
async function verifyIdToken(idToken, clientId) {
  const parts = String(idToken || '').split('.'); if (parts.length !== 3) throw new Error('Login do Google inválido');
  let head, pay; try { head = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); pay = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch (e) { throw new Error('Login do Google inválido'); }
  if (head.alg !== 'RS256') throw new Error('Login do Google inválido');
  const jwk = (await keys()).find(k => k.kid === head.kid); if (!jwk) throw new Error('Login do Google inválido (chave desconhecida)');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('Login do Google inválido (assinatura)');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(pay.iss)) throw new Error('Login do Google inválido (emissor)');
  if (!clientId || pay.aud !== clientId) throw new Error('Login do Google inválido (destinatário)');
  if (!pay.exp || pay.exp * 1000 < Date.now()) throw new Error('O login do Google expirou. Tente de novo.');
  if (pay.email_verified !== true && pay.email_verified !== 'true') throw new Error('O e-mail dessa conta Google não está verificado.');
  return { sub: String(pay.sub), email: String(pay.email || '').toLowerCase(), name: String(pay.name || '') };
}
module.exports = { verifyIdToken };
