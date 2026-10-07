// Testa: layout das bikes (sala), temas editáveis, aulas especiais, migração de dados antigos
const { start } = require('./harness');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
function client(base) { let cookie = ''; return async (method, p, body) => { const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie, origin: base }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ } return { s: r.status, j }; }; }
const CPF = ['529.982.247-25', '111.444.777-35', '390.533.447-05'];
(async () => {
  const h = await start({ port: 4580, mock: 4581 }); const B = h.base; const owner = client(B), ana = client(B), bia = client(B);
  let r = await owner('POST', '/api/login', { email: 'dona@fany.com', password: 'senhaForte123' }); ok(r.s === 200, 'dona entra');
  let st = r.j.db;
  ok(st.layouts.length === 1 && st.layouts[0].name === 'Sala 3-2-3' && JSON.stringify(st.layouts[0].rows) === '["XXX","XX","XXX"]' && st.settings.layoutId === st.layouts[0].id && st.settings.maxBikes === 8, 'a sala nova já vem 3 na frente, 2 no meio e 3 atrás (8 bikes)');
  ok(st.themes.map(t => t.id).sort().join() === 'gold,havai' && st.themes.every(t => t.builtin), 'temas Dourado e Havaí já existem');
  const lay323 = st.layouts[0].id;
  // aluna: vê temas e a forma da aula, mas não a lista de layouts
  r = await ana('POST', '/api/signup', { name: 'Ana', email: 'ana@x.com', phone: '(18) 99111-0001', cpf: CPF[0], password: 'minhasenha1', acceptTerms: true }); ok(r.s === 200, 'aluna se cadastra');
  ok(r.j.db.themes.length === 2 && !r.j.db.layouts, 'aluna recebe os temas, mas não os layouts do estúdio');
  r = await ana('POST', '/api/act/layoutSave', { name: 'X', rows: ['XXX'] }); ok(r.s === 403, 'aluna não mexe na sala');
  r = await ana('POST', '/api/act/themeSave', { name: 'X' }); ok(r.s === 403, 'aluna não cria tema');
  // layouts: validação
  for (const [rows, why] of [[[], 'vazio'], [['...'], 'sem bike'], [['XXXXXXXXXX'], 'linha de 10'], [Array(9).fill('XX'), '9 linhas'], [['XX', 'AB'], 'letra inválida'], ['XXX', 'não é lista']]) { r = await owner('POST', '/api/act/layoutSave', { name: 'Ruim', rows }); ok(r.s === 400, `layout inválido recusado (${why})`); }
  r = await owner('POST', '/api/act/layoutSave', { name: 'A', rows: ['XXX'] }); ok(r.s === 400, 'nome curto recusado');
  r = await owner('POST', '/api/act/layoutSave', { name: 'Sala 4+3', rows: ['XXXX', 'XXX'] }); ok(r.s === 200 && r.j.state.db.layouts.length === 2, 'dona cria um layout novo (4 + 3 = 7 bikes)');
  const lay43 = r.j.id;
  // aula usando o layout
  const when = d => new Date(Date.now() + d * 864e5).toISOString();
  r = await owner('POST', '/api/act/classSave', { title: 'Aula A', start: when(3), duration: 45, layoutId: lay43 }); let cls = r.j.state.db.classes.find(c => c.title === 'Aula A');
  ok(r.s === 200 && cls.maxBikes === 7 && JSON.stringify(cls.grid) === '["XXXX","XXX"]' && cls.layoutId === lay43, 'aula nova usa o layout escolhido (7 bikes) e guarda a forma');
  r = await owner('POST', '/api/act/classSave', { title: 'Aula B', start: when(4), duration: 45 }); const clsB = r.j.state.db.classes.find(c => c.title === 'Aula B');
  ok(clsB.maxBikes === 8 && JSON.stringify(clsB.grid) === '["XXX","XX","XXX"]' && clsB.layoutId === lay323, 'sem escolher, a aula nova usa o layout padrão (3-2-3)');
  r = await owner('POST', '/api/act/classSave', { title: 'Aula C', start: when(5), duration: 45, layoutId: 'nao-existe' }); ok(r.s === 400, 'layout inexistente recusado');
  // reservas e realocação
  await owner('POST', '/api/act/adjust', { userId: r.j && null, amount: 1 }).catch(() => {});
  const anaId = (await ana('GET', '/api/state')).j.sess.userId;
  // confirma o e-mail das alunas direto (sem serviço de e-mail ligado, não é exigido)
  r = await owner('POST', '/api/act/adjust', { userId: anaId, amount: 10, reason: 'teste' }); ok(r.s === 200, 'dona dá créditos');
  r = await ana('POST', '/api/act/reserve', { classId: cls.id, bike: 7 }); ok(r.s === 200 && r.j.bike === 7, 'aluna reserva a bike 7 (na última linha do layout 4+3)');
  r = await owner('POST', '/api/act/layoutSave', { id: lay43, name: 'Sala 4+3', rows: ['XXX', 'XX'], applyFuture: true }); ok(r.s === 200, 'dona reduz o layout para 5 bikes e aplica nas aulas futuras');
  st = r.j.state.db; cls = st.classes.find(c => c.id === cls.id); const res = st.reservations.find(x => x.classId === cls.id && x.userId === anaId);
  ok(cls.maxBikes === 5 && JSON.stringify(cls.grid) === '["XXX","XX"]' && res.bike >= 1 && res.bike <= 5, `a aula passou para 5 bikes e a bike 7 da aluna foi realocada (agora ${res.bike})`);
  ok((await ana('GET', '/api/state')).j.db.notes.some(n => /Sua bike mudou/.test(n.title)), 'aluna foi avisada da mudança de bike');
  // 6 reservas não cabem em 4 bikes → mantém
  r = await owner('POST', '/api/act/layoutSave', { name: 'Mini', rows: ['XX', 'XX'] }); const layMini = r.j.id;
  r = await owner('POST', '/api/act/classSave', { id: cls.id, title: 'Aula A', start: cls.start, duration: 45, layoutId: layMini }); ok(r.s === 200, 'trocar uma aula para um layout menor que ainda comporta as reservas funciona');
  // delete
  r = await owner('POST', '/api/act/layoutDelete', { id: lay323 }); ok(r.s === 400 && /padrão/.test(r.j.error), 'não apaga o layout padrão');
  r = await owner('POST', '/api/act/layoutDefault', { id: lay43 }); ok(r.s === 200 && r.j.state.db.settings.layoutId === lay43 && r.j.state.db.settings.maxBikes === 5, 'trocar o layout padrão atualiza o número de bikes do estúdio');
  r = await owner('POST', '/api/act/layoutDefault', { id: lay323 }); ok(r.s === 200 && r.j.state.db.settings.maxBikes === 8, 'volta para 3-2-3 (8 bikes)');
  r = await owner('POST', '/api/act/layoutDelete', { id: layMini }); ok(r.s === 200 && !r.j.state.db.layouts.some(l => l.id === layMini), 'apaga um layout que não é padrão');
  // temas
  const T = { name: 'Festa Junina', emoji: '🎉', deco: '🎊🌽', c1: '#ffcc33', c2: '#ff6633', c3: '#cc2244', tcAuto: true, btn: 'gradient', pattern: 'confetti', tag: 'FESTA!', btnText: 'Quero ir · {preço}', glow: true, round: 'soft' };
  for (const [bad, why] of [[{ c1: 'red' }, 'cor sem #'], [{ c2: '#12345' }, 'cor curta'], [{ c3: 'javascript:alert(1)' }, 'cor maliciosa'], [{ name: 'x' }, 'nome curto']]) { r = await owner('POST', '/api/act/themeSave', { ...T, ...bad }); ok(r.s === 400, `tema inválido recusado (${why})`); }
  r = await owner('POST', '/api/act/themeSave', { ...T, pattern: 'hack', btn: 'x', round: 'y' }); const tj = r.j.state.db.themes.find(t => t.id === r.j.id);
  ok(r.s === 200 && tj.pattern === 'none' && tj.btn === 'gradient' && tj.round === 'pill', 'opções desconhecidas viram o padrão (nada estranho entra no banco)');
  r = await owner('POST', '/api/act/themeSave', { ...T }); const themeId = r.j.id; ok(r.s === 200 && r.j.state.db.themes.length === 4, 'dona cria o tema "Festa Junina"');
  r = await owner('POST', '/api/act/themeSave', { ...T, id: themeId, emoji: '🎈', name: 'Festa Junina 2' }); ok(r.s === 200 && r.j.state.db.themes.find(t => t.id === themeId).emoji === '🎈', 'edita o tema');
  r = await owner('POST', '/api/act/themeDelete', { id: 'havai' }); ok(r.s === 400 && /padrões/.test(r.j.error), 'tema padrão não pode ser apagado');
  // aula especial com tema novo e layout
  r = await owner('POST', '/api/act/specSave', { id: 'sp-havai', name: 'Aula Temática Havai', price: '35,00', theme: themeId, layoutId: lay43, duration: 90, desc: 'x', active: true, applyAll: true }); ok(r.s === 200, 'aula especial passa a usar o tema novo e o layout de 5 bikes');
  r = await owner('POST', '/api/act/specSchedule', { id: 'sp-havai', start: when(6) }); const ev = r.j.state.db.classes.find(c => c.event);
  ok(r.s === 200 && ev.event.theme === themeId && ev.maxBikes === 5 && JSON.stringify(ev.grid) === '["XXX","XX"]' && ev.duration === 90, 'a data agendada herda tema, layout (5 bikes) e 90 min');
  r = await owner('POST', '/api/act/themeDelete', { id: themeId }); ok(r.s === 400 && /em uso/.test(r.j.error), 'tema em uso não pode ser apagado');
  r = await owner('POST', '/api/act/specSave', { id: 'sp-havai', name: 'Aula Temática Havai', price: '35,00', theme: 'havai', layoutId: lay323, duration: 90, desc: 'x', active: true, applyAll: true }); const ev2 = r.j.state.db.classes.find(c => c.event);
  ok(ev2.event.theme === 'havai' && ev2.maxBikes === 8 && JSON.stringify(ev2.grid) === '["XXX","XX","XXX"]', 'voltando ao Havaí + 3-2-3: as datas já marcadas acompanham');
  r = await owner('POST', '/api/act/themeDelete', { id: themeId }); ok(r.s === 200, 'agora o tema sem uso pode ser apagado');
  r = await owner('POST', '/api/act/specSave', { id: 'sp-havai', name: 'Aula Temática Havai', price: '35,00', theme: 'tema-que-nao-existe', duration: 90, desc: 'x', active: true }); ok(r.j.state.db.specials[0].theme === 'gold', 'tema inexistente cai no Dourado');
  // duplicar semana copia a forma
  const bia2 = await bia('POST', '/api/signup', { name: 'Bia', email: 'bia@x.com', phone: '(18) 99111-0002', cpf: CPF[1], password: 'minhasenha1', acceptTerms: true }); ok(bia2.s === 200, 'segunda aluna');
  await owner('POST', '/api/act/classSave', { title: 'Cópia', start: when(1), duration: 45, layoutId: lay43 });
  r = await owner('POST', '/api/act/dupweek', {}); const copies = r.j.state.db.classes.filter(c => c.title === 'Cópia'); ok(copies.length === 2 && copies.every(c => JSON.stringify(c.grid) === '["XXX","XX"]' && c.maxBikes === 5), 'duplicar semana copia a forma da sala');
  // o formulário antigo (só quantidade de bikes) continua aceito
  r = await owner('POST', '/api/act/series', { title: 'Antiga', days: [0, 1, 2, 3, 4, 5, 6], hour: 7, minute: 0, weeks: 1, duration: 45, maxBikes: 6 }); const old = r.j.state.db.classes.filter(c => c.title === 'Antiga'); ok(old.length >= 1 && old.every(c => c.maxBikes === 6 && c.grid.join('').replace(/\./g, '').length === 6), 'compatibilidade: quantidade de bikes sem layout gera forma automática');
  // limite de temas e de layouts
  let lim = 0; for (let i = 0; i < 40; i++) { r = await owner('POST', '/api/act/themeSave', { ...T, name: 'T' + i }); if (r.s === 400) { lim++; break; } } ok(lim === 1, 'limite de temas protege o banco');
  lim = 0; for (let i = 0; i < 30; i++) { r = await owner('POST', '/api/act/layoutSave', { name: 'L' + i, rows: ['XX'] }); if (r.s === 400) { lim++; break; } } ok(lim === 1, 'limite de layouts protege o banco');
  h.stop();

  /* ═══ migração: dados da versão anterior continuam funcionando ═══ */
  const mk = (id, off, mb, extra = {}) => ({ id, title: 'Spinning ' + id, instructor: 'Fany', start: new Date(Date.now() + off * 864e5).toISOString(), duration: 45, maxBikes: mb, level: 'Todos', notes: '', active: true, event: null, ...extra });
  const old0 = { v: 1, schema: 4, settings: { name: 'Spinning Fany', about: 'x', address: 'y', whatsapp: '5518996676637', instagram: '', maxBikes: 8, duration: 45, cancelHours: 2, instructor: 'Fany', gifts: true, terms: 't', reminder: 'r', infinitepayHandle: '' }, packages: [{ id: 'p1', name: '1 Aula', credits: 1, price: 4500, desc: '', kind: 'credits', validity: null, active: true, sort: 1 }], specials: [{ id: 'sp-havai', name: 'Aula Temática Havai', price: 3500, theme: 'havai', maxBikes: 8, duration: 90, desc: '', active: true }], classes: [mk('f8', 2, 8), mk('f10', 3, 10), mk('p8', -2, 8), mk('ev', 5, 8, { event: { price: 3500, theme: 'havai', tpl: 'sp-havai' } })], users: [{ id: 'u1', name: 'Velha', email: 'v@x.com', phone: '5518991110009', role: 'client', credits: 5, blocked: false, createdAt: new Date().toISOString(), termsAt: new Date().toISOString() }], reservations: [{ id: 'r1', userId: 'u1', classId: 'f8', bike: 6, status: 'confirmed', paidCredit: true, at: new Date().toISOString() }], waitlist: [], purchases: [], ledger: [], notes: [], subs: [], audit: [], sessions: [], announcements: [] };
  const h2 = await start({ port: 4582, mock: 4583, preDb: old0 }); const o2 = client(h2.base);
  r = await o2('POST', '/api/login', { email: 'dona@fany.com', password: 'senhaForte123' }); st = r.j.db; const g = id => st.classes.find(c => c.id === id);
  ok(st.layouts.length === 2 && st.settings.layoutId === 'lay-323' && st.themes.length === 2, 'migração: cria layouts e temas sem perder nada');
  ok(JSON.stringify(g('f8').grid) === '["XXX","XX","XXX"]' && g('f8').layoutId === 'lay-323', 'migração: aula futura de 8 bikes passa para 3-2-3');
  ok(g('f10').maxBikes === 10 && g('f10').grid.join('').replace(/\./g, '').length === 10, 'migração: aula de 10 bikes mantém 10 bikes (forma automática)');
  ok(g('p8').grid.join('').replace(/\./g, '').length === 8 && JSON.stringify(g('p8').grid) !== '["XXX","XX","XXX"]', 'migração: aula passada não muda de forma');
  ok(g('ev').grid.length > 0 && g('ev').event.theme === 'havai', 'migração: aula especial continua com o tema Havaí');
  ok(st.reservations.find(x => x.id === 'r1').bike === 6 && st.users.find(u => u.id === 'u1').credits === 5, 'migração: reservas e créditos intactos (a bike 6 continua sendo a bike 6)');
  h2.stop();
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('EXCEÇÃO', e); process.exit(1); });
