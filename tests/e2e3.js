// Navegador: layout das bikes (editor), temas criados pela dona, aba Aulas especiais, ficha da aluna com bike
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { start } = require('./harness');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const h = await start({ port: 4600, mock: 4601 }); const B = await chromium.launch(); const errors = [];
  const mk = async (w, hh) => { const ctx = await B.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 2 }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource|net::/.test(m.text())) errors.push('CONSOLE ' + m.text()); }); p.on('dialog', d => { errors.push('DIALOG nativo ' + d.message()); d.dismiss(); }); return p; };
  const sleep = (p, ms) => p.waitForTimeout(ms);
  const shot = async (p, n) => { await sleep(p, 300); await p.screenshot({ path: `/tmp/k_${n}.png` }); };
  const toast = p => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
  const dlg = async (p, label) => { await p.waitForSelector('.modal [data-act=dlg]'); await p.locator('.modal [data-act=dlg]', { hasText: label }).click(); await sleep(p, 250); };
  const login = async (p, email, pw) => { await p.goto(h.base + '/#/entrar'); await p.waitForSelector('form[data-form=login]'); await p.fill('form[data-form=login] input[name=email]', email); await p.fill('form[data-form=login] input[name=password]', pw); await p.click('form[data-form=login] button[type=submit]'); };
  const post = (p, path, body) => p.evaluate(([a, b]) => fetch('/api/act/' + a, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()), [path, body]);
  const rowsOf = p => p.evaluate(() => ui.sala.rows.slice());
  const tab = async (p, t) => { await p.click(`[data-act=atab][data-t=${t}]`); await sleep(p, 150); };
  const when = (d, hh) => { const x = new Date(Date.now() + d * 864e5); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}T${hh}`; };

  /* ═══ Agenda sem "grade da semana"; aula nova pelo layout padrão ═══ */
  const dona = await mk(1280, 900); await login(dona, 'dona@fany.com', 'senhaForte123'); await dona.waitForSelector('text=Aulas de hoje');
  const labels = await dona.locator('[data-act=atab]').allInnerTexts(); ok(['Aulas especiais', 'Sala', 'Temas'].every(x => labels.includes(x)), 'abas novas no painel: Aulas especiais, Sala e Temas');
  await tab(dona, 'agenda'); const ag = await dona.locator('main').innerText();
  ok(!/Grade da semana|Gerar grade/.test(ag) && await dona.locator('form[data-form=series]').count() === 0, 'a "grade da semana" saiu da Agenda');
  ok(await dona.locator('form[data-form=class] select[name=layoutId] option:checked').innerText() === 'Sala 3-2-3 · 8 bikes' && await dona.locator('form[data-form=class] input[name=maxBikes]').count() === 0, 'a aula nova já vem com a sala 3-2-3 (sem campo de quantidade de bikes)');
  await dona.fill('form[data-form=class] input[name=title]', 'Aula Teste'); await dona.fill('form[data-form=class] input[name=start]', when(1, '18:00')); await dona.click('form[data-form=class] button[type=submit]'); await sleep(dona, 500);
  let st = await (async () => (await dona.evaluate(() => db.classes.map(c => ({ id: c.id, title: c.title, grid: c.grid, maxBikes: c.maxBikes, layoutId: c.layoutId })))))();
  const cls = st.find(c => c.title === 'Aula Teste'); ok(cls && JSON.stringify(cls.grid) === '["XXX","XX","XXX"]' && cls.maxBikes === 8, 'aula criada guarda o desenho 3-2-3 (8 bikes)');

  /* ═══ aluna: vê o desenho e a bike no painel dela ═══ */
  const ana = await mk(390, 844); await ana.goto(h.base + '/#/entrar'); await ana.click('[data-act=authmode][data-m=signup]'); await ana.fill('input[name=name]', 'Ana Souza'); await ana.fill('input[name=email]', 'ana@email.com'); await ana.fill('input[name=cpf]', '52998224725'); await ana.fill('input[name=phone]', '(18) 99111-0001'); await ana.fill('input[name=password]', 'senha12345'); await ana.check('input[name=terms]'); await ana.click('form[data-form=signup] button[type=submit]'); await ana.waitForSelector('text=Sua bike, seus créditos');
  const anaId = await ana.evaluate(() => sess.userId); await post(dona, 'adjust', { userId: anaId, amount: 10, reason: 'teste' });
  await ana.reload(); await ana.waitForSelector('.item[data-class]'); await ana.locator(`[data-class="${cls.id}"] [data-act=pick]`).click(); await ana.waitForSelector('.map2 .bk');
  const shape = await ana.locator('.map2 .mrow').evaluateAll(rs => rs.map(r => r.querySelectorAll('.bk').length)); ok(JSON.stringify(shape) === '[3,2,3]', `a aluna vê 3 bikes na frente, 2 no meio e 3 atrás (${shape})`);
  const nums = await ana.locator('.map2 .bk span').allInnerTexts(); ok(nums.join('') === '12345678', 'numeração em ordem de leitura (1 a 8)');
  const widths = await ana.locator('.map2 .bk').evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().width))); ok(Math.max(...widths) - Math.min(...widths) <= 1, 'todas as bikes têm o mesmo tamanho');
  const cx = await ana.locator('.map2 .mrow').evaluateAll(rs => rs.map(r => { const b = r.getBoundingClientRect(), k = [...r.children].map(x => x.getBoundingClientRect()); return Math.round((k[0].left + k.at(-1).right) / 2 - (b.left + b.right) / 2); })); ok(cx.every(v => Math.abs(v) <= 2), 'cada linha está centralizada na sala');
  await shot(ana, 'aluna_mapa'); await ana.locator('.map2 .bk').nth(4).click(); await ana.click('[data-act=seatok]'); await ana.waitForSelector('.ticket'); ok((await ana.locator('.ticket b').innerText()).trim() === '5', 'aluna reserva a bike 5'); await ana.click('.modal [data-act=close]');
  const mini = await ana.locator('.nextc .mini .mrow').evaluateAll(rs => rs.map(r => r.children.length)); ok(JSON.stringify(mini) === '[3,2,3]' && (await ana.locator('.nextc .mb.me').innerText()).includes('5'), '"Sua próxima aula" mostra a mini sala 3-2-3 com a bike 5 destacada');
  const meRow = await ana.locator('.nextc .mrow').evaluateAll(rs => rs.findIndex(r => r.querySelector('.me'))); ok(meRow === 1, 'a bike 5 está na linha do meio');

  /* ═══ dona vê qual bike cada aluna pegou ═══ */
  await dona.reload(); await dona.waitForSelector('[data-act=atab]'); await tab(dona, 'agenda'); await dona.locator(`[data-act=turma][data-id="${cls.id}"]`).click(); await dona.waitForSelector(`[data-room="${cls.id}"] .mrow`);
  ok((await dona.locator(`[data-room="${cls.id}"] [data-b="5"] em`).innerText()).trim() === 'Ana S.', 'na Turma, o nome "Ana S." aparece embaixo da bike 5');
  ok(JSON.stringify(await dona.locator(`[data-room="${cls.id}"] .mrow`).evaluateAll(rs => rs.map(r => r.querySelectorAll('.bk').length))) === '[3,2,3]', 'a sala da dona tem o mesmo desenho 3-2-3');
  await tab(dona, 'alunas'); await dona.fill('#sq', 'Ana'); await sleep(dona, 150); await dona.locator('#slist [data-act=ostud]').first().click(); await dona.waitForSelector(`[data-bookings="${anaId}"]`);
  ok(/Aula Teste/.test(await dona.locator(`[data-bookings="${anaId}"]`).innerText()) && /Bike 5/.test(await dona.locator(`[data-bookings="${anaId}"]`).innerText()), 'na ficha da aluna aparece a aula e a Bike 5'); await shot(dona, 'ficha');

  /* ═══ editor da sala ═══ */
  await tab(dona, 'sala'); await dona.waitForSelector('.lay-tile');
  ok(await dona.locator('.lay-tile.is-bike').count() === 8 && JSON.stringify(await rowsOf(dona)) === '["XXX","XX","XXX"]', 'editor abre com a sala 3-2-3');
  await dona.click('[data-act=laypreset][data-p="4,4"]'); ok(JSON.stringify(await rowsOf(dona)) === '["XXXX","XXXX"]' && /8 bikes/.test(await dona.locator('#salacount').innerText()), 'modelo pronto 4-4');
  await dona.click('[data-act=laypreset][data-p="3,2,3"]');
  await dona.locator('.lay-tile[data-r="0"][data-c="1"]').click(); ok(JSON.stringify(await rowsOf(dona)) === '["X.X","XX","XXX"]' && /7 bikes/.test(await dona.locator('#salacount').innerText()), 'tocar num lugar vira espaço (7 bikes)');
  await dona.locator('.lay-tile[data-r="0"][data-c="1"]').click(); ok(JSON.stringify(await rowsOf(dona)) === '["XXX","XX","XXX"]', 'tocar de novo volta a ser bike');
  await dona.click('[data-act=layaddbike][data-r="1"]'); ok((await rowsOf(dona))[1] === 'XXX' && /9 bikes/.test(await dona.locator('#salacount').innerText()), '+ bike no fim da linha (9 bikes)');
  await dona.click('[data-act=layrmlast][data-r="1"]'); await dona.click('[data-act=layaddgap][data-r="1"]'); ok((await rowsOf(dona))[1] === 'XX.', '+ espaço no fim da linha');
  await dona.click('[data-act=layrmlast][data-r="1"]'); await dona.click('[data-act=layaddrow]'); ok((await rowsOf(dona)).length === 4 && await dona.locator('.lay-row').count() === 4, '+ linha');
  await dona.click('[data-act=laydelrow][data-r="3"]'); ok((await rowsOf(dona)).length === 3, 'apagar linha');
  await dona.click('[data-act=laydown][data-r="0"]'); ok(JSON.stringify(await rowsOf(dona)) === '["XX","XXX","XXX"]', 'descer a primeira linha (2-3-3)'); await dona.click('[data-act=layup][data-r="1"]'); ok(JSON.stringify(await rowsOf(dona)) === '["XXX","XX","XXX"]', 'subir linha (volta 3-2-3)');
  // arrastar e soltar
  await dona.locator('.lay-tile[data-r="0"][data-c="1"]').click();   // abre um espaço em cima
  await dona.locator('.lay-tile[data-r="1"][data-c="0"]').dragTo(dona.locator('.lay-tile[data-r="0"][data-c="1"]')); await sleep(dona, 200);
  ok(JSON.stringify(await rowsOf(dona)) === '["XXX",".X","XXX"]', 'arrastar uma bike para o espaço troca de lugar');
  await dona.locator('.lay-handle[data-rowdrag="2"]').dragTo(dona.locator('.lay-row[data-lrow="0"]')); await sleep(dona, 200);
  ok(JSON.stringify(await rowsOf(dona)) === '["XXX","XXX",".X"]', 'arrastar a linha ⠿ muda a linha de lugar');
  await dona.click('[data-act=laypreset][data-p="3,2,3"]');
  // validação
  await dona.click('[data-act=layclear]'); await dona.locator('.lay-tile[data-r="0"][data-c="0"]').click(); ok(/pelo menos uma bike/i.test(await dona.locator('#salaform').innerText()) && await dona.locator('#salaform button[type=submit]').isDisabled(), 'sem nenhuma bike: aviso e não deixa salvar');
  await dona.click('[data-act=laypreset][data-p="3,2,3"]');
  // salvar como novo, com outro nome
  await dona.fill('#layname', 'Sala especial 4-4'); await dona.click('[data-act=laypreset][data-p="4,4"]'); await dona.click('[data-act=laysaveas]'); await sleep(dona, 400);
  let lays = await dona.evaluate(() => db.layouts.map(l => ({ id: l.id, name: l.name, rows: l.rows }))); const l44 = lays.find(l => l.name === 'Sala especial 4-4');
  ok(l44 && JSON.stringify(l44.rows) === '["XXXX","XXXX"]' && lays.length === 2, 'salvar como novo layout cria "Sala especial 4-4" e mantém o 3-2-3');
  ok(await dona.evaluate(() => db.settings.layoutId) === lays[0].id, 'o padrão continua sendo o 3-2-3');
  // aplicar nas aulas futuras: a aula da Ana passa a 4-4 e ela segue na bike 5
  await dona.locator(`[data-act=layload][data-id="${lays[0].id}"]`).click(); await dona.click('[data-act=laypreset][data-p="4,4"]'); await dona.click('#salaform button[type=submit]'); await sleep(dona, 500);
  const after = await dona.evaluate(id => ({ c: db.classes.find(x => x.id === id), r: db.reservations.find(x => x.classId === id && x.bike) }), cls.id);
  ok(JSON.stringify(after.c.grid) === '["XXXX","XXXX"]' && after.r.bike === 5 && /atualizada/.test(await toast(dona)), 'ao salvar, a aula futura passa para 4-4 e a Ana continua na bike 5');
  await ana.reload(); await ana.waitForSelector('.nextc'); ok(JSON.stringify(await ana.locator('.nextc .mrow').evaluateAll(rs => rs.map(r => r.children.length))) === '[4,4]', 'o painel da aluna já mostra a sala nova (4-4)');
  // padrão / apagar
  await dona.locator(`[data-act=laydefault][data-id="${l44.id}"]`).click(); await sleep(dona, 300); ok(await dona.evaluate(() => db.settings.layoutId) === l44.id, 'definir outro layout como padrão');
  await dona.locator(`[data-act=laydefault][data-id="${lays[0].id}"]`).click(); await sleep(dona, 300);
  await dona.locator(`[data-act=laydelete][data-id="${l44.id}"]`).click(); await dlg(dona, 'Apagar'); ok(!(await dona.evaluate(() => db.layouts)).some(l => l.id === l44.id), 'apagar um layout que não é o padrão');
  await shot(dona, 'sala_editor');

  /* ═══ criador de temas ═══ */
  await tab(dona, 'temas'); await dona.waitForSelector('#themeform');
  ok(await dona.locator('.th-pick').count() === 3 && await dona.locator('#themeform [data-act=themedelete]').count() === 0, 'dois temas padrão + "criar novo"; novo tema não tem botão apagar');
  await dona.fill('#themeform input[name=name]', 'Festa Teste');
  await dona.click('[data-act=themepreset][data-i="2"]'); ok((await dona.inputValue('#themeform input[name=c1]')) === '#ffcc33' && (await dona.inputValue('#themeform input[name=emoji]')) === '🌽' && (await dona.locator('#themeprev .th-tag').first().innerText()).includes('🌽'), 'paleta pronta "Festa junina" preenche cores e emojis e a prévia muda');
  await dona.fill('#themeform input[name=tag]', 'FESTA!'); await dona.fill('#themeform input[name=btnText]', 'Quero ir · {preço}');
  ok((await dona.locator('#themeprev .th-tag').first().innerText()).includes('FESTA!') && (await dona.locator('#themeprev .btn-th').first().innerText()).replace(/\u00a0/g, ' ').includes('Quero ir · R$ 35,00'), 'etiqueta e texto do botão aparecem na prévia ao vivo ({preço} vira o valor)');
  await dona.locator('#themeform label.opt:has-text("Só contorno")').click(); await dona.locator('#themeform label.opt:has-text("Reto")').click();
  ok(await dona.locator('#themeprev .btn-th').first().getAttribute('data-b') === 'outline' && await dona.locator('#themeprev .btn-th').first().getAttribute('data-r') === 'sharp', 'estilo do botão (contorno) e formato (reto) mudam na prévia');
  await dona.locator('#themeform label.opt:has-text("Toque nos emojis para decorar")').click(); await dona.fill('#themeform input[name=deco]', ''); await dona.click('[data-act=themeemoji][data-e="🎉"]'); await dona.click('[data-act=themeemoji][data-e="🔥"]');
  ok((await dona.inputValue('#themeform input[name=deco]')) === '🎉🔥' && (await dona.locator('#themeprev .th-deco').first().innerText()).includes('🔥'), 'paleta de emojis: toque para decorar (até 5)');
  await dona.locator('#themeform input[name=c2]').fill('#00aa88'); ok((await dona.locator('#themeprev .btn-th').first().getAttribute('style')).includes('#00aa88'), 'mudar uma cor atualiza a prévia na hora');
  await shot(dona, 'temas'); await dona.click('#themeform button[type=submit]'); await sleep(dona, 500);
  let themes = await dona.evaluate(() => db.themes); const tf = themes.find(t => t.name === 'Festa Teste');
  ok(tf && tf.c1 === '#ffcc33' && tf.c2 === '#00aa88' && tf.emoji === '🌽' && tf.deco === '🎉🔥' && tf.btn === 'outline' && tf.round === 'sharp' && tf.tag === 'FESTA!' && tf.btnText === 'Quero ir · {preço}' && !tf.builtin, 'o tema novo foi salvo com todas as escolhas');
  ok(await dona.locator('.th-pick').count() === 4, 'o tema aparece na lista');
  await dona.fill('#themeform input[name=name]', 'Festa Teste 2'); await dona.click('[data-act=themesaveas]'); await sleep(dona, 400); themes = await dona.evaluate(() => db.themes); ok(themes.length === 4, '"Salvar como novo tema" cria uma cópia');
  const copy = themes.find(t => t.name === 'Festa Teste 2'); await dona.click('[data-act=themedelete]'); await dlg(dona, 'Apagar'); ok(!(await dona.evaluate(() => db.themes)).some(t => t.id === copy.id), 'apagar o tema copiado');
  await dona.locator('.th-pick', { hasText: 'Havaí' }).click(); ok(await dona.locator('#themeform [data-act=themedelete]').count() === 0 && /não pode ser apagado/.test(await dona.locator('#themeform').innerText()), 'tema padrão pode ser editado mas não apagado');

  /* ═══ aba Aulas especiais: modelo com tema + sala, datas ═══ */
  await tab(dona, 'especiais'); ok(await dona.locator('form[data-form=spec]').count() === 2 && /1 · Modelos/.test(await dona.locator('main').innerText()) && /2 · Datas/.test(await dona.locator('main').innerText()), 'aba própria com "1 · Modelos" e "2 · Datas agendadas"');
  const f = dona.locator('form[data-form=spec][data-id="sp-havai"]'); const opts = await f.locator('select[name=theme] option').allInnerTexts(); ok(opts.some(o => /Festa Teste/.test(o)) && opts.some(o => /Havaí/.test(o)), 'o tema novo aparece na escolha do modelo');
  await f.locator('select[name=theme]').selectOption({ label: '🌽 Festa Teste' }); await f.locator('select[name=layoutId]').selectOption({ label: /./ }.label || undefined).catch(() => {});
  await f.locator('button[type=submit]').click(); await sleep(dona, 500);
  await dona.locator('form[data-form=specsched] input[name=start]').first().fill(when(4, '17:00')); await dona.locator('form[data-form=specsched] button').first().click(); await sleep(dona, 500);
  const ev = await dona.evaluate(() => db.classes.find(c => c.event)); ok(ev && ev.event.theme === tf.id && JSON.stringify(ev.grid) === '["XXXX","XXXX"]' && ev.duration === 90, 'a data agendada usa o tema novo, 90 min e o desenho do layout padrão atual (4-4)');
  ok(await dona.locator('main .item.thc').count() >= 1 && /Aula Temática Havai/.test(await dona.locator('main').innerText()), 'a data aparece na lista de datas agendadas');
  await dona.locator('[data-act=editclass]').first().click(); await dona.waitForSelector('form[data-form=class] input[name=price]'); await dona.fill('form[data-form=class] input[name=price]', '40,00'); await dona.click('form[data-form=class] button[type=submit]'); await sleep(dona, 500);
  ok((await dona.evaluate(() => db.classes.find(c => c.event).event.price)) === 4000, 'editar uma data (preço R$ 40) pela aba especial');
  await tab(dona, 'temas'); await dona.locator('.th-pick', { hasText: 'Festa Teste' }).click(); await dona.click('[data-act=themedelete]'); await dlg(dona, 'Apagar'); ok(/em uso/.test(await toast(dona)) && (await dona.evaluate(() => db.themes)).some(t => t.id === tf.id), 'tema em uso não pode ser apagado');
  // aluna vê o visual do tema
  await ana.goto(h.base + '/#/conta'); await ana.reload(); await ana.waitForSelector('.item.thc'); const card = ana.locator(`.item.thc[data-theme="${tf.id}"]`);
  ok(await card.count() === 1 && (await card.getAttribute('style')).includes('--t1:#ffcc33') && (await card.locator('.th-tag').innerText()).includes('FESTA!') && (await card.locator('.th-deco').innerText()).includes('🎉'), 'a aluna vê o card com as cores, etiqueta e emojis do tema');
  ok((await card.locator('.btn-th').innerText()).replace(/\u00a0/g, ' ').includes('Quero ir · R$ 40,00') && await card.locator('.btn-th').getAttribute('data-b') === 'outline', 'o botão tem o texto, o preço e o estilo escolhidos');
  await shot(ana, 'aluna_tema'); await card.locator('[data-act=pick]').click(); await ana.waitForSelector('.modal.thm .map2'); ok((await ana.locator('.modal.thm').getAttribute('style')).includes('--t1:#ffcc33'), 'o mapa de bikes da aula especial usa as cores do tema'); await ana.click('.modal [data-act=close]');
  const home = await mk(390, 844); await home.goto(h.base); await home.waitForSelector('#especial .thb'); ok((await home.locator('#especial .thb').getAttribute('style')).includes('--t1:#ffcc33') && (await home.locator('#especial .btn-th').first().innerText()).includes('Quero ir'), 'a página inicial também usa o tema');
  await shot(home, 'home_tema');
  await tab(dona, 'especiais'); await dona.locator('form[data-form=spec][data-id="sp-havai"] select[name=theme]').selectOption('havai'); await dona.locator('form[data-form=spec][data-id="sp-havai"] button[type=submit]').click(); await sleep(dona, 500);
  await tab(dona, 'temas'); await dona.locator('.th-pick', { hasText: 'Festa Teste' }).click(); await dona.click('[data-act=themedelete]'); await dlg(dona, 'Apagar'); ok(!(await dona.evaluate(() => db.themes)).some(t => t.id === tf.id), 'trocando o tema das aulas, o tema antigo pode ser apagado');

  /* ═══ celular da dona: nada estoura a tela ═══ */
  const dm = await mk(390, 844); await login(dm, 'dona@fany.com', 'senhaForte123'); await dm.waitForSelector('text=Aulas de hoje');
  for (const t of ['agenda', 'especiais', 'sala', 'temas', 'estudio']) { await tab(dm, t); const ov = await dm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); ok(!ov, `[celular] aba ${t} sem rolagem lateral`); }
  await tab(dm, 'sala'); await dm.locator('.lay-tile[data-r="0"][data-c="0"]').click(); ok((await rowsOf(dm))[0][0] === '.', '[celular] tocar num lugar do editor funciona'); await shot(dm, 'sala_cel');
  console.log('\nERROS NO NAVEGADOR:', errors.length ? errors : 'nenhum'); const bad = h.log().split('\n').filter(l => /Error|erro interno|TypeError/.test(l)); console.log('ERROS NO SERVIDOR:', bad.length ? bad : 'nenhum');
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK'); await B.close(); h.stop(); process.exit(fails || errors.length || bad.length ? 1 : 0);
})().catch(e => { console.error('EXCEÇÃO', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
