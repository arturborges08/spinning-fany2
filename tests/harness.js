// Sobe o servidor de verdade + InfinitePay, e-mail e Google "de mentira" para os testes
const http = require('http'), crypto = require('crypto'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
async function start({ port = 4520, mock = 4521, email = false, google = false, offerMs = 0, dailyLimit = 0, env = {} } = {}) {
  const orders = {}, emails = [], DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fany-'));
  const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), jwk = { ...kp.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const mockSrv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const j = b ? JSON.parse(b) : {}; res.setHeader('content-type', 'application/json');
      if (req.url === '/links') { if (j.handle !== 'minhatag') { res.statusCode = 400; return res.end('{}'); } orders[j.order_nsu] = { amount: j.items.reduce((a, i) => a + i.price * i.quantity, 0), paid: false, redirect: j.redirect_url, webhook: j.webhook_url, slug: 'slug-' + j.order_nsu, tx: 'tx-' + j.order_nsu, items: j.items }; return res.end(JSON.stringify({ url: `http://localhost:${mock}/checkout/${j.order_nsu}` })); }
      if (req.url === '/payment_check') { const o = orders[j.order_nsu]; if (!o || j.transaction_nsu !== o.tx || j.slug !== o.slug) return res.end('{"success":false,"paid":false}'); return res.end(JSON.stringify({ success: true, paid: o.paid, amount: o.amount, paid_amount: o.amount, installments: 1, capture_method: 'pix' })); }
      if (req.url === '/email') { if (req.headers['api-key'] !== 'test-key') { res.statusCode = 401; return res.end('{}'); } emails.push({ to: j.to[0].email, name: j.to[0].name, subject: j.subject, html: j.htmlContent, text: j.textContent, headers: j.headers, from: j.sender, at: Date.now() }); return res.end('{"messageId":"x"}'); }
      if (req.url === '/certs') return res.end(JSON.stringify({ keys: [jwk] }));
      if (req.url.startsWith('/checkout/')) { res.setHeader('content-type', 'text/html'); return res.end('<h1>Checkout InfinitePay (simulado)</h1>'); }
      res.statusCode = 404; res.end('{}');
    });
  }).listen(mock);
  const base = `http://localhost:${port}`;
  try { await fetch(base + '/healthz', { signal: AbortSignal.timeout(500) }); throw new Error('A porta ' + port + ' já está ocupada por outro servidor (de um teste anterior?). Encerre-o e rode de novo.'); } catch (e) { if (/ocupada/.test(e.message)) throw e; }
  const E = { ...process.env, PORT: port, DATA_DIR: DATA, PUBLIC_URL: base, OWNER_EMAIL: 'dona@fany.com', OWNER_PASSWORD: 'senhaForte123', INFINITEPAY_HANDLE: 'minhatag', INFINITEPAY_API: `http://localhost:${mock}`, ...env };
  if (email) Object.assign(E, { BREVO_API_KEY: 'test-key', EMAIL_FROM: 'Spinning Fany <avisos@fany.test>', EMAIL_API_URL: `http://localhost:${mock}/email`, EMAIL_PROMO_ANYTIME: '1', EMAIL_TICK_MS: '120' });
  if (dailyLimit) E.EMAIL_DAILY_LIMIT = String(dailyLimit);
  if (google) Object.assign(E, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CERTS_URL: `http://localhost:${mock}/certs` });
  if (offerMs) E.OFFER_TEST_MS = String(offerMs);
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], { env: E, stdio: ['ignore', 'pipe', 'pipe'] });
  process.on('exit', () => { try { srv.kill('SIGKILL'); } catch (e) { /* ok */ } });
  let log = ''; const lf = '/tmp/harness-' + port + '.log'; fs.writeFileSync(lf, ''); const add = d => { log += d; try { fs.appendFileSync(lf, d); } catch (e) { /* ok */ } }; srv.stdout.on('data', add); srv.stderr.on('data', add); srv.on('exit', c => add('\n[servidor encerrou com código ' + c + ']\n'));
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/healthz'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
  async function pay(orderId) { const o = orders[orderId]; if (!o) throw new Error('pedido não existe no mock: ' + orderId); o.paid = true; const r = await fetch(o.webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_nsu: orderId, transaction_nsu: o.tx, invoice_slug: o.slug, amount: o.amount, paid_amount: o.amount, capture_method: 'pix' }) }); return r.status; }
  /** espera chegar um e-mail que satisfaça o filtro (o servidor envia 1 por vez, a cada ~1,5 s) */
  async function mail(pred, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = emails.find(pred); if (m) return m; await new Promise(r => setTimeout(r, 200)); } return null; }
  function googleToken(claims = {}, opts = {}) {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: opts.kid || 'k1', typ: 'JWT' })).toString('base64url');
    const pay_ = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'test-client', sub: 'g-123', email: 'maria@gmail.com', email_verified: true, name: 'Maria Google', exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString('base64url');
    const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + pay_), opts.badKey ? crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey : kp.privateKey).toString('base64url');
    return `${head}.${pay_}.${sig}`;
  }
  return { base, orders, emails, DATA, pay, mail, googleToken, log: () => log, stop() { srv.kill('SIGTERM'); mockSrv.close(); } };
}
module.exports = { start };
