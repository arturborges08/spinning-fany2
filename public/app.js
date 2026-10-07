'use strict';
/* GERADO por build.js */
/* ═══ código compartilhado (servidor e navegador) ═══ */
const DEFAULT_TERMS = 'Declaro que estou em condições de saúde para praticar atividade física e assumo a responsabilidade pela minha participação. Vou avisar a instrutora sobre qualquer lesão, gestação ou desconforto. Cancelamentos fora do prazo não devolvem o crédito.';
const DEFAULT_REMINDER = 'Oi {nome}! Lembrete da sua aula de spinning: {aula}, {quando}. Bike {bike}. Te esperamos! 🚴';
const OCC = ['confirmed', 'attended', 'no_show'];
let db = null;
const S = () => db.settings;
/* ── utilidades ── */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const num = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const digits = s => String(s ?? '').replace(/\D/g, '');
const brl = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((c || 0) / 100);
const reaisToCents = v => Math.round(parseFloat(String(v).replace(/\./g, '').replace(',', '.')) * 100) || 0;
const centsToReais = c => (c / 100).toFixed(2).replace('.', ',');
const D = v => (v instanceof Date ? v : new Date(v));
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const fWhen = v => cap1(new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(D(v)).replace('.', ''));
const fDay = v => cap1(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(D(v)));
const fTime = v => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(D(v));
const fDate = v => new Intl.DateTimeFormat('pt-BR').format(D(v));
const dayKey = v => { const d = D(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toLocalInput = v => { const d = D(v); return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const atHour = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
function isValidCpf(raw) {
  const c = digits(raw); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = len => { let s = 0; for (let i = 0; i < len; i++) s += Number(c[i]) * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}
function normPhone(raw) { let d = digits(raw); if (!d) return ''; if (d.length === 10 || d.length === 11) d = '55' + d; return d; }
const validPhone = raw => /^55\d{10,11}$/.test(normPhone(raw));
function fPhone(raw) { const d = digits(raw).replace(/^55(?=\d{10,11}$)/, ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return raw || ''; }
const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const cls = id => db.classes.find(c => c.id === id);
const usr = id => db.users.find(u => u.id === id);
const pkg = id => db.packages.find(p => p.id === id);
const occ = cid => db.reservations.filter(r => r.classId === cid && OCC.includes(r.status));
const isFuture = c => D(c.start) > new Date();
const shortName = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || '?'; };
const HOLD_MIN = 20;                                  // minutos que a bike fica segurada esperando o PIX
const isHeld = r => !!(r && r.holdUntil && r.status === 'confirmed');
function defaultSpecial() { return { id: 'sp-havai', name: 'Aula Temática Havai', price: 3500, theme: 'havai', maxBikes: 8, duration: 90, desc: 'Aloha! Aula temática com música tropical e muito astral. Compra direta: não usa crédito.', active: true }; }
const purName = pu => pu.kind === 'event' ? (cls(pu.classId) ? cls(pu.classId).title : 'Aula avulsa') : (pkg(pu.pkgId) ? pkg(pu.pkgId).name : '—');
const maskCpf = c => { const d = digits(c); return d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : ''; };
const fmtCpf = c => { const d = digits(c); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : ''; };
/** Vagas oferecidas a quem estava na fila de espera (seguradas por alguns minutos até ela confirmar). */
const activeOffers = (classId, exceptUserId) => (db.waitlist || []).filter(w => w.classId === classId && w.offerUntil && D(w.offerUntil).getTime() > Date.now() && w.userId !== exceptUserId);
const offerOf = (classId, userId) => (db.waitlist || []).find(w => w.classId === classId && w.userId === userId && w.offerUntil && D(w.offerUntil).getTime() > Date.now()) || null;
const seatsLeft = (c, userId) => c.maxBikes - occ(c.id).length - activeOffers(c.id, userId).length;


/* ═══════════ interface ═══════════ */
const ui = { authMode: 'login', authKeep: {},  stab: 'agenda', atab: 'checkin', modal: null, q: '', cq: '', filter: 'todas', openStudent: null, openRoster: null, days: 30, editClass: null, fns: [], hojeOff: 0, hojeClass: null, moving: null };
const IC = {
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  wallet: '<path d="M3 7h16a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M3 7l2-3h12"/><circle cx="17" cy="13" r="1"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'
};
const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const WHEEL = '<svg class="wheel" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2.2"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M16 4.5V11M16 21v6.5M4.5 16H11M21 16h6.5"/></g><circle cx="16" cy="16" r="3.2" fill="currentColor"/></svg>';
const WAICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 00-7.7 13.6L3 21l4.5-1.2A9 9 0 1012 3zm4.4 12.2c-.2.5-1.1 1-1.5 1-.4.1-.9.1-1.5-.1-.4-.1-.8-.3-1.4-.5-2.5-1.1-4.1-3.6-4.3-3.8-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4l.7 1.7c.1.1.1.3 0 .4l-.3.5-.4.4c-.1.1-.3.3-.1.5.1.3.6 1 1.3 1.6.9.8 1.6 1 1.9 1.1.2.1.4.1.5-.1l.7-.9c.2-.2.3-.2.6-.1l1.6.8c.2.1.4.2.4.3.1.1.1.6-.1 1.1z"/></svg>';
const evTheme = c => (c && c.event ? (c.event.theme === 'havai' ? 'hw' : 'evg') : '');
const evEmoji = c => (c && c.event && c.event.theme === 'havai' ? '🌺' : '⭐');
const holdMin = r => Math.max(1, Math.ceil((D(r.holdUntil) - Date.now()) / 6e4));
function eventItem(c, u) {
  const r = db.reservations.find(x => x.userId === u.id && x.classId === c.id && x.status === 'confirmed');
  const held = isHeld(r), n = occ(c.id).length, full = n >= c.maxBikes, left = c.maxBikes - n, th = evTheme(c), em = evEmoji(c);
  let btn, status, cls_ = 'ok';
  if (r && held) { status = `⏳ Aguardando pagamento · bike ${r.bike} · expira em ${holdMin(r)} min`; cls_ = 'warn'; btn = `<div class="row" style="gap:6px"><button class="btn-hw btn-sm" data-act="resume" data-id="${r.pay}">Pagar agora</button><button class="btn-line btn-sm" data-act="cancel" data-id="${r.id}">Cancelar</button></div>`; }
  else if (r) { status = `✔ Vaga garantida · bike ${r.bike}`; btn = `<div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="change" data-id="${c.id}">Trocar bike</button><a class="btn-line btn-sm" target="_blank" rel="noopener" href="${waLink(S().whatsapp, `Oi! Preciso cancelar/alterar minha vaga na ${c.title} (${fWhen(c.start)}).`)}">Falar com a Fany</a></div>`; }
  else if (full) { status = 'Esgotada'; cls_ = 'bad'; btn = '<button class="btn-line btn-sm" disabled>Esgotada</button>'; }
  else { status = `${left} de ${c.maxBikes} bikes livres`; btn = `<button class="btn-hw" data-act="pick" data-id="${c.id}">${em} Garantir minha vaga · ${brl(c.event.price)}</button>`; }
  return `<article class="item ${th} ${r ? 'mine' : ''}" data-class="${c.id}"><div><p class="ev-tag">${em} AULA ESPECIAL · pagamento direto, sem usar crédito</p><p style="font:700 1.1rem var(--display)"><span class="${th === 'hw' ? 'hw-time' : 'gold'}">${fTime(c.start)}</span> · ${esc(c.title)}</p><p class="muted sm">${fDay(c.start)} · ${c.duration} min · ${esc(c.instructor)}</p><p class="sm ${cls_}">${status}</p>${c.notes ? `<p class="muted xs">${esc(c.notes)}</p>` : ''}</div><div class="ev-side"><span class="ev-price">${brl(c.event.price)}</span>${btn}</div></article>`;
}
function eventCardHome(c) {
  const left = c.maxBikes - occ(c.id).length, th = evTheme(c);
  return `<article class="cls ${th}"><span class="ev-tag">${evEmoji(c)} AULA ESPECIAL</span><span class="cap" style="font:700 1.05rem var(--display)">${esc(fDay(c.start))}</span><span class="t">${fTime(c.start)}</span><span class="muted sm">${c.duration} min · ${esc(c.instructor)}</span><span class="ev-price">${brl(c.event.price)}</span><span class="sm ${left <= 0 ? 'bad' : left <= 3 ? 'warn' : 'ok'}">${left <= 0 ? 'Esgotada' : left <= 3 ? `Últimas ${left} bikes!` : `${left} bikes livres`}</span><button class="btn-hw" data-act="enter" data-cid="${left > 0 ? c.id : ''}" ${left <= 0 ? 'disabled' : ''}>${evEmoji(c)} Garantir minha vaga</button></article>`;
}
const me = () => (sess && sess.userId ? usr(sess.userId) : null);
const isAdmin = () => !!sess && (sess.role === 'admin' || sess.role === 'owner');
const isOwner = () => !!sess && sess.role === 'owner';

function toast(msg, kind = 'ok') {
  const el = document.createElement('div'); el.className = 'toast ' + (kind === 'err' ? 'err' : 'ok'); el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), kind === 'err' ? 5200 : 3200);
}
const go = p => { location.hash = '#/' + p; };
const route = () => (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
function dialog(d) { ui.fns = (d.buttons || []).map(b => b.fn); ui.modal = { type: 'dialog', title: d.title, body: d.body || '', input: d.input || null, buttons: (d.buttons || []).map(b => ({ label: b.label, kind: b.kind || 'btn' })) }; renderModal(); }
const confirmBox = (title, body, okLabel, fn, danger) => dialog({ title, body, buttons: [{ label: 'Voltar', kind: 'btn-line', fn: () => { } }, { label: okLabel, kind: danger ? 'btn-bad' : 'btn', fn }] });

/* ── cabeçalho ── */
function topbar() {
  const s = S(); const logged = !!sess;
  return `<header class="top"><div class="wrap">
    <a class="brand" href="#/" aria-label="Início">${WHEEL}<span><small>ESTÚDIO</small><b>${esc(s.name.toUpperCase())}</b></span></a>
    <nav class="nav"><a href="#/" data-act="to" data-to="aulas">Aulas</a><a href="#/" data-act="to" data-to="pacotes">Pacotes</a><a href="#/" data-act="to" data-to="estudio">O estúdio</a></nav>
    <div class="row" style="gap:6px">
      ${logged ? `${['conta', 'painel'].includes(route()) ? '' : `<a class="btn-ghost btn-sm" href="#/${isAdmin() ? 'painel' : 'conta'}" style="text-decoration:none">${isAdmin() ? 'Painel' : 'Minha conta'}</a>`}<button class="btn-line btn-sm" data-act="logout">Sair</button>` : `<a class="btn btn-sm" href="#/entrar">Entrar</a>`}
    </div></div></header>`;
}

/* ── página inicial ── */
function viewHome() {
  const s = S(); const now = new Date();
  const classes = db.classes.filter(c => c.active && !c.event && D(c.start) > now).sort((a, b) => D(a.start) - D(b.start)).slice(0, 8);
  const events = db.classes.filter(c => c.active && c.event && D(c.start) > now).sort((a, b) => D(a.start) - D(b.start)).slice(0, 4);
  const pk = db.packages.filter(p => p.active).sort((a, b) => a.sort - b.sort);
  const ann = db.announcements[0];
  const steps = [['shield', 'Crie sua conta', 'Nome, e-mail e WhatsApp. Leva menos de um minuto.'], ['wallet', 'Pague com Pix ou cartão', 'Checkout seguro da InfinitePay. Pagou, o crédito cai sozinho na sua conta.'], ['cal', 'Escolha sua bike', 'Veja o mapa da sala e reserve a sua. Se lotar, entre na lista de espera.'], ['bolt', 'Pedale', 'Chegue, faça check-in com a Fany e transforme o treino em rotina.']];
  const faq = [['Como recebo meus créditos?', 'Assim que o pagamento (Pix ou cartão) é confirmado, os créditos entram sozinhos na sua conta — normalmente em segundos.'], ['Posso cancelar uma aula?', `Pode, até ${s.cancelHours}h antes. Cancelando a tempo, o crédito volta para você.`], ['E se a aula estiver lotada?', 'Entre na lista de espera. Se alguém cancelar, você sobe automaticamente.'], ['O que levar?', 'Toalha, água e tênis ou sapatilha. As bikes são ajustadas antes da aula.']];
  return `${topbar()}
  <section class="hero"><div class="mark" aria-hidden="true">SPINNING<br>FANY</div><div class="wrap">
    <h1>Pedale.<br>Supere.<br><em>Transforme-se.</em></h1>
    <p class="lead">${esc(s.about)}</p>
    <div class="row" style="margin-top:28px"><button class="btn" data-act="enter" style="min-height:52px;padding:0 28px">Começar agora</button><a class="btn-ghost" href="#/" data-act="to" data-to="pacotes" style="min-height:52px;padding:0 24px">Ver pacotes</a></div>
    <div class="stats"><div><b>${s.maxBikes}</b><span class="muted">Bikes</span></div><div><b>${s.duration} min</b><span class="muted">Por aula</span></div><div><b>${esc(s.instructor)}</b><span class="muted">Instrutora</span></div></div>
  </div></section>
  ${ann ? `<div class="banner" style="font-size:.9rem"><b class="gold">${esc(ann.title)}</b> — ${esc(ann.body)}</div>` : ''}
  ${events.length ? `<section class="sec" id="especial"><div class="wrap"><div class="hw-banner ${evTheme(events[0])}"><p class="eyebrow">${evEmoji(events[0])} AULA ESPECIAL</p><h2>${esc(events[0].title)}</h2><p class="muted" style="margin-top:8px;max-width:38rem">${esc(events[0].notes || '')}</p><p class="sm" style="margin-top:8px"><b>${brl(events[0].event.price)}</b> · ${events[0].duration} minutos · você paga direto (Pix ou cartão) e já garante a bike — <b>não usa créditos</b>.</p></div><div class="grid g3" style="margin-top:18px">${events.map(eventCardHome).join('')}</div></div></section>` : ''}
  <section class="sec" id="aulas"><div class="wrap">
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:22px"><div><h2>Próximas aulas</h2></div><button class="linkbtn" data-act="enter">Reservar bike</button></div>
    <div class="grid g4">${classes.map(c => { const left = seatsLeft(c, sess ? sess.userId : ''); return `<button class="cls" data-act="enter" data-cid="${left > 0 ? c.id : ''}" style="color:inherit;font:inherit;cursor:pointer"><span class="gold sm">${esc(c.title)}</span><span class="cap" style="font:700 1.05rem var(--display)">${esc(fDay(c.start))}</span><span class="t">${fTime(c.start)}</span><span class="muted sm">${c.duration} min · ${esc(c.instructor)}</span><span class="sm ${left <= 0 ? 'bad' : left <= 3 ? 'warn' : 'ok'}">${left <= 0 ? 'Lotada · lista de espera' : left <= 3 ? `Últimas ${left} bikes` : `${left} bikes livres`}</span></button>`; }).join('') || '<div class="empty" style="grid-column:1/-1">Ainda não há aulas publicadas. Chame a Fany no WhatsApp.</div>'}</div>
  </div></section>
  <section class="sec alt" id="pacotes"><div class="wrap"><h2>Pacotes e mensalidade</h2><p class="sub">Pague com Pix ou cartão e use os créditos para reservar suas aulas.</p>
    <div class="grid g3" style="margin-top:26px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${pk.map(p => `<article class="pkg ${p.highlight ? 'hl' : ''}"><span class="muted xs">${p.kind === 'subscription' ? 'Mensal' : 'Pacote'}</span><h3 style="font-size:1.2rem">${esc(p.name)}</h3><div class="price">${brl(p.price)}</div><p class="muted sm">${p.credits} ${p.credits === 1 ? 'crédito' : 'créditos'}${p.desc ? ' · ' + esc(p.desc) : ''}</p>${p.credits > 1 ? `<p class="muted xs">${brl(Math.round(p.price / p.credits))} por aula</p>` : ''}${p.validity ? `<p class="muted xs">Válido por ${p.validity} dias</p>` : ''}<button class="btn" style="margin-top:14px" data-act="enter">Comprar</button></article>`).join('')}</div></div></section>
  <section class="sec"><div class="wrap"><h2>Do pagamento à bike, sem burocracia</h2>
    <div class="grid g4" style="margin-top:24px">${steps.map(([i, t, d]) => `<div class="step">${icon(i)}<h3>${t}</h3><p class="muted sm">${d}</p></div>`).join('')}</div></div></section>
  <section class="sec alt" id="estudio"><div class="wrap grid g2" style="gap:40px">
    <div><h2>A casa da Fany em Artiville</h2><p class="muted" style="margin-top:14px">${esc(s.about)}</p>
      <p style="margin-top:20px">📍 ${esc(s.address)}</p><p class="muted sm" style="margin-top:6px">${s.maxBikes} bikes · ${s.duration} min · cancelamento até ${s.cancelHours}h antes</p>
      <a class="btn" style="margin-top:22px" href="${waLink(s.whatsapp, 'Oi! Vim pelo site do Spinning Fany.')}" target="_blank" rel="noopener">Chamar no WhatsApp</a></div>
    <div><h3 class="gold" style="font-size:1.4rem;margin-bottom:14px">Dúvidas frequentes</h3><div class="stack">${faq.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
      <p class="muted sm" style="margin-top:18px">Já é aluna? <a class="gold" href="#/entrar">Entrar na minha conta</a></p></div>
  </div></section>
  <footer class="foot"><p class="gold" style="font:700 1rem var(--display)">${esc(s.name.toUpperCase())}</p><p>${esc(s.address)}</p>${s.instagram ? `<p><a href="https://instagram.com/${esc(s.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener">@${esc(s.instagram.replace(/^@/, ''))}</a></p>` : ''}</footer>
  <a class="wa btn" href="${waLink(s.whatsapp, 'Oi! Vim pelo site do Spinning Fany.')}" target="_blank" rel="noopener" aria-label="Chamar no WhatsApp">${WAICON}</a>`;
}

/* ── entrar ── */
function viewLogin() {
  const m = ui.authMode, k = ui.authKeep || {};
  const titles = { login: 'Entrar', signup: 'Criar conta', forgot: 'Esqueci a senha', gcomplete: 'Quase lá!' };
  const sub = { login: 'Entre com seu e-mail (ou CPF) e a senha.', signup: 'Leva menos de um minuto. Depois é só comprar seus créditos e reservar sua bike.', forgot: 'Digite seu e-mail e enviaremos um link para criar uma senha nova.', gcomplete: `Olá, ${esc((ui.gpending && ui.gpending.name) || '')}! Falta só o CPF e o WhatsApp para terminar.` };
  const terms = `<div class="mono" style="font-family:var(--body);font-size:.78rem;color:var(--muted);max-height:110px">${esc(S().terms)}</div><label class="row sm" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" name="terms" required style="margin-top:4px"> <span>Li e aceito o termo de responsabilidade.</span></label><label class="row sm" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" name="mkt" style="margin-top:4px"> <span>Quero receber novidades e promoções do estúdio por e-mail <span class="muted">(opcional — você cancela quando quiser)</span>.</span></label>`;
  const cpfPhone = `<div><label class="lbl" for="sc">CPF</label><input id="sc" class="field" name="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14" data-mask="cpf" required value="${esc(k.cpf || '')}"></div>
    <div><label class="lbl" for="sp">WhatsApp com DDD</label><input id="sp" class="field" name="phone" inputmode="tel" autocomplete="tel" placeholder="(18) 99667-6637" required value="${esc(k.phone || '')}"></div>`;
  let form;
  if (m === 'signup') form = `<form data-form="signup" class="stack">
    <div><label class="lbl" for="sn">Nome completo</label><input id="sn" class="field" name="name" autocomplete="name" required maxlength="120" value="${esc(k.name || '')}"></div>
    <div><label class="lbl" for="se">E-mail</label><input id="se" class="field" type="email" name="email" autocomplete="email" inputmode="email" required value="${esc(k.email || '')}"></div>${cpfPhone}
    <div><label class="lbl" for="ss">Senha (mínimo 8 caracteres)</label><input id="ss" class="field" type="password" name="password" autocomplete="new-password" minlength="8" required></div>${terms}
    <button class="btn btn-block" type="submit">Criar minha conta</button>${server.emailEnabled ? '<p class="muted xs">Vamos enviar um e-mail para você confirmar o endereço.</p>' : ''}</form>`;
  else if (m === 'forgot') form = server.emailEnabled ? `<form data-form="forgot" class="stack"><div><label class="lbl" for="fe">E-mail da sua conta</label><input id="fe" class="field" type="email" name="email" required autocomplete="email" value="${esc(k.email || '')}"></div><button class="btn btn-block" type="submit">Enviar link</button><button class="linkbtn xs" type="button" data-act="authmode" data-m="login">Voltar para entrar</button></form>` : `<p class="muted">A recuperação por e-mail ainda não está ativa. <a class="gold" target="_blank" rel="noopener" href="${waLink(S().whatsapp, 'Oi! Esqueci minha senha do site do Spinning Fany.')}">Chame a Fany no WhatsApp</a> para criar uma senha nova.</p><button class="linkbtn xs" type="button" data-act="authmode" data-m="login" style="margin-top:12px">Voltar para entrar</button>`;
  else if (m === 'gcomplete') form = `<form data-form="gcomplete" class="stack"><p class="muted sm">Conta Google: <b>${esc((ui.gpending && ui.gpending.email) || '')}</b></p>${cpfPhone}${terms}<button class="btn btn-block" type="submit">Terminar cadastro</button></form>`;
  else form = `<form data-form="login" class="stack">
    <div><label class="lbl" for="le">E-mail ou CPF</label><input id="le" class="field" name="email" autocomplete="username" required value="${esc(k.email || '')}"></div>
    <div><label class="lbl" for="lp">Senha</label><input id="lp" class="field" type="password" name="password" autocomplete="current-password" required></div>
    <button class="btn btn-block" type="submit">Entrar</button><button class="linkbtn xs" type="button" data-act="authmode" data-m="forgot">Esqueci a senha</button></form>`;
  const google = server.googleClientId && (m === 'login' || m === 'signup') ? '<div id="gbtn" class="gwrap"></div><p class="muted xs" style="text-align:center;margin:10px 0">ou use seu e-mail</p>' : '';
  return `${topbar()}<main class="wrap" style="max-width:480px;padding-top:34px;padding-bottom:70px">
  <h1 style="font-size:2rem">${titles[m] || 'Entrar'}</h1><p class="muted" style="margin:8px 0 20px">${sub[m] || ''}</p>
  ${m === 'login' || m === 'signup' ? `<div class="row" style="margin-bottom:14px"><button class="tab ${m === 'signup' ? '' : 'on'}" data-act="authmode" data-m="login">Já tenho conta</button><button class="tab ${m === 'signup' ? 'on' : ''}" data-act="authmode" data-m="signup">Criar conta</button></div>` : ''}
  <div class="card">${google}${form}</div></main>`;
}
function viewReset() {
  const t = (location.hash.split('t=')[1] || '').split('&')[0];
  return `${topbar()}<main class="wrap" style="max-width:480px;padding-top:34px;padding-bottom:70px"><h1 style="font-size:2rem">Senha nova</h1><p class="muted" style="margin:8px 0 20px">Escolha uma senha nova para a sua conta.</p>
  <div class="card"><form data-form="reset" class="stack" data-token="${esc(t)}"><div><label class="lbl" for="rp">Senha nova (mínimo 8 caracteres)</label><input id="rp" class="field" type="password" name="password" autocomplete="new-password" minlength="8" required></div><button class="btn btn-block" type="submit">Salvar senha nova</button></form></div></main>`;
}

/* ── área da aluna ── */
/** Mini sala: a bike da aluna em destaque, as outras ocupadas e as livres. */
function miniRoom(c, myBike) {
  const n = c.maxBikes, cols = n <= 20 ? 4 : n <= 42 ? 6 : 8, L = cols / 2, rows = Math.ceil(n / cols), taken = new Set(occ(c.id).map(r => r.bike)); let cells = '';
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    if (k === L) cells += '<span></span>'; const i = r * cols + k + 1; if (i > n) { cells += '<span></span>'; continue; }
    cells += `<span class="mb ${i === myBike ? 'me' : taken.has(i) ? 'occ' : ''}" title="Bike ${i}">${i === myBike ? '🚴 ' : ''}${i}</span>`;
  }
  return `<div class="mini"><div class="stage" style="font-size:.6rem;margin-top:0">${esc(c.instructor)} · frente</div><div class="mgrid" style="grid-template-columns:repeat(${L},1fr) 14px repeat(${cols - L},1fr)">${cells}</div></div>`;
}
function verifyBanner(u) {
  if (!server.emailEnabled || u.emailVerified !== false || u.role !== 'client') return '';
  return `<div class="card hl" style="margin-bottom:14px"><p><b class="gold">Confirme seu e-mail</b> para reservar e comprar.</p><p class="muted sm" style="margin:6px 0 12px">Enviamos uma mensagem para <b>${esc(u.email)}</b>. Toque no botão dentro dela (olhe também o spam).</p><button class="btn btn-sm" data-act="resendverify">Reenviar e-mail</button></div>`;
}
/** Vagas liberadas para quem estava na fila: precisa confirmar antes do prazo. */
function offersBanner(u) {
  const mine = db.waitlist.filter(w => w.userId === u.id && w.offerUntil && D(w.offerUntil) > new Date());
  return mine.map(w => { const c = cls(w.classId); if (!c) return ''; return `<div class="card hl" style="margin-bottom:14px;border-color:var(--ok)"><p><b class="ok">🎉 Vaga liberada!</b> ${esc(c.title)} · ${esc(fWhen(c.start))}</p><p class="muted sm" style="margin:6px 0 12px">Confirme até as <b>${fTime(w.offerUntil)}</b> escolhendo sua bike. Depois disso a vaga passa para a próxima da fila.</p><div class="row"><button class="btn btn-sm" data-act="pick" data-id="${c.id}">Confirmar e escolher bike</button><button class="btn-line btn-sm" data-act="declineoffer" data-id="${c.id}">Não vou</button></div></div>`; }).join('');
}
/** "Sua próxima aula": a bike que a aluna vai usar, sempre à vista no painel dela. */
function nextBooking(u) {
  const now = new Date();
  const r = db.reservations.filter(x => x.userId === u.id && x.status === 'confirmed' && !x.holdUntil && cls(x.classId) && cls(x.classId).active && D(cls(x.classId).start) > addDays(now, 0) - 36e5).sort((a, b) => D(cls(a.classId).start) - D(cls(b.classId).start))[0];
  if (!r) return '';
  const c = cls(r.classId), th = evTheme(c);
  return `<div class="card nextc ${th === 'hw' ? 'hw' : ''}" style="margin-bottom:16px"><div class="row" style="justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:14px"><div style="min-width:0"><p class="muted xs">SUA PRÓXIMA AULA</p><p style="font:700 1.15rem var(--display);margin:2px 0">${c.event ? evEmoji(c) + ' ' : ''}${esc(c.title)}</p><p class="muted sm">${esc(fWhen(c.start))} · ${c.duration} min</p><div class="row" style="margin-top:10px;gap:6px"><button class="btn-line btn-sm" data-act="change" data-id="${c.id}">Trocar bike</button></div></div><div style="text-align:center;flex:none"><p class="muted xs">SUA BIKE</p><p class="bignum">${r.bike}</p></div></div>${miniRoom(c, r.bike)}</div>`;
}
function viewStudent() {
  const u = me(); const s = S(); const now = new Date();
  const notes = myNotes(u.id);
  const tabs = [['agenda', 'Agenda'], ['minhas', 'Minhas aulas'], ['comprar', 'Comprar'], ...(S().gifts === false ? [] : [['presente', 'Presentear 🎁']]), ['conta', 'Conta']];
  const days = u.credits > 0 && u.expireAt ? Math.ceil((D(u.expireAt) - now) / 864e5) : null;
  const attended = db.reservations.filter(r => r.userId === u.id && r.status === 'attended').length;
  let body = '';
  if (ui.stab === 'agenda') body = studentAgenda(u);
  else if (ui.stab === 'minhas') body = studentMine(u);
  else if (ui.stab === 'comprar') body = studentBuy(u);
  else if (ui.stab === 'presente' && S().gifts !== false) body = studentGift(u);
  else body = studentAccount(u);
  return `${topbar()}<main class="wrap" style="padding-top:22px;padding-bottom:90px">
  <div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:18px"><div><p class="gold sm">Olá, ${esc(u.name.split(' ')[0])}</p><h1 style="font-size:1.9rem">Sua bike, seus créditos</h1>${attended ? `<p class="muted sm" style="margin-top:4px">${attended} ${attended === 1 ? 'aula feita' : 'aulas feitas'} 💪</p>` : ''}</div>
    <div class="chip"><div><small class="muted xs">Créditos</small><br><b class="tab-num">${u.credits}</b>${days !== null && days <= 14 ? `<br><span class="warn xs">vencem em ${Math.max(days, 0)} dia(s)</span>` : ''}</div></div></div>
  ${notes.length ? `<div class="card hl" style="margin-bottom:14px"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><div class="stack sm">${notes.map(n => `<p>🔔 <b>${esc(n.title)}</b> <span class="muted">— ${esc(n.body)}</span></p>`).join('')}</div><button class="linkbtn xs" style="flex:none" data-act="readnotes">Ok, entendi</button></div></div>` : ''}
  ${u.blocked ? '<div class="card bad" style="margin-bottom:14px;border-color:var(--bad)">Sua conta está bloqueada. Fale com o estúdio no WhatsApp.</div>' : ''}
  ${verifyBanner(u)}${offersBanner(u)}${nextBooking(u)}
  <div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button class="tab ${ui.stab === id ? 'on' : ''}" role="tab" data-act="stab" data-t="${id}">${l}</button>`).join('')}</div>
  ${body}</main>`;
}
function studentAgenda(u) {
  const now = new Date();
  const list = db.classes.filter(c => c.active && D(c.start) > now).sort((a, b) => D(a.start) - D(b.start)).slice(0, 80);
  if (!list.length) return '<div class="empty">Nenhuma aula publicada ainda. Volte em breve!</div>';
  const groups = new Map(); for (const c of list) { const k = dayKey(c.start); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const warn = u.credits < 1 ? '<div class="card hl sm" style="margin-bottom:6px">Você está sem créditos. <button class="linkbtn" data-act="stab" data-t="comprar">Compre um pacote</button> para reservar.</div>' : '';
  return warn + [...groups.values()].map(rows => `<h2 class="day">${esc(fDay(rows[0].start))}</h2>` + rows.map(c => {
    if (c.event) return eventItem(c, u);
    const mine = db.reservations.find(r => r.userId === u.id && r.classId === c.id && r.status === 'confirmed');
    const wl = db.waitlist.find(w => w.userId === u.id && w.classId === c.id);
    const myOffer = offerOf(c.id, u.id), left = seatsLeft(c, u.id), full = left <= 0 && !myOffer && !mine;
    const pos = wl ? db.waitlist.filter(w => w.classId === c.id && D(w.at) <= D(wl.at)).length : 0;
    let btn;
    if (mine) btn = `<div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="change" data-id="${c.id}">Trocar bike</button><button class="btn-bad btn-sm" data-act="cancel" data-id="${mine.id}">Cancelar</button></div>`;
    else if (myOffer) btn = `<div class="row" style="gap:6px"><button class="btn btn-sm" data-act="pick" data-id="${c.id}">🎉 Confirmar vaga</button><button class="btn-line btn-sm" data-act="declineoffer" data-id="${c.id}">Não vou</button></div>`;
    else if (wl) btn = `<button class="btn-line btn-sm" data-act="leavewait" data-id="${c.id}">Sair da espera</button>`;
    else if (full) btn = `<button class="btn-ghost btn-sm" data-act="wait" data-id="${c.id}">Lista de espera</button>`;
    else btn = `<button class="btn btn-sm" data-act="pick" data-id="${c.id}">Escolher bike</button>`;
    return `<article class="item ${mine || myOffer ? 'mine' : ''}" data-class="${c.id}"><div><p style="font:700 1.05rem var(--display)"><span class="gold">${fTime(c.start)}</span> · ${esc(c.title)}</p><p class="muted sm">${c.duration} min · ${esc(c.instructor)} · ${esc(c.level)}</p>
      <p class="sm ${myOffer ? 'ok' : full && !mine ? 'bad' : 'ok'}">${mine ? `✔ Reservada · bike ${mine.bike}` : myOffer ? `🎉 Vaga liberada para você! Confirme até ${fTime(myOffer.offerUntil)}` : full ? 'Lotada' : `${left} de ${c.maxBikes} bikes livres`}${wl && !myOffer ? ` · você é a ${pos}ª na fila` : ''}</p>${c.notes ? `<p class="muted xs">${esc(c.notes)}</p>` : ''}</div>${btn}</article>`;
  }).join('')).join('');
}
function studentMine(u) {
  const now = new Date();
  const up = db.reservations.filter(r => r.userId === u.id && r.status === 'confirmed' && cls(r.classId) && cls(r.classId).active && D(cls(r.classId).start) > addDays(now, 0) - 36e5).sort((a, b) => D(cls(a.classId).start) - D(cls(b.classId).start));
  const wl = db.waitlist.filter(w => w.userId === u.id && cls(w.classId) && cls(w.classId).active && isFuture(cls(w.classId)));
  const hist = db.reservations.filter(r => r.userId === u.id && ['attended', 'no_show'].includes(r.status) && cls(r.classId)).sort((a, b) => D(cls(b.classId).start) - D(cls(a.classId).start)).slice(0, 12);
  return `<h2 class="day" style="margin-top:6px">Próximas</h2>${up.map(r => { const c = cls(r.classId); if (c.event) return eventItem(c, u); const ok = (D(c.start) - now) / 36e5 >= S().cancelHours; return `<article class="item"><div><p style="font:700 1.05rem var(--display)">${esc(c.title)}</p><p class="muted sm cap">${esc(fWhen(c.start))} · ${esc(c.instructor)}</p><p class="gold" style="font:700 1.3rem var(--display)">Bike ${r.bike}</p>${miniRoom(c, r.bike)}</div>${ok ? `<div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="change" data-id="${c.id}">Trocar bike</button><button class="btn-line btn-sm" data-act="cancel" data-id="${r.id}">Cancelar (devolve 1 crédito)</button></div>` : `<a class="btn-line btn-sm" target="_blank" rel="noopener" href="${waLink(S().whatsapp, `Oi! Preciso falar sobre minha aula de ${c.title} (${fWhen(c.start)}).`)}">Prazo de cancelamento passou</a>`}</article>`; }).join('') || '<div class="empty">Você ainda não tem aulas reservadas.</div>'}
  ${wl.length ? `<h2 class="day">Lista de espera</h2>${wl.map(w => { const c = cls(w.classId); const pos = db.waitlist.filter(x => x.classId === c.id && D(x.at) <= D(w.at)).length; return `<article class="item"><div><p>${esc(c.title)}</p><p class="muted sm cap">${esc(fWhen(c.start))} · ${w.offerUntil && D(w.offerUntil) > new Date() ? '🎉 vaga liberada — confirme até ' + fTime(w.offerUntil) : 'você é a ' + pos + 'ª na fila'}</p></div><button class="linkbtn bad" data-act="leavewait" data-id="${c.id}">Sair</button></article>`; }).join('')}` : ''}
  ${hist.length ? `<h2 class="day">Histórico</h2>${hist.map(r => { const c = cls(r.classId); return `<article class="item"><span>${esc(c.title)} <span class="muted">· ${esc(fWhen(c.start))}</span></span><span class="${r.status === 'attended' ? 'ok' : 'bad'}">${r.status === 'attended' ? 'Presente' : 'Faltou'}</span></article>`; }).join('')}` : ''}`;
}
function studentBuy(u) {
  const pk = db.packages.filter(p => p.active).sort((a, b) => a.sort - b.sort);
  const subs = db.subs.filter(s => s.userId === u.id);
  const activeSub = new Set(subs.filter(s => s.status === 'active').map(s => s.pkgId));
  const pend = db.purchases.filter(p => p.userId === u.id).sort((a, b) => D(b.createdAt) - D(a.createdAt)).slice(0, 12);
  const led = db.ledger.filter(l => l.userId === u.id).sort((a, b) => D(b.at) - D(a.at)).slice(0, 30);
  return `${!server.paymentsReady ? '<div class="card hl sm" style="margin-bottom:14px">O pagamento online está sendo ativado. Enquanto isso, chame o estúdio no WhatsApp para comprar.</div>' : '<p class="muted sm" style="margin-bottom:12px">Você paga com <b>Pix</b> ou <b>cartão</b> no checkout seguro da InfinitePay. Pagou, os créditos caem na hora.</p>'}
  <div class="grid g3">${pk.map(p => `<article class="pkg"><span class="muted xs">${p.kind === 'subscription' ? 'Renova todo mês' : 'Pacote'}</span><h3 style="font-size:1.2rem">${esc(p.name)}</h3><div class="price">${brl(p.price)}</div><p class="muted sm">${p.credits} ${p.credits === 1 ? 'crédito' : 'créditos'}${p.desc ? ' · ' + esc(p.desc) : ''}</p>${p.validity ? `<p class="muted xs">Válido por ${p.validity} dias</p>` : ''}<button class="btn" style="margin-top:12px" data-act="buy" data-id="${p.id}" ${activeSub.has(p.id) || !server.paymentsReady ? 'disabled' : ''}>${activeSub.has(p.id) ? 'Mensalidade ativa' : 'Comprar'}</button></article>`).join('')}</div>
  ${subs.length ? `<h2 class="day">Mensalidade</h2>${subs.map(s => `<article class="item"><div><p>${esc(pkg(s.pkgId) ? pkg(s.pkgId).name : 'Mensalidade')} · ${s.status === 'active' ? 'ativa' : 'cancelada'}</p><p class="muted sm">${s.credits} créditos por mês. Todo mês a Fany te envia o link para renovar.</p></div>${s.status === 'active' ? `<button class="linkbtn bad" data-act="subcancel" data-id="${s.id}">Cancelar</button>` : ''}</article>`).join('')}` : ''}
  <h2 class="day">Pedidos</h2><div class="scroll-x"><table class="tbl"><thead><tr><th>Quando</th><th>Pacote</th><th>Valor</th><th>Status</th></tr></thead><tbody>${pend.map(p => `<tr><td>${esc(fWhen(p.createdAt))}</td><td>${esc(purName(p))}</td><td>${brl(p.amount)}</td><td>${p.status === 'paid' ? '<span class="ok">Pago</span>' : p.status === 'refunded' ? 'Estornado' : p.status === 'cancelled' ? 'Cancelado' : p.expired ? '<span class="muted">Expirado — fale com a Fany se já pagou</span>' : (p.checkoutUrl ? `<button class="linkbtn" data-act="resume" data-id="${p.id}">Continuar pagamento</button>` : '<span class="muted">Aguardando pagamento</span>')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum pedido ainda.</td></tr>'}</tbody></table></div>
  <h2 class="day">Extrato de créditos</h2>${led.map(l => `<article class="item"><span>${esc(l.desc)} <span class="muted">· ${esc(fWhen(l.at))}</span></span><b class="${l.amount > 0 ? 'ok' : ''}">${l.amount > 0 ? '+' : ''}${l.amount}</b></article>`).join('') || '<p class="muted sm">Sem movimentações ainda.</p>'}`;
}
function studentGift(u) {
  const hist = db.ledger.filter(l => l.userId === u.id && (l.type === 'gift_out' || l.type === 'gift_in')).sort((a, b) => D(b.at) - D(a.at)).slice(0, 15);
  const off = u.credits < 1;
  return `<div class="grid g2"><form data-form="gift" class="card stack"><h2>Presentear com créditos 🎁</h2>
    <p class="muted sm">Envie aulas para uma amiga. Os créditos saem do seu saldo (${u.credits}) e entram na conta dela na hora.</p>
    <div><label class="lbl" for="gp">WhatsApp de quem vai receber</label><input id="gp" class="field" name="phone" inputmode="tel" placeholder="(18) 99667-6637" required ${off ? 'disabled' : ''}></div>
    <div><label class="lbl" for="gn">Nome dela (só se ainda não tiver conta)</label><input id="gn" class="field" name="name" placeholder="Maria Silva" ${off ? 'disabled' : ''}></div>
    <div><label class="lbl" for="ga">Quantos créditos?</label><input id="ga" class="field" type="number" name="amount" min="1" max="${Math.max(u.credits, 1)}" value="1" required ${off ? 'disabled' : ''}></div>
    <div><label class="lbl" for="gm">Recado (opcional)</label><input id="gm" class="field" name="msg" maxlength="120" placeholder="Bora pedalar juntas! 💛" ${off ? 'disabled' : ''}></div>
    <button class="btn btn-block" type="submit" ${off ? 'disabled' : ''}>${off ? 'Você não tem créditos para enviar' : 'Enviar créditos'}</button></form>
  <div class="card"><h2>Presentes recentes</h2>${hist.map(l => `<p class="row sm" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(l.desc)} <span class="muted xs">· ${esc(fWhen(l.at))}</span></span><b class="${l.amount > 0 ? 'ok' : ''}">${l.amount > 0 ? '+' : ''}${l.amount}</b></p>`).join('') || '<p class="muted sm">Nenhum presente ainda.</p>'}</div></div>`;
}
function studentAccount(u) {
  return `<div class="card" style="max-width:440px;margin-bottom:16px"><h2>Meus dados de acesso</h2>
  <p class="sm">E-mail: <b>${esc(u.email || '—')}</b> ${u.emailVerified !== false ? '<span class="pill ok">confirmado</span>' : '<span class="pill warn">não confirmado</span>'}</p>
  <p class="sm" style="margin-top:6px">CPF: <b>${u.cpfMasked || 'não cadastrado'}</b></p><p class="sm" style="margin-top:6px">WhatsApp: <b>${esc(fPhone(u.phone))}</b></p>${u.google ? '<p class="muted xs" style="margin-top:6px">Conta conectada ao Google.</p>' : ''}</div>
  <form data-form="profile" class="stack" style="max-width:440px"><div><label class="lbl">Nome</label><input class="field" name="name" value="${esc(u.name)}" required></div>
  <div><label class="lbl">WhatsApp</label><input class="field" name="phone" inputmode="tel" value="${esc(fPhone(u.phone))}" required></div>
  ${u.hasCpf ? '' : '<div><label class="lbl">CPF (para completar seu cadastro)</label><input class="field" name="cpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14" data-mask="cpf"></div>'}
  <div><label class="lbl">Contato de emergência (nome e telefone)</label><input class="field" name="emergency" value="${esc(u.emergency || '')}"></div>
  <button class="btn" type="submit">Salvar</button>${u.termsAt ? `<p class="muted xs">Termo de responsabilidade aceito em ${fDate(u.termsAt)}.</p>` : ''}</form>
  ${server.emailEnabled ? `<form data-form="emailprefs" class="stack card" style="max-width:440px;margin-top:20px"><h2>Avisos por e-mail</h2>
  <label class="row sm" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" name="notify" ${u.notifyEmail !== false ? 'checked' : ''} style="margin-top:4px"> <span>Receber avisos da minha conta (reservas, créditos, mudanças de horário).<br><span class="muted xs">Aviso de vaga liberada na fila sempre chega.</span></span></label>
  <label class="row sm" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" name="mkt" ${u.mktOptIn ? 'checked' : ''} style="margin-top:4px"> <span>Receber novidades e promoções do estúdio.</span></label><button class="btn-line" type="submit">Salvar preferências</button></form>` : ''}
  ${u.hasAccess ? `<form data-form="password" class="stack card" style="max-width:440px;margin-top:20px"><h2>Trocar senha</h2>
  <input class="field" type="password" name="current" placeholder="Senha atual" autocomplete="current-password" required><input class="field" type="password" name="next" placeholder="Nova senha (mínimo 8 caracteres)" autocomplete="new-password" minlength="8" required><button class="btn-line" type="submit">Trocar senha</button></form>` : '<p class="muted sm" style="max-width:440px;margin-top:20px">Você entra com o Google. Se quiser criar uma senha, use “Esqueci a senha” na tela de entrar.</p>'}`;
}

/* ── modais ── */
function renderModal() {
  const m = ui.modal, host = $('#modal');
  if (!m) { host.innerHTML = ''; return; }
  const close = '<button class="x" data-act="close" aria-label="Fechar">×</button>';
  let inner = '';
  if (m.type === 'seat') {
    const c = cls(m.classId), u = me();
    if (!c || !c.active) { ui.modal = null; return renderModal(); }
    const mineR = db.reservations.find(r => r.userId === u.id && r.classId === c.id && r.status === 'confirmed');
    const taken = new Set(occ(c.id).map(r => r.bike));
    const n = c.maxBikes, cols = n <= 20 ? 4 : n <= 42 ? 6 : 8, L = cols / 2, rows = Math.ceil(n / cols);
    let cells = '';
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      if (k === L) cells += '<span></span>';
      const i = r * cols + k + 1;
      if (i > n) { cells += '<span></span>'; continue; }
      const isMine = m.change && mineR && mineR.bike === i, off = taken.has(i);
      cells += `<button class="bk ${m.pick === i ? 'on' : ''} ${isMine ? 'mine' : ''}" data-act="seatpick" data-n="${i}" ${off ? 'disabled' : ''} aria-label="Bike ${i}${isMine ? ' (sua bike atual)' : off ? ' ocupada' : ''}" aria-pressed="${m.pick === i}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.4"/><circle cx="18" cy="17" r="3.4"/><path d="M6 17l4-8h5l3 8M10 9l2.5 8M15 9l2-3h2M9 6.5h3"/></svg><span>${i}</span></button>`;
    }
    const free = n - taken.size, ev = c.event && !m.change;
    inner = `${close}<h3>${m.change ? 'Trocar de bike' : (c.event ? evEmoji(c) + ' ' : '') + 'Escolha sua bike'}</h3><p class="sm" style="margin-bottom:2px"><b>${esc(c.title)}</b> <span class="muted cap">· ${esc(fWhen(c.start))}</span></p><p class="muted xs">${free} ${free === 1 ? 'bike livre' : 'bikes livres'} de ${n}</p>
    <div class="stage">${esc(c.instructor)} · frente da sala</div>
    <div class="map" style="grid-template-columns:repeat(${L},minmax(0,1fr)) 18px repeat(${cols - L},minmax(0,1fr));max-width:${cols * 66 + 18}px">${cells}</div>
    <div class="legend"><span><i></i>Livre</span><span><i class="o"></i>Ocupada</span><span><i class="s"></i>Sua escolha</span></div>
    <p class="muted xs row" style="justify-content:space-between;margin:16px 0 10px"><span>${m.change ? 'Sem custo para trocar' : ev ? `Aula avulsa · ${brl(c.event.price)} no PIX, sem crédito` : `Gasta 1 crédito (você tem ${u.credits})`}</span><span class="gold">${m.pick ? 'Bike ' + m.pick : 'Toque numa bike'}</span></p>
    ${!m.change && !ev && u.credits < 1 ? '<button class="btn btn-block" data-act="gobuy">Comprar créditos</button>' : `<button class="${ev && evTheme(c) === 'hw' ? 'btn-hw btn-block' : 'btn btn-block'}" data-act="seatok" ${m.pick ? '' : 'disabled'}>${m.pick ? (m.change ? 'Trocar para a bike ' + m.pick : ev ? 'Ir para o pagamento · bike ' + m.pick + ' · ' + brl(c.event.price) : 'Confirmar bike ' + m.pick) : 'Confirmar'}</button>`}`;
  } else if (m.type === 'bikeadm') {
    const c = cls(m.classId);
    if (!c) { ui.modal = null; return renderModal(); }
    const r = occ(c.id).find(x => x.bike === m.bike);
    if (r) {
      const u = usr(r.userId) || { name: '?', credits: 0 };
      const held = isHeld(r), pe = r.pay && db.purchases.find(x => x.id === r.pay);
      const st = held ? '<span class="pill warn">⏳ Aguardando pagamento</span>' : r.status === 'attended' ? '<span class="pill ok">✔ Presente</span>' : r.status === 'no_show' ? '<span class="pill bad">✕ Faltou</span>' : '<span class="pill warn">Aguardando</span>';
      inner = `${close}<h3>Bike ${m.bike} · ${esc(u.name)}</h3><p class="muted sm">${esc(c.title)} · ${esc(fWhen(c.start))}</p>
      <div class="stack sm" style="margin:12px 0"><p>${st}</p><p class="muted">${u.credits} crédito(s)${c.event ? (pe ? ' · aula avulsa ' + (pe.status === 'paid' ? 'paga ' + brl(pe.amount) : 'a pagar ' + brl(pe.amount)) : ' · cortesia') : (r.paidCredit ? '' : ' · cortesia')}${u.phone ? ' · ' + esc(fPhone(u.phone)) : ''}</p>${u.emergency ? `<p class="muted xs">Emergência: ${esc(u.emergency)}</p>` : ''}${u.obs ? `<p class="warn xs">📝 ${esc(u.obs)}</p>` : ''}</div>
      ${held ? `<button class="btn btn-block" data-act="markpaid" data-id="${r.pay}">Confirmar pagamento manualmente</button>` : `<div class="row" style="gap:8px"><button class="btn" style="flex:1" data-act="att" data-id="${r.id}" data-s="attended">✔ Presente</button><button class="btn-bad" style="flex:1" data-act="att" data-id="${r.id}" data-s="no_show">✕ Faltou</button></div>`}
      ${!held && r.status !== 'confirmed' ? `<button class="btn-line btn-block btn-sm" style="margin-top:8px" data-act="att" data-id="${r.id}" data-s="confirmed">Desfazer marcação</button>` : ''}
      <div class="row" style="gap:8px;margin-top:12px"><button class="btn-line btn-sm" data-act="movebike" data-id="${r.id}" data-c="${c.id}">Trocar de bike</button>${u.phone ? `<a class="btn-line btn-sm" target="_blank" rel="noopener" href="${waLink(u.phone, fill(S().reminder || DEFAULT_REMINDER, { nome: u.name.split(' ')[0], aula: c.title, quando: fWhen(c.start), bike: r.bike || '—' }))}">WhatsApp</a>` : ''}<button class="btn-bad btn-sm" data-act="rcancel" data-id="${r.id}">Cancelar reserva</button></div>`;
    } else {
      const inClass = new Set(occ(c.id).map(x => x.userId));
      const list = students().filter(u => !u.blocked && !inClass.has(u.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const one = db.packages.find(p => p.active && p.kind === 'credits' && p.credits === 1), ev = c.event;
      const walk = m.mode === 'walk', k = m.keep || {}, sel = (v, cur) => (v === cur ? ' selected' : '');
      const price = ev ? ev.price : (one ? one.price : null), pl = price != null ? ' · ' + brl(price) : '';
      const opt = (v, label, cur, def) => `<option value="${v}"${(cur || def) === v ? ' selected' : ''}>${label}</option>`;
      const payOpts = (cur, withCredit) => (ev
        ? [['CASH', 'Dinheiro' + pl], ['CARD_MACHINE', 'Maquininha' + pl], ['PIX_KEY', 'PIX direto' + pl], ['FREE', 'Cortesia (grátis)']]
        : withCredit ? [['CREDIT', 'Usar 1 crédito dela'], ['FREE', 'Cortesia (não gasta crédito)'], ['CASH', 'Vender aula avulsa — dinheiro' + pl], ['CARD_MACHINE', 'Vender aula avulsa — maquininha' + pl], ['PIX_KEY', 'Vender aula avulsa — PIX direto' + pl]]
        : [['CASH', 'Dinheiro' + pl], ['CARD_MACHINE', 'Maquininha' + pl], ['PIX_KEY', 'PIX direto' + pl], ['FREE', 'Cortesia (grátis)']]).map(([v, l]) => opt(v, l, cur, ev ? 'CASH' : withCredit ? 'CREDIT' : 'CASH')).join('');
      inner = `${close}<h3>${ev ? evEmoji(c) + ' ' : ''}Reservar bike ${m.bike}</h3><p class="muted sm">${esc(c.title)} · ${esc(fWhen(c.start))}${ev ? ' · aula avulsa paga, não usa crédito' : ''}</p>
      <div class="row" style="margin:12px 0"><button class="tab ${walk ? '' : 'on'}" data-act="admmode" data-m="student">Aluna cadastrada</button><button class="tab ${walk ? 'on' : ''}" data-act="admmode" data-m="walk">Avulsa (sem cadastro)</button></div>
      ${walk ? `<form data-form="admwalk" class="stack"><input class="field" name="name" placeholder="Nome da aluna" required autocomplete="off" value="${esc(k.name || '')}"><input class="field" name="phone" inputmode="tel" placeholder="WhatsApp (opcional)" value="${esc(k.phone || '')}"><div><label class="lbl">Como ela pagou?</label><select class="field" name="method">${payOpts(k.method, false)}</select></div><button class="btn btn-block" type="submit">Reservar bike ${m.bike}</button></form>`
        : `<form data-form="admres" class="stack"><select class="field" name="uid" required><option value="">Escolha a aluna…</option>${list.map(u => `<option value="${u.id}"${sel(u.id, k.uid)}>${esc(u.name)}${ev ? '' : ' · ' + u.credits + ' crédito(s)'}</option>`).join('')}</select><div><label class="lbl">Como pagar?</label><select class="field" name="method">${payOpts(k.method, true)}</select></div><button class="btn btn-block" type="submit">Reservar bike ${m.bike}</button></form>`}`;
    }
  } else if (m.type === 'ticket') {
    const c = cls(m.classId);
    inner = `${close}<h3>Reserva confirmada! ${c && c.event ? evEmoji(c) : '🎟️'}</h3><div class="ticket"><span class="muted xs">SUA BIKE</span><b>${m.bike}</b><p>${esc(c ? c.title : '')}</p><p class="muted sm cap">${esc(c ? fWhen(c.start) : '')}</p></div><p class="muted xs" style="margin-bottom:12px">Chegue 10 minutos antes. ${c && c.event ? 'Para cancelar ou alterar a vaga, fale com a Fany.' : `Cancelamento grátis até ${S().cancelHours}h antes da aula.`}</p><button class="btn btn-block" data-act="close">Fechar</button>`;
  } else if (m.type === 'dialog') {
    inner = `${close}<h3>${esc(m.title)}</h3>${m.body ? `<p class="muted sm" style="margin-bottom:12px">${m.body}</p>` : ''}${m.input ? `<input class="field" id="dlg-input" placeholder="${esc(m.input)}" style="margin-bottom:12px">` : ''}<div class="row" style="justify-content:flex-end">${m.buttons.map((b, i) => `<button class="${b.kind}" data-act="dlg" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`;
  }
  host.innerHTML = `<div class="ov" data-act="ovclose"><div class="modal ${m.type === 'seat' ? 'wide' : ''} ${m.type === 'seat' && evTheme(cls(m.classId)) === 'hw' ? 'hwm' : ''}" role="dialog" aria-modal="true">${inner}</div></div>`;
}


/* ═══════════ painel da dona ═══════════ */
const ATABS = [['checkin', 'Hoje'], ['visao', 'Visão geral'], ['agenda', 'Agenda'], ['alunas', 'Alunas'], ['creditos', 'Créditos'], ['vendas', 'Vendas'], ['pacotes', 'Pacotes'], ['pagamentos', 'Pagamentos'], ['emails', 'E-mails'], ['equipe', 'Equipe'], ['avisos', 'Avisos'], ['estudio', 'Estúdio']];
const METHOD = { INFINITEPAY: 'Pix/cartão (site)', PIX: 'PIX (site)', CASH: 'Dinheiro', CARD_MACHINE: 'Maquininha', PIX_KEY: 'PIX direto', COURTESY: 'Cortesia' };
const ACTIONS = { creditos_ajustados: 'Créditos ajustados', aluna_bloqueada: 'Aluna bloqueada', aluna_desbloqueada: 'Aluna desbloqueada', aula_criada: 'Aula criada', aula_editada: 'Aula editada', aula_cancelada: 'Aula cancelada', grade_gerada: 'Grade gerada', semana_duplicada: 'Semana duplicada', reserva_cancelada: 'Reserva cancelada', pacote_salvo: 'Pacote salvo', venda_manual: 'Venda no estúdio', venda_estornada: 'Venda estornada', pix_confirmado: 'PIX confirmado', configuracoes: 'Configurações salvas', mensalidade: 'Mensalidade', credito_doado: 'Créditos doados', reserva_manual: 'Reserva feita pela Fany' };
const bars = (data, fmt) => { const max = Math.max(1, ...data.map(d => d.v)), step = Math.ceil(data.length / 8); return `<div class="scrollbars"><div class="bars">${data.map((d, i) => `<div class="bar" title="${esc(d.l)}: ${esc(fmt(d.v))}"><i style="height:${Math.round(d.v / max * 100)}%"></i><span>${i % step === 0 ? esc(d.l) : '&nbsp;'}</span></div>`).join('') || '<span class="muted sm">Sem dados ainda</span>'}</div></div>`; };
const students = () => db.users.filter(u => !u.deleted);
const kpi = (k, v, h, act) => `<${act ? 'button data-act="atab" data-t="' + act + '"' : 'div'} class="kpi"><small>${k}</small><b>${v}</b>${h ? `<small>${h}</small>` : ''}</${act ? 'button' : 'div'}>`;

function viewAdmin() {
  const tabs = `<div class="tabs" role="tablist">${ATABS.filter(([id]) => id !== 'equipe' || isOwner()).map(([id, l]) => `<button class="tab ${ui.atab === id ? 'on' : ''}" role="tab" data-act="atab" data-t="${id}">${l}</button>`).join('')}</div>`;
  const fn = { checkin: aCheckin, visao: aOverview, agenda: aAgenda, alunas: aStudents, creditos: aCredits, vendas: aSales, pacotes: aPackages, pagamentos: aPayments, emails: aEmails, equipe: aTeam, avisos: aNews, estudio: aStudio }[ui.atab] || aCheckin;
  return `${topbar()}<main class="wrap" style="padding-top:20px;padding-bottom:90px">${tabs}${fn()}</main>`;
}

function aOverview() {
  const now = new Date(), ms = new Date(now.getFullYear(), now.getMonth(), 1);
  const paid = db.purchases.filter(p => p.status === 'paid');
  const month = paid.filter(p => D(p.paidAt) >= ms);
  const st = students();
  const past = db.classes.filter(c => c.active && D(c.start) < now && D(c.start) > addDays(now, -30));
  const occ30 = past.length ? Math.round(past.reduce((a, c) => a + occ(c.id).length / c.maxBikes, 0) / past.length * 100) : 0;
  const act = new Set(db.reservations.filter(r => ['confirmed', 'attended'].includes(r.status) && cls(r.classId) && D(cls(r.classId).start) < now && D(cls(r.classId).start) > addDays(now, -30)).map(r => r.userId));
  const next = db.classes.filter(c => c.active && D(c.start) > now).sort((a, b) => D(a.start) - D(b.start));
  const rev = {}; for (const p of paid) if (D(p.paidAt) > addDays(now, -30)) { const k = dayKey(p.paidAt); rev[k] = (rev[k] || 0) + p.amount; }
  const revData = Object.keys(rev).sort().map(k => ({ l: k.slice(8) + '/' + k.slice(5, 7), v: rev[k] / 100 }));
  const expiring = st.filter(u => u.credits > 0 && u.expireAt && D(u.expireAt) > now && D(u.expireAt) < addDays(now, 7));
  const lastClass = u => { const rs = db.reservations.filter(r => r.userId === u.id && ['confirmed', 'attended'].includes(r.status) && cls(r.classId) && D(cls(r.classId).start) < now).map(r => D(cls(r.classId).start)); return rs.length ? new Date(Math.max(...rs)) : null; };
  const inactive = st.filter(u => !u.blocked && db.purchases.some(p => p.userId === u.id && p.status === 'paid') && (!lastClass(u) || now - lastClass(u) > 21 * 864e5)).slice(0, 12);
  const people = (rows, msg, hint, empty) => rows.length ? `<div class="stack">${rows.map(u => `<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><p>${esc(u.name)}</p><p class="muted xs">${hint(u)}</p></div>${u.phone ? `<a class="btn-line btn-sm" target="_blank" rel="noopener" href="${waLink(u.phone, msg(u))}">WhatsApp</a>` : ''}</div>`).join('')}</div>` : `<p class="muted sm">${empty}</p>`;
  const pending = db.purchases.filter(p => p.status === 'pending' && !p.expired);
  return `<h1 style="font-size:1.9rem;margin-bottom:6px">Painel da Fany</h1><p class="muted" style="margin-bottom:18px">Aulas, alunas, créditos e dinheiro no mesmo lugar.</p>
  ${!server.paymentsReady ? `<button class="card hl sm" style="width:100%;text-align:left;margin-bottom:14px;color:inherit" data-act="atab" data-t="pagamentos"><b class="gold">Falta conectar a InfinitePay.</b> <span class="muted">Sem isso as alunas não conseguem pagar pelo site. Toque aqui para configurar (leva ~5 minutos).</span></button>` : ''}
  ${!server.emailEnabled ? `<button class="card hl sm" style="width:100%;text-align:left;margin-bottom:14px;color:inherit" data-act="atab" data-t="emails"><b class="gold">O envio de e-mails está desligado.</b> <span class="muted">Sem ele não saem confirmação de cadastro, aviso de vaga liberada nem promoções. Toque aqui para ver como ligar.</span></button>` : ''}
  ${!db.classes.some(c => c.active && isFuture(c)) ? `<button class="card hl sm" style="width:100%;text-align:left;margin-bottom:14px;color:inherit" data-act="atab" data-t="agenda"><b class="gold">Sua agenda está vazia.</b> <span class="muted">Crie a grade da semana para as alunas poderem reservar. Toque aqui.</span></button>` : ''}
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">${kpi('Faturado no mês', brl(month.reduce((a, p) => a + p.amount, 0)), month.length + ' vendas', 'vendas')}${kpi('Faturado total', brl(paid.reduce((a, p) => a + p.amount, 0)), paid.length + ' vendas')}${kpi('Ocupação (30 dias)', occ30 + '%', 'aulas passadas')}${kpi('Alunas ativas (30d)', act.size, st.length + ' cadastradas', 'alunas')}${kpi('Créditos em aberto', st.reduce((a, u) => a + u.credits, 0))}${kpi('Aulas à frente', next.length, '', 'agenda')}${kpi('Pagamentos pendentes', pending.length, pending.filter(p => p.claimed).length + ' já avisaram', 'pix')}${kpi('Lista de espera', db.waitlist.length)}</div>
  <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Ocupação das próximas aulas (%)</h2>${bars(next.slice(0, 12).map(c => ({ l: fTime(c.start), v: Math.round(occ(c.id).length / c.maxBikes * 100) })), v => v + '%')}</div>
  <div class="card"><h2>Receita dos últimos 30 dias (R$)</h2>${bars(revData, v => 'R$ ' + v.toFixed(2).replace('.', ','))}</div></div>
  <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Chame no WhatsApp: créditos vencendo</h2>${people(expiring, u => `Oi ${u.name.split(' ')[0]}! Seus ${u.credits} créditos vencem em ${fDate(u.expireAt)}. Bora reservar uma aula? 🚴`, u => `${u.credits} créditos · vence ${fDate(u.expireAt)}`, 'Ninguém com crédito vencendo nos próximos 7 dias.')}</div>
  <div class="card"><h2>Chame no WhatsApp: sumiram há 3+ semanas</h2>${people(inactive, u => `Oi ${u.name.split(' ')[0]}! Sentimos sua falta no spinning 💛 Tem horário bom essa semana, vamos voltar?`, u => (lastClass(u) ? 'última aula ' + fDate(lastClass(u)) : 'nunca veio') + (u.credits ? ` · ${u.credits} créditos` : ''), 'Todas as alunas que compraram estão ativas. 👏')}</div></div>
  <div class="card" style="margin-top:14px"><h2>Histórico de ações</h2><div class="stack sm" style="max-height:260px;overflow:auto">${db.audit.slice(0, 40).map(a => `<p><span>${esc(ACTIONS[a.action] || a.action)}</span> <span class="muted">· ${esc(fWhen(a.at))}</span>${a.detail ? `<br><span class="muted xs">${esc(a.detail)}</span>` : ''}</p>`).join('') || '<p class="muted">Nada registrado ainda.</p>'}</div></div>`;
}

const BIKE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.4"/><circle cx="18" cy="17" r="3.4"/><path d="M6 17l4-8h5l3 8M10 9l2.5 8M15 9l2-3h2M9 6.5h3"/></svg>';
/** Sala da aula: cada bike mostra o nome da aluna e se ela veio. Toque numa bike para marcar presença, trocar ou reservar. */
function roomCard(c) {
  const rs = occ(c.id), by = new Map(rs.filter(r => r.bike).map(r => [r.bike, r]));
  const nOk = rs.filter(r => r.status === 'attended').length, nNo = rs.filter(r => r.status === 'no_show').length, nWait = rs.length - nOk - nNo;
  const n = c.maxBikes, cols = n <= 8 ? 4 : (window.innerWidth >= 900 ? (n <= 36 ? 6 : 8) : (n <= 20 ? 4 : 6)), L = cols / 2, rows = Math.ceil(n / cols);
  const mv = ui.moving && ui.moving.classId === c.id ? db.reservations.find(r => r.id === ui.moving.resId) : null;
  let cells = '';
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    if (k === L) cells += '<span></span>';
    const i = r * cols + k + 1; if (i > n) { cells += '<span></span>'; continue; }
    const res = by.get(i), u = res && usr(res.userId);
    const st = !res ? 'free' : isHeld(res) ? 'hold' : res.status === 'attended' ? 'ok' : res.status === 'no_show' ? 'no' : 'res';
    const label = !res ? 'livre' : `${u ? u.name : '?'}, ${st === 'ok' ? 'presente' : st === 'no' ? 'faltou' : st === 'hold' ? 'aguardando PIX' : 'aguardando'}`;
    cells += `<button class="bk adm ${st} ${mv && res && mv.id === res.id ? 'mv' : ''}" data-act="bikeadm" data-c="${c.id}" data-b="${i}" aria-label="Bike ${i}: ${esc(label)}">${st === 'ok' ? '<span class="tick">✔</span>' : st === 'no' ? '<span class="tick">✕</span>' : st === 'hold' ? '<span class="tick">⏳</span>' : ''}${BIKE_SVG}<span>${i}</span><em>${res ? esc(shortName(u ? u.name : '?')) : 'Livre'}</em></button>`;
  }
  const noBike = rs.filter(r => !r.bike);
  const wl = db.waitlist.filter(w => w.classId === c.id).sort((a, b) => D(a.at) - D(b.at));
  const tpl = S().reminder || DEFAULT_REMINDER;
  const when = (dayKey(c.start) === dayKey(new Date()) ? 'hoje' : fDay(c.start).toLowerCase()) + ' às ' + fTime(c.start);
  return `<div class="card" data-room="${c.id}">
  <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${c.event ? evEmoji(c) + ' ' : ''}${esc(c.title)} · ${fTime(c.start)}</h2><p class="muted sm" style="margin-top:4px">${esc(c.instructor)}${c.event ? ' · aula avulsa ' + brl(c.event.price) : ''} · ${rs.length}/${c.maxBikes} bikes · <span class="ok">${nOk} presente${nOk === 1 ? '' : 's'}</span> · <span class="bad">${nNo} falta${nNo === 1 ? '' : 's'}</span> · <span class="warn">${nWait} aguardando</span></p></div>
    <div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="addany" data-id="${c.id}" ${rs.length >= c.maxBikes ? 'disabled' : ''}>+ Reservar bike</button><button class="btn btn-sm" data-act="allpresent" data-id="${c.id}" ${nWait ? '' : 'disabled'}>Todas presentes</button></div></div>
  ${mv ? `<div class="card hl sm" style="margin-top:12px">Movendo <b>${esc(shortName((usr(mv.userId) || {}).name))}</b> (bike ${mv.bike || '—'}): toque na nova bike — se estiver ocupada, elas trocam de lugar. <button class="linkbtn" data-act="movecancel">Cancelar</button></div>` : ''}
  <div class="room"><div class="stage">${esc(c.instructor)} · frente da sala</div>
  <div class="map" style="grid-template-columns:repeat(${L},minmax(0,1fr)) 18px repeat(${cols - L},minmax(0,1fr));max-width:${cols * 78 + 18}px">${cells}</div></div>
  <div class="legend"><span><i class="f"></i>Livre</span><span><i class="r"></i>Aguardando</span><span><i class="p"></i>Presente</span><span><i class="a"></i>Faltou</span>${c.event ? '<span><i class="h"></i>Aguardando PIX</span>' : ''}</div>
  ${noBike.length ? `<p class="warn sm" style="margin-top:12px">Sem bike definida: ${noBike.map(r => esc((usr(r.userId) || {}).name || '?')).join(', ')} — toque numa bike livre depois de “Trocar de bike”.</p>` : ''}
  <details style="margin-top:16px"><summary class="sm gold" style="cursor:pointer">Ver lista da turma (${rs.length})</summary><div style="margin-top:10px">${rs.sort((a, b) => (a.bike || 99) - (b.bike || 99)).map(r => { const u = usr(r.userId) || { name: '?' }; return `<div class="row sm" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>Bike ${r.bike || '—'} · ${esc(u.name)} <span class="${r.status === 'attended' ? 'ok' : r.status === 'no_show' ? 'bad' : 'muted'}">${isHeld(r) ? '⏳ aguardando PIX' : r.status === 'attended' ? '✔ presente' : r.status === 'no_show' ? '✕ faltou' : ''}</span></span>${u.phone ? `<a class="linkbtn xs" target="_blank" rel="noopener" href="${waLink(u.phone, fill(tpl, { nome: u.name.split(' ')[0], aula: c.title, quando: when, bike: r.bike || '—' }))}">lembrete</a>` : ''}</div>`; }).join('') || '<p class="muted sm">Ninguém reservou ainda.</p>'}</div></details>
  ${wl.length ? `<p class="gold sm" style="margin:16px 0 6px">Lista de espera</p>${wl.map((w, i) => { const u = usr(w.userId) || { name: '?', credits: 0 }; return `<div class="row sm" style="justify-content:space-between"><span>${i + 1}. ${esc(u.name)} · ${u.credits} crédito(s)${u.credits < 1 ? ' <b class="bad">(sem crédito!)</b>' : ''}${w.offerUntil && D(w.offerUntil) > new Date() ? ` · <b class="ok">vaga oferecida até ${fTime(w.offerUntil)}</b>` : ''}</span><button class="linkbtn bad" data-act="wlrm" data-id="${w.id}">tirar</button></div>`; }).join('')}` : ''}</div>`;
}
function aCheckin() {
  const base = addDays(new Date(), ui.hojeOff || 0), dk = dayKey(base), now = new Date();
  const list = db.classes.filter(c => c.active && dayKey(c.start) === dk).sort((a, b) => D(a.start) - D(b.start));
  let sel = list.find(c => c.id === ui.hojeClass);
  if (!sel) { sel = list.find(c => addDays(D(c.start), 0).getTime() + c.duration * 6e4 > now.getTime()) || list[list.length - 1] || null; ui.hojeClass = sel ? sel.id : null; }
  const title = ui.hojeOff ? 'Aulas de ' + fDay(base).toLowerCase() : 'Aulas de hoje';
  return `<div class="row" style="justify-content:space-between;margin-bottom:6px"><h1 style="font-size:1.9rem">${esc(title)}</h1><div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="hday" data-d="-1" aria-label="Dia anterior">‹</button><button class="btn-line btn-sm" data-act="hday" data-d="0" ${ui.hojeOff ? '' : 'disabled'}>Hoje</button><button class="btn-line btn-sm" data-act="hday" data-d="1" aria-label="Próximo dia">›</button></div></div>
  <p class="muted" style="margin-bottom:14px">${esc(fDay(base))} — toque numa bike para marcar presença ou falta, trocar de lugar ou reservar para alguém.</p>
  <div class="tabs">${list.map(c => `<button class="tab ${sel && sel.id === c.id ? 'on' : ''}" data-act="hclass" data-id="${c.id}">${fTime(c.start)} · ${occ(c.id).length}/${c.maxBikes}</button>`).join('')}</div>
  ${sel ? roomCard(sel) : '<div class="empty">Nenhuma aula nesse dia. Crie na aba Agenda.</div>'}`;
}

function aAgenda() {
  const s = S(), e = ui.editClass ? cls(ui.editClass) : null;
  const f = e || { title: 'Spinning Noturno', instructor: s.instructor, start: '', duration: s.duration, maxBikes: s.maxBikes, level: 'Todos os níveis', notes: '' };
  const list = db.classes.filter(c => c.active && D(c.start) > addDays(new Date(), -1)).sort((a, b) => D(a.start) - D(b.start)).slice(0, 120);
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h1 style="font-size:1.9rem">Agenda</h1><button class="btn-line" data-act="dupweek">Duplicar semana</button></div>
  <div class="grid g2"><form class="card stack" data-form="class"><h2>${e ? 'Editar aula' : 'Nova aula avulsa'}</h2>
    <input class="field" name="title" value="${esc(f.title)}" placeholder="Nome da aula" required><input class="field" name="instructor" value="${esc(f.instructor)}" placeholder="Instrutora">
    <div><label class="lbl">Data e hora</label><input class="field" type="datetime-local" name="start" value="${f.start ? toLocalInput(f.start) : ''}" required></div>
    <div class="row"><div style="flex:1"><label class="lbl">Duração (min)</label><input class="field" type="number" name="duration" min="15" max="180" value="${f.duration}"></div><div style="flex:1"><label class="lbl">Bikes</label><input class="field" type="number" name="maxBikes" min="1" max="80" value="${f.maxBikes}"></div></div>
    <input class="field" name="level" value="${esc(f.level)}" placeholder="Nível"><input class="field" name="notes" value="${esc(f.notes || '')}" placeholder="Aviso para as alunas (opcional)">
    ${f.event ? `<div class="row"><div style="flex:1"><label class="lbl">Preço da aula avulsa (R$)</label><input class="field" name="price" inputmode="decimal" value="${centsToReais(f.event.price)}"></div><div style="flex:1"><label class="lbl">Tema do botão</label><select class="field" name="theme"><option value="havai" ${f.event.theme === 'havai' ? 'selected' : ''}>🌺 Havaí</option><option value="gold" ${f.event.theme !== 'havai' ? 'selected' : ''}>⭐ Dourado</option></select></div></div>` : ''}
    <div class="row"><button class="btn" type="submit" style="flex:1">${e ? 'Salvar alterações' : 'Publicar aula'}</button>${e ? '<button class="btn-line" type="button" data-act="editcancel">Cancelar edição</button>' : ''}</div></form>
  <form class="card stack" data-form="series"><h2>Grade da semana</h2><p class="muted sm">Cria várias aulas de uma vez e não duplica as que já existem.</p>
    <input class="field" name="title" value="Spinning Noturno" required><div class="row">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => `<label class="tab" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="d${i}" ${[1, 3, 5].includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div>
    <div class="row"><div style="flex:1"><label class="lbl">Hora</label><input class="field" type="number" name="hour" min="0" max="23" value="19"></div><div style="flex:1"><label class="lbl">Minuto</label><input class="field" type="number" name="minute" min="0" max="59" step="5" value="0"></div><div style="flex:1"><label class="lbl">Semanas</label><input class="field" type="number" name="weeks" min="1" max="12" value="2"></div></div>
    <div class="row"><div style="flex:1"><label class="lbl">Duração</label><input class="field" type="number" name="duration" value="${s.duration}"></div><div style="flex:1"><label class="lbl">Bikes</label><input class="field" type="number" name="maxBikes" value="${s.maxBikes}"></div></div>
    <button class="btn" type="submit">Gerar grade</button></form></div>
  ${specialsSection()}
  <h2 class="day">Aulas publicadas</h2>${list.map(c => `<div class="item"><div><p style="font:700 1rem var(--display)">${c.event ? evEmoji(c) + ' ' : ''}${esc(c.title)}${c.event ? ` <span class="pill warn">avulsa ${brl(c.event.price)}</span>` : ''}</p><p class="muted sm cap">${esc(fWhen(c.start))} · ${esc(c.instructor)} · ${c.duration} min · ${occ(c.id).length}/${c.maxBikes}</p></div><div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="turma" data-id="${c.id}">${ui.openRoster === c.id ? 'Fechar turma' : 'Turma'}</button><button class="btn-line btn-sm" data-act="editclass" data-id="${c.id}">Editar</button><button class="btn-bad btn-sm" data-act="cancelclass" data-id="${c.id}">Cancelar aula</button></div></div>${ui.openRoster === c.id ? roomCard(c) : ''}`).join('') || '<div class="empty">Nenhuma aula publicada.</div>'}`;
}

function specialsSection() {
  const one = t => { const nxt = t.id ? db.classes.filter(c => c.active && c.event && c.event.tpl === t.id && isFuture(c)).sort((a, b) => D(a.start) - D(b.start)) : [];
    return `<div class="card ${t.theme === 'havai' ? 'hw' : ''}" style="padding:0"><form class="stack" data-form="spec" data-id="${t.id}" style="padding:18px"><h2 style="margin-bottom:0">${t.id ? (t.theme === 'havai' ? '🌺 ' : '⭐ ') + esc(t.name) : 'Nova aula especial'}</h2>
    <input class="field" name="name" value="${esc(t.name)}" placeholder="Nome da aula" required>
    <div class="row"><div style="flex:1"><label class="lbl">Preço (R$)</label><input class="field" name="price" inputmode="decimal" value="${centsToReais(t.price)}"></div><div style="flex:1"><label class="lbl">Bikes</label><input class="field" type="number" name="maxBikes" min="1" max="80" value="${t.maxBikes}"></div><div style="flex:1"><label class="lbl">Duração (min)</label><input class="field" type="number" name="duration" min="15" max="240" value="${t.duration}"></div></div>
    <div><label class="lbl">Tema do botão</label><select class="field" name="theme"><option value="havai" ${t.theme === 'havai' ? 'selected' : ''}>🌺 Havaí</option><option value="gold" ${t.theme !== 'havai' ? 'selected' : ''}>⭐ Dourado (padrão)</option></select></div>
    <div><label class="lbl">Descrição (as alunas veem)</label><input class="field" name="desc" value="${esc(t.desc || '')}" maxlength="200"></div>
    <label class="row sm" style="gap:8px"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> Ativa (pode agendar novas datas)</label>
    ${t.id ? '<label class="row sm" style="gap:8px"><input type="checkbox" name="applyAll" checked> Atualizar também as datas já agendadas</label>' : ''}
    <button class="btn btn-block" type="submit">${t.id ? 'Salvar modelo' : 'Criar aula especial'}</button></form>
    ${t.id ? `<form data-form="specsched" data-id="${t.id}" class="row" style="padding:0 18px 18px"><input class="field" style="flex:1;min-width:190px" type="datetime-local" name="start" required aria-label="Data e hora da nova aula"><button class="btn-ghost" type="submit" ${t.active ? '' : 'disabled'}>+ Agendar data</button></form>
    <p class="muted xs" style="padding:0 18px 16px">${nxt.length ? 'Próximas datas: ' + nxt.map(c => esc(fWhen(c.start))).join(' · ') : 'Nenhuma data agendada.'}</p>` : ''}</div>`; };
  return `<h2 class="day">Aulas especiais (avulsas pagas)</h2><p class="muted sm" style="margin-bottom:12px">Aulas de evento como a Temática Havaí: a aluna paga direto no PIX e já garante a bike — não usa crédito. Edite o preço, o tema e o tamanho aqui; “Agendar data” coloca uma nova aula na agenda.</p>
  <div class="grid g2">${db.specials.map(one).join('')}${one({ id: '', name: 'Nova aula especial', price: 3500, theme: 'gold', maxBikes: 8, duration: 90, desc: '', active: true })}</div>`;
}
function aStudents() {
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h1 style="font-size:1.9rem">Alunas</h1><div class="row"><button class="btn-line btn-sm" data-act="export" data-k="students">Baixar planilha</button><button class="btn btn-sm" data-act="newstud">+ Nova aluna</button></div></div>
  <div class="row" style="margin-bottom:12px"><input class="field" style="max-width:340px" id="sq" placeholder="Buscar nome ou telefone" value="${esc(ui.q)}" data-live="q">${[['todas', 'Todas'], ['creditos', 'Com créditos'], ['semcredito', 'Sem créditos'], ['bloqueadas', 'Bloqueadas']].map(([k, l]) => `<button class="tab ${ui.filter === k ? 'on' : ''}" data-act="sfilter" data-k="${k}">${l}</button>`).join('')}</div>
  <div id="slist">${studentList()}</div>`;
}
function studentList() {
  const q = ui.q.toLowerCase().trim(), qd = digits(ui.q);
  const list = students().filter(u => (!q || u.name.toLowerCase().includes(q) || (qd && (u.phone || '').includes(qd))) && (ui.filter === 'todas' || (ui.filter === 'creditos' && u.credits > 0) || (ui.filter === 'semcredito' && u.credits < 1) || (ui.filter === 'bloqueadas' && u.blocked))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return `<p class="muted xs" style="margin-bottom:8px">${list.length} resultado(s)</p><div class="scroll-x"><table class="tbl"><thead><tr><th>Nome</th><th>Créditos</th><th>Aulas</th><th>Status</th><th></th></tr></thead><tbody>${list.map(u => { const a = db.reservations.filter(r => r.userId === u.id && r.status === 'attended').length, f = db.reservations.filter(r => r.userId === u.id && r.status === 'no_show').length; return `<tr><td><b>${esc(u.name)}</b><br><span class="muted xs">${u.phone ? esc(fPhone(u.phone)) : 'sem WhatsApp'}${u.email ? ' · ' + esc(u.email) : ''}</span>${u.email && u.emailVerified === false ? ' <span class="pill warn">e-mail não confirmado</span>' : ''}</td><td class="tab-num">${u.credits}</td><td class="muted tab-num">${a}${f ? ` · ${f} falta(s)` : ''}</td><td>${u.blocked ? '<span class="bad">Bloqueada</span>' : 'Ativa'}</td><td><button class="linkbtn" data-act="ostud" data-id="${u.id}">${ui.openStudent === u.id ? 'fechar' : 'abrir'}</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Nenhuma aluna encontrada.</td></tr>'}</tbody></table></div>${ui.openStudent && usr(ui.openStudent) ? studentEditor(usr(ui.openStudent)) : ''}`;
}
function studentEditor(u) {
  const led = db.ledger.filter(l => l.userId === u.id).sort((a, b) => D(b.at) - D(a.at)).slice(0, 30);
  const spent = db.purchases.filter(p => p.userId === u.id && p.status === 'paid').reduce((a, p) => a + p.amount, 0);
  return `<div class="card hl" style="margin-top:14px"><div class="row sm" style="gap:6px 18px;margin-bottom:10px"><span>✉ ${esc(u.email || 'sem e-mail')} ${u.email ? (u.emailVerified !== false ? '<span class="pill ok">confirmado</span>' : '<span class="pill warn">não confirmado</span>') : ''}</span><span>🪪 CPF: <b id="cpf-${u.id}">${u.cpfMasked || 'não cadastrado'}</b> ${u.hasCpf ? `<button class="linkbtn xs" data-act="revealcpf" data-id="${u.id}">mostrar</button>` : ''}</span><span class="muted xs">${u.mktOptIn ? 'aceita promoções' : 'não aceitou promoções'}</span></div><p class="muted xs" style="margin-bottom:10px">Cadastro: ${fDate(u.createdAt)} · Gastou: ${brl(spent)} · ${u.termsAt ? 'Termo aceito' : 'Termo pendente'}${u.expireAt && u.credits > 0 ? ' · Créditos vencem ' + fDate(u.expireAt) : ''}</p>
  <form data-form="studedit" data-id="${u.id}" class="grid g2"><input class="field" name="name" value="${esc(u.name)}" aria-label="Nome" required><input class="field" name="phone" value="${esc(fPhone(u.phone))}" placeholder="WhatsApp" aria-label="WhatsApp"><input class="field" name="emergency" value="${esc(u.emergency || '')}" placeholder="Contato de emergência" style="grid-column:1/-1"><textarea class="field" name="obs" placeholder="Observações (lesão, preferência de bike…) — só você vê" style="grid-column:1/-1">${esc(u.obs || '')}</textarea>
  <div class="row" style="grid-column:1/-1"><button class="btn btn-sm" type="submit">Salvar</button>${u.hasAccess ? `<button class="btn-line btn-sm" type="button" data-act="resetpw" data-id="${u.id}">Redefinir senha</button>` : `<button class="btn-line btn-sm" type="button" data-act="createaccess" data-id="${u.id}">Criar acesso (e-mail e senha)</button>`}<button class="btn-line btn-sm" type="button" data-act="block" data-id="${u.id}">${u.blocked ? 'Desbloquear' : 'Bloquear'}</button>${u.phone ? `<a class="btn-line btn-sm" target="_blank" rel="noopener" href="${waLink(u.phone)}">WhatsApp</a>` : ''}</div></form>
  <div class="grid g2" style="margin-top:14px"><form data-form="adjust" data-id="${u.id}" class="card stack" style="background:var(--elevated)"><b class="sm">Dar ou tirar créditos</b><div class="row"><input class="field" style="width:90px" type="number" name="amount" value="1" aria-label="Quantidade"><input class="field" style="flex:1;min-width:120px" name="reason" value="Cortesia da Fany"><button class="btn btn-sm" type="submit">Aplicar</button></div><p class="muted xs">Número negativo desconta.</p></form>
  <form data-form="sale" data-id="${u.id}" class="card stack" style="background:var(--elevated)"><b class="sm">Registrar venda no estúdio</b><select class="field" name="pkg">${db.packages.filter(p => p.active).map(p => `<option value="${p.id}">${esc(p.name)} · ${brl(p.price)}</option>`).join('')}</select><div class="row"><select class="field" name="method" style="flex:1"><option value="CASH">Dinheiro</option><option value="CARD_MACHINE">Maquininha</option><option value="PIX_KEY">PIX direto</option><option value="COURTESY">Cortesia (R$ 0)</option></select><button class="btn btn-sm" type="submit">Vender</button></div></form></div>
  <div class="stack xs muted" style="margin-top:12px;max-height:180px;overflow:auto">${led.map(l => `<p class="row" style="justify-content:space-between"><span>${esc(l.desc)} · ${esc(fWhen(l.at))}</span><b style="color:var(--fg)">${l.amount > 0 ? '+' : ''}${l.amount}</b></p>`).join('')}</div></div>`;
}

function creditList() {
  const q = ui.cq.toLowerCase().trim(), qd = digits(ui.cq);
  const list = students().filter(u => !q || u.name.toLowerCase().includes(q) || (qd && (u.phone || '').includes(qd))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return `<div class="scroll-x"><table class="tbl"><thead><tr><th>Aluna</th><th>Créditos</th><th>Vencem</th><th>Ajuste rápido</th></tr></thead><tbody>${list.map(u => `<tr><td><b>${esc(u.name)}</b><br><span class="muted xs">${u.phone ? esc(fPhone(u.phone)) : 'sem WhatsApp'}</span></td><td class="tab-num"><b class="${u.credits ? 'gold' : 'muted'}">${u.credits}</b></td><td class="muted xs">${u.expireAt && u.credits > 0 ? fDate(u.expireAt) : '—'}</td><td><div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="qadj" data-id="${u.id}" data-n="-1" ${u.credits < 1 ? 'disabled' : ''} aria-label="Tirar 1 crédito de ${esc(u.name)}">−1</button><button class="btn-line btn-sm" data-act="qadj" data-id="${u.id}" data-n="1" aria-label="Dar 1 crédito para ${esc(u.name)}">+1</button><button class="btn-line btn-sm" data-act="qadj" data-id="${u.id}" data-n="5" aria-label="Dar 5 créditos para ${esc(u.name)}">+5</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhuma aluna encontrada.</td></tr>'}</tbody></table></div>`;
}
function aCredits() {
  const moves = db.ledger.slice().sort((a, b) => D(b.at) - D(a.at)).slice(0, 30);
  return `<h1 style="font-size:1.9rem">Créditos</h1><p class="muted" style="margin:6px 0 14px">Dê ou tire créditos de qualquer aluna. Tudo fica registrado no extrato dela e no histórico.</p>
  <form class="card" data-form="adjust2" style="margin-bottom:14px"><h2>Ajustar créditos</h2><div class="grid g2"><div><label class="lbl">Aluna</label><select class="field" name="uid" required><option value="">Escolha…</option>${students().slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(u => `<option value="${u.id}">${esc(u.name)} · ${u.credits} crédito(s)</option>`).join('')}</select></div>
  <div class="row" style="align-items:flex-end;flex-wrap:nowrap"><div style="flex:1"><label class="lbl">O que fazer</label><select class="field" name="op"><option value="give">Dar créditos</option><option value="take">Tirar créditos</option></select></div><div style="width:96px"><label class="lbl">Quantos</label><input class="field" type="number" name="qty" min="1" max="200" value="1" required></div></div>
  <div style="grid-column:1/-1"><label class="lbl">Motivo (a aluna vê no extrato)</label><input class="field" name="reason" value="Cortesia da Fany" maxlength="120"></div></div><button class="btn" style="margin-top:14px" type="submit">Aplicar</button></form>
  <div class="row" style="margin-bottom:10px"><input class="field" style="max-width:340px" placeholder="Buscar aluna" value="${esc(ui.cq)}" data-live="cq"><span class="muted sm">Saldo total: <b class="gold">${students().reduce((a, u) => a + u.credits, 0)}</b></span></div>
  <div id="clist">${creditList()}</div>
  <h2 class="day">Últimas movimentações</h2><div class="stack sm">${moves.map(l => { const u = usr(l.userId); return `<p class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px"><span>${esc(u ? u.name : '—')} <span class="muted">· ${esc(l.desc)} · ${esc(fWhen(l.at))}</span></span><b class="${l.amount > 0 ? 'ok' : ''}">${l.amount > 0 ? '+' : ''}${l.amount}</b></p>`; }).join('') || '<p class="muted">Sem movimentações.</p>'}</div>`;
}

function aSales() {
  const since = addDays(new Date(), -ui.days);
  const rows = db.purchases.filter(p => D(p.createdAt) >= since).sort((a, b) => D(b.createdAt) - D(a.createdAt));
  const paid = rows.filter(p => p.status === 'paid'), by = {};
  for (const p of paid) by[p.billing] = (by[p.billing] || 0) + p.amount;
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h1 style="font-size:1.9rem">Vendas</h1><div class="row"><select class="field" style="width:auto" data-change="days" aria-label="Período">${[7, 30, 90, 365].map(d => `<option value="${d}" ${ui.days === d ? 'selected' : ''}>${d === 365 ? '1 ano' : d + ' dias'}</option>`).join('')}</select><button class="btn-line btn-sm" data-act="export" data-k="sales">Planilha p/ contador</button></div></div>
  <div class="grid g4">${kpi('Total no período', brl(paid.reduce((a, p) => a + p.amount, 0)), paid.length + ' vendas pagas')}${Object.entries(by).map(([m, v]) => kpi(METHOD[m] || m, brl(v))).join('')}</div>
  <form data-form="quicksale" class="card row" style="margin:14px 0"><b class="sm" style="width:100%">Nova venda no balcão</b><select class="field" name="uid" style="flex:1;min-width:170px" required><option value="">Aluna…</option>${students().map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select><select class="field" name="pkg" style="flex:1;min-width:170px">${db.packages.filter(p => p.active).map(p => `<option value="${p.id}">${esc(p.name)} · ${brl(p.price)}</option>`).join('')}</select><select class="field" name="method" style="width:auto"><option value="CASH">Dinheiro</option><option value="CARD_MACHINE">Maquininha</option><option value="PIX_KEY">PIX direto</option><option value="COURTESY">Cortesia</option></select><button class="btn" type="submit">Vender</button></form>
  <div class="scroll-x"><table class="tbl"><thead><tr><th>Data</th><th>Aluna</th><th>Pacote</th><th>Valor</th><th>Forma</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(p => { const u = usr(p.userId); return `<tr><td>${esc(fWhen(p.createdAt))}</td><td>${esc(u ? u.name : '—')}</td><td>${esc(purName(p))}${p.kind === 'event' ? ' <span class="pill">avulsa</span>' : ''}</td><td>${brl(p.amount)}</td><td>${esc(METHOD[p.billing] || p.billing)}</td><td>${p.status === 'paid' ? '<span class="ok">Pago</span>' : p.status === 'refunded' ? '<span class="bad">Estornado</span>' : p.status === 'cancelled' ? 'Cancelado' : p.expired ? 'Expirado' : 'Aguardando'}</td><td>${p.status === 'paid' && p.amount > 0 ? `<button class="linkbtn bad xs" data-act="refund" data-id="${p.id}">estornar</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Nenhuma venda nesse período.</td></tr>'}</tbody></table></div>`;
}

function aPackages() {
  const one = p => `<form class="card stack" data-form="pkg" data-id="${p.id}"><input class="field" name="name" value="${esc(p.name)}" aria-label="Nome" required>
  <div class="row"><div style="flex:1"><label class="lbl">Créditos</label><input class="field" type="number" name="credits" min="1" value="${p.credits}"></div><div style="flex:1"><label class="lbl">Preço (R$)</label><input class="field" name="price" inputmode="decimal" value="${centsToReais(p.price)}"></div></div>
  <input class="field" name="desc" value="${esc(p.desc || '')}" placeholder="Descrição curta"><div><label class="lbl">Validade dos créditos (dias — vazio = não vence)</label><input class="field" type="number" name="validity" min="1" value="${p.validity || ''}"></div>
  <select class="field" name="kind"><option value="credits" ${p.kind === 'credits' ? 'selected' : ''}>Pacote de créditos (pagamento único)</option><option value="subscription" ${p.kind === 'subscription' ? 'selected' : ''}>Mensalidade (renova todo mês)</option></select>
  <div class="row"><div style="flex:1"><label class="lbl">Ordem no site (menor aparece primeiro)</label><input class="field" type="number" name="sort" min="0" value="${p.sort ?? 99}"></div></div>
  <label class="row sm" style="gap:8px"><input type="checkbox" name="highlight" ${p.highlight ? 'checked' : ''}> Destacar este plano (borda dourada)</label>
  <label class="row sm" style="gap:8px"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Ativo no site</label><div class="row"><button class="btn" style="flex:1" type="submit">${p.id ? 'Salvar' : 'Criar pacote'}</button>${p.id ? `<button class="btn-bad" type="button" data-act="pkgdel" data-id="${p.id}">Apagar</button>` : ''}</div></form>`;
  return `<h1 style="font-size:1.9rem">Pacotes</h1><p class="muted" style="margin:6px 0 16px">Edite nome, preço, créditos, validade, ordem e destaque. Mudanças valem para compras futuras. Para esconder do site, desmarque “Ativo”; só dá para apagar um plano que nunca foi vendido.</p><div class="grid g2">${db.packages.slice().sort((a, b) => a.sort - b.sort).map(one).join('')}${one({ id: '', name: 'Novo pacote', credits: 5, price: 19900, desc: '', kind: 'credits', validity: null, active: true, sort: db.packages.length + 1, highlight: false })}</div>`;
}

function aPayments() {
  const pend = db.purchases.filter(p => p.status === 'pending').sort((a, b) => D(b.createdAt) - D(a.createdAt)).slice(0, 60);
  const subs = db.subs.slice().sort((a, b) => D(b.createdAt) - D(a.createdAt));
  const base = server.publicUrl || location.origin;
  return `<h1 style="font-size:1.9rem">Pagamentos</h1>
  <div class="card ${server.paymentsReady ? '' : 'hl'}" style="margin:14px 0"><h2>Checkout InfinitePay ${server.paymentsReady ? '<span class="pill ok">conectado</span>' : '<span class="pill warn">falta conectar</span>'}</h2>
    <p class="muted sm">As alunas pagam com <b>Pix</b> ou <b>cartão</b> no checkout seguro da InfinitePay e os créditos caem sozinhos. Pix: sem taxa. Cartão: taxa da InfinitePay (veja no seu app).</p>
    <ol class="muted sm" style="margin:12px 0;padding-left:20px;line-height:1.7"><li>No app InfinitePay: <b>Vendas › Checkout › Configurações › Habilitar Checkout Integrado</b>.</li><li>Copie sua <b>InfiniteTag</b> (aparece no canto superior do app, sem o $) e cole abaixo.</li><li>Toque em <b>Testar conexão</b>. Não precisa configurar webhook: o sistema envia o endereço em cada cobrança.</li></ol>
    ${isOwner() ? `<form data-form="payhandle" class="row" style="align-items:flex-end"><div style="flex:1;min-width:200px"><label class="lbl">InfiniteTag (sem o $)</label><input class="field" name="handle" value="${esc(S().infinitepayHandle || '')}" placeholder="minha_tag" ${server.handleFromEnv ? 'disabled' : ''} autocomplete="off"></div><button class="btn" type="submit" ${server.handleFromEnv ? 'disabled' : ''}>Salvar</button><button class="btn-ghost" type="button" data-act="testcheckout" ${server.paymentsReady ? '' : 'disabled'}>Testar conexão</button></form>
    ${server.handleFromEnv ? '<p class="muted xs" style="margin-top:8px">A InfiniteTag está definida nas variáveis do servidor.</p>' : ''}` : '<p class="muted sm">Só a dona altera a conta de pagamento.</p>'}
    <p class="muted xs" style="margin-top:10px">Endereço do site: ${esc(base)}</p></div>
  <form class="card row" data-form="charge" style="margin-bottom:14px"><b class="sm" style="width:100%">Cobrar uma aluna por link</b><select class="field" name="uid" required style="flex:1;min-width:170px"><option value="">Aluna…</option>${students().slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select><select class="field" name="pkg" style="flex:1;min-width:170px">${db.packages.filter(p => p.active).map(p => `<option value="${p.id}">${esc(p.name)} · ${brl(p.price)}</option>`).join('')}</select><button class="btn" type="submit" ${server.paymentsReady ? '' : 'disabled'}>Gerar link</button></form>
  <h2 class="day" style="margin-top:6px">Pedidos aguardando pagamento</h2><p class="muted sm" style="margin-bottom:8px">Quando a aluna paga, o pedido some daqui sozinho. Se alguém pagou e o crédito não caiu, confira no app da InfinitePay e use “Já recebi”.</p>
  ${pend.map(p => { const u = usr(p.userId), ev = p.kind === 'event'; const rr = ev && db.reservations.find(x => x.pay === p.id && x.status === 'confirmed'); return `<div class="item"><div><p>${esc(u ? u.name : '—')} · ${ev ? evEmoji(cls(p.classId)) + ' ' : ''}${esc(purName(p))} ${p.needsAction ? '<span class="pill bad">pago, mas sem vaga — devolver</span>' : ''}${p.expired ? '<span class="pill warn">reserva expirou</span>' : ''}</p><p class="muted sm">${brl(p.amount)} · ${ev ? 'aula avulsa · bike ' + ((rr && rr.bike) || p.bike || '—') : p.credits + ' créditos'} · ${esc(fWhen(p.createdAt))}</p>${p.note && p.needsAction ? `<p class="bad xs">${esc(p.note)}</p>` : ''}</div><div class="row" style="gap:6px">${p.checkoutUrl && u && u.phone ? `<a class="btn-line btn-sm" target="_blank" rel="noopener" href="${waLink(u.phone, `Oi ${u.name.split(' ')[0]}! Aqui está o link para finalizar seu pagamento no Spinning Fany: ${p.checkoutUrl}`)}">Enviar link</a>` : ''}<button class="btn btn-sm" data-act="markpaid" data-id="${p.id}">Já recebi · liberar</button><button class="btn-line btn-sm" data-act="dropbuy" data-id="${p.id}">Descartar</button></div></div>`; }).join('') || '<div class="empty">Nenhum pedido aguardando.</div>'}
  <h2 class="day">Mensalidades</h2><p class="muted sm" style="margin-bottom:8px">A mensalidade renova por link: todo mês toque em “Enviar link do mês” e mande para a aluna pelo WhatsApp. Pagou, os 20 créditos caem sozinhos.</p>
  ${subs.map(m => { const u = usr(m.userId), k = pkg(m.pkgId); return `<div class="item"><div><p>${esc(u ? u.name : '—')} · ${esc(k ? k.name : '')}</p><p class="muted sm">${m.status === 'active' ? 'ativa' : 'encerrada'} · ${m.credits} créditos/mês · último link ${fDate(m.lastCharge)}</p></div><div class="row" style="gap:6px">${m.status === 'active' ? `<button class="btn btn-sm" data-act="chargesub" data-id="${m.id}" ${server.paymentsReady ? '' : 'disabled'}>Enviar link do mês</button><button class="btn-bad btn-sm" data-act="subend" data-id="${m.id}">Encerrar</button>` : ''}</div></div>`; }).join('') || '<div class="empty">Nenhuma mensalidade ainda.</div>'}`;
}

const AUD = [['all', 'Todas as alunas que aceitam novidades'], ['withCredits', 'Quem tem créditos'], ['noCredits', 'Quem está sem créditos (lembrar de comprar)'], ['inactive', 'Quem não vem há 3 semanas'], ['expiring', 'Quem tem crédito vencendo em 7 dias']];
function aEmails() {
  const m = server.mail || {}, camps = db.campaigns || [];
  const status = m.enabled
    ? `<p class="muted sm" style="margin:6px 0 16px">Enviando por <b>${esc(m.provider)}</b> como <b>${esc(m.from)}</b>. Hoje: <b>${m.sentToday}</b> de ${m.limit} enviados · ${m.pending} na fila${m.failed ? ` · <span class="bad">${m.failed} com erro</span>` : ''}.</p>`
    : `<div class="card hl" style="margin:12px 0"><h2>Ligar o envio de e-mails</h2><p class="muted sm">Hoje o site <b>não envia e-mails</b>. Ligando, saem: confirmação de cadastro, “esqueci a senha”, aviso de vaga liberada na fila (para confirmar), avisos de crédito e as promoções.</p><ol class="muted sm" style="margin:10px 0 0;padding-left:20px;line-height:1.7"><li>Crie uma conta grátis na <b>Brevo</b> (300 e-mails por dia) e gere uma <b>chave de API</b>.</li><li>No Railway, crie as variáveis <b>BREVO_API_KEY</b> (a chave) e <b>EMAIL_FROM</b> (ex.: <i>Spinning Fany &lt;avisos@seudominio.com.br&gt;</i>).</li><li>Reinicie. Esta tela vai mostrar “Enviando por brevo”. Passo a passo completo no guia.</li></ol></div>`;
  return `<h1 style="font-size:1.9rem">E-mails</h1>${status}
  <form data-form="campaign" class="card stack" style="max-width:640px;margin-bottom:18px"><h2>Nova mensagem promocional</h2>
  <div><label class="lbl">Para quem</label><select class="field" name="audience">${AUD.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
  <div class="row"><button class="btn-line btn-sm" type="button" data-act="campcount">Ver quantas vão receber</button><span id="campcount" class="muted sm"></span></div>
  <div><label class="lbl">Assunto</label><input class="field" name="subject" maxlength="120" placeholder="Ex.: Sábado tem Aula Temática Havai 🌺" required></div>
  <div><label class="lbl">Mensagem (use {nome} para o nome da aluna)</label><textarea class="field" name="body" rows="6" maxlength="3000" placeholder="Oi {nome}!&#10;Sábado às 17h tem Aula Temática Havai. Garanta sua bike!" required></textarea></div>
  <div class="row"><div style="flex:1;min-width:150px"><label class="lbl">Texto do botão (opcional)</label><input class="field" name="buttonLabel" maxlength="40" placeholder="Garantir minha vaga"></div><div style="flex:1;min-width:150px"><label class="lbl">Link do botão (opcional)</label><input class="field" name="buttonUrl" maxlength="300" placeholder="/#/conta"></div></div>
  <div class="row"><button class="btn-line" type="button" data-act="camptest" ${m.enabled ? '' : 'disabled'}>Enviar teste para mim</button><button class="btn" type="submit" ${m.enabled ? '' : 'disabled'}>Enviar para as alunas</button></div>
  <p class="muted xs">Só recebe quem <b>confirmou o e-mail</b> e <b>aceitou novidades</b>. Todo e-mail tem link para descadastrar. Promoções não saem de madrugada (21h às 8h). Se passar do limite diário do plano grátis, o resto sai no dia seguinte.</p></form>
  <h2 class="day" style="margin-top:6px">Mensagens enviadas</h2>
  ${camps.map(c => `<div class="item"><div><p style="font:700 1rem var(--display)">${esc(c.subject)}</p><p class="muted sm">${esc(fWhen(c.createdAt))} · ${esc(c.createdBy || '')} · ${esc((AUD.find(a => a[0] === c.audience) || [0, c.audience])[1])}</p></div><div class="sm" style="text-align:right"><b class="ok">${c.sent}</b> enviados de ${c.total}${c.failed ? `<br><span class="bad">${c.failed} com erro</span>` : ''}</div></div>`).join('') || '<div class="empty">Nenhuma campanha ainda.</div>'}`;
}

function aTeam() {
  if (!isOwner()) return '<div class="empty">Só a dona acessa a equipe.</div>';
  const team = db.users.filter(u => u.role === 'owner' || u.role === 'admin');
  return `<h1 style="font-size:1.9rem">Equipe</h1><p class="muted" style="margin:6px 0 14px">Administradoras entram no painel e cuidam das aulas, alunas e vendas. Só você (dona) cria administradoras, muda a conta de pagamento e baixa a cópia de segurança. Quem cria conta pelo site entra como aluna.</p>
  <form class="card stack" data-form="teamadd" style="max-width:520px;margin-bottom:16px"><h2>Adicionar administradora</h2><input class="field" name="name" placeholder="Nome" required maxlength="120"><input class="field" type="email" name="email" placeholder="E-mail" required autocomplete="off"><input class="field" name="password" placeholder="Senha temporária (mínimo 8 caracteres)" minlength="8" required autocomplete="off"><p class="muted xs">Se esse e-mail já tem conta de aluna, ela vira administradora e continua com a senha dela (o campo senha é ignorado).</p><button class="btn" type="submit">Adicionar</button></form>
  ${team.map(u => `<div class="item"><div><p><b>${esc(u.name)}</b> <span class="pill ${u.role === 'owner' ? 'ok' : 'warn'}">${u.role === 'owner' ? 'dona' : 'administradora'}</span></p><p class="muted sm">${esc(u.email)}</p></div><div class="row" style="gap:6px">${u.role === 'admin' ? `<button class="btn-line btn-sm" data-act="resetpw" data-id="${u.id}">Redefinir senha</button><button class="btn-bad btn-sm" data-act="teamremove" data-id="${u.id}">Remover acesso</button>` : ''}</div></div>`).join('')}`;
}

function aNews() {
  return `<h1 style="font-size:1.9rem">Avisos do mural</h1><p class="muted" style="margin:6px 0 14px">Aparece na página inicial. O mais recente fica em destaque.</p>
  <form class="card stack" data-form="ann"><input class="field" name="title" placeholder="Título" maxlength="80" required><textarea class="field" name="body" placeholder="Mensagem para as alunas" maxlength="400" required></textarea><button class="btn" type="submit">Publicar</button></form>
  <div style="margin-top:12px">${db.announcements.map(a => `<div class="item"><div><p style="font:700 1rem var(--display)">${esc(a.title)}</p><p class="muted sm">${esc(a.body)}</p></div><button class="linkbtn bad" data-act="anndel" data-id="${a.id}">apagar</button></div>`).join('')}</div>`;
}

function aStudio() {
  const s = S(); const f = (k, l, ph = '') => `<div><label class="lbl">${l}</label><input class="field" name="${k}" value="${esc(s[k])}" placeholder="${ph}"></div>`;
  return `<h1 style="font-size:1.9rem;margin-bottom:12px">Estúdio</h1>
  <div class="card hl" style="max-width:560px;margin-bottom:16px"><h2>Aulas especiais e planos</h2><p class="muted sm" style="margin-bottom:12px">Edite o preço, o tema e as datas da Aula Temática Havai, e os planos de crédito (preço, créditos, validade, destaque).</p><div class="row"><button class="btn btn-sm" data-act="atab" data-t="agenda">🌺 Aulas especiais</button><button class="btn-line btn-sm" data-act="atab" data-t="pacotes">Planos e pacotes</button></div></div>
  <form class="stack" data-form="studio" style="max-width:560px">${f('name', 'Nome')}${f('address', 'Endereço')}${f('whatsapp', 'WhatsApp do estúdio (com DDD)', '18 99667-6637')}${f('instructor', 'Instrutora padrão')}${f('instagram', 'Instagram', '@spinningfany')}
  <div><label class="lbl">Sobre</label><textarea class="field" name="about">${esc(s.about)}</textarea></div>
  <div class="row"><div style="flex:1"><label class="lbl">Bikes</label><input class="field" type="number" name="maxBikes" min="1" value="${s.maxBikes}"></div><div style="flex:1"><label class="lbl">Duração</label><input class="field" type="number" name="duration" min="15" value="${s.duration}"></div><div style="flex:1"><label class="lbl">Cancelar até (h)</label><input class="field" type="number" name="cancelHours" min="0" value="${s.cancelHours}"></div></div>
  <div><label class="lbl">Termo de responsabilidade</label><textarea class="field" name="terms" rows="4">${esc(s.terms)}</textarea></div>
  <div><label class="lbl">Mensagem de lembrete no WhatsApp (use {nome} {aula} {quando} {bike})</label><textarea class="field" name="reminder">${esc(s.reminder)}</textarea></div>
  <label class="row sm" style="gap:8px"><input type="checkbox" name="gifts" ${s.gifts === false ? '' : 'checked'}> Permitir que as alunas doem créditos umas para as outras</label>
  <button class="btn" type="submit">Salvar estúdio</button></form>
  ${isOwner() ? `<div class="card stack" style="margin-top:22px;max-width:560px"><h2>Cópia de segurança</h2><p class="muted sm">O sistema guarda uma cópia automática por dia no servidor. Baixe uma cópia sua de vez em quando e guarde em lugar seguro (contém dados das alunas).</p><div class="row"><a class="btn-line btn-sm" href="/api/backup" download>Baixar cópia (.json)</a><button class="btn-line btn-sm" data-act="export" data-k="classes">Relatório de aulas</button></div></div>` : `<div class="row" style="margin-top:22px"><button class="btn-line btn-sm" data-act="export" data-k="classes">Relatório de aulas</button></div>`}`;
}


/* ═══════════ estado, API e ações (navegador) ═══════════ */
let sess = null, server = { paymentsReady: false, publicUrl: '', handleFromEnv: false };
const myNotes = uidv => db.notes.filter(n => n.userId === uidv && !n.read);
const $ = (s, root = document) => root.querySelector(s);
const el = (f, n) => f.elements[n];
const stamp = () => dayKey(new Date());

async function http(method, path, body) {
  let r;
  try { r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch (e) { throw new Error('Sem conexão com o servidor. Confira sua internet e tente de novo.'); }
  let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ }
  if (j && j.state) apply(j.state); else if (j && j.db) apply(j);
  if (!r.ok) throw new Error((j && j.error) || 'Algo deu errado. Tente de novo.');
  return j;
}
function apply(st) { if (!st || !st.db) return; db = st.db; sess = st.sess; server = st.server || server; }
async function refresh() { try { await http('GET', '/api/state'); } catch (e) { /* mantém a tela atual */ } }
let busy = false;
/** Chama uma ação do servidor, mostra o aviso e redesenha a tela. */
async function act(name, payload, okMsg) {
  if (busy) return null; busy = true;
  try { const j = await http('POST', '/api/act/' + name, payload || {}); const m = j.msg || okMsg; if (m) toast(m, j.warn ? 'err' : 'ok'); render(); return j; }
  catch (e) { toast(e.message, 'err'); render(); return null; }
  finally { busy = false; }
}
/** Chama o servidor sem redesenhar a tela (para não apagar o que a pessoa está digitando). */
async function quiet(name, payload) { if (busy) return null; busy = true; try { return await http('POST', '/api/act/' + name, payload || {}); } catch (e) { toast(e.message, 'err'); return null; } finally { busy = false; } }
const maskCpfInput = v => digits(v).slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
let gScript = false, gInit = false;
function initGoogle() {
  const box = $('#gbtn'); if (!box || !server.googleClientId) return;
  const draw = () => { if (!(window.google && google.accounts && google.accounts.id)) return; if (!gInit) { google.accounts.id.initialize({ client_id: server.googleClientId, callback: onGoogle }); gInit = true; } google.accounts.id.renderButton(box, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'pt-BR', width: Math.min(320, box.clientWidth || 320) }); };
  if (window.google && google.accounts) return draw();
  if (!gScript) { gScript = true; const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = draw; sc.onerror = () => { gScript = false; box.innerHTML = '<p class="muted xs">Não consegui carregar o login do Google agora.</p>'; }; document.head.appendChild(sc); } else setTimeout(draw, 500);
}
async function onGoogle(resp) {
  try { const j = await http('POST', '/api/google', { credential: resp.credential }); if (j.needsProfile) { ui.gpending = j; ui.authMode = 'gcomplete'; ui.authKeep = {}; render(); } else afterLogin(); }
  catch (e) { toast(e.message, 'err'); }
}
const logout = async () => { try { await http('POST', '/api/logout', {}); } catch (e) { /* ok */ } ui.modal = null; sess = null; go(''); render(); };
const afterLogin = () => { ui.modal = null; ui.stab = 'agenda'; ui.atab = 'checkin'; go(isAdmin() ? 'painel' : 'conta'); render(); };

/* ── exportações (planilhas) ── */
function download(name, text, mime) { const b = new Blob([text], { type: mime || 'text/plain;charset=utf-8' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
const csvEsc = v => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = rows => '\ufeff' + rows.map(r => r.map(csvEsc).join(';')).join('\n');
function exportCsv(k) {
  if (k === 'sales') {
    const st = { paid: 'Pago', pending: 'Aguardando', refunded: 'Estornado', cancelled: 'Cancelado' };
    download(`vendas-${stamp()}.csv`, toCsv([['Data', 'Pago em', 'Aluna', 'Pacote', 'Valor (R$)', 'Forma', 'Status'], ...db.purchases.map(p => [fWhen(p.createdAt), p.paidAt ? fWhen(p.paidAt) : '', (usr(p.userId) || {}).name, purName(p), centsToReais(p.amount), METHOD[p.billing] || p.billing, st[p.status] || p.status])]), 'text/csv;charset=utf-8');
  } else if (k === 'students') {
    download(`alunas-${stamp()}.csv`, toCsv([['Nome', 'E-mail', 'WhatsApp', 'Créditos', 'Aulas feitas', 'Faltas', 'Cadastro'], ...students().map(u => [u.name, u.email, fPhone(u.phone), u.credits, db.reservations.filter(r => r.userId === u.id && r.status === 'attended').length, db.reservations.filter(r => r.userId === u.id && r.status === 'no_show').length, fDate(u.createdAt)])]), 'text/csv;charset=utf-8');
  } else {
    const past = db.classes.filter(c => c.active && D(c.start) < new Date()).sort((a, b) => D(b.start) - D(a.start));
    download(`aulas-${stamp()}.csv`, toCsv([['Data', 'Aula', 'Instrutora', 'Bikes', 'Reservas', 'Presentes', 'Faltas', 'Ocupação'], ...past.map(c => { const o = occ(c.id); return [fWhen(c.start), c.title, c.instructor, c.maxBikes, o.length, o.filter(r => r.status === 'attended').length, o.filter(r => r.status === 'no_show').length, Math.round(o.length / c.maxBikes * 100) + '%']; })]), 'text/csv;charset=utf-8');
  }
}
const goPay = url => { toast('Abrindo o pagamento seguro…'); location.href = url; };

/* ── página de retorno do pagamento ── */
function viewPago() {
  const o = ui.pago || { status: 'checking' };
  let body;
  if (o.status === 'login') body = `<h2>Entre na sua conta</h2><p class="muted" style="margin:10px 0 18px">Para ver o resultado do pagamento, entre na sua conta.</p><a class="btn" href="#/entrar">Entrar</a>`;
  else if (o.status === 'paid') body = `<div class="ok" style="font-size:3rem">✔</div><h2 style="margin:8px 0">Pagamento confirmado!</h2><p class="muted" style="margin-bottom:20px">${o.kind === 'event' ? 'Sua vaga está garantida. Aloha! 🌺' : 'Seus créditos já estão na sua conta.'}</p><a class="btn" href="#/conta" data-act="gotab" data-t="${o.kind === 'event' ? 'minhas' : 'agenda'}">${o.kind === 'event' ? 'Ver minhas aulas' : 'Reservar minha bike'}</a>`;
  else if (o.status === 'needs') body = `<h2>Recebemos seu pagamento</h2><p class="muted" style="margin:10px 0 18px">Houve um problema com a vaga. A Fany vai falar com você pelo WhatsApp para resolver.</p><a class="btn" target="_blank" rel="noopener" href="${waLink(S().whatsapp, 'Oi! Paguei minha vaga mas houve um problema.')}">Falar com a Fany</a>`;
  else if (o.status === 'timeout') body = `<h2>Ainda confirmando…</h2><p class="muted" style="margin:10px 0 18px">O banco pode levar alguns minutos. Assim que confirmar, seus créditos entram sozinhos e você recebe um aviso.</p><div class="row" style="justify-content:center"><button class="btn" data-act="pagorecheck">Verificar de novo</button><a class="btn-line" href="#/conta" data-act="gotab" data-t="comprar">Ver meus pedidos</a></div>`;
  else body = `<div class="spin" aria-hidden="true"></div><h2 style="margin:14px 0 6px">Confirmando seu pagamento…</h2><p class="muted">Não feche esta página. Leva só alguns segundos.</p>`;
  return `${topbar()}<main class="wrap" style="max-width:520px;padding-top:56px;padding-bottom:80px"><div class="card" style="text-align:center;padding:34px 22px">${body}</div></main>`;
}
let pollTimer = null;
function startPoll() {
  const id = (location.hash.split('?o=')[1] || '').split('&')[0]; if (!id) { ui.pago = { status: 'timeout' }; return; }
  if (ui.pagoId === id && (pollTimer || (ui.pago && ui.pago.status !== 'checking'))) return;   // já está checando, ou já terminou
  ui.pagoId = id; ui.pago = { status: 'checking' }; clearInterval(pollTimer);
  let n = 0;
  const tick = async () => {
    n++;
    try {
      const r = await fetch('/api/order/' + encodeURIComponent(id), { credentials: 'same-origin' });
      if (r.status === 401) { ui.pago = { status: 'login' }; clearInterval(pollTimer); pollTimer = null; if (route() === 'pago') render(); return; }
      const j = await r.json();
      if (j.state) apply(j.state);
      if (j.status === 'paid') ui.pago = { status: 'paid', kind: j.kind }; else if (j.needsAction) ui.pago = { status: 'needs' }; else if (n >= 45) ui.pago = { status: 'timeout' };
      if (ui.pago.status !== 'checking') { clearInterval(pollTimer); pollTimer = null; }
      if (route() === 'pago') render();
    } catch (e) { /* tenta de novo */ }
  };
  pollTimer = setInterval(tick, 2000); tick();
}

/* ── ações da tela ── */
const acts = {
  to(t, e) { const id = t.dataset.to; if (route() !== '') { ui.scrollTo = id; return; } e.preventDefault(); const x = document.getElementById(id); if (x) x.scrollIntoView({ behavior: 'smooth' }); },
  enter(t) { if (t && t.dataset && t.dataset.cid) ui.pendingClass = t.dataset.cid; go(sess ? (isAdmin() ? 'painel' : 'conta') : 'entrar'); },
  authmode(t) { ui.authMode = t.dataset.m; ui.authKeep = {}; render(); },
  logout,
  close() { ui.modal = null; renderModal(); },
  ovclose(t, e) { if (e.target === t) { ui.modal = null; renderModal(); } },
  stab(t) { ui.stab = t.dataset.t; ui.modal = null; render(); },
  gotab(t) { ui.stab = t.dataset.t; },
  atab(t) { ui.atab = t.dataset.t; ui.openStudent = null; ui.moving = null; render(); },
  pagorecheck() { ui.pagoId = null; ui.pago = { status: 'checking' }; startPoll(); render(); },
  dlg(t) { const i = Number(t.dataset.i), fn = ui.fns[i], inp = $('#dlg-input'), v = inp ? inp.value : ''; ui.modal = null; renderModal(); if (fn) fn(v); },
  /* aluna */
  pick(t) { if (me() && me().blocked) return toast('Sua conta está bloqueada. Fale com o estúdio.', 'err'); ui.modal = { type: 'seat', classId: t.dataset.id, pick: null }; renderModal(); },
  change(t) { ui.modal = { type: 'seat', classId: t.dataset.id, pick: null, change: true }; renderModal(); },
  seatpick(t) { ui.modal.pick = Number(t.dataset.n); renderModal(); },
  gobuy() { ui.modal = null; ui.stab = 'comprar'; render(); },
  async seatok() {
    const m = ui.modal; if (!m || !m.pick) return; const c = cls(m.classId);
    if (c && c.event && !m.change) { const j = await act('checkoutEvent', { classId: m.classId, bike: m.pick }); if (j && j.url) goPay(j.url); else if (!j) { m.pick = null; render(); } return; }
    const j = await act(m.change ? 'change' : 'reserve', { classId: m.classId, bike: m.pick }, m.change ? '' : '');
    if (j) { ui.modal = { type: 'ticket', classId: m.classId, bike: j.bike }; renderModal(); } else if (ui.modal) { ui.modal.pick = null; renderModal(); }
  },
  wait(t) { act('wait', { classId: t.dataset.id }); },
  leavewait(t) { act('leavewait', { classId: t.dataset.id }); },
  cancel(t) { const id = t.dataset.id, rr = db.reservations.find(x => x.id === id), ce = rr && cls(rr.classId); confirmBox(ce && ce.event ? 'Cancelar a vaga?' : 'Cancelar essa reserva?', ce && ce.event ? 'Sua bike será liberada. Você ainda não pagou, então nada será cobrado.' : 'O crédito volta para você.', 'Cancelar reserva', () => act('cancel', { id }), true); },
  async buy(t) { const j = await act('checkout', { packageId: t.dataset.id }); if (j && j.url) goPay(j.url); },
  async resume(t) { const j = await act('resume', { id: t.dataset.id }); if (j && j.url) goPay(j.url); },
  subcancel(t) { const id = t.dataset.id; confirmBox('Cancelar a mensalidade?', 'Os créditos já pagos continuam valendo.', 'Cancelar mensalidade', () => act('subcancel', { id }), true); },
  readnotes() { act('readnotes'); },
  declineoffer(t) { const id = t.dataset.id; confirmBox('Não vai mais querer a vaga?', 'Ela passa para a próxima da fila.', 'Não vou', () => act('declineOffer', { classId: id }), true); },
  resendverify() { act('resendVerify'); },
  async revealcpf(t) { const j = await quiet('revealCpf', { userId: t.dataset.id }); const x = document.getElementById('cpf-' + t.dataset.id); if (j && x) { x.textContent = j.cpf; t.remove(); } },
  async campcount(t) { const f = t.closest('form'), j = await quiet('campaignPreview', { audience: el(f, 'audience').value }); const x = $('#campcount'); if (j && x) x.textContent = `${j.count} aluna(s) vão receber`; },
  async camptest(t) { const f = t.closest('form'), j = await quiet('campaignTest', { subject: el(f, 'subject').value, body: el(f, 'body').value, buttonLabel: el(f, 'buttonLabel').value, buttonUrl: el(f, 'buttonUrl').value }); if (j) toast(j.msg); },
  /* painel */
  hday(t) { const d = t.dataset.d; ui.hojeOff = d === '0' ? 0 : (ui.hojeOff || 0) + Number(d); ui.hojeClass = null; ui.moving = null; render(); },
  hclass(t) { ui.hojeClass = t.dataset.id; ui.moving = null; render(); },
  bikeadm(t) {
    const cid = t.dataset.c, b = Number(t.dataset.b);
    if (ui.moving && ui.moving.classId === cid) { const mv = ui.moving; ui.moving = null; act('moveseat', { id: mv.resId, bike: b }); return; }
    ui.modal = { type: 'bikeadm', classId: cid, bike: b, mode: 'student' }; renderModal();
  },
  admmode(t) { if (ui.modal && ui.modal.type === 'bikeadm') { ui.modal.mode = t.dataset.m; ui.modal.keep = null; renderModal(); } },
  addany(t) { const c = cls(t.dataset.id); if (!c) return; const used = new Set(occ(c.id).map(r => r.bike)); let b = null; for (let i = 1; i <= c.maxBikes; i++) if (!used.has(i)) { b = i; break; } if (!b) return toast('A aula está lotada', 'err'); ui.modal = { type: 'bikeadm', classId: c.id, bike: b, mode: 'student' }; renderModal(); },
  movebike(t) { ui.moving = { classId: t.dataset.c, resId: t.dataset.id }; ui.modal = null; render(); },
  movecancel() { ui.moving = null; render(); },
  allpresent(t) { const id = t.dataset.id; confirmBox('Marcar todas como presentes?', 'Quem ainda está "aguardando" vira presente. Quem já foi marcada como falta continua.', 'Marcar todas', () => act('allpresent', { classId: id })); },
  qadj(t) { act('adjust', { userId: t.dataset.id, amount: Number(t.dataset.n), reason: 'Ajuste rápido' }); },
  att(t) { if (ui.modal && ui.modal.type === 'bikeadm') ui.modal = null; act('att', { id: t.dataset.id, status: t.dataset.s }); },
  rcancel(t) {
    const id = t.dataset.id, r = db.reservations.find(x => x.id === id), u = r && usr(r.userId), ce = r && cls(r.classId); ui.modal = null;
    if (ce && ce.event) {
      const pu = db.purchases.find(p => p.id === r.pay), paid = pu && pu.status === 'paid';
      dialog({ title: `Cancelar a vaga de ${u ? u.name : ''}?`, body: paid ? `Ela pagou ${brl(pu.amount)}. Se você devolver o dinheiro, escolha “Cancelar e estornar” para a venda sair do financeiro (a devolução em si é feita no app da InfinitePay).` : '', buttons: [{ label: 'Voltar', kind: 'btn-line', fn() { } }, { label: paid ? 'Cancelar sem estornar' : 'Cancelar vaga', kind: 'btn-bad', fn() { act('rcancel', { id, mode: 'plain' }); } }, ...(paid ? [{ label: 'Cancelar e estornar', fn() { act('rcancel', { id, mode: 'refundMoney' }); } }] : [])] });
      return;
    }
    dialog({ title: `Cancelar a reserva de ${u ? u.name : ''}?`, buttons: [{ label: 'Voltar', kind: 'btn-line', fn() { } }, { label: 'Cancelar sem devolver', kind: 'btn-bad', fn() { act('rcancel', { id, mode: 'plain' }); } }, { label: 'Cancelar e devolver crédito', fn() { act('rcancel', { id, mode: 'refundCredit' }); } }] });
  },
  wlrm(t) { act('wlrm', { id: t.dataset.id }); },
  editclass(t) { ui.editClass = t.dataset.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  editcancel() { ui.editClass = null; render(); },
  turma(t) { ui.openRoster = ui.openRoster === t.dataset.id ? '' : t.dataset.id; render(); },
  cancelclass(t) {
    const id = t.dataset.id, c = cls(id), n = occ(id).length;
    dialog({ title: 'Cancelar essa aula?', body: n ? (c && c.event ? `${n} aluna(s) já reservaram: elas são avisadas e as vendas ficam marcadas como estornadas (devolva o valor no app da InfinitePay).` : `${n} aluna(s) já reservaram: o crédito volta para todas e elas são avisadas.`) : '', input: n ? 'Motivo (as alunas vão ver)' : null, buttons: [{ label: 'Voltar', kind: 'btn-line', fn() { } }, { label: 'Cancelar aula', kind: 'btn-bad', fn(reason) { act('classCancel', { id, reason }); } }] });
  },
  dupweek() { confirmBox('Duplicar semana', 'Copia as aulas dos próximos 7 dias para a semana seguinte.', 'Duplicar', () => act('dupweek')); },
  ostud(t) { ui.openStudent = ui.openStudent === t.dataset.id ? null : t.dataset.id; render(); },
  sfilter(t) { ui.filter = t.dataset.k; render(); },
  newstud() { dialog({ title: 'Nova aluna', body: 'Cadastre quem reserva pelo WhatsApp. Depois você pode criar o acesso dela (e-mail e senha).', input: 'Nome completo', buttons: [{ label: 'Voltar', kind: 'btn-line', fn() { } }, { label: 'Continuar', fn(name) { dialog({ title: 'WhatsApp da aluna', input: 'DDD + número', buttons: [{ label: 'Voltar', kind: 'btn-line', fn() { } }, { label: 'Cadastrar', async fn(ph) { const j = await act('newStudent', { name, phone: ph }); if (j && j.userId) { ui.openStudent = j.userId; render(); } } }] }); } }] }); },
  block(t) { act('block', { id: t.dataset.id }); },
  markpaid(t) { const id = t.dataset.id, pu = db.purchases.find(p => p.id === id), u = pu && usr(pu.userId), evp = pu && pu.kind === 'event'; confirmBox(evp ? 'Confirmar a vaga?' : 'Liberar os créditos?', `Confirme que ${esc(u ? u.name : '')} pagou ${brl(pu ? pu.amount : 0)}. Use só se você viu o dinheiro entrar no app da InfinitePay.`, 'Já recebi · liberar', () => act('markPaid', { id })); },
  dropbuy(t) { act('dropOrder', { id: t.dataset.id }); },
  pkgdel(t) { const id = t.dataset.id, p = pkg(id); if (!p) return; confirmBox('Apagar esse plano?', esc(p.name), 'Apagar', () => act('pkgDel', { id }), true); },
  refund(t) { const id = t.dataset.id, pu = db.purchases.find(p => p.id === id); confirmBox('Estornar essa venda?', `${brl(pu ? pu.amount : 0)} — os créditos não usados serão retirados. Se foi pago online, devolva o dinheiro no app da InfinitePay.`, 'Estornar', () => act('refund', { id }), true); },
  subend(t) { const id = t.dataset.id; confirmBox('Encerrar essa mensalidade?', 'Ela deixa de ser cobrada.', 'Encerrar', () => act('subEnd', { id }), true); },
  async chargesub(t) { const j = await act('chargeSub', { id: t.dataset.id }); if (j && j.url) showLink(j.url, db.subs.find(x => x.id === t.dataset.id)); },
  anndel(t) { const id = t.dataset.id; confirmBox('Apagar esse aviso?', '', 'Apagar', () => act('annDel', { id }), true); },
  resetpw(t) { const id = t.dataset.id, u = usr(id); dialog({ title: 'Redefinir senha de ' + (u ? u.name : ''), body: 'Digite uma senha temporária (mínimo 8 caracteres) e passe para a pessoa. Ela poderá trocar depois em Conta.', input: 'Nova senha', buttons: [{ label: 'Voltar', kind: 'btn-line', fn() { } }, { label: 'Redefinir', fn(pw) { act('resetPassword', { userId: id, password: pw }); } }] }); },
  createaccess(t) { const id = t.dataset.id; dialog({ title: 'Criar acesso', body: 'E-mail da aluna:', input: 'e-mail@exemplo.com', buttons: [{ label: 'Voltar', kind: 'btn-line', fn() { } }, { label: 'Continuar', fn(email) { dialog({ title: 'Senha temporária', body: 'Mínimo 8 caracteres. Passe para a aluna junto com o e-mail.', input: 'Senha temporária', buttons: [{ label: 'Voltar', kind: 'btn-line', fn() { } }, { label: 'Criar acesso', fn(pw) { act('createAccess', { userId: id, email, password: pw }); } }] }); } }] }); },
  teamremove(t) { const id = t.dataset.id, u = usr(id); confirmBox('Remover o acesso de administradora?', esc(u ? u.name : '') + ' volta a ser aluna.', 'Remover', () => act('teamRemove', { userId: id }), true); },
  async testcheckout() { const j = await act('testCheckout'); if (j && j.url) dialog({ title: 'Conexão funcionando ✔', body: 'O link de teste foi criado. Pode abrir para ver como o checkout aparece (não precisa pagar).', buttons: [{ label: 'Fechar', kind: 'btn-line', fn() { } }, { label: 'Abrir checkout', fn() { window.open(j.url, '_blank', 'noopener'); } }] }); },
  export(t) { exportCsv(t.dataset.k); },
  copy(t) { const txt = t.dataset.text; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Link copiado'), () => toast('Não consegui copiar. Selecione o texto manualmente.', 'err')); }
};
/** Mostra o link de cobrança com botões de copiar e enviar pelo WhatsApp. */
function showLink(url, subOrUser) {
  const u = subOrUser && (usr(subOrUser.userId) || subOrUser); const msg = `Oi ${u && u.name ? u.name.split(' ')[0] : ''}! Aqui está o link para finalizar seu pagamento no Spinning Fany: ${url}`;
  ui.modal = { type: 'dialog', title: 'Link de pagamento pronto', body: `Envie para a aluna. Pagou, os créditos caem sozinhos.<div class="mono" style="margin-top:10px">${esc(url)}</div>`, input: null, buttons: [{ label: 'Fechar', kind: 'btn-line' }, { label: 'Copiar link', kind: 'btn-line' }, { label: u && u.phone ? 'Enviar no WhatsApp' : 'Abrir', kind: 'btn' }] };
  ui.fns = [() => { }, () => acts.copy({ dataset: { text: url } }), () => window.open(u && u.phone ? waLink(u.phone, msg) : url, '_blank', 'noopener')]; renderModal();
}

/* ── formulários ── */
const forms = {
  async login(f) {
    ui.authKeep = { email: el(f, 'email').value };
    try { await http('POST', '/api/login', { email: el(f, 'email').value, password: el(f, 'password').value }); afterLogin(); } catch (e) { toast(e.message, 'err'); }
  },
  async signup(f) {
    ui.authKeep = { name: el(f, 'name').value, email: el(f, 'email').value, phone: el(f, 'phone').value, cpf: el(f, 'cpf').value };
    try { await http('POST', '/api/signup', { name: el(f, 'name').value, email: el(f, 'email').value, phone: el(f, 'phone').value, cpf: el(f, 'cpf').value, password: el(f, 'password').value, acceptTerms: el(f, 'terms').checked, mktOptIn: el(f, 'mkt').checked }); ui.authKeep = {}; toast(server.emailEnabled ? 'Conta criada! Confirme seu e-mail para reservar 💛' : 'Conta criada! Bem-vinda 💛'); afterLogin(); } catch (e) { toast(e.message, 'err'); }
  },
  async gcomplete(f) {
    if (!ui.gpending) return; ui.authKeep = { phone: el(f, 'phone').value, cpf: el(f, 'cpf').value };
    try { await http('POST', '/api/google/complete', { pending: ui.gpending.pending, cpf: el(f, 'cpf').value, phone: el(f, 'phone').value, acceptTerms: el(f, 'terms').checked, mktOptIn: el(f, 'mkt').checked }); ui.gpending = null; ui.authKeep = {}; toast('Conta criada! Bem-vinda 💛'); afterLogin(); } catch (e) { toast(e.message, 'err'); }
  },
  async forgot(f) { try { await http('POST', '/api/forgot', { email: el(f, 'email').value }); toast('Se esse e-mail tiver conta, enviamos o link. Confira também o spam.'); ui.authMode = 'login'; render(); } catch (e) { toast(e.message, 'err'); } },
  async reset(f) { try { await http('POST', '/api/reset', { token: f.dataset.token, password: el(f, 'password').value }); toast('Senha alterada! Entre com a senha nova.'); ui.authMode = 'login'; sess = null; go('entrar'); } catch (e) { toast(e.message, 'err'); } },
  emailprefs(f) { act('emailPrefs', { mkt: el(f, 'mkt').checked, notify: el(f, 'notify').checked }); },
  campaign(f) { act('campaignSend', { audience: el(f, 'audience').value, subject: el(f, 'subject').value, body: el(f, 'body').value, buttonLabel: el(f, 'buttonLabel').value, buttonUrl: el(f, 'buttonUrl').value }); },
  profile(f) { act('profile', { name: el(f, 'name').value, phone: el(f, 'phone').value, emergency: el(f, 'emergency').value, cpf: el(f, 'cpf') ? el(f, 'cpf').value : '' }); },
  async password(f) { const j = await act('password', { current: el(f, 'current').value, next: el(f, 'next').value }); if (j) f.reset(); },
  gift(f) {
    const phone = el(f, 'phone').value, name = el(f, 'name').value, amount = Number(el(f, 'amount').value), msg = el(f, 'msg').value;
    const u = me(); if (!Number.isInteger(amount) || amount < 1) return toast('Informe quantos créditos quer enviar.', 'err'); if (amount > u.credits) return toast(`Você só tem ${u.credits} crédito(s).`, 'err'); if (!validPhone(phone)) return toast('WhatsApp inválido. Use DDD + número, ex: (18) 99667-6637', 'err');
    confirmBox('Enviar créditos de presente?', `${amount} crédito(s) para <b>${esc(fPhone(normPhone(phone)))}</b>. Não dá para desfazer — só a Fany consegue ajustar depois.`, 'Enviar', () => act('gift', { phone, name, amount, msg }));
  },
  adjust2(f) { if (!el(f, 'uid').value) return toast('Escolha a aluna', 'err'); const q = num(el(f, 'qty').value, 1, 200, 0); act('adjust', { userId: el(f, 'uid').value, amount: el(f, 'op').value === 'take' ? -q : q, reason: el(f, 'reason').value }); },
  adjust(f) { act('adjust', { userId: f.dataset.id, amount: el(f, 'amount').value, reason: el(f, 'reason').value }); },
  admres(f) { const m = ui.modal; if (!m || m.type !== 'bikeadm') return; m.keep = { uid: el(f, 'uid').value, method: el(f, 'method').value }; if (!el(f, 'uid').value) return toast('Escolha a aluna', 'err'); act('book', { classId: m.classId, bike: m.bike, userId: el(f, 'uid').value, method: el(f, 'method').value }).then(j => { if (j) { ui.modal = null; renderModal(); } }); },
  admwalk(f) { const m = ui.modal; if (!m || m.type !== 'bikeadm') return; m.keep = { name: el(f, 'name').value, phone: el(f, 'phone').value, method: el(f, 'method').value }; act('book', { classId: m.classId, bike: m.bike, walk: { name: el(f, 'name').value, phone: el(f, 'phone').value }, method: el(f, 'method').value }).then(j => { if (j) { ui.modal = null; renderModal(); } }); },
  async class(f) {
    const body = { id: ui.editClass || '', title: el(f, 'title').value, instructor: el(f, 'instructor').value, start: el(f, 'start').value ? new Date(el(f, 'start').value).toISOString() : '', duration: el(f, 'duration').value, maxBikes: el(f, 'maxBikes').value, level: el(f, 'level').value, notes: el(f, 'notes').value };
    if (el(f, 'price')) { body.price = el(f, 'price').value; body.theme = el(f, 'theme').value; }
    const j = await act('classSave', body); if (j) { ui.editClass = null; render(); }
  },
  series(f) { act('series', { title: el(f, 'title').value, days: [0, 1, 2, 3, 4, 5, 6].filter(i => el(f, 'd' + i).checked), hour: el(f, 'hour').value, minute: el(f, 'minute').value, weeks: el(f, 'weeks').value, duration: el(f, 'duration').value, maxBikes: el(f, 'maxBikes').value }); },
  studedit(f) { act('studEdit', { id: f.dataset.id, name: el(f, 'name').value, phone: el(f, 'phone').value, emergency: el(f, 'emergency').value, obs: el(f, 'obs').value }); },
  sale(f) { act('sale', { userId: f.dataset.id, packageId: el(f, 'pkg').value, method: el(f, 'method').value }); },
  quicksale(f) { if (!el(f, 'uid').value) return toast('Escolha a aluna', 'err'); act('sale', { userId: el(f, 'uid').value, packageId: el(f, 'pkg').value, method: el(f, 'method').value }); },
  pkg(f) { act('pkgSave', { id: f.dataset.id, name: el(f, 'name').value, credits: el(f, 'credits').value, price: el(f, 'price').value, desc: el(f, 'desc').value, kind: el(f, 'kind').value, validity: el(f, 'validity').value, active: el(f, 'active').checked, highlight: el(f, 'highlight').checked, sort: el(f, 'sort').value }); },
  spec(f) { act('specSave', { id: f.dataset.id || '', name: el(f, 'name').value, price: el(f, 'price').value, theme: el(f, 'theme').value, maxBikes: el(f, 'maxBikes').value, duration: el(f, 'duration').value, desc: el(f, 'desc').value, active: el(f, 'active').checked, applyAll: el(f, 'applyAll') ? el(f, 'applyAll').checked : false }); },
  specsched(f) { if (!el(f, 'start').value) return toast('Escolha data e hora', 'err'); act('specSchedule', { id: f.dataset.id, start: new Date(el(f, 'start').value).toISOString() }); },
  ann(f) { act('annPost', { title: el(f, 'title').value, body: el(f, 'body').value }); },
  payhandle(f) { act('payHandle', { handle: el(f, 'handle').value }); },
  async charge(f) { if (!el(f, 'uid').value) return toast('Escolha a aluna', 'err'); const uid_ = el(f, 'uid').value; const j = await act('charge', { userId: uid_, packageId: el(f, 'pkg').value }); if (j && j.url) showLink(j.url, usr(uid_)); },
  teamadd(f) { act('teamAdd', { name: el(f, 'name').value, email: el(f, 'email').value, password: el(f, 'password').value }).then(j => { if (j) f.reset(); }); },
  studio(f) {
    const vals = { name: el(f, 'name').value, address: el(f, 'address').value, whatsapp: el(f, 'whatsapp').value, instructor: el(f, 'instructor').value, instagram: el(f, 'instagram').value, about: el(f, 'about').value, maxBikes: el(f, 'maxBikes').value, duration: el(f, 'duration').value, cancelHours: el(f, 'cancelHours').value, terms: el(f, 'terms').value, reminder: el(f, 'reminder').value, gifts: el(f, 'gifts').checked };
    const nb = num(vals.maxBikes, 1, 80, 8), nd = num(vals.duration, 15, 240, 45), changed = nb !== S().maxBikes || nd !== S().duration;
    const future = db.classes.filter(c => c.active && !c.event && isFuture(c) && (c.maxBikes !== nb || c.duration !== nd)).length;
    if (changed && future) dialog({ title: 'Aplicar às aulas que já estão na agenda?', body: `Você mudou a quantidade de bikes ou a duração. Há ${future} aula(s) futura(s) com o valor antigo. Quem já reservou uma bike que deixar de existir é realocada e avisada. (A Aula Temática tem configuração própria.)`, buttons: [{ label: 'Só para novas aulas', kind: 'btn-line', fn: () => act('studio', { ...vals, applyAll: false }) }, { label: 'Aplicar a todas as futuras', fn: () => act('studio', { ...vals, applyAll: true }) }] });
    else act('studio', { ...vals, applyAll: false });
  }
};

/* ── eventos ── */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const fn = acts[t.dataset.act]; if (!fn) return;
  if (t.tagName === 'A' && !['to', 'gotab'].includes(t.dataset.act) && !t.getAttribute('href')?.startsWith('#')) e.preventDefault();
  fn(t, e);
});
document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault(); const fn = forms[f.dataset.form]; if (fn) fn(f); });
document.addEventListener('input', e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.mask === 'cpf') { t.value = maskCpfInput(t.value); return; }
  if (t.dataset.live === 'q') { ui.q = t.value; const l = $('#slist'); if (l) l.innerHTML = studentList(); }
  else if (t.dataset.live === 'cq') { ui.cq = t.value; const l = $('#clist'); if (l) l.innerHTML = creditList(); }
});
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.change === 'days') { ui.days = Number(t.value); render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.modal) { ui.modal = null; renderModal(); } });
window.addEventListener('hashchange', () => { ui.modal = null; render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && !ui.modal && route() !== 'pago') { await refresh(); render(); } });
setInterval(async () => { if (document.visibilityState === 'visible' && !ui.modal && ['conta', 'painel'].includes(route()) && !busy && !document.activeElement?.matches?.('input,textarea,select')) { await refresh(); render(); } }, 45000);

/* ── desenho ── */
function render() {
  if (!db) return;
  const r = route(), y = window.scrollY; let html;
  const okm = (location.hash.match(/[?&]ok=(\w+)/) || [])[1];
  if (okm && r === 'entrar') { history.replaceState(null, '', '#/entrar'); setTimeout(() => toast(okm === 'verificado' ? 'E-mail confirmado! Agora é só entrar 💛' : 'Link inválido ou já usado. Se você já confirmou, é só entrar.', okm === 'verificado' ? 'ok' : 'err'), 0); }
  if (r === 'redefinir') { $('#app').innerHTML = viewReset(); renderModal(); window.scrollTo(0, 0); return; }
  if (r === 'entrar') { if (sess) { go(isAdmin() ? 'painel' : 'conta'); return; } html = viewLogin(); }
  else if (r === 'conta') { if (!sess) { go('entrar'); return; } html = viewStudent(); if (ui.pendingClass) { const pc = cls(ui.pendingClass); ui.pendingClass = null; ui.stab = 'agenda'; const had = pc && db.reservations.some(x => sess && x.userId === sess.userId && x.classId === pc.id && x.status === 'confirmed'); if (had) setTimeout(() => toast('Você já tem reserva nessa aula 😉'), 0); else if (pc && pc.active && isFuture(pc) && occ(pc.id).length < pc.maxBikes && !ui.modal) ui.modal = { type: 'seat', classId: pc.id, pick: null }; html = viewStudent(); } }
  else if (r === 'painel') { if (!isAdmin()) { go(sess ? 'conta' : 'entrar'); return; } html = viewAdmin(); }
  else if (r === 'pago') { html = viewPago(); }
  else html = viewHome();
  $('#app').innerHTML = html; renderModal();
  if (r === 'pago') startPoll();
  if (r === 'entrar') initGoogle();
  if (ui.scrollTo && r === '') { const x = document.getElementById(ui.scrollTo); ui.scrollTo = null; if (x) { x.scrollIntoView(); return; } }
  window.scrollTo(0, y);
  document.title = (r === 'painel' ? 'Painel · ' : '') + S().name;
}
(async function boot() { await refresh(); if (!db) { $('#app').innerHTML = '<p style="padding:40px;text-align:center">Não consegui carregar. Atualize a página.</p>'; return; } render(); })();

