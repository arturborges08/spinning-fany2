function changeSeat(userId, classId, bike) {
  const c = cls(classId), r = db.reservations.find(x => x.userId === userId && x.classId === classId && x.status === 'confirmed');
  if (!c || !r) throw new Error('Reserva não encontrada');
  if (!isFuture(c)) throw new Error('Esta aula já passou');
  if (!Number.isInteger(bike) || bike < 1 || bike > c.maxBikes) throw new Error('Bike inválida');
  if (occ(classId).some(x => x.id !== r.id && x.bike === bike)) throw new Error(`A bike ${bike} já está reservada. Escolha outra.`);
  r.bike = bike; return bike;
}
/** Muda a quantidade de bikes de uma aula. Realoca quem estiver numa bike que deixou de existir. Devolve false se não couber. */
function resizeClass(c, newMax) {
  const taken = occ(c.id);
  if (newMax < taken.length) return false;
  const over = taken.filter(r => r.bike > newMax);
  const usedB = new Set(taken.map(r => r.bike)), free = []; for (let i = 1; i <= newMax; i++) if (!usedB.has(i)) free.push(i);
  if (over.length > free.length) return false;
  const grew = newMax > c.maxBikes;
  for (const r of over) { const nb = free.shift(); r.bike = nb; notify(r.userId, 'Sua bike mudou', `${c.title} (${fWhen(c.start)}): sua nova bike é a ${nb}.`); }
  c.maxBikes = newMax; if (grew) promoteWaitlist(c.id);
  return true;
}
/** Aplica a nova quantidade de bikes/duração às aulas normais futuras (aulas avulsas pagas têm configuração própria). */
function applyStudioToClasses(newMax, newDur) {
  const now = new Date(); let ok = 0, kept = 0;
  for (const c of db.classes) {
    if (!c.active || c.event || D(c.start) <= now) continue;
    if (newMax && !resizeClass(c, newMax)) { kept++; continue; }
    c.duration = newDur; ok++;
  }
  return { ok, kept };
}
function audit(action, detail) { db.audit.unshift({ id: uid(), action, detail: detail || '', at: new Date().toISOString() }); db.audit.length = Math.min(db.audit.length, 120); }
/** Aviso dentro do site e, se o envio de e-mail estiver ligado, também por e-mail. `opts.important` = vai por e-mail mesmo que a aluna tenha desligado os avisos. */
function notify(userId, title, body, opts) {
  if (!(opts && opts.noNote)) db.notes.push({ id: uid(), userId, title, body: body || '', read: false, at: new Date().toISOString(), kind: (opts && opts.kind) || '', ref: (opts && opts.ref) || '' });   // noNote = só e-mail (a aluna já está vendo a tela)
  if (hooks.notify) { try { hooks.notify(userId, title, body || '', opts || {}); } catch (e) { console.error('[aviso por e-mail]', e.message); } }
}
function ledgerAdd(userId, amount, type, desc, ref) { db.ledger.push({ id: uid(), userId, amount, type, desc, ref: ref || null, at: new Date().toISOString() }); }
function addCredits(userId, amount, type, desc, ref, validity) {
  const u = usr(userId); if (!u) throw new Error('Aluna não encontrada');
  const applied = Math.max(amount, -u.credits);          // nunca fica negativo
  if (!applied) return;
  u.credits += applied; ledgerAdd(userId, applied, type, desc, ref);
  if (validity > 0 && applied > 0) { const base = Math.max(u.expireAt ? D(u.expireAt).getTime() : 0, Date.now()); u.expireAt = new Date(base + validity * 864e5).toISOString(); }
}
function expireCredits() {
  let ch = false;
  for (const u of db.users) if (u.credits > 0 && u.expireAt && D(u.expireAt) < new Date()) { ledgerAdd(u.id, -u.credits, 'expired', 'Créditos vencidos'); u.credits = 0; u.expireAt = null; ch = true; }
  if (ch) save();
}
/** Confere se a vaga pode ser reservada (sem mexer em nada). Devolve a bike que será usada. */
function seatPlan(userId, classId, o = {}) {
  expireHolds();
  const c = cls(classId), u = usr(userId);
  if (!c || !c.active) throw new Error('Aula não encontrada');
  if (!u) throw new Error('Aluna não encontrada');
  if (!o.allowPast && !isFuture(c)) throw new Error('Esta aula já passou');
  const mine = db.reservations.find(r => r.userId === userId && r.classId === classId);
  if (mine && OCC.includes(mine.status)) throw new Error(`${o.admin ? u.name + ' já tem' : 'Você já tem'} uma reserva nesta aula`);
  const taken = occ(classId);
  if (taken.length + activeOffers(classId, userId).length >= c.maxBikes) throw new Error(c.event ? 'Aula esgotada' : 'Aula lotada — entre na lista de espera');
  const used = new Set(taken.map(r => r.bike).filter(Boolean));
  let bike = o.bike ? Number(o.bike) : null;
  if (bike) {
    if (!Number.isInteger(bike) || bike < 1 || bike > c.maxBikes) throw new Error('Bike inválida');
    if (used.has(bike)) throw new Error(`A bike ${bike} já está reservada. Escolha outra.`);
  } else for (let i = 1; i <= c.maxBikes; i++) if (!used.has(i)) { bike = i; break; }
  if (!bike) throw new Error(c.event ? 'Aula esgotada' : 'Aula lotada — entre na lista de espera');
  return { c, u, mine, bike };
}
function reserveSeat(userId, classId, o = {}) {
  const debit = o.debit !== false;
  const { c, u, mine, bike } = seatPlan(userId, classId, o);
  if (c.event && debit) throw new Error('Esta é uma aula avulsa paga: reserve pelo botão da aula (pagamento direto, sem crédito).');
  if (debit && u.credits < 1) throw new Error(o.admin ? `${u.name} não tem créditos. Escolha cortesia ou venda uma aula.` : 'Você não tem créditos. Compre um pacote.');
  if (debit) { u.credits -= 1; ledgerAdd(userId, -1, 'reservation', `${o.label || 'Reserva'}: ${c.title}`, classId); }
  if (mine) Object.assign(mine, { status: 'confirmed', bike, paidCredit: debit, holdUntil: null, pay: null, at: new Date().toISOString() });
  else db.reservations.push({ id: uid(), userId, classId, bike, status: 'confirmed', paidCredit: debit, at: new Date().toISOString() });
  db.waitlist = db.waitlist.filter(w => !(w.userId === userId && w.classId === classId)); settleOfferNotes(userId, classId);
  return bike;
}
const OFFER_MAX_MIN = 30, OFFER_MIN_MIN = 10;
/**
 * Abriu vaga? Oferece para a próxima da fila (com crédito). A vaga fica reservada para ela por alguns minutos:
 * ela precisa CONFIRMAR (escolhendo a bike) — se não responder a tempo, passa para a próxima.
 */
function promoteWaitlist(classId) {
  const c = cls(classId); if (!c || !c.active || c.event || !isFuture(c)) return;
  let free = c.maxBikes - occ(classId).length - activeOffers(classId).length;
  const queue = db.waitlist.filter(w => w.classId === classId && !w.offerUntil).sort((a, b) => D(a.at) - D(b.at));
  for (const w of queue) {
    if (free <= 0) break;
    const u = usr(w.userId); if (!u || u.blocked || u.credits < 1) continue;
    const toStart = D(c.start).getTime() - Date.now();
    let until = Date.now() + Math.min(OFFER_MAX_MIN, Math.max(OFFER_MIN_MIN, Math.floor(toStart / 6e4 / 3))) * 60e3;
    until = Math.min(until, D(c.start).getTime() - 5 * 60e3);
    if (hooks.offerMs) until = Date.now() + hooks.offerMs();               // só para testes automáticos
    else if (until < Date.now() + 2 * 60e3) continue;                      // aula começa daqui a pouco: não dá tempo de oferecer
    w.offerUntil = new Date(until).toISOString(); w.offeredAt = new Date().toISOString(); free--;
    notify(u.id, 'Vaga liberada! 🎉', `Abriu uma vaga em ${c.title} (${fWhen(c.start)}). Confirme até as ${fTime(until)} — depois disso ela passa para a próxima da fila.`, { important: true, kind: 'offer', ref: classId, button: { label: 'Confirmar minha vaga', path: '/#/conta' } });
  }
}
/** Ofertas que ninguém confirmou a tempo voltam para a fila (a pessoa sai dela) e a vaga vai para a próxima. */
/** Quando a oferta de vaga termina (confirmou, recusou, expirou ou a aula foi cancelada), o aviso "Vaga liberada!" deixa de aparecer no painel. */
function settleOfferNotes(userId, classId) { for (const n of db.notes) if (n.kind === 'offer' && n.ref === classId && (!userId || n.userId === userId)) n.read = true; }
function expireOffers() {
  const now = Date.now(), gone = db.waitlist.filter(w => w.offerUntil && D(w.offerUntil).getTime() < now);
  if (!gone.length) return false;
  db.waitlist = db.waitlist.filter(w => !gone.includes(w));
  for (const w of gone) { settleOfferNotes(w.userId, w.classId); const c = cls(w.classId); notify(w.userId, 'A vaga passou para a próxima', `O tempo para confirmar a vaga em ${c ? c.title + ' (' + fWhen(c.start) + ')' : 'aula'} acabou. Você saiu da fila — se ainda quiser, entre de novo.`); }
  for (const cid of new Set(gone.map(w => w.classId))) promoteWaitlist(cid);
  return true;
}
function declineOffer(userId, classId) {
  const w = db.waitlist.find(x => x.userId === userId && x.classId === classId);
  if (!w) throw new Error('Você não está na fila dessa aula');
  db.waitlist = db.waitlist.filter(x => x !== w); settleOfferNotes(userId, classId); promoteWaitlist(classId);
}
function releaseSeat(resId, o = {}) {
  const r = db.reservations.find(x => x.id === resId); if (!r) throw new Error('Reserva não encontrada');
  if (o.byUser && r.userId !== o.byUser) throw new Error('Reserva não encontrada');
  if (r.status !== 'confirmed') return false;
  const c = cls(r.classId);
  if (c && c.event) {                                                           // aula avulsa paga: sem crédito para devolver
    if (o.byUser && !r.holdUntil) throw new Error('Esta é uma aula avulsa paga: para cancelar ou pedir reembolso fale com a Fany pelo WhatsApp.');
    r.status = 'cancelled'; r.bike = null; r.holdUntil = null;
    const pu = db.purchases.find(p => p.id === r.pay); if (pu && pu.status === 'pending') pu.status = 'cancelled';
    return true;
  }
  if (o.cutoff != null && c) { const h = (D(c.start) - Date.now()) / 36e5; if (h < o.cutoff) throw new Error(`Cancelamento só até ${o.cutoff}h antes da aula. Fale com o estúdio pelo WhatsApp.`); }
  r.status = 'cancelled'; r.bike = null;
  if (o.refund && r.paidCredit) addCredits(r.userId, 1, 'refund', `Cancelamento: ${c ? c.title : 'aula'}`, r.id);
  promoteWaitlist(r.classId);
  return true;
}
function newPurchase(userId, pkgId, billing, extra = {}) {
  const p = pkg(pkgId); if (!p) throw new Error('Pacote não encontrado');
  const pu = { id: uid(), userId, pkgId, amount: extra.free ? 0 : p.price, credits: p.credits, status: 'pending', billing, createdAt: new Date().toISOString(), paidAt: null, note: extra.note || '', claimed: false };
  db.purchases.push(pu); return pu;
}
function fulfill(purchaseId) {
  const pu = db.purchases.find(p => p.id === purchaseId);
  if (!pu || pu.status !== 'pending') return false;           // idempotente: nunca credita duas vezes
  if (pu.kind === 'event') return fulfillEvent(pu);
  const p = pkg(pu.pkgId);
  pu.status = 'paid'; pu.paidAt = new Date().toISOString();
  addCredits(pu.userId, pu.credits, 'purchase', `Créditos liberados · ${p ? p.name : 'pacote'}`, pu.id, p ? p.validity : null);
  if (p && p.kind === 'subscription' && !db.subs.some(s => s.userId === pu.userId && s.pkgId === p.id && s.status === 'active'))
    db.subs.push({ id: uid(), userId: pu.userId, pkgId: p.id, status: 'active', credits: pu.credits, createdAt: new Date().toISOString(), lastCharge: pu.paidAt });
  notify(pu.userId, 'Créditos liberados 🎉', `${pu.credits} crédito(s) já estão na sua conta.`);
  return true;
}
function refundPurchase(id) {
  const pu = db.purchases.find(p => p.id === id);
  if (!pu || pu.status !== 'paid') throw new Error('Só dá para estornar vendas pagas.');
  pu.status = 'refunded'; pu.refundedAt = new Date().toISOString();
  if (pu.kind === 'event') {                                                    // aula avulsa: libera a bike (o dinheiro é devolvido pela Fany)
    const r = db.reservations.find(x => x.pay === pu.id && x.status === 'confirmed'); if (r) { r.status = 'cancelled'; r.bike = null; r.holdUntil = null; }
    audit('venda_estornada', `${(usr(pu.userId) || {}).name || ''} · ${brl(pu.amount)} · ${purName(pu)}`); return 0;
  }
  const u = usr(pu.userId), take = u ? Math.min(pu.credits, u.credits) : 0;
  if (take > 0) { u.credits -= take; ledgerAdd(u.id, -take, 'chargeback', 'Venda estornada', pu.id); }
  audit('venda_estornada', `${u ? u.name : ''} · ${brl(pu.amount)} · ${take} crédito(s) retirados`);
  return take;
}
function cancelClass(id, reason) {
  const c = cls(id); if (!c || !c.active) throw new Error('Aula não encontrada');
  let n = 0;
  if (isFuture(c)) for (const r of db.reservations.filter(x => x.classId === id && x.status === 'confirmed')) {
    r.status = 'cancelled'; r.bike = null; r.holdUntil = null;
    if (c.event) {
      const pu = db.purchases.find(p => p.id === r.pay);
      if (pu && pu.status === 'paid') { pu.status = 'refunded'; pu.refundedAt = new Date().toISOString(); } else if (pu && pu.status === 'pending') pu.status = 'cancelled';
      notify(r.userId, 'Aula cancelada', `${c.title} (${fWhen(c.start)}) foi cancelada${reason ? ': ' + reason : ''}.${pu && pu.status === 'refunded' ? ' A Fany vai devolver o valor pago.' : ''}`); n++; continue;
    }
    if (r.paidCredit) addCredits(r.userId, 1, 'refund', `Aula cancelada pelo estúdio: ${c.title}`, r.id);
    notify(r.userId, 'Aula cancelada', `${c.title} (${fWhen(c.start)}) foi cancelada${reason ? ': ' + reason : ''}. Seu crédito voltou.`); n++;
  }
  db.waitlist = db.waitlist.filter(w => w.classId !== id); settleOfferNotes(null, id);
  c.active = false; audit('aula_cancelada', `${c.title} · ${fWhen(c.start)} · ${n} reserva(s) devolvida(s)`);
  return n;
}
/* ── créditos: ajuste da dona e presente entre alunas ── */
function adjustCredits(userId, amount, reason) {
  const u = usr(userId); if (!u) throw new Error('Aluna não encontrada');
  const a = num(amount, -200, 200, 0); if (!a) throw new Error('Informe a quantidade de créditos');
  if (a < 0 && -a > u.credits) throw new Error(`${u.name} só tem ${u.credits} crédito(s) — não dá para tirar ${-a}.`);
  const why = clean(reason, 120) || 'Ajuste manual';
  addCredits(u.id, a, 'adjustment', why, null, null);
  notify(u.id, a > 0 ? 'Você ganhou créditos 🎁' : 'Seus créditos foram ajustados', `${a > 0 ? '+' : ''}${a} crédito(s): ${why}`);
  audit('creditos_ajustados', `${a > 0 ? '+' : ''}${a} · ${u.name} · ${why}`);
  return a;
}
/** Valida o presente. Devolve a destinatária (ou null se ainda não tiver conta). Não altera nada. */
function checkGift(fromId, phone, amount) {
  const from = usr(fromId); if (!from) throw new Error('Aluna não encontrada');
  if (S().gifts === false) throw new Error('O estúdio desativou a doação de créditos.');
  if (from.blocked) throw new Error('Sua conta está bloqueada. Fale com o estúdio.');
  const n = Number(amount); if (!Number.isInteger(n) || n < 1) throw new Error('Informe quantos créditos quer enviar.');
  if (n > from.credits) throw new Error(`Você só tem ${from.credits} crédito(s).`);
  if (!validPhone(phone)) throw new Error('WhatsApp inválido. Use DDD + número, ex: (18) 99667-6637');
  const ph = normPhone(phone); if (ph === from.phone) throw new Error('Você não pode enviar créditos para você mesma 🙂');
  const to = db.users.find(x => x.phone === ph) || null;
  if (to && to.blocked) throw new Error('Não foi possível enviar para essa conta. Fale com o estúdio.');
  return to;
}
function giftCredits(fromId, phone, name, amount, msg) {
  let to = checkGift(fromId, phone, amount); const from = usr(fromId), n = Number(amount);
  if (!to) {
    const nm = clean(name, 120); if (nm.length < 2) throw new Error('Essa pessoa ainda não tem conta. Informe o nome dela para criarmos.');
    to = { id: uid(), name: nm, phone: normPhone(phone), credits: 0, blocked: false, createdAt: new Date().toISOString(), termsAt: null }; db.users.push(to);
  }
  addCredits(from.id, -n, 'gift_out', `Presente para ${shortName(to.name)}`, to.id);
  addCredits(to.id, n, 'gift_in', `Presente de ${shortName(from.name)}`, from.id);
  const m = clean(msg, 120);
  notify(to.id, 'Você ganhou créditos de presente 🎁', `${shortName(from.name)} te enviou ${n} crédito(s)${m ? ': “' + m + '”' : ''}.`);
  audit('credito_doado', `${from.name} → ${to.name} · ${n} crédito(s)`);
  return to;
}

/* ── a dona reserva bike (aluna cadastrada ou avulsa) ── */
function adminBook(classId, bike, o) {
  if (!['CREDIT', 'FREE', 'CASH', 'CARD_MACHINE', 'PIX_KEY'].includes(o.method)) throw new Error('Escolha como a aluna vai pagar');
  const cEv = cls(classId), ev = cEv && cEv.event;
  if (ev && o.method === 'CREDIT') throw new Error('Aula avulsa paga não usa crédito. Escolha como foi o pagamento ou cortesia.');
  const sale = ['CASH', 'CARD_MACHINE', 'PIX_KEY'].includes(o.method);
  const one = sale && !ev ? db.packages.find(p => p.active && p.kind === 'credits' && p.credits === 1) : null;
  if (sale && !ev && !one) throw new Error('Crie um pacote de 1 aula (aba Pacotes) para vender aula avulsa.');
  let u = o.userId ? usr(o.userId) : null, created = false;
  if (!u) {
    const w = o.walk || {}, name = clean(w.name, 120);
    if (name.length < 2) throw new Error('Informe o nome da aluna');
    const ph = clean(w.phone, 30) ? normPhone(w.phone) : '';
    if (ph && !validPhone(ph)) throw new Error('WhatsApp inválido. Use DDD + número.');
    u = ph ? db.users.find(x => x.phone === ph) : null;
    if (!u) { u = { id: uid(), name, phone: ph, credits: 0, blocked: false, createdAt: new Date().toISOString(), termsAt: null, walkin: true }; created = true; db.users.push(u); }
  }
  try {
    seatPlan(u.id, classId, { bike, allowPast: true, admin: true });            // valida a vaga antes de mexer em dinheiro
    if (o.method === 'CREDIT' && u.credits < 1) throw new Error(`${u.name} não tem créditos. Escolha cortesia ou venda uma aula.`);
  } catch (e) { if (created) db.users = db.users.filter(x => x !== u); throw e; }
  if (sale && !ev) { const pu = newPurchase(u.id, one.id, o.method, { note: 'Aula avulsa' }); fulfill(pu.id); }
  const b = reserveSeat(u.id, classId, { bike, debit: !ev && o.method !== 'FREE', allowPast: true, admin: true, label: 'Reserva pela Fany' });
  if (ev && sale) {                                                             // aula avulsa: registra a venda no valor da aula
    const pu = { id: uid(), userId: u.id, kind: 'event', classId, bike: b, pkgId: null, amount: ev.price, credits: 0, status: 'paid', billing: o.method, createdAt: new Date().toISOString(), paidAt: new Date().toISOString(), note: 'Venda no estúdio', claimed: false };
    db.purchases.push(pu); const rr = db.reservations.find(x => x.userId === u.id && x.classId === classId && x.status === 'confirmed'); if (rr) rr.pay = pu.id;
  }
  const how = { CREDIT: 'usou crédito', FREE: 'cortesia', CASH: 'dinheiro', CARD_MACHINE: 'maquininha', PIX_KEY: 'PIX direto' }[o.method];
  audit('reserva_manual', `${u.name} · bike ${b} · ${how}`);
  return { bike: b, user: u };
}
/** Muda a aluna de bike; se a bike de destino estiver ocupada, as duas trocam de lugar. */
function moveSeat(resId, target) {
  const r = db.reservations.find(x => x.id === resId); if (!r || !OCC.includes(r.status)) throw new Error('Reserva não encontrada');
  const c = cls(r.classId); if (!c) throw new Error('Aula não encontrada');
  if (!Number.isInteger(target) || target < 1 || target > c.maxBikes) throw new Error('Bike inválida');
  const other = occ(c.id).find(x => x.id !== r.id && x.bike === target);
  if (other) other.bike = r.bike;
  r.bike = target; return !!other;
}

/** Bikes seguradas que passaram do prazo voltam a ficar livres. O pedido continua pendente (se a aluna pagou atrasado, a Fany ainda consegue liberar). */
function expireHolds() {
  let ch = false; const now = Date.now();
  for (const r of db.reservations) if (isHeld(r) && D(r.holdUntil).getTime() < now) {
    r.status = 'cancelled'; r.bike = null; r.holdUntil = null; ch = true;
    const pu = db.purchases.find(p => p.id === r.pay); if (pu && pu.status === 'pending') pu.expired = true;
    notify(r.userId, 'Reserva expirada', 'O tempo para pagar o PIX acabou e a bike foi liberada. Se você já pagou, fale com a Fany.');
  }
  if (ch) save();
  return ch;
}
/** Aluna escolhe a bike de uma aula avulsa: a bike fica segurada por 20 min até o PIX ser pago. */
function bookEvent(userId, classId, bike) {
  expireHolds();
  const u = usr(userId); if (!u) throw new Error('Aluna não encontrada');
  if (u.blocked) throw new Error('Sua conta está bloqueada. Fale com o estúdio.');
  const c = cls(classId); if (!c || !c.active || !c.event) throw new Error('Aula não encontrada');
  const plan = seatPlan(userId, classId, { bike });
  const now = new Date().toISOString();
  const pu = { id: uid(), userId, kind: 'event', classId, bike: plan.bike, pkgId: null, amount: c.event.price, credits: 0, status: 'pending', billing: 'PIX', createdAt: now, paidAt: null, note: '', claimed: false };
  db.purchases.push(pu);
  const hold = new Date(Date.now() + HOLD_MIN * 60e3).toISOString();
  if (plan.mine) Object.assign(plan.mine, { status: 'confirmed', bike: plan.bike, paidCredit: false, holdUntil: hold, pay: pu.id, at: now });
  else db.reservations.push({ id: uid(), userId, classId, bike: plan.bike, status: 'confirmed', paidCredit: false, holdUntil: hold, pay: pu.id, at: now });
  return pu;
}
/** PIX da aula avulsa confirmado: a vaga vira definitiva. Se a bike já expirou, tenta recolocar a aluna. */
function fulfillEvent(pu) {
  const c = cls(pu.classId); if (!c || !c.active) throw new Error('A aula foi cancelada. Devolva o valor para a aluna.');
  let r = db.reservations.find(x => x.pay === pu.id && x.status === 'confirmed');
  if (!r) {
    let plan; try { plan = seatPlan(pu.userId, pu.classId, { bike: pu.bike, allowPast: true }); } catch (e) { try { plan = seatPlan(pu.userId, pu.classId, { allowPast: true }); } catch (e2) { throw new Error('O tempo da reserva acabou e a aula está esgotada. Devolva o valor para a aluna.'); } }
    const now = new Date().toISOString();
    if (plan.mine) { Object.assign(plan.mine, { status: 'confirmed', bike: plan.bike, paidCredit: false, pay: pu.id, at: now }); r = plan.mine; }
    else { r = { id: uid(), userId: pu.userId, classId: pu.classId, bike: plan.bike, status: 'confirmed', paidCredit: false, pay: pu.id, at: now }; db.reservations.push(r); }
  }
  r.holdUntil = null; pu.bike = r.bike; pu.status = 'paid'; pu.paidAt = new Date().toISOString(); pu.expired = false;
  notify(pu.userId, 'Vaga confirmada! 🌺', `${c.title} (${fWhen(c.start)}) — sua bike: ${r.bike}.`);
  return true;
}
/** Cadastro/edição do modelo de aula especial. Opcionalmente atualiza as datas já agendadas. */
/** grade (linhas de bikes) que uma aula especial usa */
const tplGrid = t => { const l = t.layoutId && db.layouts.find(x => x.id === t.layoutId); return l ? l.rows.slice() : autoGrid(t.maxBikes || 8); };
function saveSpecial(o) {
  const name = clean(o.name, 80); if (name.length < 2) throw new Error('Dê um nome para a aula');
  const price = num(o.price, 0, 5e6, 0); if (price < 100) throw new Error('Preço mínimo: R$ 1,00');
  const theme = (db.themes || []).some(x => x.id === o.theme) ? o.theme : 'gold';
  const old = db.specials.find(x => x.id === o.id);
  let layoutId = old ? old.layoutId || null : (defaultLayout() || {}).id || null, maxBikes = old ? old.maxBikes : 8;
  if (o.layoutId !== undefined && o.layoutId !== '') { const l = db.layouts.find(x => x.id === o.layoutId); if (!l) throw new Error('Layout não encontrado'); layoutId = l.id; maxBikes = gridCount(l.rows); }
  else if (o.layoutId === undefined && o.maxBikes) { layoutId = null; maxBikes = num(o.maxBikes, 1, GRID_MAX_BIKES, 8); }     // chamadas antigas (só quantidade de bikes)
  else if (layoutId) { const l = db.layouts.find(x => x.id === layoutId); if (l) maxBikes = gridCount(l.rows); }
  const t = { id: o.id || uid(), name, price, theme, layoutId, maxBikes, duration: num(o.duration, 15, 240, 90), desc: clean(o.desc, 200), active: !!o.active };
  if (old) Object.assign(old, t); else db.specials.push(t);
  let ok = 0, kept = 0;
  if (o.applyAll && old) for (const c of db.classes) {
    if (!c.active || !c.event || c.event.tpl !== t.id || D(c.start) <= new Date()) continue;
    c.title = t.name; c.duration = t.duration; c.notes = t.desc; c.event.price = t.price; c.event.theme = t.theme;
    const rows = tplGrid(t), same = JSON.stringify(rows) === JSON.stringify(c.grid || []);
    if (!same && !applyLayoutToClass(c, { id: t.layoutId, rows })) kept++; else ok++;
  }
  audit('aula_especial', `${name} · ${brl(price)}`);
  return { id: t.id, ok, kept };
}
function scheduleSpecial(tplId, startValue) {
  const t = db.specials.find(x => x.id === tplId); if (!t) throw new Error('Aula especial não encontrada');
  const start = new Date(startValue); if (isNaN(start)) throw new Error('Escolha data e hora');
  const iso = start.toISOString();
  if (db.classes.some(c => c.active && c.start === iso && c.title === t.name)) throw new Error('Já existe essa aula nesse horário');
  const grid = tplGrid(t);
  db.classes.push({ id: uid(), title: t.name, instructor: S().instructor, start: iso, duration: t.duration, maxBikes: gridCount(grid), grid, layoutId: t.layoutId || null, level: 'Aula temática', notes: t.desc, active: true, event: { price: t.price, theme: t.theme, tpl: t.id } });
  audit('aula_criada', `${t.name} · ${fWhen(start)}`);
}


/* ── sala: layouts das bikes ── */
const defaultLayout = () => (db.layouts || []).find(l => l.id === db.settings.layoutId) || (db.layouts || [])[0] || null;
function layoutOrThrow(id) { const l = (db.layouts || []).find(x => x.id === id); if (!l) throw new Error('Layout não encontrado'); return l; }
/** grade + modelo que uma aula nova vai usar (modelo escolhido, quantidade antiga de bikes, ou o padrão da sala) */
function resolveGrid(layoutId, maxBikes) {
  if (layoutId) { const l = layoutOrThrow(layoutId); return { layoutId: l.id, grid: l.rows.slice() }; }
  if (maxBikes) return { layoutId: null, grid: autoGrid(maxBikes) };
  const d = defaultLayout(); return d ? { layoutId: d.id, grid: d.rows.slice() } : { layoutId: null, grid: autoGrid(8) };
}
/** põe o layout numa aula. Quem já reservou uma bike que deixou de existir é realocada e avisada (resizeClass). */
function applyLayoutToClass(c, layout) {
  const n = gridCount(layout.rows);
  if (!resizeClass(c, n)) return false;
  c.grid = layout.rows.slice(); c.layoutId = layout.id || null; c.maxBikes = n; return true;
}
function saveLayout(o) {
  const name = clean(o.name, 40); if (name.length < 2) throw new Error('Dê um nome para o layout');
  const rows = (Array.isArray(o.rows) ? o.rows : []).map(r => String(r).toUpperCase()); const err = gridError(rows); if (err) throw new Error(err);
  let l = o.id ? db.layouts.find(x => x.id === o.id) : null; if (o.id && !l) throw new Error('Layout não encontrado');
  if (!l) { if (db.layouts.length >= 20) throw new Error('Limite de 20 layouts. Apague algum que não usa mais.'); l = { id: uid(), name, rows }; db.layouts.push(l); } else { l.name = name; l.rows = rows; }
  if (o.makeDefault || !db.settings.layoutId) db.settings.layoutId = l.id;
  if (db.settings.layoutId === l.id) db.settings.maxBikes = gridCount(rows);
  for (const t of db.specials) if (t.layoutId === l.id) t.maxBikes = gridCount(rows);
  let ok = 0, kept = 0;
  if (o.applyFuture) for (const c of db.classes) if (c.active && D(c.start) > new Date() && c.layoutId === l.id) { if (applyLayoutToClass(c, l)) ok++; else kept++; }
  audit('sala_salva', `${name} · ${gridCount(rows)} bikes`); return { id: l.id, ok, kept };
}
function deleteLayout(id) {
  const l = layoutOrThrow(id); if (db.settings.layoutId === id) throw new Error('Esse é o layout padrão. Escolha outro como padrão antes de apagar.');
  if (db.specials.some(t => t.layoutId === id)) throw new Error('Alguma aula especial usa esse layout. Troque o layout dela primeiro.');
  db.layouts = db.layouts.filter(x => x.id !== id); for (const c of db.classes) if (c.layoutId === id) c.layoutId = null;   // as aulas já criadas mantêm a forma que têm
  audit('sala_apagada', l.name);
}
function setDefaultLayout(id) { const l = layoutOrThrow(id); db.settings.layoutId = l.id; db.settings.maxBikes = gridCount(l.rows); audit('sala_padrao', l.name); }

/* ── temas das aulas especiais ── */
function saveTheme(o) {
  const name = clean(o.name, 30); if (name.length < 2) throw new Error('Dê um nome para o tema');
  const col = v => { if (!hexOk(v)) throw new Error('Alguma cor está inválida. Escolha as cores no seletor.'); return v.toLowerCase(); };
  const t = { name, emoji: clean(o.emoji, 16), deco: clean(o.deco, 24), c1: col(o.c1), c2: col(o.c2), c3: col(o.c3), tcAuto: o.tcAuto !== false, tc: hexOk(o.tc) ? o.tc.toLowerCase() : '#1a0b00', btn: THEME_BTN.includes(o.btn) ? o.btn : 'gradient', pattern: THEME_PATTERNS.includes(o.pattern) ? o.pattern : 'none', tag: clean(o.tag, 30), btnText: clean(o.btnText, 50) || 'Garantir minha vaga · {preço}', glow: !!o.glow, round: THEME_ROUND.includes(o.round) ? o.round : 'pill' };
  let old = o.id ? db.themes.find(x => x.id === o.id) : null; if (o.id && !old) throw new Error('Tema não encontrado');
  if (old) Object.assign(old, t); else { if (db.themes.length >= 30) throw new Error('Limite de 30 temas. Apague algum que não usa mais.'); old = Object.assign({ id: uid(), builtin: false }, t); db.themes.push(old); }
  audit('tema_salvo', name); return old;
}
function deleteTheme(id) {
  const t = db.themes.find(x => x.id === id); if (!t) throw new Error('Tema não encontrado'); if (t.builtin) throw new Error('Os temas Dourado e Havaí são os padrões: dá para editar, mas não apagar.');
  const used = db.specials.filter(x => x.theme === id).length + db.classes.filter(c => c.active && c.event && c.event.theme === id && D(c.start) > new Date()).length;
  if (used) throw new Error('Esse tema está em uso por aulas especiais. Troque o tema delas primeiro.');
  db.themes = db.themes.filter(x => x.id !== id); audit('tema_apagado', t.name);
}
