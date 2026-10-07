
/* ═══════════ temas das aulas especiais (a dona cria e edita) ═══════════ */
const themeOf = c => themeById(c && c.event && c.event.theme);
const evEmoji = c => (c && c.event ? themeOf(c).emoji || '' : '');
const thVars = t => esc(themeVars(t));
const thEmoji = t => (t.emoji ? esc(t.emoji) + ' ' : '');
const priceLabel = (t, price) => String(t.btnText || 'Garantir minha vaga · {preço}').replace(/\{pre[cç]o\}/gi, brl(price));
const thDeco = t => (t.deco ? `<span class="th-deco" aria-hidden="true">${esc(t.deco)}</span>` : '');
function thBtn(t, label, attrs = '', cls = '') { return `<button type="button" class="btn-th ${cls}" data-b="${esc(t.btn)}" data-r="${esc(t.round)}" data-g="${t.glow ? 'on' : 'off'}" style="${thVars(t)}" ${attrs}>${label}</button>`; }

/** cartão de uma aula especial (agenda da aluna e pré-visualização do criador de temas) */
function evCard(c, t, o) {
  return `<article class="item thc ${o.mine ? 'mine' : ''}" style="${thVars(t)}" data-class="${esc(c.id)}" data-theme="${esc(t.id)}">${thDeco(t)}<div><p class="th-tag">${thEmoji(t)}${esc(t.tag || 'AULA ESPECIAL')} · pagamento direto, sem usar crédito</p><p style="font:700 1.1rem var(--display)"><span class="th-time">${fTime(c.start)}</span> · ${esc(c.title)}</p><p class="muted sm">${esc(fDay(c.start))} · ${c.duration} min · ${esc(c.instructor)}</p><p class="sm ${o.cls_ || 'ok'}">${o.status}</p>${c.notes ? `<p class="muted xs">${esc(c.notes)}</p>` : ''}</div><div class="ev-side"><span class="th-price">${brl(c.event.price)}</span>${o.btn}</div></article>`;
}
function eventItem(c, u) {
  const t = themeOf(c), r = db.reservations.find(x => x.userId === u.id && x.classId === c.id && x.status === 'confirmed');
  const held = isHeld(r), n = occ(c.id).length, full = n >= c.maxBikes, left = c.maxBikes - n;
  let btn, status, cls_ = 'ok';
  if (r && held) { status = `⏳ Aguardando pagamento · bike ${r.bike} · expira em ${holdMin(r)} min`; cls_ = 'warn'; btn = `<div class="row" style="gap:6px">${thBtn(t, 'Pagar agora', `data-act="resume" data-id="${r.pay}"`, 'btn-sm')}<button class="btn-line btn-sm" data-act="cancel" data-id="${r.id}">Cancelar</button></div>`; }
  else if (r) { status = `✔ Vaga garantida · bike ${r.bike}`; btn = `<div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="change" data-id="${c.id}">Trocar bike</button><a class="btn-line btn-sm" target="_blank" rel="noopener" href="${waLink(S().whatsapp, `Oi! Preciso cancelar/alterar minha vaga na ${c.title} (${fWhen(c.start)}).`)}">Falar com a Fany</a></div>`; }
  else if (full) { status = 'Esgotada'; cls_ = 'bad'; btn = '<button class="btn-line btn-sm" disabled>Esgotada</button>'; }
  else { status = `${left} de ${c.maxBikes} bikes livres`; btn = thBtn(t, `${thEmoji(t)}${esc(priceLabel(t, c.event.price))}`, `data-act="pick" data-id="${c.id}"`); }
  return evCard(c, t, { mine: !!r, status, cls_, btn });
}
function eventCardHome(c) {
  const t = themeOf(c), left = c.maxBikes - occ(c.id).length;
  return `<article class="cls thc" style="${thVars(t)}">${thDeco(t)}<span class="th-tag">${thEmoji(t)}${esc(t.tag || 'AULA ESPECIAL')}</span><span class="cap" style="font:700 1.05rem var(--display)">${esc(fDay(c.start))}</span><span class="t">${fTime(c.start)}</span><span class="muted sm">${c.duration} min · ${esc(c.instructor)}</span><span class="th-price">${brl(c.event.price)}</span><span class="sm ${left <= 0 ? 'bad' : left <= 3 ? 'warn' : 'ok'}">${left <= 0 ? 'Esgotada' : left <= 3 ? `Últimas ${left} bikes!` : `${left} bikes livres`}</span>${thBtn(t, `${thEmoji(t)}${esc(priceLabel(t, c.event.price))}`, `data-act="enter" data-cid="${left > 0 ? c.id : ''}" ${left <= 0 ? 'disabled' : ''}`)}</article>`;
}
function eventBanner(c, t = themeOf(c)) {
  return `<div class="thb" style="${thVars(t)}">${thDeco(t)}<p class="eyebrow">${thEmoji(t)}${esc(t.tag || 'AULA ESPECIAL')}</p><h2>${esc(c.title)}</h2><p class="muted" style="margin-top:8px;max-width:38rem">${esc(c.notes || '')}</p><p class="sm" style="margin-top:8px"><b>${brl(c.event.price)}</b> · ${c.duration} minutos · você paga direto (Pix ou cartão) e já garante a bike — <b>não usa créditos</b>.</p></div>`;
}

/* ── paletas prontas ── */
const THEME_PRESETS = [
  { name: 'Havaí', emoji: '🌺', deco: '🌺🌴', c1: '#ffd23f', c2: '#ff9142', c3: '#ff5d8f', pattern: 'waves' },
  { name: 'Balada neon', emoji: '🪩', deco: '🪩🎶', c1: '#00e5ff', c2: '#7c4dff', c3: '#ff2bd6', pattern: 'dots' },
  { name: 'Festa junina', emoji: '🌽', deco: '🎉🌽🔥', c1: '#ffcc33', c2: '#ff6633', c3: '#cc2244', pattern: 'confetti' },
  { name: 'Halloween', emoji: '🎃', deco: '🎃👻🦇', c1: '#ff9a1f', c2: '#7a2cff', c3: '#3b1a73', pattern: 'stars' },
  { name: 'Natal', emoji: '🎄', deco: '🎄🎁⭐', c1: '#ff4b4b', c2: '#1f9d55', c3: '#f5c518', pattern: 'stars' },
  { name: 'Carnaval', emoji: '🎭', deco: '🎭🥁🎊', c1: '#ffe600', c2: '#00c853', c3: '#d500f9', pattern: 'confetti' },
  { name: 'Dia das Mães', emoji: '💐', deco: '💐💗', c1: '#ff8fb1', c2: '#ffc2d6', c3: '#d6336c', pattern: 'dots' },
  { name: 'Outubro Rosa', emoji: '🎀', deco: '🎀💗', c1: '#ff6fb5', c2: '#ff3d8b', c3: '#b5176b', pattern: 'stripes' },
  { name: 'Verão', emoji: '🍉', deco: '🍉🏖️☀️', c1: '#ff5c5c', c2: '#ffd84d', c3: '#3ddc84', pattern: 'waves' },
  { name: 'Noite roxa', emoji: '💜', deco: '💜✨', c1: '#b388ff', c2: '#7c4dff', c3: '#4527a0', pattern: 'stars' },
  { name: 'Dourado', emoji: '⭐', deco: '⭐', c1: '#f7cd2b', c2: '#c99a0b', c3: '#f5c518', pattern: 'none' }
];
const EMOJI_PAL = ['🌺', '🌴', '🏝️', '🍹', '🍉', '🌞', '🎉', '🥳', '🎊', '🪩', '🎶', '🎤', '💃', '🕺', '🔥', '⚡', '⭐', '✨', '💛', '🧡', '❤️', '💗', '💜', '💙', '🎀', '💐', '🌈', '🎃', '👻', '🎄', '🎁', '🎭', '🥁', '🌽', '🏆', '👑', '💪', '🧘', '🚴', '🍀', '🐚', '🦩'];
const PATTERN_NAMES = { none: 'Liso', waves: 'Ondas', dots: 'Bolinhas', stripes: 'Listras', confetti: 'Confete', stars: 'Estrelas' };
const blankTheme = () => ({ id: '', name: 'Meu tema', emoji: '🎉', deco: '🎉✨', c1: '#b388ff', c2: '#7c4dff', c3: '#ff4081', tcAuto: true, tc: '#1a0b00', btn: 'gradient', pattern: 'confetti', tag: 'AULA ESPECIAL', btnText: 'Garantir minha vaga · {preço}', glow: true, round: 'pill' });

function sampleClass(t) {
  const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(17, 0, 0, 0);
  return { id: 'prev', title: 'Aula Temática', instructor: S().instructor, start: d.toISOString(), duration: 90, maxBikes: 8, notes: 'Aqui aparece a descrição da aula.', event: { price: 3500, theme: t.id } };
}
/** como o tema vai aparecer para as alunas (card, botões e faixa da página inicial) */
function themePreviewHtml(t) {
  const c = sampleClass(t), btn = thBtn(t, `${thEmoji(t)}${esc(priceLabel(t, 3500))}`);
  return `<p class="sticky-note">No celular da aluna — card na agenda:</p>${evCard(c, t, { status: '5 de 8 bikes livres', cls_: 'ok', btn })}
    <p class="sticky-note" style="margin-top:16px">Botões:</p><div class="row">${btn}${thBtn(t, `${thEmoji(t)}Pagar agora`, '', 'btn-sm')}</div>
    <p class="sticky-note" style="margin-top:16px">Faixa da página inicial:</p>${eventBanner(c, t)}`;
}
function readThemeForm(f) {
  const g = n => f.elements[n];
  return { id: f.dataset.id || '', name: g('name').value, emoji: g('emoji').value, deco: g('deco').value, c1: g('c1').value, c2: g('c2').value, c3: g('c3').value, tcAuto: g('tcAuto').checked, tc: g('tc').value, btn: g('btn').value, round: g('round').value, pattern: g('pattern').value, tag: g('tag').value, btnText: g('btnText').value, glow: g('glow').checked };
}
function updateThemePreview() { const f = $('#themeform'), p = $('#themeprev'); if (!f || !p) return; try { p.innerHTML = themePreviewHtml(readThemeForm(f)); } catch (e) { /* campo ainda incompleto */ } }
const pill = (name, val, label, cur, extra = '') => `<label class="opt"><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''}><span>${extra}${label}</span></label>`;

function themeForm(t) {
  const sw = p => { const u = patternUri(Object.assign({}, t, { pattern: p })); return `<i class="swatch" style="background-color:var(--bg);background-image:${esc(u.img)};background-repeat:${u.rep};background-position:${u.pos}"></i>`; };
  const used = t.id && (db.specials.some(x => x.theme === t.id) || db.classes.some(c => c.event && c.event.theme === t.id));
  return `<form id="themeform" data-form="theme" data-id="${esc(t.id)}" class="card stack">
    <h2>${t.id ? 'Editando o tema' : 'Novo tema'}</h2>
    <div><label class="lbl" for="tn">Nome do tema <span class="muted xs">(só você vê)</span></label><input id="tn" class="field" name="name" value="${esc(t.name)}" maxlength="30" required></div>
    <div><p class="lbl">Cores <span class="muted xs">(o botão e o card usam as três juntas)</span></p><div class="colors"><label>Cor 1 · começo<input type="color" name="c1" value="${esc(t.c1)}"></label><label>Cor 2 · meio<input type="color" name="c2" value="${esc(t.c2)}"></label><label>Cor 3 · fim<input type="color" name="c3" value="${esc(t.c3)}"></label></div>
      <label class="row sm" style="gap:8px;margin-top:10px"><input type="checkbox" name="tcAuto" ${t.tcAuto !== false ? 'checked' : ''}> Cor do texto do botão automática (recomendado)</label>
      <label class="lbl" style="display:flex;align-items:center;gap:10px">Cor do texto, se desmarcar acima <input type="color" name="tc" value="${esc(t.tc || '#1a0b00')}" style="width:56px;height:34px;border-radius:8px;border:1px solid var(--line);background:var(--elevated)"></label></div>
    <div><p class="lbl">Emojis</p>
      <div class="row"><div style="flex:1;min-width:130px"><label class="lbl" for="te">No botão e na etiqueta</label><input id="te" class="field" name="emoji" value="${esc(t.emoji)}" maxlength="16" placeholder="🎉"></div><div style="flex:2;min-width:170px"><label class="lbl" for="td">Decoração no canto do card <span class="muted xs">(até 5)</span></label><input id="td" class="field" name="deco" value="${esc(t.deco)}" maxlength="24" placeholder="🎉✨"></div></div>
      <div class="opts" style="margin:10px 0 6px">${pill('emoTarget', 'emoji', 'Toque nos emojis para o botão', 'emoji')}${pill('emoTarget', 'deco', 'Toque nos emojis para decorar', 'emoji')}</div>
      <div class="pal">${EMOJI_PAL.map(e => `<button type="button" data-act="themeemoji" data-e="${e}" aria-label="Emoji ${e}">${e}</button>`).join('')}</div>
      <p class="muted xs" style="margin-top:6px">Quer outro emoji? Escreva ou cole direto nos campos acima — qualquer emoji funciona.</p></div>
    <div><p class="lbl">Fundo do card</p><div class="opts">${Object.entries(PATTERN_NAMES).map(([k, n]) => pill('pattern', k, n, t.pattern || 'none', k === 'none' ? '' : sw(k))).join('')}</div></div>
    <div><p class="lbl">Estilo do botão</p><div class="opts">${pill('btn', 'gradient', 'Degradê', t.btn)}${pill('btn', 'solid', 'Cor sólida', t.btn)}${pill('btn', 'outline', 'Só contorno', t.btn)}</div></div>
    <div><p class="lbl">Formato do botão</p><div class="opts">${pill('round', 'pill', 'Redondo', t.round)}${pill('round', 'soft', 'Cantos suaves', t.round)}${pill('round', 'sharp', 'Reto', t.round)}</div>
      <label class="row sm" style="gap:8px;margin-top:10px"><input type="checkbox" name="glow" ${t.glow ? 'checked' : ''}> Brilho em volta do botão</label></div>
    <div class="row"><div style="flex:1;min-width:150px"><label class="lbl" for="tt">Etiqueta do card</label><input id="tt" class="field" name="tag" value="${esc(t.tag)}" maxlength="30" placeholder="AULA ESPECIAL"></div><div style="flex:2;min-width:190px"><label class="lbl" for="tb">Texto do botão <span class="muted xs">({preço} vira o valor)</span></label><input id="tb" class="field" name="btnText" value="${esc(t.btnText)}" maxlength="50"></div></div>
    <div><p class="lbl">Começar de uma paleta pronta <span class="muted xs">(depois ajuste do seu jeito)</span></p><div class="row" style="gap:6px">${THEME_PRESETS.map((p, i) => `<button type="button" class="preset" data-act="themepreset" data-i="${i}"><i style="background:linear-gradient(90deg,${p.c1},${p.c2},${p.c3})"></i>${p.emoji} ${p.name}</button>`).join('')}</div></div>
    <div class="row"><button class="btn" type="submit">${t.id ? 'Salvar alterações' : 'Criar tema'}</button>${t.id ? '<button class="btn-line" type="button" data-act="themesaveas">Salvar como novo tema</button>' : ''}${t.id && !t.builtin ? `<button class="btn-bad" type="button" data-act="themedelete" data-id="${esc(t.id)}" ${used ? 'title="Em uso: troque o tema das aulas primeiro"' : ''}>Apagar</button>` : ''}</div>
    ${t.builtin ? '<p class="muted xs">Este é um tema padrão: você pode editar à vontade, mas ele não pode ser apagado.</p>' : ''}
  </form>`;
}
function aThemes() {
  const cur = ui.themeEditId === undefined ? '' : ui.themeEditId, t = db.themes.find(x => x.id === cur) || blankTheme();
  return `<h1 style="font-size:1.9rem">Temas das aulas especiais</h1>
  <p class="muted" style="margin:6px 0 16px;max-width:46rem">Crie o visual do botão e do card de cada aula especial: cores, emojis, fundo e texto. Escolha o tema depois, na aba <button class="linkbtn" data-act="atab" data-t="especiais">Aulas especiais</button>. Dá para ter quantos temas quiser (festa junina, Natal, Halloween…).</p>
  <h2 class="day" style="margin-top:6px">Seus temas</h2>
  <div class="th-grid">${db.themes.map(x => `<button class="th-pick ${x.id === cur ? 'on' : ''}" data-act="themeedit" data-id="${esc(x.id)}" aria-label="Editar o tema ${esc(x.name)}"><div class="thc" style="${thVars(x)};padding:14px;border-radius:18px;min-height:100px">${thDeco(x)}<p class="th-tag">${thEmoji(x)}${esc(x.tag || 'AULA ESPECIAL')}</p><p style="font:700 1rem var(--display);margin:4px 0 10px">${esc(x.name)}${x.builtin ? ' <span class="muted xs">· padrão</span>' : ''}</p><span class="btn-th btn-sm" data-b="${esc(x.btn)}" data-r="${esc(x.round)}" data-g="${x.glow ? 'on' : 'off'}">${thEmoji(x)}Botão</span></div></button>`).join('')}<button class="th-pick ${!cur ? 'on' : ''}" data-act="themenew" style="display:grid;place-items:center;min-height:120px;border:2px dashed var(--line)"><span class="gold" style="font-weight:600">+ Criar novo tema</span></button></div>
  <div class="th-layout" style="margin-top:20px">${themeForm(t)}<div class="th-sticky"><h2 class="day" style="margin-top:0">Pré-visualização ao vivo</h2><div id="themeprev">${themePreviewHtml(t)}</div></div></div>`;
}
const themeActs = {
  themeedit(t) { ui.themeEditId = t.dataset.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  themenew() { ui.themeEditId = ''; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  themeemoji(t) { const f = $('#themeform'); if (!f) return; const e = t.dataset.e; if (f.elements.emoTarget.value === 'deco') { const cur = Array.from(f.elements.deco.value); f.elements.deco.value = [...cur, e].slice(-5).join(''); } else f.elements.emoji.value = e; updateThemePreview(); },
  themepreset(t) {
    const f = $('#themeform'), p = THEME_PRESETS[+t.dataset.i]; if (!f || !p) return;
    for (const k of ['c1', 'c2', 'c3', 'emoji', 'deco']) f.elements[k].value = p[k];
    f.elements.pattern.value = p.pattern; f.elements.tcAuto.checked = true; f.elements.btn.value = 'gradient'; f.elements.round.value = 'pill'; f.elements.glow.checked = true; updateThemePreview();
  },
  themedelete(t) { const x = db.themes.find(y => y.id === t.dataset.id); confirmBox('Apagar esse tema?', esc(x ? x.name : ''), 'Apagar', async () => { const j = await act('themeDelete', { id: t.dataset.id }); if (j) { ui.themeEditId = ''; render(); } }, true); },
  async themesaveas() { const f = $('#themeform'); if (!f) return; const o = readThemeForm(f); o.id = ''; if (db.themes.some(x => x.name === o.name)) o.name += ' (cópia)'; const j = await act('themeSave', o); if (j) { ui.themeEditId = j.id; render(); } }
};
const themeForms = { async theme(f) { const j = await act('themeSave', readThemeForm(f)); if (j) { ui.themeEditId = j.id; render(); } } };

/* ═══════════ aba "Aulas especiais" ═══════════ */
const layoutOptions = (sel, extra = '') => (db.layouts || []).map(l => `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)} · ${gridCount(l.rows)} bikes</option>`).join('') + extra;
const themeOptions = sel => db.themes.map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${t.emoji ? esc(t.emoji) + ' ' : ''}${esc(t.name)}</option>`).join('');
function specCard(t) {
  const th = themeById(t.theme), nxt = t.id ? db.classes.filter(c => c.active && c.event && c.event.tpl === t.id && isFuture(c)).sort((a, b) => D(a.start) - D(b.start)) : [];
  return `<div class="card thc" style="padding:0;${thVars(th)}">${thDeco(th)}<form class="stack" data-form="spec" data-id="${esc(t.id)}" style="padding:18px"><h2 style="margin-bottom:0">${t.id ? thEmoji(th) + esc(t.name) : 'Nova aula especial'}</h2>
    <input class="field" name="name" value="${esc(t.name)}" placeholder="Nome da aula" required>
    <div class="row"><div style="flex:1"><label class="lbl">Preço (R$)</label><input class="field" name="price" inputmode="decimal" value="${centsToReais(t.price)}"></div><div style="flex:1"><label class="lbl">Duração (min)</label><input class="field" type="number" name="duration" min="15" max="240" value="${t.duration}"></div></div>
    <div><label class="lbl">Sala (quantas bikes e onde ficam)</label><select class="field" name="layoutId">${layoutOptions(t.layoutId || '', t.layoutId ? '' : `<option value="" selected>Forma automática · ${t.maxBikes} bikes</option>`)}</select></div>
    <div><label class="lbl">Tema (visual do card e do botão)</label><select class="field" name="theme">${themeOptions(t.theme)}</select><button type="button" class="linkbtn xs" data-act="atab" data-t="temas">🎨 Criar ou editar temas</button></div>
    <div><label class="lbl">Descrição (as alunas veem)</label><input class="field" name="desc" value="${esc(t.desc || '')}" maxlength="200"></div>
    <label class="row sm" style="gap:8px"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> Ativa (pode agendar novas datas)</label>
    ${t.id ? '<label class="row sm" style="gap:8px"><input type="checkbox" name="applyAll" checked> Atualizar também as datas já agendadas</label>' : ''}
    <button class="btn btn-block" type="submit">${t.id ? 'Salvar modelo' : 'Criar aula especial'}</button></form>
    ${t.id ? `<form data-form="specsched" data-id="${esc(t.id)}" class="row" style="padding:0 18px 18px"><input class="field" style="flex:1;min-width:190px" type="datetime-local" name="start" required aria-label="Data e hora da nova aula"><button class="btn-ghost" type="submit" ${t.active ? '' : 'disabled'}>+ Agendar data</button></form>
    <p class="muted xs" style="padding:0 18px 16px">${nxt.length ? 'Próximas datas: ' + nxt.map(c => esc(fWhen(c.start))).join(' · ') : 'Nenhuma data agendada.'}</p>` : ''}</div>`;
}
function eventEditForm(c) {
  const t = themeOf(c);
  return `<form class="card stack" data-form="class" style="margin-bottom:18px;border-color:var(--gold)"><h2>Editar esta data</h2>
    <input type="hidden" name="level" value="${esc(c.level || 'Aula temática')}"><input class="field" name="title" value="${esc(c.title)}" required><input class="field" name="instructor" value="${esc(c.instructor)}" placeholder="Instrutora">
    <div><label class="lbl">Data e hora</label><input class="field" type="datetime-local" name="start" value="${toLocalInput(c.start)}" required></div>
    <div class="row"><div style="flex:1"><label class="lbl">Duração (min)</label><input class="field" type="number" name="duration" min="15" max="240" value="${c.duration}"></div><div style="flex:1"><label class="lbl">Preço (R$)</label><input class="field" name="price" inputmode="decimal" value="${centsToReais(c.event.price)}"></div></div>
    <div class="row"><div style="flex:1;min-width:180px"><label class="lbl">Sala</label><select class="field" name="layoutId">${layoutOptions(c.layoutId || '', c.layoutId ? '' : `<option value="" selected>Forma atual · ${c.maxBikes} bikes</option>`)}</select></div><div style="flex:1;min-width:180px"><label class="lbl">Tema</label><select class="field" name="theme">${themeOptions(t.id)}</select></div></div>
    <input class="field" name="notes" value="${esc(c.notes || '')}" placeholder="Descrição (as alunas veem)">
    <div class="row"><button class="btn" type="submit" style="flex:1">Salvar alterações</button><button class="btn-line" type="button" data-act="editcancel">Cancelar edição</button></div></form>`;
}
function aSpecials() {
  const evs = db.classes.filter(c => c.event && c.active && D(c.start) > addDays(new Date(), -1)).sort((a, b) => D(a.start) - D(b.start));
  const e = ui.editClass && cls(ui.editClass) && cls(ui.editClass).event ? cls(ui.editClass) : null;
  return `<h1 style="font-size:1.9rem">Aulas especiais</h1>
  <p class="muted" style="margin:6px 0 16px;max-width:46rem">Aulas de evento (como a Temática Havaí): a aluna paga direto no Pix ou cartão e já garante a bike — <b>não usa crédito</b>. Aqui você cria o <b>modelo</b> (preço, sala, tema) e depois agenda as <b>datas</b>. O visual do botão é criado na aba <button class="linkbtn" data-act="atab" data-t="temas">Temas</button> e o desenho das bikes na aba <button class="linkbtn" data-act="atab" data-t="sala">Sala</button>.</p>
  ${e ? eventEditForm(e) : ''}
  <h2 class="day" style="margin-top:6px">1 · Modelos de aula especial</h2><div class="grid g2">${db.specials.map(specCard).join('')}${specCard({ id: '', name: 'Nova aula especial', price: 3500, theme: 'gold', layoutId: S().layoutId || null, maxBikes: S().maxBikes, duration: 90, desc: '', active: true })}</div>
  <h2 class="day">2 · Datas agendadas</h2>${evs.map(c => { const t = themeOf(c); return `<div class="item thc" style="${thVars(t)}"><div><p style="font:700 1rem var(--display)">${thEmoji(t)}${esc(c.title)} <span class="pill warn">${brl(c.event.price)}</span></p><p class="muted sm">${esc(fWhen(c.start))} · ${c.duration} min · ${occ(c.id).length}/${c.maxBikes} bikes</p></div><div class="row" style="gap:6px"><button class="btn-line btn-sm" data-act="turma" data-id="${c.id}">${ui.openRoster === c.id ? 'Fechar turma' : 'Turma'}</button><button class="btn-line btn-sm" data-act="editclass" data-id="${c.id}">Editar</button><button class="btn-bad btn-sm" data-act="cancelclass" data-id="${c.id}">Cancelar aula</button></div></div>${ui.openRoster === c.id ? roomCard(c) : ''}`; }).join('') || '<div class="empty">Nenhuma data agendada. Use “+ Agendar data” no modelo acima.</div>'}`;
}
