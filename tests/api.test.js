// Testa o servidor de ponta a ponta com uma InfinitePay "de mentira"
const http = require('http'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const MOCK = 4511, PORT = 4510, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fany-'));
const orders = {};   // order_nsu -> {paid, amount, slug, tx}
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const j = b ? JSON.parse(b) : {}; res.setHeader('content-type', 'application/json');
    if (req.url === '/links') {
      if (j.handle !== 'minhatag') { res.statusCode = 400; return res.end('{"error":"handle"}'); }
      orders[j.order_nsu] = { amount: j.items.reduce((a, i) => a + i.price * i.quantity, 0), paid: false, redirect: j.redirect_url, webhook: j.webhook_url, slug: 'slug-' + j.order_nsu, tx: 'tx-' + j.order_nsu, items: j.items, customer: j.customer };
      return res.end(JSON.stringify({ url: 'https://checkout.infinitepay.com.br/minhatag?lenc=' + j.order_nsu }));
    }
    if (req.url === '/payment_check') { const o = orders[j.order_nsu]; if (!o || j.transaction_nsu !== o.tx || j.slug !== o.slug) return res.end(JSON.stringify({ success: false, paid: false })); return res.end(JSON.stringify({ success: true, paid: o.paid, amount: o.amount, paid_amount: o.amount + 5, installments: 1, capture_method: 'pix' })); }
    res.statusCode = 404; res.end('{}');
  });
}).listen(MOCK);

const srv = spawn('node', ['server/index.js'], { env: { ...process.env, PORT, DATA_DIR: DATA, PUBLIC_URL: `http://localhost:${PORT}`, OWNER_EMAIL: 'dona@fany.com', OWNER_PASSWORD: 'senhaForte123', INFINITEPAY_HANDLE: '$minhatag', INFINITEPAY_API: `http://localhost:${MOCK}` }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = `http://localhost:${PORT}`;
function client() {
  let cookie = '';
  return async (method, p, body) => {
    const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', cookie, origin: BASE }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ } return { s: r.status, j, r };
  };
}
(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/healthz'); break; } catch (e) { await sleep(100); } }
  const guest = client(), owner = client(), ana = client(), bia = client(), adm = client();
  // visitante
  let r = await guest('GET', '/api/state'); ok(r.s === 200 && r.j.sess === null && r.j.db.users.length === 0 && r.j.db.packages.length === 5, 'visitante vê pacotes e nenhuma conta');
  ok(!JSON.stringify(r.j).includes('webhookSecret') && !JSON.stringify(r.j).includes('infinitepayHandle'), 'visitante não recebe segredos');
  // dona
  r = await owner('POST', '/api/login', { email: 'dona@fany.com', password: 'errada' }); ok(r.s === 400 && /incorretos/.test(r.j.error), 'senha errada recusada');
  r = await owner('POST', '/api/login', { email: 'dona@fany.com', password: 'senhaForte123' }); ok(r.s === 200 && r.j.sess.role === 'owner', 'dona entra com e-mail e senha');
  ok(!JSON.stringify(r.j).includes('"pw"') && !JSON.stringify(r.j).includes('s1$'), 'estado da dona não vaza hash de senha');
  // cadastro de aluna = cliente
  r = await ana('POST', '/api/signup', { name: 'Ana Souza', email: 'ana@x.com', phone: '(18) 99111-0001', password: 'minhasenha1', acceptTerms: true, cpf: '529.982.247-25' }); ok(r.s === 200 && r.j.sess.role === 'student', 'quem cria conta entra como aluna (cliente)');
  r = await bia('POST', '/api/signup', { name: 'Bia Lima', email: 'bia@x.com', phone: '(18) 99111-0002', password: 'minhasenha2', acceptTerms: true, cpf: '111.444.777-35' }); ok(r.s === 200, 'segunda aluna');
  r = await guest('POST', '/api/signup', { name: 'Dup', email: 'ana@x.com', phone: '(18) 99111-0009', password: 'minhasenha1', acceptTerms: true, cpf: '390.533.447-05' }); ok(r.s === 400 && /e-mail/i.test(r.j.error), 'e-mail repetido recusado');
  r = await guest('POST', '/api/signup', { name: 'Dup', email: 'dup@x.com', phone: '(18) 99111-0001', password: 'minhasenha1', acceptTerms: true, cpf: '390.533.447-05' }); ok(r.s === 400 && /WhatsApp/.test(r.j.error), 'WhatsApp repetido recusado');
  r = await guest('POST', '/api/signup', { name: 'Curta', email: 'c@x.com', phone: '(18) 99111-0003', password: '123', acceptTerms: true, cpf: '935.411.347-80' }); ok(r.s === 400, 'senha curta recusada');
  r = await guest('POST', '/api/signup', { name: 'SemTermo', email: 's@x.com', phone: '(18) 99111-0004', password: 'minhasenha1' }); ok(r.s === 400, 'sem aceitar termo recusado');
  // permissões
  r = await ana('POST', '/api/act/adjust', { userId: 'x', amount: 5 }); ok(r.s === 403, 'aluna não usa ações da equipe');
  r = await ana('POST', '/api/act/teamAdd', { email: 'z@z.com', name: 'Zé', password: 'abcdefgh' }); ok(r.s === 403, 'aluna não cria admin');
  r = await guest('POST', '/api/act/reserve', { classId: 'x' }); ok(r.s === 401, 'visitante não reserva');
  // dona cria grade
  r = await owner('POST', '/api/act/series', { title: 'Spinning Noturno', days: [0, 1, 2, 3, 4, 5, 6], hour: 19, minute: 0, weeks: 2, duration: 45, maxBikes: 8 }); ok(r.s === 200 && r.j.state.db.classes.length >= 10, 'dona cria a grade (' + r.j.state.db.classes.length + ' aulas)');
  const cls = r.j.state.db.classes.filter(c => !c.event).sort((a, b) => new Date(a.start) - new Date(b.start));
  ok(cls.every(c => c.maxBikes === 8), 'aulas com 8 bikes');
  // checkout de pacote
  r = await ana('POST', '/api/act/checkout', { packageId: 'p10' }); ok(r.s === 200 && /checkout.infinitepay/.test(r.j.url), 'aluna gera link de pagamento (InfinitePay)');
  const orderId = r.j.orderId, o = orders[orderId];
  ok(o && o.amount === 34900 && o.items[0].description.includes('10 Aulas') && o.redirect === `http://localhost:${PORT}/pago` && /\/api\/webhooks\/infinitepay\?k=/.test(o.webhook) && o.customer.phone_number === '+5518991110001', 'pedido enviado com valor, descrição, redirect, webhook e cliente');
  r = await ana('POST', '/api/act/checkout', { packageId: 'p10' }); ok(r.j.orderId === orderId, 'repetir não cria pedido duplicado');
  let st = (await ana('GET', '/api/state')).j.db; ok(st.users[0].credits === 0 && st.purchases[0].status === 'pending', 'antes de pagar: 0 créditos, pedido pendente');
  // webhook: sem segredo / não pago / pago
  const hook = o.webhook.replace(`http://localhost:${PORT}`, '');
  r = await guest('POST', '/api/webhooks/infinitepay?k=errado', { order_nsu: orderId, transaction_nsu: o.tx, invoice_slug: o.slug }); ok(r.s === 401, 'webhook sem segredo correto: 401');
  r = await guest('POST', hook, { order_nsu: orderId, transaction_nsu: o.tx, invoice_slug: o.slug }); ok(r.s === 400, 'webhook antes de pagar: 400 (InfinitePay tenta de novo)');
  st = (await ana('GET', '/api/state')).j.db; ok(st.users[0].credits === 0, 'sem crédito antes de pagar');
  o.paid = true;
  r = await guest('POST', hook, { order_nsu: orderId, transaction_nsu: 'tx-falso', invoice_slug: o.slug }); ok(r.s === 400, 'transação falsa recusada');
  r = await guest('POST', hook, { order_nsu: 'naoexiste', transaction_nsu: 'a', invoice_slug: 'b' }); ok(r.s === 400 && /não encontrado/i.test(r.j.message), 'pedido inexistente: 400');
  r = await guest('POST', hook, { order_nsu: orderId, transaction_nsu: o.tx, invoice_slug: o.slug }); ok(r.s === 200 && r.j.success, 'webhook pago: 200');
  st = (await ana('GET', '/api/state')).j.db; ok(st.users[0].credits === 10 && st.purchases[0].status === 'paid', 'CRÉDITO CAIU SOZINHO: 10 créditos');
  r = await guest('POST', hook, { order_nsu: orderId, transaction_nsu: o.tx, invoice_slug: o.slug }); st = (await ana('GET', '/api/state')).j.db; ok(r.s === 200 && st.users[0].credits === 10, 'webhook repetido não credita de novo');
  // valor diferente
  r = await ana('POST', '/api/act/checkout', { packageId: 'p5' }); const o2 = orders[r.j.orderId]; o2.paid = true; o2.amount = 100;
  r = await guest('POST', o2.webhook.replace(`http://localhost:${PORT}`, ''), { order_nsu: r.j.orderId, transaction_nsu: o2.tx, invoice_slug: o2.slug }); st = (await ana('GET', '/api/state')).j.db; ok(r.s === 400 && st.users[0].credits === 10, 'valor diferente do pedido: recusado, sem crédito');
  // retorno /pago
  r = await ana('POST', '/api/act/checkout', { packageId: 'p1' }); const oid3 = r.j.orderId, o3 = orders[oid3]; o3.paid = true;
  r = await fetch(`${BASE}/pago?order_nsu=${oid3}&transaction_nsu=${o3.tx}&slug=${o3.slug}&capture_method=pix`, { redirect: 'manual' }); st = (await ana('GET', '/api/state')).j.db;
  ok(r.status === 302 && r.headers.get('location').includes('#/pago?o=' + oid3) && st.users[0].credits === 11, 'retorno /pago confirma sozinho e redireciona (+1 crédito)');
  r = await ana('GET', '/api/order/' + oid3); ok(r.j.status === 'paid', 'consulta de pedido: paid');
  r = await bia('GET', '/api/order/' + oid3); ok(r.s === 404, 'outra aluna não vê pedido alheio');
  // reserva
  const c1 = cls[2];
  r = await ana('POST', '/api/act/reserve', { classId: c1.id, bike: 3 }); ok(r.s === 200 && r.j.bike === 3, 'reserva a bike 3');
  st = r.j.state.db; ok(st.users[0].credits === 10, 'gastou 1 crédito');
  r = await bia('POST', '/api/act/reserve', { classId: c1.id, bike: 3 }); ok(r.s === 400 && /já está reservada/.test(r.j.error), 'bike ocupada: recusa');
  r = await bia('GET', '/api/state'); const rs = r.j.db.reservations.filter(x => x.classId === c1.id);
  ok(rs.length === 1 && rs[0].bike === 3 && rs[0].userId === '' , 'outra aluna vê a bike ocupada, mas sem nome');
  ok(!JSON.stringify(r.j).includes('Ana Souza') && !JSON.stringify(r.j).includes('ana@x.com') && !JSON.stringify(r.j).includes('99111-0001') && !JSON.stringify(r.j).includes('5518991110001'), 'aluna não recebe dados de outras alunas');
  r = await bia('POST', '/api/act/reserve', { classId: c1.id, bike: 4 }); ok(r.s === 400 && /créditos/.test(r.j.error), 'sem crédito: recusa');
  r = await ana('POST', '/api/act/cancel', { id: (await ana('GET', '/api/state')).j.db.reservations.find(x => x.classId === c1.id).id }); ok(r.s === 200 && r.j.state.db.users[0].credits === 11, 'cancelar devolve o crédito');
  // doação
  r = await ana('POST', '/api/act/gift', { phone: '(18) 99111-0002', amount: 2, msg: 'Bora!' }); st = r.j.state.db; ok(r.s === 200 && st.users[0].credits === 9, 'doação de créditos');
  r = await bia('GET', '/api/state'); ok(r.j.db.users[0].credits === 2 && r.j.db.notes.some(n => /presente/i.test(n.title)), 'destinatária recebeu +2 e o aviso');
  // aula especial (Havaí)
  r = await owner('POST', '/api/act/specSchedule', { id: 'sp-havai', start: new Date(Date.now() + 3 * 864e5).toISOString() }); const ev = r.j.state.db.classes.find(c => c.event); ok(r.s === 200 && ev && ev.duration === 90 && ev.event.price === 3500, 'dona agenda a Aula Temática Havai (R$ 35, 90 min)');
  r = await bia('POST', '/api/act/checkoutEvent', { classId: ev.id, bike: 5 }); const oe = orders[r.j.orderId]; ok(r.s === 200 && oe.amount === 3500, 'aluna compra a aula avulsa: pedido de R$ 35');
  st = r.j.state.db; ok(st.reservations.find(x => x.classId === ev.id && x.bike === 5 && x.holdUntil) && st.users[0].credits === 2, 'bike segurada e créditos intactos');
  oe.paid = true; await guest('POST', oe.webhook.replace(`http://localhost:${PORT}`, ''), { order_nsu: r.j.orderId, transaction_nsu: oe.tx, invoice_slug: oe.slug });
  st = (await bia('GET', '/api/state')).j.db; ok(st.reservations.find(x => x.classId === ev.id && x.bike === 5 && !x.holdUntil && x.status === 'confirmed') && st.users[0].credits === 2, 'pagou: vaga definitiva, sem mexer em crédito');
  r = await bia('POST', '/api/act/cancel', { id: st.reservations.find(x => x.classId === ev.id).id }); ok(r.s === 400 && /fale com a Fany/.test(r.j.error), 'aluna não cancela vaga paga sozinha');
  // aula avulsa: aluna desiste, mas paga depois pelo link antigo → a vaga é recolocada
  r = await ana('POST', '/api/act/checkoutEvent', { classId: ev.id, bike: 6 }); const oe2 = orders[r.j.orderId], oid_e2 = r.j.orderId;
  const resId = r.j.state.db.reservations.find(x => x.pay === oid_e2).id;
  r = await ana('POST', '/api/act/cancel', { id: resId }); ok(r.s === 200, 'aluna desiste da vaga enquanto aguarda o pagamento');
  st = (await bia('GET', '/api/state')).j.db; ok(!st.reservations.some(x => x.classId === ev.id && x.bike === 6), 'a bike 6 voltou a ficar livre');
  oe2.paid = true; r = await guest('POST', oe2.webhook.replace(`http://localhost:${PORT}`, ''), { order_nsu: oid_e2, transaction_nsu: oe2.tx, invoice_slug: oe2.slug }); ok(r.s === 200, 'pagamento chega depois do cancelamento');
  st = (await ana('GET', '/api/state')).j.db; ok(st.reservations.some(x => x.pay === oid_e2 && x.status === 'confirmed' && !x.holdUntil), 'a vaga é recolocada automaticamente (dinheiro nunca fica sem vaga)');
  // lotada e pagamento atrasado → marca "pago, mas sem vaga" para a dona devolver
  r = await owner('POST', '/api/act/specSchedule', { id: 'sp-havai', start: new Date(Date.now() + 6 * 864e5).toISOString() }); const ev2 = r.j.state.db.classes.filter(c => c.event).at(-1);
  r = await ana('POST', '/api/act/checkoutEvent', { classId: ev2.id, bike: 1 }); const oe3 = orders[r.j.orderId], oid3b = r.j.orderId;
  await ana('POST', '/api/act/cancel', { id: r.j.state.db.reservations.find(x => x.pay === oid3b).id });
  const DBf = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8')); ok(DBf.purchases.some(x => x.id === oid3b), 'pedido continua registrado');
  for (let b = 1; b <= 8; b++) { const u = (await owner('POST', '/api/act/book', { classId: ev2.id, bike: b, walk: { name: 'Avulsa ' + b, phone: '' }, method: 'FREE' })); if (u.s !== 200) console.log('book falhou', u.j); }
  oe3.paid = true; r = await guest('POST', oe3.webhook.replace(`http://localhost:${PORT}`, ''), { order_nsu: oid3b, transaction_nsu: oe3.tx, invoice_slug: oe3.slug }); ok(r.s === 200, 'webhook responde 200 (não fica tentando para sempre)');
  st = (await owner('GET', '/api/state')).j.db; const po = st.purchases.find(x => x.id === oid3b); ok(po.status === 'pending' && po.needsAction === true && /sem vaga|esgotada|Aula/.test(po.note), 'aula lotada: pedido marcado "pago, mas sem vaga — devolver"');
  r = await owner('POST', '/api/act/dropOrder', { id: oid3b }); ok(r.s === 200, 'dona resolve descartando o pedido depois de devolver o valor');
  // equipe
  r = await owner('POST', '/api/act/teamAdd', { name: 'Gerente', email: 'gerente@fany.com', password: 'senhaAdmin1' }); ok(r.s === 200, 'dona cria administradora');
  r = await adm('POST', '/api/login', { email: 'gerente@fany.com', password: 'senhaAdmin1' }); ok(r.j.sess.role === 'admin', 'administradora entra');
  r = await adm('POST', '/api/act/adjust', { userId: r.j.db.users[0].id, amount: 1, reason: 'x' }); ok(r.s === 200, 'admin ajusta créditos');
  r = await adm('POST', '/api/act/teamAdd', { name: 'X', email: 'x@x.com', password: 'abcdefgh' }); ok(r.s === 403, 'admin NÃO cria outra admin');
  r = await adm('POST', '/api/act/payHandle', { handle: 'outra' }); ok(r.s === 403, 'admin NÃO muda a conta de pagamento');
  r = await adm('GET', '/api/backup'); ok(r.s === 403, 'admin NÃO baixa o backup');
  r = await owner('GET', '/api/backup'); ok(r.s === 200 && r.j.users.length >= 4 && r.j.sessions.length === 0, 'dona baixa o backup');
  const anaId = (await ana('GET', '/api/state')).j.db.users[0].id;
  r = await adm('POST', '/api/act/resetPassword', { userId: anaId, password: 'novaSenha123' }); ok(r.s === 200, 'admin redefine senha de aluna');
  r = await ana('GET', '/api/state'); ok(r.j.sess === null, 'sessão antiga da aluna foi encerrada');
  r = await ana('POST', '/api/login', { email: 'ana@x.com', password: 'novaSenha123' }); ok(r.s === 200, 'aluna entra com a senha nova');
  const ownerId = (await owner('GET', '/api/state')).j.db.users.find(u => u.role === 'owner').id;
  r = await adm('POST', '/api/act/resetPassword', { userId: ownerId, password: 'hackeado123' }); ok(r.s === 400, 'admin NÃO redefine senha da dona');
  r = await adm('POST', '/api/act/block', { id: ownerId }); ok(r.s === 400, 'admin NÃO bloqueia a dona');
  r = await owner('POST', '/api/act/teamRemove', { userId: (await adm('GET', '/api/state')).j.sess.userId }); ok(r.s === 200, 'dona remove a administradora');
  r = await adm('POST', '/api/act/adjust', { userId: anaId, amount: 1 }); ok(r.s === 403, 'ex-admin perde o acesso na hora');
  // segurança
  r = await fetch(BASE + '/api/act/adjust', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site-malicioso.com' }, body: '{}' }); ok(r.status === 403, 'origem estranha bloqueada (CSRF)');
  r = await fetch(BASE + '/api/state'); ok(/default-src 'self'/.test(r.headers.get('content-security-policy')) && r.headers.get('x-frame-options') === 'DENY', 'cabeçalhos de segurança presentes');
  // limite de tentativas de login
  let blocked = false; for (let i = 0; i < 10; i++) { r = await guest('POST', '/api/login', { email: 'ana@x.com', password: 'x' + i }); if (r.s === 429) blocked = true; } ok(blocked, 'tentativas de login limitadas (429)');
  // persistência
  srv.kill('SIGTERM'); await sleep(400);
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8')); ok(saved.users.length >= 4 && saved.purchases.some(p => p.status === 'paid'), 'dados gravados em disco');
  ok(fs.readdirSync(path.join(DATA, 'backups')).length >= 1, 'cópia de segurança diária criada');
  const srv2 = spawn('node', ['server/index.js'], { env: { ...process.env, PORT, DATA_DIR: DATA, PUBLIC_URL: `http://localhost:${PORT}`, OWNER_EMAIL: 'dona@fany.com', OWNER_PASSWORD: 'senhaForte123', INFINITEPAY_HANDLE: 'minhatag', INFINITEPAY_API: `http://localhost:${MOCK}` }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/healthz'); break; } catch (e) { await sleep(100); } }
  r = await ana('POST', '/api/login', { email: 'ana@x.com', password: 'novaSenha123' }); ok(r.s === 200 && r.j.db.users[0].credits === 9, 'depois de reiniciar o servidor os créditos continuam (9)');
  srv2.kill('SIGTERM'); mock.close();
  if (/Error|erro interno/.test(log.replace(/\[webhook\]|\[pago\]/g, ''))) console.log('LOG DO SERVIDOR:\n' + log);
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('EXCEÇÃO', e); srv.kill(); process.exit(1); });
