const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { start } = require('./harness');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const h = await start({ port: 4530, mock: 4531 }); const B = await chromium.launch(); const errors = [];
  const mk = async (w = 390, hh = 844) => { const ctx = await B.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 2 }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource|net::/.test(m.text())) errors.push('CONSOLE ' + m.text()); }); p.on('dialog', d => { errors.push('DIALOG nativo ' + d.message()); d.dismiss(); }); return p; };
  const sleep = (p, ms) => p.waitForTimeout(ms);
  const shot = async (p, n) => { await sleep(p, 350); await p.screenshot({ path: `/tmp/f_${n}.png` }); };
  const state = async p => (await (await fetch(h.base + '/api/state', { headers: { cookie: (await p.context().cookies()).map(c => `${c.name}=${c.value}`).join('; ') } })).json());
  const dlg = async (p, label) => { await p.waitForSelector('.modal [data-act=dlg]'); await p.locator('.modal [data-act=dlg]', { hasText: label }).click(); await sleep(p, 250); };
  const toast = p => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
  const login = async (p, email, pw) => { await p.goto(h.base + '/#/entrar'); await p.waitForSelector('form[data-form=login]'); await p.fill('form[data-form=login] input[name=email]', email); await p.fill('form[data-form=login] input[name=password]', pw); await p.click('form[data-form=login] button[type=submit]'); };
  const CPFS = { 'ana@email.com': '529.982.247-25', 'bia@email.com': '111.444.777-35' };
  const signup = async (p, name, email, phone, pw) => { await p.goto(h.base + '/#/entrar'); await p.click('[data-act=authmode][data-m=signup]'); await p.fill('input[name=name]', name); await p.fill('input[name=email]', email); await p.fill('input[name=cpf]', CPFS[email]); await p.fill('input[name=phone]', phone); await p.fill('input[name=password]', pw); await p.check('input[name=terms]'); await p.click('form[data-form=signup] button[type=submit]'); };
  const credits = async p => Number((await p.locator('.chip b').innerText()).trim());

  /* ═══ 1. site público e cadastro ═══ */
  const ana = await mk(); await ana.goto(h.base); await ana.waitForSelector('.hero');
  const home = await ana.locator('body').innerText();
  ok(!/demonstra|Ver como|dados de exemplo|neste aparelho/i.test(home), 'home sem nenhum texto de demo');
  ok(await ana.locator('[data-act=demostudent]').count() === 0, 'sem botão de login demo');
  await ana.click('a.btn:has-text("Entrar")'); await ana.waitForSelector('form[data-form=login]');
  const loginTxt = await ana.locator('main').innerText(); ok(!/PIN|Sou a Fany|dona/i.test(loginTxt) && await ana.locator('input[name=pin]').count() === 0, 'tela de login sem PIN nem "entrar como dona"');
  await shot(ana, 'login');
  await signup(ana, 'Ana Souza', 'ana@email.com', '(18) 99111-0001', 'senha12345'); await ana.waitForSelector('text=Sua bike, seus créditos');
  ok((await state(ana)).sess.role === 'student' && await credits(ana) === 0, 'quem cria conta entra como aluna, com 0 crédito');
  ok(!(await ana.locator('body').innerText()).includes('Painel'), 'aluna não vê link do painel');
  await ana.goto(h.base + '/#/painel'); await sleep(ana, 300); ok(ana.url().endsWith('#/conta'), 'aluna tentando abrir o painel volta para a conta');

  /* ═══ 2. dona: login, grade, pagamentos, equipe ═══ */
  const dona = await mk(); await login(dona, 'dona@fany.com', 'errada'); await sleep(dona, 400); ok(/incorretos/.test(await toast(dona)), 'senha errada: aviso');
  await login(dona, 'dona@fany.com', 'senhaForte123'); await dona.waitForSelector('text=Aulas de hoje'); ok((await state(dona)).sess.role === 'owner', 'dona entra com e-mail e senha');
  await dona.click('[data-act=atab][data-t=visao]'); ok((await dona.locator('main').innerText()).includes('agenda está vazia'), 'aviso de agenda vazia com atalho');
  await dona.click('[data-act=atab][data-t=agenda]');
  await dona.evaluate(() => fetch('/api/act/series', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Spinning Noturno', days: [0, 1, 2, 3, 4, 5, 6], hour: 19, minute: 0, weeks: 2, duration: 45 }) }).then(r => r.json())); await sleep(dona, 500);
  let st = await state(dona); const grade = st.db.classes.filter(c => !c.event); ok(grade.length >= 5 && grade.every(c => c.maxBikes === 8), `dona cria a grade pela tela (${grade.length} aulas, 8 bikes)`);
  await dona.click('[data-act=atab][data-t=pagamentos]'); await sleep(dona, 150); const pg = await dona.locator('main').innerText(); ok(/conectado/.test(pg) && /Pix.*sem taxa/.test(pg), 'aba Pagamentos mostra InfinitePay conectada');
  await shot(dona, 'pagamentos');
  await dona.click('[data-act=testcheckout]'); await dona.waitForSelector('text=Conexão funcionando'); ok(true, 'botão "Testar conexão" funciona'); await dona.click('.modal [data-act=dlg]:has-text("Fechar")');
  await dona.click('[data-act=atab][data-t=equipe]'); await dona.fill('form[data-form=teamadd] input[name=name]', 'Gerente Lu'); await dona.fill('form[data-form=teamadd] input[name=email]', 'lu@fany.com'); await dona.fill('form[data-form=teamadd] input[name=password]', 'senhaLu1234'); await dona.click('form[data-form=teamadd] button[type=submit]'); await sleep(dona, 400);
  ok((await state(dona)).db.users.some(u => u.email === 'lu@fany.com' && u.role === 'admin'), 'dona cria administradora pela aba Equipe');
  await shot(dona, 'equipe');

  /* ═══ 3. pagamento: link → InfinitePay → webhook → crédito automático ═══ */
  await ana.click('[data-t=comprar]'); await sleep(ana, 150);
  ok((await ana.locator('main').innerText()).includes('Pix ou cartão') && await ana.locator('[data-act=buy]:not([disabled])').count() >= 4, 'aluna vê planos com pagamento ativo');
  await shot(ana, 'comprar');
  await ana.locator('.pkg', { hasText: 'Pacote 10 Aulas' }).locator('[data-act=buy]').click(); await ana.waitForURL(/localhost:4531\/checkout\//);
  const orderId = ana.url().split('/checkout/')[1]; ok(h.orders[orderId] && h.orders[orderId].amount === 34900, 'clicou em Comprar → foi para o checkout da InfinitePay (R$ 349,00)');
  ok((await state(ana)).db.users[0].credits === 0, 'antes de pagar, nenhum crédito');
  ok(await h.pay(orderId) === 200, 'InfinitePay avisa o pagamento (webhook)');
  await ana.goto(`${h.base}/pago?order_nsu=${orderId}&transaction_nsu=tx-${orderId}&slug=slug-${orderId}&capture_method=pix`); await ana.waitForSelector('text=Pagamento confirmado');
  await shot(ana, 'pago'); await ana.click('a.btn:has-text("Reservar minha bike")'); await ana.waitForSelector('text=Sua bike, seus créditos'); ok(await credits(ana) === 10, 'CRÉDITO CAIU SOZINHO: 10 créditos na conta');
  // sem webhook: só a página de retorno
  await ana.click('[data-t=comprar]'); await ana.locator('.pkg', { hasText: '1 Aula' }).locator('[data-act=buy]').click(); await ana.waitForURL(/checkout\//); const oid2 = ana.url().split('/checkout/')[1]; h.orders[oid2].paid = true;
  await ana.goto(`${h.base}/pago?order_nsu=${oid2}&transaction_nsu=tx-${oid2}&slug=slug-${oid2}`); await ana.waitForSelector('text=Pagamento confirmado'); await ana.click('a.btn'); await ana.waitForSelector('text=Sua bike, seus créditos'); ok(await credits(ana) === 11, 'só com a página de retorno (sem webhook) também credita (+1)');

  /* ═══ 4. reserva com mapa de bikes ═══ */
  await ana.click('[data-t=agenda]'); const first = ana.locator('.item[data-class]').first(); const cid = await first.getAttribute('data-class');
  await first.locator('[data-act=pick]').click(); await ana.waitForSelector('.map2 .bk'); ok(await ana.locator('.bk').count() === 8, 'mapa com 8 bikes (2 fileiras, corredor no meio)');
  await shot(ana, 'mapa'); await ana.locator('.bk:not([disabled])').nth(2).click(); const bn = (await ana.locator('.bk.on span').innerText()).trim(); await ana.click('[data-act=seatok]'); await ana.waitForSelector('.ticket');
  ok((await ana.locator('.ticket b').innerText()).trim() === bn && await credits(ana) === 10, `bike ${bn} reservada, 1 crédito gasto`);
  await ana.click('.modal [data-act=close]');

  /* ═══ 5. outra aluna: presente de créditos e privacidade ═══ */
  const bia = await mk(); await signup(bia, 'Bia Lima', 'bia@email.com', '(18) 99111-0002', 'senha12345'); await bia.waitForSelector('text=Sua bike, seus créditos');
  const biaState = JSON.stringify(await state(bia)); ok(!/Ana Souza|ana@email|99111-0001|5518991110001/.test(biaState), 'Bia não recebe nenhum dado da Ana');
  const occupied = (await state(bia)).db.reservations.filter(r => r.classId === cid); ok(occupied.length === 1 && occupied[0].bike === Number(bn) && occupied[0].userId === '', 'Bia vê a bike ocupada, sem nome');
  await ana.click('[data-t=presente]'); await ana.fill('form[data-form=gift] input[name=phone]', '(18) 99111-0002'); await ana.fill('form[data-form=gift] input[name=amount]', '3'); await ana.fill('form[data-form=gift] input[name=msg]', 'Bora!'); await ana.click('form[data-form=gift] button[type=submit]'); await dlg(ana, 'Enviar');
  ok(await credits(ana) === 7, 'Ana enviou 3 créditos (saldo 7)'); await bia.reload(); await bia.waitForSelector('.chip'); ok(await credits(bia) === 3 && /presente/i.test(await bia.locator('main').innerText()), 'Bia recebeu 3 créditos e o aviso');

  /* ═══ 6. Aula Temática Havai: compra direta, sem crédito ═══ */
  await dona.click('[data-act=atab][data-t=especiais]'); const when = new Date(Date.now() + 4 * 864e5); const ls = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}T17:00`;
  await dona.locator('form[data-form=specsched] input[name=start]').fill(ls); await dona.locator('form[data-form=specsched] button').click(); await sleep(dona, 400);
  const ev = (await state(dona)).db.classes.find(c => c.event); ok(ev && ev.duration === 90 && ev.maxBikes === 8 && ev.event.price === 3500, 'dona agenda a Aula Temática Havai (R$ 35, 90 min, 8 bikes)');
  await ana.reload(); await ana.waitForSelector('.item.thc'); const item = ana.locator(`[data-class="${ev.id}"]`); ok((await item.innerText()).replace(/\u00a0/g, ' ').includes('Garantir minha vaga · R$ 35,00'), 'botão havaiano com o preço');
  await shot(ana, 'havai'); const c0 = await credits(ana);
  await item.locator('[data-act=pick]').click(); await ana.waitForSelector('.modal.thm .map2'); await ana.locator('.bk:not([disabled])').nth(4).click(); const hb = (await ana.locator('.bk.on span').innerText()).trim(); await ana.click('[data-act=seatok]'); await ana.waitForURL(/checkout\//);
  const eo = ana.url().split('/checkout/')[1]; ok(h.orders[eo].amount === 3500, 'aula avulsa → checkout de R$ 35,00'); ok((await state(ana)).db.reservations.some(r => r.pay === eo && r.holdUntil && r.bike === Number(hb)), 'bike segurada enquanto paga');
  await h.pay(eo); await ana.goto(`${h.base}/pago?order_nsu=${eo}&transaction_nsu=tx-${eo}&slug=slug-${eo}`); await ana.waitForSelector('text=Pagamento confirmado'); ok((await ana.locator('.card').first().innerText()).includes('vaga está garantida'), 'pagou: vaga garantida');
  await ana.click('a.btn'); await ana.waitForSelector('.chip'); ok(await credits(ana) === c0, 'aula avulsa não mexeu nos créditos');

  /* ═══ 7. equipe: administradora tem menos poderes ═══ */
  const lu = await mk(); await login(lu, 'lu@fany.com', 'senhaLu1234'); await lu.waitForSelector('text=Aulas de hoje'); ok((await state(lu)).sess.role === 'admin', 'administradora entra pelo mesmo login');
  ok(await lu.locator('[data-act=atab][data-t=equipe]').count() === 0, 'administradora não vê a aba Equipe');
  await lu.click('[data-act=atab][data-t=pagamentos]'); ok((await lu.locator('main').innerText()).includes('Só a dona altera') && await lu.locator('input[name=handle]').count() === 0, 'administradora não altera a conta de pagamento');
  await lu.click('[data-act=atab][data-t=estudio]'); ok(await lu.locator('a[href="/api/backup"]').count() === 0, 'administradora não baixa o backup');
  await lu.click('[data-act=atab][data-t=creditos]'); await lu.selectOption('form[data-form=adjust2] select[name=uid]', { label: /Bia Lima/ }).catch(async () => { const v = (await state(lu)).db.users.find(u => u.name === 'Bia Lima').id; await lu.selectOption('form[data-form=adjust2] select[name=uid]', v); });
  await lu.fill('form[data-form=adjust2] input[name=qty]', '2'); await lu.click('form[data-form=adjust2] button[type=submit]'); await sleep(lu, 400); ok((await state(lu)).db.users.find(u => u.name === 'Bia Lima').credits === 5, 'administradora ajusta créditos (Bia: 3 → 5)');
  const fy = await lu.evaluate(async () => (await fetch('/api/act/teamAdd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X', email: 'x@x.com', password: 'abcdefgh' }) })).status); ok(fy === 403, 'servidor recusa admin criando admin (403)');

  /* ═══ 8. Hoje: sala com nomes e presença ═══ */
  await dona.click('[data-act=atab][data-t=checkin]'); const tcls = (await state(dona)).db.classes.find(c => c.id === cid); const dayOff = Math.round((new Date(new Date(tcls.start).toDateString()) - new Date(new Date().toDateString())) / 864e5);
  for (let i = 0; i < dayOff; i++) await dona.click('[data-act=hday][data-d="1"]'); await dona.locator(`[data-act=hclass][data-id="${cid}"]`).click(); await dona.waitForSelector(`[data-room="${cid}"]`);
  ok((await dona.locator(`[data-room="${cid}"] [data-b="${bn}"] em`).innerText()).trim() === 'Ana S.', 'sala mostra o nome "Ana S." embaixo da bike ' + bn);
  await dona.locator(`[data-room="${cid}"] [data-b="${bn}"]`).click(); await dona.click('.modal [data-act=att][data-s=attended]'); await sleep(dona, 350); ok((await dona.locator(`[data-room="${cid}"] [data-b="${bn}"]`).getAttribute('class')).includes(' ok'), 'dona marca presença (bike fica verde)');
  await shot(dona, 'sala');

  /* ═══ 9. planos editáveis, senha, sair ═══ */
  await dona.click('[data-act=atab][data-t=pacotes]'); const f5 = dona.locator('form[data-form=pkg][data-id="p5"]'); await f5.locator('input[name=price]').fill('209,90'); await f5.locator('button[type=submit]').click(); await sleep(dona, 400);
  await ana.goto(h.base + '/#/'); await ana.reload(); await ana.waitForSelector('#pacotes'); ok((await ana.locator('#pacotes').innerText()).replace(/\u00a0/g, ' ').includes('R$ 209,90'), 'preço editado pela dona aparece no site');
  await ana.goto(h.base + '/#/conta'); await ana.click('[data-t=conta]'); await ana.fill('form[data-form=password] input[name=current]', 'senha12345'); await ana.fill('form[data-form=password] input[name=next]', 'novaSenha999'); await ana.click('form[data-form=password] button[type=submit]'); await sleep(ana, 500); ok(/Senha alterada/.test(await toast(ana)), 'aluna troca a própria senha');
  await ana.click('text=Sair'); await ana.waitForSelector('.hero'); await login(ana, 'ana@email.com', 'senha12345'); await sleep(ana, 400); ok(/incorretos/.test(await toast(ana)), 'senha antiga não funciona mais');
  await login(ana, 'ana@email.com', 'novaSenha999'); await ana.waitForSelector('text=Sua bike, seus créditos'); ok(true, 'senha nova funciona');
  const ds = await mk(1280, 900); await login(ds, 'dona@fany.com', 'senhaForte123'); await ds.waitForSelector('text=Aulas de hoje');
  for (const t of ['checkin', 'visao', 'agenda', 'alunas', 'creditos', 'vendas', 'pacotes', 'pagamentos', 'equipe', 'avisos', 'estudio']) { await ds.click(`[data-act=atab][data-t=${t}]`); await sleep(ds, 60); ok((await ds.locator('main').innerText()).length > 40, `[desktop] aba ${t}`); }
  await ds.click('[data-act=atab][data-t=visao]'); await shot(ds, 'visao');
  const ov = await ds.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); ok(!ov, '[desktop] sem rolagem horizontal');
  console.log('\nERROS NO NAVEGADOR:', errors.length ? errors : 'nenhum'); const bad = h.log().split('\n').filter(l => /Error|erro interno|TypeError/.test(l)); console.log('ERROS NO SERVIDOR:', bad.length ? bad : 'nenhum');
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK'); await B.close(); h.stop(); process.exit(fails || errors.length || bad.length ? 1 : 0);
})().catch(e => { console.error('EXCEÇÃO', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
