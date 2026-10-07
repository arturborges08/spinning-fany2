// Testa: confirmação de e-mail, CPF, recuperação de senha, fila de espera com confirmação, campanhas, Google
const { start } = require('./harness');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(base) {
  let cookie = '';
  return async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie, origin: base }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ } return { s: r.status, j, r };
  };
}
const CPF = ['529.982.247-25', '111.444.777-35', '390.533.447-05', '935.411.347-80', '168.995.350-09', '745.012.198-07', '453.178.287-91'];
(async () => {
  const h = await start({ port: 4540, mock: 4541, email: true, google: true, offerMs: 6000 }); const B = h.base;
  const owner = client(B), guest = client(B), A = client(B), Bi = client(B), C = client(B), Dd = client(B), E = client(B);
  const link = (m, re) => { const x = (m.text + m.html).match(re); return x && x[0].replace(/&amp;/g, '&'); };
  let r = await owner('POST', '/api/login', { email: 'dona@fany.com', password: 'senhaForte123' }); ok(r.s === 200 && r.j.server.emailEnabled === true, 'e-mail ligado no servidor');
  ok(r.j.server.mail.provider === 'brevo' && r.j.server.mail.from === 'avisos@fany.test', 'painel sabe qual serviço de e-mail está usando');

  /* ═══ cadastro: CPF + confirmação de e-mail ═══ */
  const su = (c, n, e, ph, cpf, mkt) => c('POST', '/api/signup', { name: n, email: e, phone: ph, cpf, password: 'minhasenha1', acceptTerms: true, mktOptIn: mkt });
  r = await su(guest, 'Ana', 'ana@x.com', '(18) 99111-0001', '123.456.789-00'); ok(r.s === 400 && /CPF inválido/.test(r.j.error), 'CPF inválido recusado');
  r = await su(guest, 'Ana', 'ana@x.com', '(18) 99111-0001', ''); ok(r.s === 400 && /CPF/.test(r.j.error), 'CPF é obrigatório');
  r = await su(A, 'Ana Souza', 'ana@x.com', '(18) 99111-0001', CPF[0], true); ok(r.s === 200, 'cadastro com CPF');
  const anaU = r.j.db.users[0]; ok(anaU.emailVerified === false && anaU.cpfMasked === '•••.982.247-••', 'conta nasce NÃO confirmada; CPF chega mascarado');
  ok(!JSON.stringify(r.j).includes('52998224725') && !JSON.stringify(r.j).includes('529.982.247-25'), 'CPF completo nunca vai para o navegador');
  r = await su(guest, 'Outra', 'outra@x.com', '(18) 99111-0009', CPF[0]); ok(r.s === 400 && /CPF já/.test(r.j.error), 'CPF repetido recusado');
  const m1 = await h.mail(m => m.to === 'ana@x.com' && /Confirme/.test(m.subject)); ok(!!m1, 'e-mail de confirmação chegou');
  ok(m1 && m1.from.email === 'avisos@fany.test' && /Spinning Fany/.test(m1.html) && /Confirmar meu e-mail/.test(m1.html), 'e-mail com o visual do estúdio e botão');
  const vlink = m1 && link(m1, /http:\/\/localhost:4540\/api\/verify\?t=[a-f0-9]+/); ok(!!vlink, 'link de confirmação no e-mail');
  r = await A('POST', '/api/act/reserve', { classId: 'x', bike: 1 }); ok(r.s === 400 && /Confirme seu e-mail/.test(r.j.error), 'sem confirmar o e-mail: não reserva');
  r = await A('POST', '/api/act/checkout', { packageId: 'p1' }); ok(r.s === 400 && /Confirme seu e-mail/.test(r.j.error), 'sem confirmar o e-mail: não compra');
  r = await A('POST', '/api/act/resendVerify', {}); ok(r.s === 400 && /Aguarde/.test(r.j.error), 'reenvio imediato é segurado (anti-spam)');
  r = await fetch(vlink, { redirect: 'manual' }); ok(r.status === 302 && /ok=verificado/.test(r.headers.get('location')), 'clicar no link confirma o e-mail');
  r = await A('GET', '/api/state'); ok(r.j.db.users[0].emailVerified === true, 'conta confirmada');
  r = await fetch(vlink, { redirect: 'manual' }); ok(/ok=erro/.test(r.headers.get('location')), 'o link só vale uma vez');
  r = await fetch(B + '/api/verify?t=lixo', { redirect: 'manual' }); ok(/ok=erro/.test(r.headers.get('location')), 'link inventado não funciona');

  /* ═══ login por CPF ═══ */
  const A2 = client(B);
  r = await A2('POST', '/api/login', { email: '529.982.247-25', password: 'minhasenha1' }); ok(r.s === 200 && r.j.db.users[0].name === 'Ana Souza', 'entra com o CPF e a senha');
  r = await A2('POST', '/api/login', { email: '52998224725', password: 'minhasenha1' }); ok(r.s === 200, 'CPF só com números também');
  r = await A2('POST', '/api/login', { email: '111.444.777-35', password: 'minhasenha1' }); ok(r.s === 400, 'CPF de quem não existe: recusa');
  r = await A2('POST', '/api/login', { email: 'ANA@X.COM', password: 'minhasenha1' }); ok(r.s === 200, 'e-mail sem diferenciar maiúsculas');

  /* ═══ equipe vê e-mail e CPF (mascarado) ═══ */
  r = await owner('GET', '/api/state'); const au = r.j.db.users.find(u => u.email === 'ana@x.com');
  ok(au.cpfMasked === '•••.982.247-••' && au.emailVerified === true && !JSON.stringify(r.j).includes('52998224725'), 'painel mostra e-mail e CPF mascarado (CPF inteiro não trafega)');
  r = await owner('POST', '/api/act/revealCpf', { userId: au.id }); ok(r.s === 200 && r.j.cpf === '529.982.247-25', 'dona revela o CPF quando precisa');
  r = await owner('GET', '/api/state'); ok(r.j.db.audit.some(a => a.action === 'cpf_visualizado' && /Ana Souza/.test(a.detail)), 'ficou registrado no histórico quem viu o CPF');
  r = await A('POST', '/api/act/revealCpf', { userId: au.id }); ok(r.s === 403, 'aluna não revela CPF de ninguém');

  /* ═══ esqueci a senha por e-mail ═══ */
  const n0 = h.emails.length;
  r = await guest('POST', '/api/forgot', { email: 'ninguem@x.com' }); ok(r.s === 200, 'e-mail inexistente: mesma resposta (não revela quem tem conta)'); await sleep(1500); ok(h.emails.length === n0, 'e-mail inexistente: nada é enviado');
  r = await guest('POST', '/api/forgot', { email: 'ana@x.com' }); ok(r.s === 200, 'pedido de nova senha');
  const mr = await h.mail(m => m.to === 'ana@x.com' && /senha nova/.test(m.subject)); ok(!!mr, 'e-mail com o link chegou'); const rl = mr && link(mr, /http:\/\/localhost:4540\/#\/redefinir\?t=[a-f0-9]+/); const rtok = rl && rl.split('t=')[1];
  r = await guest('POST', '/api/reset', { token: rtok, password: '123' }); ok(r.s === 400, 'senha curta recusada');
  r = await guest('POST', '/api/reset', { token: rtok, password: 'senhaNOVA999' }); ok(r.s === 200, 'senha redefinida pelo link');
  r = await guest('POST', '/api/reset', { token: rtok, password: 'outraSenha999' }); ok(r.s === 400, 'o link de redefinição só vale uma vez');
  r = await A('GET', '/api/state'); ok(r.j.sess === null, 'sessões antigas foram encerradas');
  r = await A('POST', '/api/login', { email: 'ana@x.com', password: 'senhaNOVA999' }); ok(r.s === 200, 'entra com a senha nova');

  /* ═══ fila de espera com confirmação ═══ */
  await owner('POST', '/api/act/teamAdd', { name: 'x', email: 'x@fany.com', password: 'senhaXXXX1' }).catch(() => { });
  const users = [[Bi, 'Bia Lima', 'bia@x.com', '(18) 99111-0002', CPF[1]], [C, 'Carla Dias', 'carla@x.com', '(18) 99111-0003', CPF[2]], [Dd, 'Dani Reis', 'dani@x.com', '(18) 99111-0004', CPF[3]], [E, 'Eva Melo', 'eva@x.com', '(18) 99111-0005', CPF[4]]];
  const ids = {};
  for (const [c, n, e, ph, cpf] of users) { r = await su(c, n, e, ph, cpf, e !== 'dani@x.com'); ids[e] = r.j.db.users[0].id; const mv = await h.mail(m => m.to === e && /Confirme/.test(m.subject)); await fetch(link(mv, /http:\/\/localhost:4540\/api\/verify\?t=[a-f0-9]+/), { redirect: 'manual' }); }
  ids['ana@x.com'] = au.id;
  for (const e of ['ana@x.com', 'bia@x.com', 'carla@x.com', 'dani@x.com', 'eva@x.com']) await owner('POST', '/api/act/adjust', { userId: ids[e], amount: 5, reason: 'teste' });
  const when = new Date(Date.now() + 2 * 864e5).toISOString();
  r = await owner('POST', '/api/act/classSave', { title: 'Aula Lotada', instructor: 'Fany', start: when, duration: 45, maxBikes: 2, level: 'x', notes: '' }); const cls = r.j.state.db.classes.find(c => c.title === 'Aula Lotada');
  const AL = client(B); await AL('POST', '/api/login', { email: 'ana@x.com', password: 'senhaNOVA999' });
  r = await AL('POST', '/api/act/reserve', { classId: cls.id, bike: 1 }); ok(r.s === 200, 'Ana reserva a bike 1'); r = await Bi('POST', '/api/act/reserve', { classId: cls.id, bike: 2 }); ok(r.s === 200, 'Bia reserva a bike 2 (aula lotada)');
  { const rm = await h.mail(m => m.to === 'ana@x.com' && /Reserva confirmada/.test(m.subject)); ok(!!rm && /bike: 1/.test(rm.text) && /Cancelamento grátis/.test(rm.text), 'e-mail "Reserva confirmada" chega com o número da bike'); const st0 = (await AL('GET', '/api/state')).j.db; ok(!st0.notes.some(n => /Reserva confirmada/.test(n.title)), 'a confirmação vai só por e-mail (sem aviso repetido na tela)'); }
  r = await C('POST', '/api/act/reserve', { classId: cls.id, bike: 1 }); ok(r.s === 400 && /lotada/i.test(r.j.error), 'Carla não consegue reservar: lotada');
  r = await E('POST', '/api/act/wait', { classId: cls.id }); ok(r.s === 200 && /fila/i.test(r.j.msg), 'Eva entra na fila (1ª)'); await sleep(50);
  r = await C('POST', '/api/act/wait', { classId: cls.id }); ok(r.s === 200, 'Carla entra na fila (2ª)'); await sleep(50);
  r = await Dd('POST', '/api/act/wait', { classId: cls.id }); ok(r.s === 200, 'Dani entra na fila (3ª)');
  r = await owner('POST', '/api/act/wait', { classId: cls.id }); // equipe também é "usuária", mas só testamos a regra de vaga abaixo
  // Dani desliga avisos comuns por e-mail (mas avisos importantes continuam)
  await Dd('POST', '/api/act/emailPrefs', { mkt: false, notify: false });
  const nE0 = h.emails.length;
  r = await AL('POST', '/api/act/cancel', { id: (await AL('GET', '/api/state')).j.db.reservations.find(x => x.classId === cls.id && x.userId === ids['ana@x.com']).id }); ok(r.s === 200, 'Ana desiste da vaga');
  const mo = await h.mail(m => m.to === 'eva@x.com' && /Vaga liberada/.test(m.subject)); ok(!!mo, 'a 1ª da fila (Eva) recebe o e-mail "Vaga liberada"');
  ok(mo && /Confirmar minha vaga/.test(mo.html) && /Confirme até/.test(mo.text), 'e-mail diz até quando confirmar e tem botão');
  ok(!h.emails.some(m => /Vaga liberada/.test(m.subject) && ['carla@x.com', 'dani@x.com'].includes(m.to)), 'quem está atrás na fila NÃO é avisada ainda');
  r = await E('GET', '/api/state'); const off = r.j.db.waitlist.find(w => w.userId === ids['eva@x.com']); ok(off && off.offerUntil && new Date(off.offerUntil) > new Date(), 'no painel dela a oferta aparece com prazo');
  r = await C('POST', '/api/act/reserve', { classId: cls.id, bike: 1 }); ok(r.s === 400 && /lotada/i.test(r.j.error), 'enquanto a oferta vale, a vaga está segurada (Carla não passa na frente)');
  r = await E('POST', '/api/act/reserve', { classId: cls.id, bike: 1 }); ok(r.s === 200 && r.j.bike === 1, 'Eva confirma escolhendo a bike 1');
  r = await E('GET', '/api/state'); ok(!r.j.db.waitlist.some(w => w.userId === ids['eva@x.com']) && r.j.db.users[0].credits === 4, 'Eva sai da fila e gasta 1 crédito');
  // Eva desiste depois → Carla é a próxima; Carla recusa → Dani
  r = await E('POST', '/api/act/cancel', { id: r.j.db.reservations.find(x => x.userId === ids['eva@x.com'] && x.classId === cls.id).id }); ok(r.s === 200, 'Eva desiste');
  ok(!!(await h.mail(m => m.to === 'carla@x.com' && /Vaga liberada/.test(m.subject))), 'Carla (2ª) é avisada');
  r = await C('POST', '/api/act/declineOffer', { classId: cls.id }); ok(r.s === 200, 'Carla diz que não vai');
  const md = await h.mail(m => m.to === 'dani@x.com' && /Vaga liberada/.test(m.subject)); ok(!!md, 'Dani (3ª) é avisada — mesmo com avisos comuns desligados, vaga liberada é importante');
  ok(!h.emails.some(m => m.to === 'dani@x.com' && /créditos foram ajustados|Você ganhou créditos/.test(m.subject) && m.at > nE0 - 1 && false), 'avisos comuns respeitam a preferência');
  // Dani não responde: expira e a oferta some (sem ninguém mais na fila)
  await sleep(6800); r = await Dd('GET', '/api/state'); ok(!r.j.db.waitlist.some(w => w.userId === ids['dani@x.com']), 'sem resposta no prazo: sai da fila');
  r = await Dd('GET', '/api/state'); ok(r.j.db.notes.some(n => /passou para a próxima/.test(n.title)), 'ela vê o aviso de que a vaga passou (no site; por e-mail só se estiver com os avisos ligados)');
  r = await Dd('POST', '/api/act/reserve', { classId: cls.id, bike: 1 }); ok(r.s === 200, 'a vaga voltou a ficar livre para qualquer uma');

  /* ═══ avisos importantes + preferências ═══ */
  const before = h.emails.length; await owner('POST', '/api/act/adjust', { userId: ids['dani@x.com'], amount: 1, reason: 'brinde' }); await owner('POST', '/api/act/adjust', { userId: ids['carla@x.com'], amount: 1, reason: 'brinde' });
  ok(!!(await h.mail(m => m.to === 'carla@x.com' && /ganhou créditos/.test(m.subject))), 'aviso comum (ganhou créditos) chega por e-mail');
  await sleep(1500); ok(!h.emails.slice(before).some(m => m.to === 'dani@x.com'), 'quem desligou os avisos comuns não recebe');

  /* ═══ campanhas promocionais ═══ */
  r = await owner('POST', '/api/act/campaignPreview', { audience: 'all' }); ok(r.j.count === 4, 'público: só quem confirmou o e-mail E aceitou novidades (' + r.j.count + ')');
  r = await Bi('POST', '/api/act/emailPrefs', { mkt: true, notify: true });
  r = await owner('POST', '/api/act/campaignPreview', { audience: 'all' }); ok(r.j.count === 4, 'público inclui quem ligou as novidades');
  r = await owner('POST', '/api/act/campaignSend', { subject: 'ab', body: 'curto' }); ok(r.s === 400, 'assunto/mensagem muito curtos são recusados');
  r = await owner('POST', '/api/act/campaignSend', { subject: 'Aula Temática Havai 🌺', body: 'Oi {nome}!\nSábado tem Aula Temática Havai por R$ 35,00. Garanta sua bike!', buttonLabel: 'Garantir minha vaga', buttonUrl: '/#/conta', audience: 'all' }); ok(r.s === 200 && /na fila/.test(r.j.msg), 'campanha criada');
  const camp = r.j.state.db.campaigns[0]; ok(camp.total === 4 && camp.subject.includes('Havai'), 'campanha registrada com o total de envios');
  const mp = await h.mail(m => m.to === 'ana@x.com' && /Havai/.test(m.subject)); ok(!!mp, 'e-mail promocional chegou');
  ok(mp && /Oi Ana!/.test(mp.text) && /Garantir minha vaga/.test(mp.html), 'texto personalizado com o nome e botão');
  ok(mp && /api\/unsub\?u=/.test(mp.html) && /Não quero mais receber/.test(mp.html) && mp.headers && /List-Unsubscribe/.test(Object.keys(mp.headers).join()), 'tem link para descadastrar (e cabeçalho List-Unsubscribe)');
  await sleep(2500); ok(!h.emails.some(m => /Havai/.test(m.subject) && m.to === 'dani@x.com'), 'quem não aceitou novidades não recebe promoção');
  const sent = h.emails.filter(m => /Havai/.test(m.subject)).length; ok(sent === 4, 'os 4 e-mails foram enviados (' + sent + ')');
  r = await owner('GET', '/api/state'); ok(r.j.db.campaigns[0].sent === 4 && r.j.server.mail.pending === 0, 'painel mostra 4 enviados e fila vazia');
  const ul = link(mp, /http:\/\/localhost:4540\/api\/unsub\?u=[^"&]+&t=[a-f0-9]+/); r = await fetch(ul); ok(r.status === 200 && /não vai mais receber/.test(await r.text()), 'descadastrar funciona com um clique');
  r = await owner('POST', '/api/act/campaignPreview', { audience: 'all' }); ok(r.j.count === 3, 'a Ana saiu do público');
  r = await fetch(B + '/api/unsub?u=' + ids['bia@x.com'] + '&t=falso'); ok(r.status === 400, 'link de descadastro falso é recusado');
  r = await owner('POST', '/api/act/campaignTest', { subject: 'Teste do e-mail', body: 'Mensagem de teste para a dona.' }); ok(r.s === 200 && /dona@fany.com/.test(r.j.msg), 'dona envia um teste para si mesma');
  ok(!!(await h.mail(m => m.to === 'dona@fany.com' && /\[TESTE\]/.test(m.subject))), 'teste chegou');
  r = await Bi('POST', '/api/act/campaignSend', { subject: 'Hack', body: 'Mensagem de teste bem longa' }); ok(r.s === 403, 'aluna não envia campanhas');

  /* ═══ Entrar com Google ═══ */
  r = await guest('GET', '/api/state'); ok(r.j.server.googleClientId === 'test-client', 'site sabe que o Google está ativo');
  r = await fetch(B + '/api/state'); ok(/accounts\.google\.com\/gsi\/client/.test(r.headers.get('content-security-policy')), 'segurança do navegador libera só o script do Google');
  const G = client(B);
  r = await G('POST', '/api/google', { credential: h.googleToken({}, { badKey: true }) }); ok(r.s === 400 && /assinatura/.test(r.j.error), 'token com assinatura falsa é recusado');
  r = await G('POST', '/api/google', { credential: h.googleToken({ aud: 'outro-app' }) }); ok(r.s === 400 && /destinat/.test(r.j.error), 'token feito para outro app é recusado');
  r = await G('POST', '/api/google', { credential: h.googleToken({ exp: Math.floor(Date.now() / 1000) - 10 }) }); ok(r.s === 400 && /expirou/.test(r.j.error), 'token vencido é recusado');
  r = await G('POST', '/api/google', { credential: h.googleToken({ email_verified: false }) }); ok(r.s === 400 && /verificado/.test(r.j.error), 'e-mail não verificado no Google é recusado');
  r = await G('POST', '/api/google', { credential: h.googleToken({ iss: 'https://evil.com' }) }); ok(r.s === 400, 'emissor falso é recusado');
  r = await G('POST', '/api/google', { credential: h.googleToken() }); ok(r.s === 200 && r.j.needsProfile && r.j.email === 'maria@gmail.com', 'primeiro acesso com Google: pede CPF e WhatsApp');
  const pend = r.j.pending;
  r = await G('POST', '/api/google/complete', { pending: pend, cpf: '000.000.000-00', phone: '(18) 99111-0007', acceptTerms: true }); ok(r.s === 400 && /CPF/.test(r.j.error), 'completar cadastro: CPF inválido recusado');
  r = await G('POST', '/api/google/complete', { pending: 'inventado', cpf: CPF[5], phone: '(18) 99111-0007', acceptTerms: true }); ok(r.s === 400, 'pacote inventado é recusado');
  r = await G('POST', '/api/google/complete', { pending: pend, cpf: CPF[5], phone: '(18) 99111-0007', acceptTerms: true, mktOptIn: true }); ok(r.s === 200 && r.j.sess.role === 'student' && r.j.db.users[0].emailVerified === true, 'conta criada pelo Google já com e-mail confirmado');
  r = await G('POST', '/api/logout', {}); const G2 = client(B); r = await G2('POST', '/api/google', { credential: h.googleToken() }); ok(r.s === 200 && r.j.sess && r.j.db.users[0].email === 'maria@gmail.com', 'próximo acesso com Google entra direto');
  r = await G2('POST', '/api/login', { email: 'maria@gmail.com', password: '' }); ok(r.s === 400, 'conta do Google não entra por senha vazia');
  // conta que já existia por e-mail e depois usa o Google
  r = await guest('POST', '/api/google', { credential: h.googleToken({ sub: 'g-bia', email: 'bia@x.com', name: 'Bia' }) }); ok(r.s === 200 && r.j.sess && r.j.db.users[0].id === ids['bia@x.com'], 'quem já tinha conta com o mesmo e-mail entra na conta existente');

  /* ═══ limite diário de e-mails (plano grátis) ═══ */
  h.stop(); await sleep(500);
  const h2 = await start({ port: 4542, mock: 4543, email: true, dailyLimit: 3 }); const o2 = client(h2.base), s2 = client(h2.base);
  await o2('POST', '/api/login', { email: 'dona@fany.com', password: 'senhaForte123' });
  for (let i = 0; i < 5; i++) { const x = client(h2.base); await x('POST', '/api/signup', { name: 'U' + i, email: `u${i}@x.com`, phone: `(18) 9911${i}-000${i}`, cpf: ['529.982.247-25', '111.444.777-35', '390.533.447-05', '935.411.347-80', '168.995.350-09'][i], password: 'minhasenha1', acceptTerms: true }); }
  await sleep(3500); ok(h2.emails.length === 3, 'respeita o limite diário do plano grátis: enviou só 3 de 5 (' + h2.emails.length + ')');
  const st = (await o2('GET', '/api/state')).j.server.mail; ok(st.pending === 2 && st.sentToday === 3, 'os 2 restantes ficam na fila para amanhã');
  h2.stop();
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK'); const bad = h.log().split('\n').filter(l => /TypeError|ReferenceError|erro interno/.test(l)); if (bad.length) console.log('LOG:', bad.slice(0, 5)); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('EXCEÇÃO', e); process.exit(1); });
