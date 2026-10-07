
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
