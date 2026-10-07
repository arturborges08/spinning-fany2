'use strict';
/** Cliente do Checkout Integrado da InfinitePay (https://ajuda.infinitepay.io — "Como usar o Checkout Integrado"). */
const base = () => (process.env.INFINITEPAY_API || 'https://api.checkout.infinitepay.io').replace(/\/$/, '');
const cleanHandle = h => String(h || '').trim().replace(/^[$@]+/, '');

async function post(path, body) {
  const r = await fetch(base() + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { /* resposta não-JSON */ }
  return { ok: r.ok, status: r.status, json: j, text };
}
/** Cria o link de pagamento (Pix ou cartão). Preços em centavos. Devolve a URL do checkout. */
async function createLink({ handle, orderNsu, items, redirectUrl, webhookUrl, customer }) {
  const body = { handle: cleanHandle(handle), order_nsu: orderNsu, redirect_url: redirectUrl, webhook_url: webhookUrl, items };
  if (customer && customer.name) body.customer = customer;
  const r = await post('/links', body);
  const url = r.json && (r.json.url || r.json.link || r.json.checkout_url);
  if (!r.ok || !url) {
    console.error('[infinitepay] erro ao criar link', r.status, r.text.slice(0, 300));
    throw new Error(r.status === 400 || r.status === 422 ? 'A InfinitePay recusou o pedido. Confira o nome de usuário (InfiniteTag) e se o Checkout Integrado está ativado.' : 'Não consegui falar com a InfinitePay agora. Tente de novo em instantes.');
  }
  return url;
}
/** Confere na InfinitePay se o pagamento realmente aconteceu. Nunca confie só no corpo do webhook. */
async function paymentCheck({ handle, orderNsu, transactionNsu, slug }) {
  const r = await post('/payment_check', { handle: cleanHandle(handle), order_nsu: orderNsu, transaction_nsu: transactionNsu, slug });
  if (!r.ok || !r.json) throw new Error('Não consegui conferir o pagamento na InfinitePay (' + r.status + ')');
  return r.json;                                   // { success, paid, amount, paid_amount, installments, capture_method }
}
module.exports = { createLink, paymentCheck, cleanHandle };
