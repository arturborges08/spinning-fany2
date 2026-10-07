'use strict';
const crypto = require('crypto');
const core = require('./core');
const ip = require('./infinitepay');

const handle = () => ip.cleanHandle(process.env.INFINITEPAY_HANDLE || core.db.settings.infinitepayHandle || '');
function webhookSecret() {
  const s = core.db.settings;
  if (!s.webhookSecret) { s.webhookSecret = crypto.randomBytes(24).toString('hex'); core.hooks.save(); }
  return s.webhookSecret;
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Cria o link de pagamento da InfinitePay para um pedido. */
async function makeLink(base, pu, description, user) {
  const customer = { name: user.name };
  if (user.email) customer.email = user.email;
  if (/^55\d{10,11}$/.test(user.phone || '')) customer.phone_number = '+' + user.phone;
  return ip.createLink({
    handle: handle(), orderNsu: pu.id, items: [{ quantity: 1, price: pu.amount, description: description.slice(0, 100) }],
    redirectUrl: base + '/pago', webhookUrl: `${base}/api/webhooks/infinitepay?k=${webhookSecret()}`, customer
  });
}

/**
 * Confirma um pagamento: confere na InfinitePay (payment_check), compara o valor e libera créditos/vaga UMA vez só.
 * Chamado pelo webhook e pela página de retorno (/pago). É seguro chamar várias vezes para o mesmo pedido.
 */
async function confirm({ orderNsu, transactionNsu, slug }) {
  const db = core.db, pu = db.purchases.find(p => p.id === orderNsu);
  if (!pu) { const e = new Error('Pedido não encontrado'); e.code = 'NOT_FOUND'; throw e; }
  if (pu.status === 'paid' || pu.status === 'refunded') return { status: pu.status, already: true };
  if (!transactionNsu || !slug) throw new Error('Faltam dados do pagamento (transaction_nsu / slug).');
  if (db.purchases.some(x => x.id !== pu.id && x.transactionNsu === transactionNsu)) { core.audit('pagamento_recusado', `transação repetida em outro pedido (${pu.id})`); throw new Error('Transação já usada em outro pedido'); }
  const chk = await ip.paymentCheck({ handle: handle(), orderNsu, transactionNsu, slug });
  if (!chk.success || chk.paid !== true) { const e = new Error('Pagamento ainda não confirmado'); e.code = 'NOT_PAID'; throw e; }
  if (Number(chk.amount) !== pu.amount) { core.audit('pagamento_valor_diferente', `pedido ${pu.id}: InfinitePay ${chk.amount}c, esperado ${pu.amount}c`); throw new Error('Valor do pagamento não confere com o pedido'); }
  if (pu.status === 'paid') return { status: 'paid', already: true };             // outra chamada confirmou enquanto esperávamos
  Object.assign(pu, { transactionNsu, slug, paidAmount: chk.paid_amount, captureMethod: chk.capture_method || '' });
  if (pu.kind === 'event' && pu.status !== 'pending') { pu.status = 'pending'; pu.expired = true; }   // pagou depois de cancelar/expirar: tenta recolocar na aula
  try { core.fulfill(pu.id); }
  catch (e) {                                                                    // dinheiro entrou mas a vaga não existe mais: a dona precisa devolver
    pu.needsAction = true; pu.note = 'Pagamento recebido, mas: ' + e.message;
    core.audit('pagamento_sem_vaga', `${(core.usr(pu.userId) || {}).name || ''} · ${core.brl(pu.amount)} · ${e.message}`);
    core.notify(pu.userId, 'Pagamento recebido', 'Recebemos seu pagamento, mas houve um problema com a vaga. A Fany vai falar com você.');
    core.hooks.save(); return { status: 'needs_action' };
  }
  core.audit('pagamento_confirmado', `${(core.usr(pu.userId) || {}).name || ''} · ${core.brl(pu.amount)} · ${core.purName(pu)} · ${chk.capture_method || ''}`);
  core.hooks.save();
  return { status: 'paid' };
}
module.exports = { handle, webhookSecret, safeEq, makeLink, confirm };
