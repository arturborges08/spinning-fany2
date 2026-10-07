// Navegador: confirmação de e-mail, CPF, bike sempre visível, fila com confirmação, e-mails promocionais, esqueci a senha
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { start } = require('./harness');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const h = await start({ port: 4560, mock: 4561, email: true }); const B = await chromium.launch(); const errors = [];
  const mk = async (w = 390, hh = 844) => { const ctx = await B.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 2 }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource|net::|accounts\.google/.test(m.text())) errors.push('CONSOLE ' + m.text()); }); p.on('dialog', d => { errors.push('DIALOG nativo ' + d.message()); d.dismiss(); }); return p; };
  const sleep = (p, ms) => p.waitForTimeout(ms);
  const shot = async (p, n) => { await sleep(p, 350); await p.screenshot({ path: `/tmp/g_${n}.png` }); };
  const toast = p => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
  const dlg = async (p, label) => { await p.waitForSelector('.modal [data-act=dlg]'); await p.locator('.modal [data-act=dlg]', { hasText: label }).click(); await sleep(p, 300); };
  const login = async (p, id, pw) => { await p.goto(h.base + '/#/entrar'); await p.waitForSelector('form[data-form=login]'); await p.fill('form[data-form=login] input[name=email]', id); await p.fill('form[data-form=login] input[name=password]', pw); await p.click('form[data-form=login] button[type=submit]'); };
  const signup = async (p, name, email, phone, cpf, mkt) => { await p.goto(h.base + '/#/entrar'); await p.click('[data-act=authmode][data-m=signup]'); await p.fill('input[name=name]', name); await p.fill('input[name=email]', email); await p.fill('input[name=cpf]', cpf); await p.fill('input[name=phone]', phone); await p.fill('input[name=password]', 'senha12345'); await p.check('input[name=terms]'); if (mkt) await p.check('input[name=mkt]'); await p.click('form[data-form=signup] button[type=submit]'); };
  const verify = async (p, email) => { const m = await h.mail(x => x.to === email && /Confirme/.test(x.subject)); const l = (m.text.match(/http:\/\/localhost:4560\/api\/verify\?t=[a-f0-9]+/) || [])[0]; await p.goto(l); await p.waitForSelector('form[data-form=login], .chip'); };
  const state = async p => (await (await fetch(h.base + '/api/state', { headers: { cookie: (await p.context().cookies()).map(c => `${c.name}=${c.value}`).join('; ') } })).json());

  /* ═══ favicon ═══ */
  const ana = await mk(); await ana.goto(h.base); await ana.waitForSelector('.hero');
  const icon = await ana.locator('link[rel=icon][type="image/svg+xml"]').getAttribute('href'); const ir = await fetch(h.base + icon); ok(icon === '/favicon.svg' && ir.status === 200 && /svg/.test(ir.headers.get('content-type')) && /f5c518/.test(await ir.text()), 'favicon é a roda amarela (SVG)');
  for (const f of ['/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']) { const r = await fetch(h.base + f); ok(r.status === 200, 'arquivo ' + f); }
  const mf = await (await fetch(h.base + '/manifest.webmanifest')).json(); ok(mf.name === 'Spinning Fany' && mf.icons.length === 2 && mf.theme_color === '#070707', 'manifesto do app (adicionar à tela inicial)');

  /* ═══ cadastro com CPF + confirmação de e-mail ═══ */
  await ana.goto(h.base + '/#/entrar'); await ana.click('[data-act=authmode][data-m=signup]');
  await ana.fill('input[name=cpf]', '52998224725'); ok(await ana.inputValue('input[name=cpf]') === '529.982.247-25', 'campo CPF formata sozinho'); await shot(ana, 'cadastro');
  ok(!(await ana.locator('input[name=mkt]').isChecked()), 'caixa de promoções começa desmarcada (consentimento de verdade)');
  await signup(ana, 'Ana Souza', 'ana@email.com', '(18) 99111-0001', '529.982.247-25', true); await sleep(ana, 700); await ana.waitForSelector('text=Sua bike, seus créditos', { timeout: 8000 }).catch(async e => { console.log('DEBUG toast:', await toast(ana), '| url:', ana.url(), '| texto:', (await ana.locator('body').innerText()).slice(0, 300)); throw e; });
  ok((await ana.locator('main').innerText()).includes('Confirme seu e-mail') && await ana.locator('[data-act=resendverify]').count() === 1, 'painel avisa "Confirme seu e-mail" com botão de reenviar');
  await shot(ana, 'confirme');
  // o dono cria aulas
  const dona = await mk(); await login(dona, 'dona@fany.com', 'senhaForte123').catch(async e => { console.log('DEBUG dona url:', dona.url(), '| erros:', errors, '| texto:', (await dona.locator('body').innerText()).slice(0, 300)); throw e; }); await dona.waitForSelector('text=Aulas de hoje');
  await dona.evaluate(() => fetch('/api/act/series', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Spinning Noturno', days: [0, 1, 2, 3, 4, 5, 6], hour: 19, minute: 0, weeks: 2, duration: 45 }) }).then(r => r.json())); await sleep(dona, 600);
  const classes = (await state(dona)).db.classes.filter(c => !c.event).sort((a, b) => new Date(a.start) - new Date(b.start)); const cid = classes[2].id;
  await dona.click('[data-act=atab][data-t=creditos]'); const aid = (await state(dona)).db.users.find(u => u.email === 'ana@email.com').id; await dona.selectOption('form[data-form=adjust2] select[name=uid]', aid); await dona.fill('form[data-form=adjust2] input[name=qty]', '10'); await dona.click('form[data-form=adjust2] button[type=submit]'); await sleep(dona, 400);
  await ana.reload(); await ana.waitForSelector('.item[data-class]'); await ana.locator(`[data-class="${cid}"] [data-act=pick]`).click(); await ana.waitForSelector('.map2'); await ana.locator('.bk:not([disabled])').first().click(); await ana.click('[data-act=seatok]'); await sleep(ana, 400);
  ok(/Confirme seu e-mail/.test(await toast(ana)), 'sem confirmar o e-mail, a reserva é barrada com explicação');
  await verify(ana, 'ana@email.com'); ok(/E-mail confirmado/.test(await toast(ana)), 'link do e-mail confirma e avisa');
  await ana.click('text=Sair'); await ana.waitForSelector('.hero'); await ana.goto(h.base + '/#/entrar'); await ana.waitForSelector('form[data-form=login]', { timeout: 8000 }).catch(async e => { console.log('DEBUG ana url:', ana.url(), '| erros:', errors, '| texto:', (await ana.locator('body').innerText()).slice(0, 400)); throw e; });
  await ana.fill('form[data-form=login] input[name=email]', '529.982.247-25'); await ana.fill('form[data-form=login] input[name=password]', 'senha12345'); await ana.click('form[data-form=login] button[type=submit]'); await ana.waitForSelector('text=Sua bike, seus créditos');
  ok(await ana.locator('[data-act=resendverify]').count() === 0, 'entrou com CPF + senha; aviso de confirmação sumiu');

  /* ═══ a bike da aluna sempre visível ═══ */
  await ana.reload(); await ana.waitForSelector('.item[data-class]'); await ana.locator(`[data-class="${cid}"] [data-act=pick]`).click(); await ana.waitForSelector('.map2'); await ana.locator('.bk:not([disabled])').nth(5).click(); const bn = (await ana.locator('.bk.on span').innerText()).trim(); await ana.click('[data-act=seatok]'); await ana.waitForSelector('.ticket'); await ana.click('.modal [data-act=close]');
  ok((await ana.locator('.nextc').innerText()).includes('SUA PRÓXIMA AULA') && (await ana.locator('.nextc .bignum').innerText()).trim() === bn, `card "Sua próxima aula" mostra a bike ${bn} em destaque`);
  ok(await ana.locator('.nextc .mb.me').count() === 1 && (await ana.locator('.nextc .mb.me').innerText()).includes(bn), 'mini sala com a bike dela destacada');
  await shot(ana, 'proxima'); await ana.click('[data-t=comprar]'); ok(await ana.locator('.nextc').count() === 1, 'o card fica visível em qualquer aba do painel');
  await ana.click('[data-t=minhas]'); ok(await ana.locator('main .mini').count() >= 2, 'em "Minhas aulas" também aparece a mini sala');
  await dona.click('[data-act=atab][data-t=creditos]'); await dona.selectOption('form[data-form=adjust2] select[name=uid]', aid); await dona.fill('form[data-form=adjust2] input[name=qty]', '1'); await dona.click('form[data-form=adjust2] button[type=submit]'); await sleep(dona, 400);
  const em = await h.mail(m => m.to === 'ana@email.com' && /ganhou créditos/.test(m.subject)); ok(!!em, 'aviso de crédito também chega por e-mail');

  /* ═══ fila de espera: vaga liberada → confirma pelo painel ═══ */
  await dona.evaluate(() => fetch('/api/act/layoutSave', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sala 2', rows: ['XX'] }) }).then(r => r.json())); await dona.reload(); await dona.waitForSelector('[data-act=atab]'); await dona.click('[data-act=atab][data-t=agenda]'); const when = new Date(Date.now() + 3 * 864e5); const ls = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}T10:00`;
  await dona.fill('form[data-form=class] input[name=title]', 'Aula da Fila'); await dona.fill('form[data-form=class] input[name=start]', ls); await dona.selectOption('form[data-form=class] select[name=layoutId]', { label: 'Sala 2 · 2 bikes' }); await dona.click('form[data-form=class] button[type=submit]'); await sleep(dona, 500);
  const fila = (await state(dona)).db.classes.find(c => c.title === 'Aula da Fila');
  const bia = await mk(); await signup(bia, 'Bia Lima', 'bia@email.com', '(18) 99111-0002', '111.444.777-35', false); await bia.waitForSelector('text=Sua bike'); await verify(bia, 'bia@email.com'); await bia.waitForSelector('.chip');
  const cle = await mk(); await signup(cle, 'Carla Dias', 'carla@email.com', '(18) 99111-0003', '390.533.447-05', false); await cle.waitForSelector('text=Sua bike'); await verify(cle, 'carla@email.com'); await cle.waitForSelector('.chip');
  const eva = await mk(); await signup(eva, 'Eva Melo', 'eva@email.com', '(18) 99111-0005', '935.411.347-80', false); await eva.waitForSelector('text=Sua bike'); await verify(eva, 'eva@email.com'); await eva.waitForSelector('.chip');
  await dona.reload(); await dona.waitForSelector('[data-act=atab]'); await dona.click('[data-act=atab][data-t=creditos]'); const users = (await state(dona)).db.users;
  for (const e of ['bia@email.com', 'carla@email.com', 'eva@email.com']) { await dona.selectOption('form[data-form=adjust2] select[name=uid]', users.find(u => u.email === e).id); await dona.fill('form[data-form=adjust2] input[name=qty]', '5'); await dona.click('form[data-form=adjust2] button[type=submit]'); await sleep(dona, 300); }
  for (const p of [ana, bia]) { await p.reload(); await p.waitForSelector('.item[data-class]'); await p.locator(`[data-class="${fila.id}"] [data-act=pick]`).click(); await p.waitForSelector('.map2'); await p.locator('.bk:not([disabled])').first().click(); await p.click('[data-act=seatok]'); await p.waitForSelector('.ticket'); await p.click('.modal [data-act=close]'); }
  await cle.reload(); await cle.waitForSelector('.item[data-class]'); const ci = cle.locator(`[data-class="${fila.id}"]`); ok((await ci.innerText()).includes('Lotada') && await ci.locator('[data-act=wait]').count() === 1, 'aula lotada mostra "Lista de espera"');
  await ci.locator('[data-act=wait]').click(); await sleep(cle, 400); ok((await cle.locator(`[data-class="${fila.id}"]`).innerText()).includes('1ª na fila'), 'Carla entra na fila (1ª)');
  await sleep(cle, 80); await eva.reload(); await eva.waitForSelector('.item[data-class]'); await eva.locator(`[data-class="${fila.id}"] [data-act=wait]`).click(); await sleep(eva, 400);
  await ana.reload(); await ana.waitForSelector('.nextc'); const aRes = (await state(ana)).db.reservations.find(r => r.classId === fila.id && r.userId === aid);
  await ana.locator(`[data-class="${fila.id}"] [data-act=cancel]`).click(); await dlg(ana, 'Cancelar reserva');
  const mo = await h.mail(m => m.to === 'carla@email.com' && /Vaga liberada/.test(m.subject)); ok(!!mo && /Confirmar minha vaga/.test(mo.html), 'e-mail "Vaga liberada" para a 1ª da fila');
  await cle.reload(); await cle.waitForSelector('.item[data-class]'); ok((await cle.locator('main').innerText()).includes('Vaga liberada!') && await cle.locator('[data-act=declineoffer]').count() >= 1, 'no painel dela aparece "Vaga liberada! Confirme até HH:MM"');
  await shot(cle, 'oferta');
  await eva.reload(); await eva.waitForSelector('.item[data-class]'); ok(!(await eva.locator('main').innerText()).includes('Vaga liberada!'), 'a 2ª da fila (Eva) ainda não recebe oferta');
  await cle.locator('.card.hl [data-act=pick]').first().click(); await cle.waitForSelector('.map2'); await cle.locator('.bk:not([disabled])').first().click(); const cb = (await cle.locator('.bk.on span').innerText()).trim(); await cle.click('[data-act=seatok]'); await cle.waitForSelector('.ticket'); await cle.click('.modal [data-act=close]');
  ok((await cle.locator('.nextc .bignum').innerText()).trim() === cb && !(await cle.locator('main').innerText()).includes('Vaga liberada!'), `Carla confirmou: bike ${cb} aparece no painel dela e a oferta some`);
  // recusa: Carla cancela, oferta vai para Eva, Eva diz "não vou"
  await cle.locator(`[data-class="${fila.id}"] [data-act=cancel]`).click(); await dlg(cle, 'Cancelar reserva'); await h.mail(m => m.to === 'eva@email.com' && /Vaga liberada/.test(m.subject));
  await eva.reload(); await eva.waitForSelector('text=Vaga liberada!'); await eva.locator('.card.hl [data-act=declineoffer]').first().click(); await dlg(eva, 'Não vou'); ok(!(await eva.locator('main').innerText()).includes('Vaga liberada!') && /passou para a próxima/.test(await toast(eva)), 'Eva recusa: sai da fila e a vaga fica livre');

  /* ═══ painel: e-mail, CPF e campanhas ═══ */
  await dona.click('[data-act=atab][data-t=alunas]'); await dona.fill('#sq', 'Ana'); await sleep(dona, 200); ok((await dona.locator('#slist').innerText()).includes('ana@email.com'), 'lista de alunas mostra o e-mail');
  await dona.locator('#slist [data-act=ostud]').first().click(); const card = await dona.locator('#slist .card.hl').innerText(); ok(card.includes('ana@email.com') && card.includes('confirmado') && card.includes('•••.982.247-••') && !card.includes('529.982.247-25'), 'ficha mostra e-mail confirmado e CPF mascarado');
  await dona.click('[data-act=revealcpf]'); await sleep(dona, 400); ok((await dona.locator('[id^=cpf-]').first().innerText()).trim() === '529.982.247-25', 'botão "mostrar" revela o CPF só para quem pede');
  await dona.click('[data-act=atab][data-t=emails]'); await dona.waitForSelector('form[data-form=campaign]'); ok((await dona.locator('main').innerText()).includes('Enviando por brevo'), 'aba E-mails mostra o serviço ativo'); await shot(dona, 'emails');
  await dona.selectOption('form[data-form=campaign] select[name=audience]', 'all'); await dona.click('[data-act=campcount]'); await sleep(dona, 400); ok(/1 aluna/.test(await dona.locator('#campcount').innerText()), 'prévia: só 1 aluna aceitou novidades');
  await dona.fill('form[data-form=campaign] input[name=subject]', 'Sábado tem Havaí 🌺'); await dona.fill('form[data-form=campaign] textarea[name=body]', 'Oi {nome}!\nSábado tem Aula Temática Havai. Garanta sua bike!'); await dona.fill('form[data-form=campaign] input[name=buttonLabel]', 'Garantir vaga'); await dona.fill('form[data-form=campaign] input[name=buttonUrl]', '/#/conta');
  await dona.click('[data-act=camptest]'); await sleep(dona, 500); ok(/Teste enviado/.test(await toast(dona)) && await dona.locator('form[data-form=campaign] input[name=subject]').inputValue() === 'Sábado tem Havaí 🌺', 'teste para si mesma não apaga o que foi escrito');
  await dona.click('form[data-form=campaign] button[type=submit]'); await sleep(dona, 600); ok(await dona.locator('.item', { hasText: 'Sábado tem Havaí' }).count() === 1, 'campanha aparece no histórico');
  const mp = await h.mail(m => m.to === 'ana@email.com' && /Havaí/.test(m.subject)); ok(!!mp && /Oi Ana!/.test(mp.text), 'e-mail promocional chegou personalizado');

  /* ═══ esqueci a senha ═══ */
  const esq = await mk(); await esq.goto(h.base + '/#/entrar'); await esq.click('[data-act=authmode][data-m=forgot]'); await esq.fill('form[data-form=forgot] input[name=email]', 'bia@email.com'); await esq.click('form[data-form=forgot] button[type=submit]'); await sleep(esq, 400);
  ok(/enviamos o link/.test(await toast(esq)), 'pede o link (resposta neutra)');
  const mr = await h.mail(m => m.to === 'bia@email.com' && /senha nova/.test(m.subject)); const rl = (mr.text.match(/http:\/\/localhost:4560\/#\/redefinir\?t=[a-f0-9]+/) || [])[0];
  await esq.goto(rl); await esq.waitForSelector('form[data-form=reset]'); await esq.fill('form[data-form=reset] input[name=password]', 'senhaNOVA999'); await esq.click('form[data-form=reset] button[type=submit]'); await esq.waitForSelector('form[data-form=login]');
  await esq.fill('form[data-form=login] input[name=email]', 'bia@email.com'); await esq.fill('form[data-form=login] input[name=password]', 'senhaNOVA999'); await esq.click('form[data-form=login] button[type=submit]'); await esq.waitForSelector('text=Sua bike, seus créditos'); ok(true, 'redefine pelo link e entra com a senha nova');
  // preferências
  await ana.click('[data-t=conta]'); ok((await ana.locator('main').innerText()).includes('•••.982.247-••') && await ana.locator('form[data-form=emailprefs]').count() === 1, 'aba Conta mostra e-mail confirmado, CPF mascarado e preferências de e-mail');
  await shot(ana, 'conta');
  console.log('\nERROS NO NAVEGADOR:', errors.length ? errors : 'nenhum'); const bad = h.log().split('\n').filter(l => /TypeError|ReferenceError|erro interno/.test(l)); console.log('ERROS NO SERVIDOR:', bad.length ? bad : 'nenhum');
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK'); await B.close(); h.stop(); process.exit(fails || errors.length || bad.length ? 1 : 0);
})().catch(e => { console.error('EXCEÇÃO', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
