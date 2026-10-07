'use strict';
/** Todas as ações do sistema. Cada uma confere a permissão e valida os dados NO SERVIDOR. */
const core = require('./core');
const auth = require('./auth');
const pay = require('./payments');
const mailer = require('./mailer');
const { D, num, clean, normPhone, validPhone, reaisToCents, uid } = core;

const A = {};
const def = (name, lvl, fn) => { A[name] = { lvl, fn }; };
const str = (v, max) => clean(v, max);
const notBlocked = u => { if (u.blocked) throw new Error('Sua conta está bloqueada. Fale com o estúdio.'); };
const needHandle = () => { if (!pay.handle()) throw new Error('O pagamento online ainda está sendo ativado. Chame o estúdio no WhatsApp para comprar.'); };
const isTeam = u => u.role === 'admin' || u.role === 'owner';
/** Quando o envio de e-mail está ligado, a aluna só reserva/compra depois de confirmar o e-mail. */
const needVerified = u => { if (u.role === 'client' && mailer.enabled() && u.emailVerified === false) throw new Error('Confirme seu e-mail para continuar. Procure a mensagem do Spinning Fany na caixa de entrada (ou no spam) ou toque em “Reenviar e-mail”.'); };
function sendVerify(u) {
  const t = auth.makeToken(core.db, u.id, 'verify', 48);
  mailer.enqueueTx(u, 'Confirme seu e-mail', `Oi ${String(u.name || '').split(' ')[0]}! Falta só confirmar seu e-mail para você poder reservar suas aulas e receber os avisos das vagas.`, { button: { label: 'Confirmar meu e-mail', url: `${mailer.baseUrl()}/api/verify?t=${t}` }, footer: 'Se você não criou uma conta no Spinning Fany, é só ignorar este e-mail.' });
}
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

/* ───────────── aluna ───────────── */
def('reserve', 'user', (c, p) => {
  const u = c.user; notBlocked(u); needVerified(u);
  const b = core.reserveSeat(u.id, String(p.classId), { bike: p.bike }), cl = core.cls(String(p.classId));
  core.notify(u.id, 'Reserva confirmada ✔', `${cl.title} · ${core.fWhen(cl.start)} · sua bike: ${b}. Cancelamento grátis até ${core.S().cancelHours}h antes da aula.`, { noNote: true, button: { label: 'Ver minha aula', path: '/#/conta' } });
  return { bike: b, ticket: { classId: String(p.classId), bike: b } };
});
def('change', 'user', (c, p) => {
  const b = core.changeSeat(c.user.id, String(p.classId), Number(p.bike)), cl = core.cls(String(p.classId));
  core.notify(c.user.id, 'Bike trocada ✔', `${cl.title} · ${core.fWhen(cl.start)} · sua nova bike: ${b}.`, { noNote: true, button: { label: 'Ver minha aula', path: '/#/conta' } });
  return { bike: b, ticket: { classId: String(p.classId), bike: b } };
});
def('cancel', 'user', (c, p) => {
  const r = core.db.reservations.find(x => x.id === p.id), ce = r && core.cls(r.classId);
  const done = core.releaseSeat(String(p.id), { refund: true, byUser: c.user.id, cutoff: core.S().cancelHours });
  if (!done) throw new Error('Reserva não encontrada');
  return { msg: ce && ce.event ? 'Vaga cancelada' : 'Reserva cancelada · crédito devolvido' };
});
def('wait', 'user', (c, p) => {
  const u = c.user, db = core.db; notBlocked(u); needVerified(u); const cl = core.cls(String(p.classId));
  if (!cl || !cl.active || !core.isFuture(cl)) throw new Error('Aula não encontrada');
  if (cl.event) throw new Error('Aula esgotada');
  if (core.occ(cl.id).some(r => r.userId === u.id)) throw new Error('Você já tem uma reserva nesta aula');
  if (core.seatsLeft(cl, u.id) > 0) throw new Error('Ainda há vaga nessa aula — reserve direto!');
  if (!db.waitlist.some(w => w.userId === u.id && w.classId === cl.id)) db.waitlist.push({ id: uid(), userId: u.id, classId: cl.id, at: new Date().toISOString() });
  return { msg: 'Você entrou na fila! Se alguém desistir, avisamos aqui e por e-mail para você confirmar a vaga.' };
});
def('declineOffer', 'user', (c, p) => { core.declineOffer(c.user.id, String(p.classId)); return { msg: 'Tudo bem! A vaga passou para a próxima da fila.' }; });
def('leavewait', 'user', (c, p) => { core.db.waitlist = core.db.waitlist.filter(w => !(w.userId === c.user.id && w.classId === String(p.classId))); return { msg: 'Você saiu da lista de espera' }; });
def('readnotes', 'user', c => { for (const n of core.db.notes) if (n.userId === c.user.id) n.read = true; return {}; });
def('subcancel', 'user', (c, p) => { const s = core.db.subs.find(x => x.id === p.id && x.userId === c.user.id); if (!s) throw new Error('Assinatura não encontrada'); s.status = 'cancelled'; return { msg: 'Mensalidade cancelada' }; });
def('profile', 'user', (c, p) => {
  const u = c.user, name = str(p.name, 120); if (name.length < 2) throw new Error('Informe seu nome');
  if (!validPhone(p.phone)) throw new Error('WhatsApp inválido. Use DDD + número.');
  const ph = normPhone(p.phone); if (core.db.users.some(x => x.id !== u.id && x.phone === ph)) throw new Error('Esse WhatsApp já pertence a outra conta');
  if (!u.cpf && p.cpf) { const d = core.digits(p.cpf); if (!core.isValidCpf(d)) throw new Error('CPF inválido. Confira os números.'); if (core.db.users.some(x => x.id !== u.id && x.cpf === d)) throw new Error('Esse CPF já tem cadastro. Se for seu, entre na conta existente.'); u.cpf = d; }
  Object.assign(u, { name, phone: ph, emergency: str(p.emergency, 160) }); return { msg: 'Perfil atualizado' };
});
def('password', 'user', (c, p) => {
  if (!auth.verifyPassword(p.current, c.user.pw)) throw new Error('A senha atual não confere');
  if (typeof p.next !== 'string' || p.next.length < 8 || p.next.length > 128) throw new Error('A nova senha precisa ter de 8 a 128 caracteres');
  c.user.pw = auth.hashPassword(p.next); auth.endAllSessions(core.db, c.user.id); c.newSession = true; return { msg: 'Senha alterada' };
});
def('gift', 'user', (c, p) => { needVerified(c.user); const to = core.giftCredits(c.user.id, String(p.phone || ''), p.name, Number(p.amount), p.msg); return { msg: `${Number(p.amount)} crédito(s) enviados para ${core.shortName(to.name)} 🎁` }; });
def('checkout', 'user', async (c, p) => {
  const u = c.user, db = core.db; notBlocked(u); needVerified(u); needHandle();
  const pk = core.pkg(String(p.packageId)); if (!pk || !pk.active) throw new Error('Pacote indisponível');
  if (pk.kind === 'subscription' && db.subs.some(s => s.userId === u.id && s.pkgId === pk.id && s.status === 'active')) throw new Error('Você já tem essa mensalidade ativa.');
  let pu = db.purchases.find(x => x.userId === u.id && x.pkgId === pk.id && x.status === 'pending' && x.checkoutUrl && x.kind !== 'event' && Date.now() - D(x.createdAt) < 30 * 60e3);
  if (!pu) {
    if (db.purchases.filter(x => x.userId === u.id && x.status === 'pending' && Date.now() - D(x.createdAt) < 36e5).length >= 6) throw new Error('Muitos pedidos em aberto. Pague um deles ou aguarde alguns minutos.');
    pu = core.newPurchase(u.id, pk.id, 'INFINITEPAY');
    try { pu.checkoutUrl = await pay.makeLink(c.base, pu, `Spinning Fany · ${pk.name}`, u); }
    catch (e) { db.purchases = db.purchases.filter(x => x !== pu); throw e; }
  }
  return { url: pu.checkoutUrl, orderId: pu.id };
});
def('checkoutEvent', 'user', async (c, p) => {
  const u = c.user, db = core.db; notBlocked(u); needVerified(u); needHandle();
  const pu = core.bookEvent(u.id, String(p.classId), p.bike ? Number(p.bike) : null);
  const cl = core.cls(pu.classId);
  try { pu.checkoutUrl = await pay.makeLink(c.base, pu, `${cl.title} · ${core.fWhen(cl.start)}`, u); }
  catch (e) { const r = db.reservations.find(x => x.pay === pu.id); if (r) { r.status = 'cancelled'; r.bike = null; r.holdUntil = null; } db.purchases = db.purchases.filter(x => x !== pu); throw e; }
  return { url: pu.checkoutUrl, orderId: pu.id };
});
def('resume', 'user', (c, p) => { const pu = core.db.purchases.find(x => x.id === p.id && x.userId === c.user.id && x.status === 'pending' && x.checkoutUrl); if (!pu) throw new Error('Pedido não encontrado ou já finalizado'); return { url: pu.checkoutUrl, orderId: pu.id }; });

/* ───────────── equipe: presença, reservas, turmas ───────────── */
def('att', 'admin', (c, p) => { const r = core.db.reservations.find(x => x.id === p.id); if (!r || !core.OCC.includes(r.status)) throw new Error('Reserva não encontrada'); if (!['attended', 'no_show', 'confirmed'].includes(p.status)) throw new Error('Status inválido'); if (core.isHeld(r)) throw new Error('Essa vaga ainda aguarda o pagamento.'); r.status = p.status; return { msg: 'Atualizado' }; });
def('allpresent', 'admin', (c, p) => { let n = 0; for (const r of core.occ(String(p.classId))) if (r.status === 'confirmed' && !core.isHeld(r)) { r.status = 'attended'; n++; } return { msg: `${n} aluna(s) marcada(s) como presentes` }; });
def('moveseat', 'admin', (c, p) => { const r = core.db.reservations.find(x => x.id === p.id), sw = core.moveSeat(String(p.id), Number(p.bike)); core.audit('reserva_manual', `${(core.usr(r.userId) || {}).name} → bike ${p.bike}${sw ? ' (trocou com outra aluna)' : ''}`); return { msg: sw ? 'As duas alunas trocaram de bike' : `Aluna movida para a bike ${p.bike}` }; });
def('book', 'admin', (c, p) => { const r = core.adminBook(String(p.classId), p.bike ? Number(p.bike) : null, { userId: p.userId ? String(p.userId) : null, walk: p.walk, method: p.method }); return { msg: `Bike ${r.bike} reservada para ${core.shortName(r.user.name)}` }; });
def('rcancel', 'admin', (c, p) => {
  const db = core.db, r = db.reservations.find(x => x.id === p.id); if (!r) throw new Error('Reserva não encontrada');
  const u = core.usr(r.userId), cl = core.cls(r.classId), name = u ? u.name : '';
  if (cl && cl.event) {
    const pu = db.purchases.find(x => x.id === r.pay);
    if (p.mode === 'refundMoney' && pu && pu.status === 'paid') { core.refundPurchase(pu.id); if (u) core.notify(u.id, 'Vaga cancelada pelo estúdio', 'A Fany vai devolver o valor pago.'); return { msg: 'Vaga cancelada · venda estornada' }; }
    core.releaseSeat(r.id, { refund: false }); core.audit('reserva_cancelada', 'aula avulsa · ' + name); return { msg: 'Vaga cancelada' };
  }
  const refund = p.mode === 'refundCredit';
  core.releaseSeat(r.id, { refund }); if (refund && u) core.notify(u.id, 'Reserva cancelada pelo estúdio', 'Seu crédito voltou.');
  core.audit('reserva_cancelada', `${refund ? 'com' : 'sem'} devolução · ${name}`); return { msg: refund ? 'Cancelada · crédito devolvido' : 'Reserva cancelada' };
});
def('wlrm', 'admin', (c, p) => { core.db.waitlist = core.db.waitlist.filter(w => w.id !== p.id); return { msg: 'Removida da lista' }; });

/* ───────────── agenda ───────────── */
def('classSave', 'admin', (c, p) => {
  const db = core.db, title = str(p.title, 80); if (!title) throw new Error('Dê um nome para a aula');
  const start = new Date(p.start); if (isNaN(start)) throw new Error('Escolha data e hora');
  const o = { title, instructor: str(p.instructor, 80) || 'Fany', start: start.toISOString(), duration: num(p.duration, 15, 240, 45), level: str(p.level, 60) || 'Todos os níveis', notes: str(p.notes, 300) };
  if (p.id) {
    const cl = core.cls(String(p.id)); if (!cl) throw new Error('Aula não encontrada'); const taken = core.occ(cl.id);
    if (p.layoutId && p.layoutId !== cl.layoutId) { const l = core.layoutOrThrow(String(p.layoutId)); if (!core.applyLayoutToClass(cl, l)) throw new Error('Esse layout tem menos bikes do que as já reservadas. Cancele ou mude a bike de algumas alunas primeiro.'); }
    else if (!p.layoutId && p.maxBikes && Number(p.maxBikes) !== cl.maxBikes) { if (!core.resizeClass(cl, num(p.maxBikes, 1, core.GRID_MAX_BIKES, 8))) throw new Error('Já há alunas em bikes acima desse limite. Mude a bike delas primeiro.'); cl.grid = core.autoGrid(cl.maxBikes); cl.layoutId = null; }
    let evNew = null;
    if (cl.event && p.price !== undefined) { const pr = reaisToCents(p.price); if (pr < 100) throw new Error('Preço mínimo da aula avulsa: R$ 1,00'); evNew = { price: pr, theme: core.db.themes.some(t => t.id === p.theme) ? p.theme : cl.event.theme }; }
    const moved = cl.start !== o.start; Object.assign(cl, o); if (evNew) Object.assign(cl.event, evNew);
    if (moved) for (const r of taken.filter(x => x.status === 'confirmed')) core.notify(r.userId, 'Sua aula mudou de horário', `${cl.title} agora é ${core.fWhen(cl.start)}. Se não puder, cancele sem custo.`);
    core.promoteWaitlist(cl.id); core.audit('aula_editada', `${title} · ${core.fWhen(start)}`);
  } else { const g = core.resolveGrid(p.layoutId ? String(p.layoutId) : null, p.layoutId ? 0 : num(p.maxBikes, 0, core.GRID_MAX_BIKES, 0)); db.classes.push({ id: uid(), ...o, grid: g.grid, layoutId: g.layoutId, maxBikes: core.gridCount(g.grid), active: true, event: null }); core.audit('aula_criada', `${title} · ${core.fWhen(start)}`); }
  return { msg: 'Aula salva' };
});
def('classCancel', 'admin', (c, p) => { const n = core.cancelClass(String(p.id), str(p.reason, 100)); return { msg: n ? `Aula cancelada · ${n} reserva(s) devolvida(s)` : 'Aula cancelada' }; });
def('series', 'admin', (c, p) => {
  const db = core.db, days = (Array.isArray(p.days) ? p.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6); if (!days.length) throw new Error('Escolha ao menos um dia da semana');
  const title = str(p.title, 80); if (!title) throw new Error('Dê um nome para a aula');
  const h = num(p.hour, 0, 23, 19), m = num(p.minute, 0, 59, 0), weeks = num(p.weeks, 1, 12, 2), dur = num(p.duration, 15, 240, 45), g = core.resolveGrid(p.layoutId ? String(p.layoutId) : null, p.layoutId ? 0 : num(p.maxBikes, 0, core.GRID_MAX_BIKES, 0)); let n = 0, skip = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const d = core.addDays(new Date(), i); if (!days.includes(d.getDay())) continue;
    const s = core.atHour(d, h, m); if (s <= new Date()) continue; const iso = s.toISOString();
    if (db.classes.some(x => x.active && x.start === iso && x.title === title)) { skip++; continue; }
    db.classes.push({ id: uid(), title, instructor: core.S().instructor, start: iso, duration: dur, maxBikes: core.gridCount(g.grid), grid: g.grid.slice(), layoutId: g.layoutId, level: 'Todos os níveis', notes: '', active: true, event: null }); n++;
  }
  core.audit('grade_gerada', `${title} · ${n} aula(s)`); return { msg: `${n} aulas geradas${skip ? ` · ${skip} já existiam` : ''}` };
});
def('dupweek', 'admin', () => {
  const db = core.db, now = new Date(); let n = 0;
  for (const cl of db.classes.filter(x => x.active && !x.event && D(x.start) > now && D(x.start) < core.addDays(now, 7))) { const s = core.addDays(cl.start, 7).toISOString(); if (db.classes.some(x => x.active && x.start === s && x.title === cl.title)) continue; db.classes.push({ ...cl, id: uid(), start: s }); n++; }
  core.audit('semana_duplicada', n + ' aula(s)'); return { msg: n ? `${n} aulas copiadas` : 'Nada novo para copiar' };
});
def('specSave', 'admin', (c, p) => {
  const r = core.saveSpecial({ id: p.id || '', name: p.name, price: reaisToCents(p.price), theme: p.theme, layoutId: p.layoutId, maxBikes: p.maxBikes, duration: p.duration, desc: p.desc, active: !!p.active, applyAll: !!p.applyAll });
  return { msg: r.ok || r.kept ? `Modelo salvo · ${r.ok} data(s) atualizada(s)${r.kept ? ` · ${r.kept} mantida(s) com as bikes antigas (já têm alunas demais)` : ''}` : 'Aula especial salva', warn: !!r.kept };
});
def('specSchedule', 'admin', (c, p) => { core.scheduleSpecial(String(p.id), p.start); return { msg: 'Aula agendada' }; });

/* ───────────── sala (layout das bikes) e temas ───────────── */
def('layoutSave', 'admin', (c, p) => { const r = core.saveLayout({ id: p.id || '', name: p.name, rows: p.rows, makeDefault: !!p.makeDefault, applyFuture: !!p.applyFuture }); return { id: r.id, msg: r.ok || r.kept ? `Layout salvo · ${r.ok} aula(s) atualizada(s)${r.kept ? ` · ${r.kept} mantida(s) (já têm mais alunas do que bikes no novo layout)` : ''}` : 'Layout salvo', warn: !!r.kept }; });
def('layoutDelete', 'admin', (c, p) => { core.deleteLayout(String(p.id)); return { msg: 'Layout apagado' }; });
def('layoutDefault', 'admin', (c, p) => { core.setDefaultLayout(String(p.id)); return { msg: 'Esse layout agora é o padrão das aulas novas' }; });
def('themeSave', 'admin', (c, p) => { const t = core.saveTheme(p); return { id: t.id, msg: 'Tema salvo' }; });
def('themeDelete', 'admin', (c, p) => { core.deleteTheme(String(p.id)); return { msg: 'Tema apagado' }; });

/* ───────────── alunas e créditos ───────────── */
def('adjust', 'admin', (c, p) => { const a = core.adjustCredits(String(p.userId), p.amount, p.reason); return { msg: `${a > 0 ? '+' : ''}${a} crédito(s) aplicados` }; });
def('studEdit', 'admin', (c, p) => {
  const db = core.db, u = core.usr(String(p.id)); if (!u) throw new Error('Aluna não encontrada');
  const name = str(p.name, 120); if (name.length < 2) throw new Error('Nome muito curto');
  const ph = normPhone(p.phone); if (ph && !validPhone(ph)) throw new Error('WhatsApp inválido');
  if (ph && db.users.some(x => x.id !== u.id && x.phone === ph)) throw new Error('Esse WhatsApp já pertence a outra aluna');
  Object.assign(u, { name, phone: ph, emergency: str(p.emergency, 160), obs: str(p.obs, 1000) }); return { msg: 'Aluna atualizada' };
});
def('block', 'admin', (c, p) => {
  const u = core.usr(String(p.id)); if (!u) throw new Error('Aluna não encontrada');
  if (u.id === c.user.id) throw new Error('Você não pode bloquear a si mesma.'); if (u.role === 'owner' || (u.role === 'admin' && c.role !== 'owner')) throw new Error('Só a dona pode bloquear a equipe.');
  u.blocked = !u.blocked; core.audit(u.blocked ? 'aluna_bloqueada' : 'aluna_desbloqueada', u.name); return { msg: 'Atualizado' };
});
def('newStudent', 'admin', (c, p) => {
  const db = core.db, name = str(p.name, 120); if (name.length < 2) throw new Error('Informe o nome');
  const ph = normPhone(p.phone); if (!validPhone(ph)) throw new Error('WhatsApp inválido. Use DDD + número.');
  if (db.users.some(x => x.phone === ph)) throw new Error('Já existe aluna com esse WhatsApp');
  const u = { id: uid(), name, phone: ph, email: '', role: 'client', credits: 0, blocked: false, createdAt: new Date().toISOString(), termsAt: null, walkin: true }; db.users.push(u);
  return { msg: 'Aluna cadastrada', userId: u.id };
});
def('createAccess', 'admin', (c, p) => {
  const db = core.db, u = core.usr(String(p.userId)); if (!u) throw new Error('Aluna não encontrada'); if (u.pw) throw new Error('Essa aluna já tem acesso. Use "Redefinir senha".');
  const email = String(p.email || '').trim().toLowerCase(); if (!auth.validEmail(email)) throw new Error('E-mail inválido');
  if (db.users.some(x => x.email === email)) throw new Error('Esse e-mail já tem cadastro');
  if (typeof p.password !== 'string' || p.password.length < 8) throw new Error('A senha temporária precisa ter ao menos 8 caracteres');
  u.email = email; u.emailVerified = true; u.pw = auth.hashPassword(p.password); u.termsAt = u.termsAt || new Date().toISOString(); core.audit('acesso_criado', u.name); return { msg: 'Acesso criado — passe o e-mail e a senha temporária para a aluna.' };
});
def('resetPassword', 'admin', (c, p) => {
  const u = core.usr(String(p.userId)); if (!u) throw new Error('Pessoa não encontrada'); if (!u.pw) throw new Error('Essa pessoa ainda não tem acesso. Use "Criar acesso".');
  if (u.role === 'owner' && c.user.id !== u.id) throw new Error('Só a própria dona troca a senha dela.'); if (u.role === 'admin' && c.role !== 'owner') throw new Error('Só a dona redefine a senha da equipe.');
  if (typeof p.password !== 'string' || p.password.length < 8 || p.password.length > 128) throw new Error('A senha precisa ter de 8 a 128 caracteres');
  u.pw = auth.hashPassword(p.password); auth.endAllSessions(core.db, u.id); core.audit('senha_redefinida', u.name); return { msg: 'Senha redefinida — avise a pessoa.' };
});

/* ───────────── vendas e pagamentos ───────────── */
def('sale', 'admin', (c, p) => {
  if (!['CASH', 'CARD_MACHINE', 'PIX_KEY', 'COURTESY'].includes(p.method)) throw new Error('Escolha a forma de pagamento');
  const u = core.usr(String(p.userId)); if (!u) throw new Error('Aluna não encontrada');
  const pu = core.newPurchase(u.id, String(p.packageId), p.method, { free: p.method === 'COURTESY', note: 'Venda no estúdio' });
  if (!core.fulfill(pu.id)) throw new Error('Não foi possível registrar a venda');
  core.audit('venda_manual', `${u.name} · ${core.pkg(pu.pkgId).name} · ${p.method} · ${core.brl(pu.amount)}`); return { msg: 'Venda registrada · créditos liberados' };
});
def('refund', 'admin', (c, p) => { const n = core.refundPurchase(String(p.id)); return { msg: `Venda estornada · ${n} crédito(s) retirados. Se foi pago online, devolva o valor no app da InfinitePay.` }; });
def('markPaid', 'admin', (c, p) => {
  const pu = core.db.purchases.find(x => x.id === p.id); if (!pu) throw new Error('Pedido não encontrado');
  if (pu.status !== 'pending') throw new Error('Esse pedido não está aguardando pagamento.');
  pu.needsAction = false; if (!core.fulfill(pu.id)) throw new Error('Esse pedido já foi pago'); pu.manual = true;
  core.audit('pagamento_confirmado_manual', `${(core.usr(pu.userId) || {}).name || ''} · ${core.brl(pu.amount)} · ${core.purName(pu)}`); return { msg: pu.kind === 'event' ? 'Vaga confirmada' : 'Créditos liberados' };
});
def('dropOrder', 'admin', (c, p) => {
  const db = core.db, id = String(p.id), r = db.reservations.find(x => x.pay === id && x.status === 'confirmed' && x.holdUntil);
  if (r) { r.status = 'cancelled'; r.bike = null; r.holdUntil = null; }
  db.purchases = db.purchases.filter(x => !(x.id === id && x.status === 'pending')); return { msg: 'Pedido descartado' };
});
def('charge', 'admin', async (c, p) => {
  const db = core.db; needHandle();
  const u = core.usr(String(p.userId)), pk = core.pkg(String(p.packageId)); if (!u) throw new Error('Aluna não encontrada'); if (!pk) throw new Error('Pacote não encontrado');
  const pu = core.newPurchase(u.id, pk.id, 'INFINITEPAY', { note: 'Link enviado pela Fany' });
  try { pu.checkoutUrl = await pay.makeLink(c.base, pu, `Spinning Fany · ${pk.name}`, u); } catch (e) { db.purchases = db.purchases.filter(x => x !== pu); throw e; }
  core.audit('cobranca_criada', `${u.name} · ${pk.name} · ${core.brl(pu.amount)}`); return { url: pu.checkoutUrl, orderId: pu.id, msg: 'Link de pagamento criado' };
});
def('chargeSub', 'admin', async (c, p) => {
  const db = core.db; needHandle(); const s = db.subs.find(x => x.id === p.id && x.status === 'active'); if (!s) throw new Error('Mensalidade não encontrada');
  const u = core.usr(s.userId), pk = core.pkg(s.pkgId); const pu = core.newPurchase(s.userId, s.pkgId, 'INFINITEPAY', { note: 'Renovação' });
  try { pu.checkoutUrl = await pay.makeLink(c.base, pu, `Spinning Fany · ${pk.name} (renovação)`, u); } catch (e) { db.purchases = db.purchases.filter(x => x !== pu); throw e; }
  s.lastCharge = new Date().toISOString(); core.notify(s.userId, 'Mensalidade do mês', 'Abra Comprar › Pedidos e finalize o pagamento para receber seus créditos.');
  core.audit('mensalidade', 'cobrança gerada · ' + u.name); return { url: pu.checkoutUrl, orderId: pu.id, msg: 'Cobrança criada' };
});
def('subEnd', 'admin', (c, p) => { const s = core.db.subs.find(x => x.id === p.id); if (!s) throw new Error('Mensalidade não encontrada'); s.status = 'cancelled'; core.audit('mensalidade', 'encerrada'); return { msg: 'Mensalidade encerrada' }; });
def('testCheckout', 'owner', async (c) => {
  needHandle(); const probe = { id: 'teste-' + uid(), amount: 100 };
  const url = await pay.makeLink(c.base, probe, 'Teste de conexão (não precisa pagar)', c.user); return { url, msg: 'Conexão OK — o link de teste foi criado.' };
});

/* ───────────── planos, avisos, estúdio ───────────── */
def('pkgSave', 'admin', (c, p) => {
  const db = core.db, name = str(p.name, 80); if (!name) throw new Error('Dê um nome para o pacote'); const price = reaisToCents(p.price); if (price < 100) throw new Error('Preço mínimo: R$ 1,00');
  const o = { name, credits: num(p.credits, 1, 500, 1), price, desc: str(p.desc, 140), kind: p.kind === 'subscription' ? 'subscription' : 'credits', validity: p.validity ? num(p.validity, 1, 730, 30) : null, active: !!p.active, highlight: !!p.highlight, sort: num(p.sort, 0, 999, db.packages.length + 1) };
  if (p.id) { const k = core.pkg(String(p.id)); if (!k) throw new Error('Pacote não encontrado'); Object.assign(k, o); } else db.packages.push({ id: uid(), ...o });
  core.audit('pacote_salvo', `${name} · ${core.brl(price)}`); return { msg: 'Pacote salvo' };
});
def('pkgDel', 'admin', (c, p) => {
  const db = core.db, k = core.pkg(String(p.id)); if (!k) throw new Error('Pacote não encontrado');
  if (db.purchases.some(x => x.pkgId === k.id) || db.subs.some(x => x.pkgId === k.id)) throw new Error('Esse plano já tem vendas. Desmarque “Ativo” para tirá-lo do site — o histórico fica guardado.');
  db.packages = db.packages.filter(x => x.id !== k.id); core.audit('pacote_salvo', 'apagado · ' + k.name); return { msg: 'Plano apagado' };
});
def('annPost', 'admin', (c, p) => { const t = str(p.title, 80), b = str(p.body, 400); if (!t || !b) throw new Error('Preencha título e mensagem'); core.db.announcements.unshift({ id: uid(), title: t, body: b, at: new Date().toISOString() }); return { msg: 'Aviso publicado' }; });
def('annDel', 'admin', (c, p) => { core.db.announcements = core.db.announcements.filter(a => a.id !== p.id); return { msg: 'Aviso apagado' }; });
def('studio', 'admin', (c, p) => {
  const s = core.S(), wa = normPhone(p.whatsapp);
  const vals = { name: str(p.name, 80) || 'Spinning Fany', address: str(p.address, 160), whatsapp: wa || s.whatsapp, instructor: str(p.instructor, 80) || 'Fany', instagram: str(p.instagram, 80), about: str(p.about, 600), duration: num(p.duration, 15, 240, 45), cancelHours: num(p.cancelHours, 0, 72, 2), terms: str(p.terms, 1500) || core.DEFAULT_TERMS, reminder: str(p.reminder, 400) || core.DEFAULT_REMINDER, gifts: p.gifts !== false };
  Object.assign(s, vals); core.audit('configuracoes', 'estúdio atualizado');
  if (p.applyAll) { const r = core.applyStudioToClasses(null, vals.duration); return { msg: `${r.ok} aula(s) atualizada(s)`, warn: false }; }
  return { msg: 'Estúdio atualizado' };
});
def('payHandle', 'owner', (c, p) => {
  const h = String(p.handle || '').trim().replace(/^[$@]+/, ''); if (h && !/^[A-Za-z0-9_.-]{2,40}$/.test(h)) throw new Error('InfiniteTag inválida. Use só letras, números, ponto, traço ou _ (sem o $).');
  core.S().infinitepayHandle = h; core.audit('configuracoes', 'InfiniteTag ' + (h ? 'cadastrada' : 'removida')); return { msg: 'InfinitePay salva' };
});

/* ───────────── equipe (só a dona) ───────────── */
def('teamAdd', 'owner', (c, p) => {
  const db = core.db, email = String(p.email || '').trim().toLowerCase(); if (!auth.validEmail(email)) throw new Error('E-mail inválido');
  const ex = db.users.find(x => x.email === email);
  if (ex) { if (ex.role === 'owner') throw new Error('Esse e-mail é o da dona.'); if (ex.role === 'admin') throw new Error('Essa pessoa já é administradora.'); ex.role = 'admin'; core.audit('admin_concedido', ex.name); return { msg: `${ex.name} agora é administradora (usa a mesma senha dela).` }; }
  const name = str(p.name, 120); if (name.length < 2) throw new Error('Informe o nome');
  if (typeof p.password !== 'string' || p.password.length < 8 || p.password.length > 128) throw new Error('A senha temporária precisa ter de 8 a 128 caracteres');
  db.users.push({ id: uid(), name, email, phone: '', role: 'admin', pw: auth.hashPassword(p.password), emailVerified: true, credits: 0, blocked: false, createdAt: new Date().toISOString(), termsAt: new Date().toISOString() });
  core.audit('admin_concedido', name); return { msg: `Administradora criada. Passe o e-mail e a senha temporária para ${name}.` };
});
def('teamRemove', 'owner', (c, p) => {
  const u = core.usr(String(p.userId)); if (!u) throw new Error('Pessoa não encontrada'); if (u.role === 'owner') throw new Error('A dona não pode ser removida.'); if (u.role !== 'admin') throw new Error('Essa pessoa não é administradora.');
  u.role = 'client'; core.audit('admin_removido', u.name); return { msg: `${u.name} voltou a ser aluna.` };
});


/* ───────────── e-mails: preferências, confirmação, campanhas ───────────── */
def('emailPrefs', 'user', (c, p) => { c.user.mktOptIn = !!p.mkt; c.user.notifyEmail = !!p.notify; return { msg: 'Preferências salvas' }; });
def('resendVerify', 'user', (c) => {
  const u = c.user; if (!mailer.enabled()) throw new Error('O envio de e-mails ainda não está ativo.'); if (u.emailVerified !== false) throw new Error('Seu e-mail já está confirmado.');
  if (u.verifySentAt && Date.now() - u.verifySentAt < 60e3) throw new Error('Já enviamos há instantes. Aguarde 1 minuto e confira também o spam.');
  u.verifySentAt = Date.now(); sendVerify(u); return { msg: 'E-mail reenviado! Confira a caixa de entrada e o spam.' };
});
def('revealCpf', 'admin', (c, p) => {
  const u = core.usr(String(p.userId)); if (!u) throw new Error('Pessoa não encontrada'); if (!u.cpf) throw new Error('Essa pessoa não tem CPF cadastrado.');
  core.audit('cpf_visualizado', `${c.user.name} viu o CPF de ${u.name}`); return { cpf: core.fmtCpf(u.cpf) };
});
function audience(kind) {
  const db = core.db, now = Date.now();
  let list = db.users.filter(u => u.role === 'client' && u.email && u.mktOptIn && u.emailVerified !== false && !u.blocked);
  if (kind === 'withCredits') list = list.filter(u => u.credits > 0);
  else if (kind === 'noCredits') list = list.filter(u => u.credits < 1);
  else if (kind === 'expiring') list = list.filter(u => u.credits > 0 && u.expireAt && D(u.expireAt).getTime() > now && D(u.expireAt).getTime() < now + 7 * 864e5);
  else if (kind === 'inactive') list = list.filter(u => { const last = db.reservations.filter(r => r.userId === u.id && ['confirmed', 'attended'].includes(r.status) && core.cls(r.classId) && D(core.cls(r.classId).start) < new Date()).map(r => D(core.cls(r.classId).start).getTime()); return !last.length || now - Math.max(...last) > 21 * 864e5; });
  return list;
}
const AUDIENCES = ['all', 'withCredits', 'noCredits', 'inactive', 'expiring'];
def('campaignPreview', 'admin', (c, p) => ({ count: audience(AUDIENCES.includes(p.audience) ? p.audience : 'all').length }));
function campaignInput(p) {
  const subject = str(p.subject, 120), body = String(p.body || '').replace(/\r/g, '').trim().slice(0, 3000);
  if (subject.length < 3) throw new Error('Escreva o assunto do e-mail'); if (body.length < 10) throw new Error('Escreva a mensagem (mínimo 10 letras)');
  let url = str(p.buttonUrl, 300); if (url && url.startsWith('/')) url = mailer.baseUrl() + url; if (url && !/^https?:\/\//i.test(url)) throw new Error('O link do botão precisa começar com https://');
  return { subject, body, button: url ? { label: str(p.buttonLabel, 40) || 'Abrir o site', url } : null };
}
def('campaignTest', 'admin', (c, p) => {
  if (!mailer.enabled()) throw new Error('Falta ligar o envio de e-mails (veja o guia).'); const u = c.user; if (!u.email) throw new Error('Sua conta não tem e-mail.');
  const m = campaignInput(p); mailer.enqueuePromo(u, '[TESTE] ' + m.subject, core.fill(m.body, { nome: firstName(u.name) }), m.button, null); return { msg: `Teste enviado para ${u.email} (chega em instantes).` };
});
def('campaignSend', 'admin', (c, p) => {
  if (!mailer.enabled()) throw new Error('Falta ligar o envio de e-mails (veja o guia).');
  const m = campaignInput(p), kind = AUDIENCES.includes(p.audience) ? p.audience : 'all', list = audience(kind);
  if (!list.length) throw new Error('Nenhuma aluna está apta a receber (só recebe quem confirmou o e-mail e aceitou novidades).');
  const db = core.db; db.campaigns = db.campaigns || []; const camp = { id: uid(), subject: m.subject, body: m.body, audience: kind, createdAt: new Date().toISOString(), createdBy: c.user.name, total: list.length, sent: 0, failed: 0 };
  db.campaigns.push(camp); for (const u of list) mailer.enqueuePromo(u, m.subject, core.fill(m.body, { nome: firstName(u.name) }), m.button, camp.id);
  core.audit('campanha_enviada', `${m.subject} · ${list.length} aluna(s)`); const days = Math.ceil(list.length / (mailer.stats().limit || 250));
  return { msg: `Campanha na fila: ${list.length} e-mail(s)${days > 1 ? ` — o plano grátis envia ${mailer.stats().limit}/dia, então termina em ${days} dias` : ' — saem aos poucos, em alguns minutos'}.` };
});

module.exports = { A, isTeam, sendVerify, audience };
