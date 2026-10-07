const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { start } = require('./harness');
(async () => {
  const h = await start({ port: 4590, mock: 4591 }); const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|net::/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto(h.base + '/#/entrar'); await p.fill('form[data-form=login] input[name=email]', 'dona@fany.com'); await p.fill('form[data-form=login] input[name=password]', 'senhaForte123'); await p.click('form[data-form=login] button[type=submit]'); await p.waitForSelector('text=Aulas de hoje');
  for (const t of ['checkin', 'visao', 'agenda', 'especiais', 'alunas', 'creditos', 'vendas', 'pacotes', 'pagamentos', 'emails', 'equipe', 'avisos', 'sala', 'temas', 'estudio']) { await p.click(`[data-act=atab][data-t=${t}]`); await p.waitForTimeout(150); const len = (await p.locator('main').innerText()).length; console.log(t, len); if (['sala', 'temas', 'especiais'].includes(t)) await p.screenshot({ path: `/tmp/n_${t}.png`, fullPage: true }); }
  console.log('erros:', errs); await b.close(); h.stop();
})().catch(e => { console.error('EXC', e.message); process.exit(1); });
