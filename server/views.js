'use strict';
/** Monta o que cada pessoa pode ver. A aluna NUNCA recebe dados de outras alunas. */
const core = require('./core');
const { D, OCC } = core;

const userPub = u => ({ id: u.id, name: u.name, email: u.email || '', phone: u.phone || '', role: u.role || 'client', credits: u.credits || 0, expireAt: u.expireAt || null, blocked: !!u.blocked, emergency: u.emergency || '', termsAt: u.termsAt || null, createdAt: u.createdAt, obs: u.obs || '', walkin: !!u.walkin, hasAccess: !!u.pw, cpfMasked: u.cpf ? core.maskCpf(u.cpf) : '', hasCpf: !!u.cpf, emailVerified: u.emailVerified !== false, mktOptIn: !!u.mktOptIn, notifyEmail: u.notifyEmail !== false, google: !!u.googleSub });
const purPub = p => ({ id: p.id, userId: p.userId, kind: p.kind || 'package', classId: p.classId || null, bike: p.bike || null, pkgId: p.pkgId || null, amount: p.amount, credits: p.credits, status: p.status, billing: p.billing, createdAt: p.createdAt, paidAt: p.paidAt || null, note: p.note || '', expired: !!p.expired, needsAction: !!p.needsAction, checkoutUrl: p.status === 'pending' ? (p.checkoutUrl || '') : '', receiptUrl: p.receiptUrl || '', captureMethod: p.captureMethod || '' });

function settingsPub(s, admin) {
  const o = { name: s.name, about: s.about, address: s.address, whatsapp: s.whatsapp, instagram: s.instagram || '', maxBikes: s.maxBikes, duration: s.duration, cancelHours: s.cancelHours, instructor: s.instructor, terms: s.terms, gifts: s.gifts !== false };
  if (admin) { o.reminder = s.reminder; o.infinitepayHandle = s.infinitepayHandle || ''; }
  return o;
}

function stateFor(user, srv) {
  const db = core.db, now = new Date(), role = !user ? 'guest' : user.role === 'owner' ? 'owner' : user.role === 'admin' ? 'admin' : 'student';
  const server = { paymentsReady: !!srv.handle(), publicUrl: srv.publicUrl(), handleFromEnv: !!process.env.INFINITEPAY_HANDLE, ownerEmail: role === 'owner' ? (user.email || '') : '', emailEnabled: srv.mail.enabled(), googleClientId: process.env.GOOGLE_CLIENT_ID || '' };
  if (role === 'admin' || role === 'owner') server.mail = srv.mail.stats();
  const sess = user ? { role: role === 'student' ? 'student' : role, userId: user.id } : null;
  const out = { settings: settingsPub(db.settings, role === 'admin' || role === 'owner'), announcements: db.announcements.slice(0, 5) };

  if (role === 'admin' || role === 'owner') {
    Object.assign(out, {
      packages: db.packages, specials: db.specials, classes: db.classes, users: db.users.map(userPub), reservations: db.reservations, waitlist: db.waitlist,
      purchases: db.purchases.map(purPub), ledger: db.ledger.slice(-4000), notes: db.notes.filter(n => n.userId === user.id), subs: db.subs, audit: db.audit.slice(0, 120), campaigns: (db.campaigns || []).slice(-30).reverse()
    });
    return { sess, server, db: out };
  }
  // visitante ou aluna: só aulas futuras, com ocupação anônima
  const mineR = user ? db.reservations.filter(r => r.userId === user.id) : [], mineW = user ? db.waitlist.filter(w => w.userId === user.id) : [];
  const need = new Set([...mineR.map(r => r.classId), ...mineW.map(w => w.classId)]);
  const classes = db.classes.filter(c => c.active && (D(c.start).getTime() > now.getTime() - 2 * 36e5 || need.has(c.id)));
  const ids = new Set(classes.map(c => c.id));
  let n = 0;
  const others = db.reservations.filter(r => OCC.includes(r.status) && ids.has(r.classId) && (!user || r.userId !== user.id)).map(r => ({ id: 'o' + (n++), userId: '', classId: r.classId, bike: r.bike, status: 'confirmed', paidCredit: true }));
  const othersW = db.waitlist.filter(w => ids.has(w.classId) && (!user || w.userId !== user.id)).map((w, i) => ({ id: 'w' + i, userId: '', classId: w.classId, at: w.at, offerUntil: w.offerUntil || null }));
  Object.assign(out, {
    packages: db.packages.filter(p => p.active), specials: [], classes, users: user ? [userPub(user)] : [],
    reservations: [...mineR, ...others], waitlist: [...mineW, ...othersW],
    purchases: user ? db.purchases.filter(p => p.userId === user.id).sort((a, b) => D(b.createdAt) - D(a.createdAt)).slice(0, 30).map(purPub) : [],
    ledger: user ? db.ledger.filter(l => l.userId === user.id).slice(-200) : [], notes: user ? db.notes.filter(n => n.userId === user.id).slice(-30) : [],
    subs: user ? db.subs.filter(s => s.userId === user.id) : [], audit: [], campaigns: []
  });
  return { sess, server, db: out };
}
module.exports = { stateFor, userPub };
