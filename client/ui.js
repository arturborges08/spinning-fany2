
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
const holdMin = r => Math.max(1, Math.ceil((D(r.holdUntil) - Date.now()) / 6e4));
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
  ${events.length ? `<section class="sec" id="especial"><div class="wrap">${eventBanner(events[0])}<div class="grid g3" style="margin-top:18px">${events.map(eventCardHome).join('')}</div></div></section>` : ''}
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
  const taken = new Set(occ(c.id).map(r => r.bike));
  const cell = i => `<span class="mb ${i === myBike ? 'me' : taken.has(i) ? 'occ' : ''}" title="Bike ${i}">${i === myBike ? '🚴 ' : ''}${i}</span>`;
  return `<div class="mini"><div class="stage" style="font-size:.6rem;margin-top:0">${esc(c.instructor)} · frente</div>${gridMap(c, cell, { cw: 40 })}</div>`;
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
  const c = cls(r.classId), th = c.event ? themeOf(c) : null;
  return `<div class="card nextc ${th ? 'thc' : ''}" style="margin-bottom:16px${th ? ';' + thVars(th) : ''}"><div class="row" style="justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:14px"><div style="min-width:0"><p class="muted xs">SUA PRÓXIMA AULA</p><p style="font:700 1.15rem var(--display);margin:2px 0">${c.event ? evEmoji(c) + ' ' : ''}${esc(c.title)}</p><p class="muted sm">${esc(fWhen(c.start))} · ${c.duration} min</p><div class="row" style="margin-top:10px;gap:6px"><button class="btn-line btn-sm" data-act="change" data-id="${c.id}">Trocar bike</button></div></div><div style="text-align:center;flex:none"><p class="muted xs">SUA BIKE</p><p class="bignum">${r.bike}</p></div></div>${miniRoom(c, r.bike)}</div>`;
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
    const n = c.maxBikes;
    const cell = i => { const isMine = m.change && mineR && mineR.bike === i, off = taken.has(i); return `<button class="bk ${m.pick === i ? 'on' : ''} ${isMine ? 'mine' : ''}" data-act="seatpick" data-n="${i}" ${off ? 'disabled' : ''} aria-label="Bike ${i}${isMine ? ' (sua bike atual)' : off ? ' ocupada' : ''}" aria-pressed="${m.pick === i}">${BIKE_ICON}<span>${i}</span></button>`; };
    const free = n - taken.size, ev = c.event && !m.change;
    inner = `${close}<h3>${m.change ? 'Trocar de bike' : (c.event && evEmoji(c) ? evEmoji(c) + ' ' : '') + 'Escolha sua bike'}</h3><p class="sm" style="margin-bottom:2px"><b>${esc(c.title)}</b> <span class="muted cap">· ${esc(fWhen(c.start))}</span></p><p class="muted xs">${free} ${free === 1 ? 'bike livre' : 'bikes livres'} de ${n}</p>
    <div class="stage">${esc(c.instructor)} · frente da sala</div>
    ${gridMap(c, cell, { cw: 66 })}
    <div class="legend"><span><i></i>Livre</span><span><i class="o"></i>Ocupada</span><span><i class="s"></i>Sua escolha</span></div>
    <p class="muted xs row" style="justify-content:space-between;margin:16px 0 10px"><span>${m.change ? 'Sem custo para trocar' : ev ? `Aula avulsa · ${brl(c.event.price)} no PIX, sem crédito` : `Gasta 1 crédito (você tem ${u.credits})`}</span><span class="gold">${m.pick ? 'Bike ' + m.pick : 'Toque numa bike'}</span></p>
    ${!m.change && !ev && u.credits < 1 ? '<button class="btn btn-block" data-act="gobuy">Comprar créditos</button>' : (ev ? thBtn(themeOf(c), `${m.pick ? (m.change ? 'Trocar para a bike ' + m.pick : ev ? 'Ir para o pagamento · bike ' + m.pick + ' · ' + brl(c.event.price) : 'Confirmar bike ' + m.pick) : 'Confirmar'}`, `data-act="seatok" ${m.pick ? '' : 'disabled'}`, 'btn-block') : `<button class="btn btn-block" data-act="seatok" ${m.pick ? '' : 'disabled'}>${m.pick ? (m.change ? 'Trocar para a bike ' + m.pick : ev ? 'Ir para o pagamento · bike ' + m.pick + ' · ' + brl(c.event.price) : 'Confirmar bike ' + m.pick) : 'Confirmar'}</button>`)}`;
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
  host.innerHTML = `<div class="ov" data-act="ovclose"><div class="modal ${m.type === 'seat' ? 'wide' : ''} ${m.type === 'seat' && cls(m.classId) && cls(m.classId).event ? 'thm' : ''}" ${m.type === 'seat' && cls(m.classId) && cls(m.classId).event ? `style="${thVars(themeOf(cls(m.classId)))}"` : ''} role="dialog" aria-modal="true">${inner}</div></div>`;
}
