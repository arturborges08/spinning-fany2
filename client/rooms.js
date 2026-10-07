
/* ═══════════ sala: desenho do layout das bikes e editor da dona ═══════════ */
/** Desenha a sala da aula: cada linha centralizada; cellFn(n) devolve o HTML da bike n; '.' é um espaço vazio. */
function gridMap(c, cellFn, o = {}) {
  const g = parseGrid(classGrid(c)); let k = 0;
  const rows = g.rows.map(row => `<div class="mrow">${row.map(ch => (ch === 'X' ? cellFn(++k) : '<span class="mgap" aria-hidden="true"></span>')).join('')}</div>`).join('');
  return `<div class="map2 ${o.cls || ''}" style="--w:${g.maxLen};--cw:${o.cw || 64}px">${rows}</div>`;
}
const BIKE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.4"/><circle cx="18" cy="17" r="3.4"/><path d="M6 17l4-8h5l3 8M10 9l2.5 8M15 9l2-3h2M9 6.5h3"/></svg>';

const SALA_PRESETS = [['3-2-3', [3, 2, 3]], ['2-3-3', [2, 3, 3]], ['3-3-2', [3, 3, 2]], ['4-4', [4, 4]], ['4-3', [4, 3]], ['5-3', [5, 3]], ['2-2-2-2', [2, 2, 2, 2]], ['3-2-3-2', [3, 2, 3, 2]], ['1-2-3-2', [1, 2, 3, 2]], ['5-5', [5, 5]]];
const salaCount = rows => rows.reduce((a, r) => a + (r.match(/X/g) || []).length, 0);
function salaInit(force) {
  if (ui.sala && !force) return;
  const d = (db.layouts || []).find(l => l.id === S().layoutId) || (db.layouts || [])[0];
  ui.sala = d ? { id: d.id, name: d.name, rows: d.rows.slice() } : { id: '', name: 'Minha sala', rows: ['XXX', 'XX', 'XXX'] };
}
const layPrev = rows => `<div class="lay-prev" aria-hidden="true">${rows.map(r => `<div>${r.split('').map(ch => `<i class="${ch === 'X' ? '' : 'g'}"></i>`).join('')}</div>`).join('')}</div>`;

function salaEditor() {
  const s = ui.sala, rows = s.rows, bikes = salaCount(rows), err = gridError(rows); let k = 0;
  const rowsHtml = rows.map((row, r) => {
    const cells = row.split('').map((ch, c) => `<button type="button" class="lay-tile ${ch === 'X' ? 'is-bike' : 'is-gap'}" draggable="true" data-act="laytile" data-r="${r}" data-c="${c}" aria-label="${ch === 'X' ? `Bike ${k + 1}: toque para virar espaço` : 'Espaço vazio: toque para virar bike'}">${ch === 'X' ? ++k : ''}</button>`).join('');
    const full = row.length >= GRID_MAX_COLS;
    return `<div class="lay-row" data-lrow="${r}"><span class="lay-handle" draggable="true" data-rowdrag="${r}" title="Arraste para mudar a linha de lugar" aria-hidden="true">⠿</span><div class="lay-cells">${cells}</div>
      <div class="lay-ctl"><button type="button" data-act="layaddbike" data-r="${r}" title="Adicionar uma bike no fim da linha" aria-label="Adicionar bike na linha ${r + 1}" ${full || bikes >= GRID_MAX_BIKES ? 'disabled' : ''}>+🚴</button><button type="button" data-act="layaddgap" data-r="${r}" title="Adicionar um espaço (corredor)" aria-label="Adicionar espaço na linha ${r + 1}" ${full ? 'disabled' : ''}>+▫</button><button type="button" data-act="layrmlast" data-r="${r}" title="Tirar o último lugar da linha" aria-label="Tirar o último lugar da linha ${r + 1}" ${row.length <= 1 ? 'disabled' : ''}>−</button><button type="button" data-act="layup" data-r="${r}" title="Subir a linha (mais perto da instrutora)" aria-label="Subir linha ${r + 1}" ${r === 0 ? 'disabled' : ''}>↑</button><button type="button" data-act="laydown" data-r="${r}" title="Descer a linha" aria-label="Descer linha ${r + 1}" ${r === rows.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-act="laydelrow" data-r="${r}" title="Apagar a linha" aria-label="Apagar linha ${r + 1}" ${rows.length <= 1 ? 'disabled' : ''}>🗑</button></div></div>`;
  }).join('');
  const isDef = s.id && s.id === S().layoutId;
  return `<form data-form="layout" id="salaform" class="card stack">
    <h2>${s.id ? 'Editando o layout' : 'Novo layout'} <span class="pill ${err ? 'bad' : 'ok'}" id="salacount">${bikes} ${bikes === 1 ? 'bike' : 'bikes'}</span></h2>
    <div><label class="lbl" for="layname">Nome do layout</label><input id="layname" class="field" name="name" value="${esc(s.name)}" maxlength="40" required data-live="layname"></div>
    <div><p class="lbl">Modelos prontos <span class="muted xs">(você ajusta depois, do seu jeito)</span></p><div class="row" style="gap:6px">${SALA_PRESETS.map(([n, c]) => `<button type="button" class="preset" data-act="laypreset" data-p="${c.join(',')}">${n}</button>`).join('')}<button type="button" class="preset" data-act="layclear">Limpar</button></div></div>
    <div><p class="lbl">Desenhe a sala <span class="muted xs">· as bikes são numeradas de cima para baixo, da esquerda para a direita</span></p>
      <p class="muted xs" style="margin-bottom:8px"><b>Toque</b> num lugar para virar bike ou espaço (corredor). <b>Arraste</b> um lugar ou o ⠿ da linha para mudar de posição. Use os botões de cada linha para colocar ou tirar lugares.</p>
      <div class="stage lay-stage">${esc(S().instructor)} · frente da sala</div>${rowsHtml}
      <button type="button" class="btn-line btn-sm" data-act="layaddrow" ${rows.length >= GRID_MAX_ROWS ? 'disabled' : ''} style="margin-top:8px">+ Adicionar linha</button>
      ${err ? `<p class="bad sm" style="margin-top:10px">${esc(err)}</p>` : ''}</div>
    ${s.id ? '<label class="row sm" style="gap:8px"><input type="checkbox" name="applyFuture" checked> Aplicar nas aulas futuras que usam este layout <span class="muted xs">(quem já reservou mantém o número da bike)</span></label>' : ''}
    <label class="row sm" style="gap:8px"><input type="checkbox" name="makeDefault" ${isDef ? 'checked' : ''}> Usar como layout padrão das aulas novas</label>
    <div class="row"><button class="btn" type="submit" ${err ? 'disabled' : ''}>${s.id ? 'Salvar alterações' : 'Criar layout'}</button>${s.id ? '<button class="btn-line" type="button" data-act="laysaveas">Salvar como novo layout</button>' : ''}</div></form>`;
}
function aSala() {
  salaInit();
  const lays = db.layouts || [];
  return `<h1 style="font-size:1.9rem">Sala das bikes</h1>
  <p class="muted" style="margin:6px 0 16px;max-width:46rem">Monte aqui o desenho da sua sala — por exemplo <b>3 bikes na frente, 2 no meio e 3 atrás</b>. É exatamente esse desenho que a aluna vê quando escolhe a bike. Você pode ter vários layouts e escolher qual usar em cada aula.</p>
  ${salaEditor()}
  <h2 class="day">Seus layouts</h2><div class="th-grid">${lays.map(l => `<div class="card"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(l.name)}</b>${l.id === S().layoutId ? '<span class="pill ok">padrão</span>' : ''}</div><p class="muted xs" style="margin:4px 0 8px">${gridCount(l.rows)} bikes</p>${layPrev(l.rows)}<div class="row" style="margin-top:12px;gap:6px"><button class="btn-line btn-sm" data-act="layload" data-id="${l.id}">Editar</button>${l.id === S().layoutId ? '' : `<button class="btn-line btn-sm" data-act="laydefault" data-id="${l.id}">Usar como padrão</button><button class="btn-bad btn-sm" data-act="laydelete" data-id="${l.id}">Apagar</button>`}</div></div>`).join('')}<div class="card" style="display:grid;place-items:center"><button class="btn-ghost" data-act="laynew">+ Novo layout</button></div></div>`;
}

/* ── ações do editor (só mexem no rascunho; nada vai para o servidor até tocar em Salvar) ── */
const roomActs = {
  laytile(t) { const s = ui.sala, r = +t.dataset.r, c = +t.dataset.c, row = s.rows[r].split(''); row[c] = row[c] === 'X' ? '.' : 'X'; s.rows[r] = row.join(''); render(); },
  layaddbike(t) { const s = ui.sala, r = +t.dataset.r; if (s.rows[r].length < GRID_MAX_COLS) s.rows[r] += 'X'; render(); },
  layaddgap(t) { const s = ui.sala, r = +t.dataset.r; if (s.rows[r].length < GRID_MAX_COLS) s.rows[r] += '.'; render(); },
  layrmlast(t) { const s = ui.sala, r = +t.dataset.r; if (s.rows[r].length > 1) s.rows[r] = s.rows[r].slice(0, -1); render(); },
  layup(t) { const s = ui.sala, r = +t.dataset.r; if (r > 0) { [s.rows[r - 1], s.rows[r]] = [s.rows[r], s.rows[r - 1]]; } render(); },
  laydown(t) { const s = ui.sala, r = +t.dataset.r; if (r < s.rows.length - 1) { [s.rows[r + 1], s.rows[r]] = [s.rows[r], s.rows[r + 1]]; } render(); },
  laydelrow(t) { const s = ui.sala; if (s.rows.length > 1) s.rows.splice(+t.dataset.r, 1); render(); },
  layaddrow() { const s = ui.sala; if (s.rows.length < GRID_MAX_ROWS) s.rows.push('XX'); render(); },
  laypreset(t) { ui.sala.rows = presetGrid(t.dataset.p.split(',').map(Number)); render(); },
  layclear() { ui.sala.rows = ['X']; render(); },
  layload(t) { const l = db.layouts.find(x => x.id === t.dataset.id); if (l) ui.sala = { id: l.id, name: l.name, rows: l.rows.slice() }; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  laynew() { ui.sala = { id: '', name: 'Novo layout', rows: ['XXX', 'XX', 'XXX'] }; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  laydefault(t) { act('layoutDefault', { id: t.dataset.id }); },
  laydelete(t) { const l = db.layouts.find(x => x.id === t.dataset.id); confirmBox('Apagar esse layout?', esc(l ? l.name : ''), 'Apagar', async () => { const j = await act('layoutDelete', { id: t.dataset.id }); if (j && ui.sala && ui.sala.id === t.dataset.id) { salaInit(true); render(); } }, true); },
  laysaveas() { saveLayoutForm($('#salaform'), true); }
};
async function saveLayoutForm(f, asNew) {
  const s = ui.sala; if (!f) return;
  const body = { id: asNew ? '' : s.id, name: asNew && (db.layouts.find(l => l.id === s.id) || {}).name === f.elements.name.value ? f.elements.name.value + ' (cópia)' : f.elements.name.value, rows: s.rows, makeDefault: asNew ? false : f.elements.makeDefault.checked, applyFuture: !asNew && f.elements.applyFuture ? f.elements.applyFuture.checked : false };
  const j = await act('layoutSave', body); if (j) { ui.sala = { id: j.id, name: body.name, rows: s.rows.slice() }; render(); }
}
const roomForms = { layout(f) { saveLayoutForm(f, false); } };

/* ── arrastar e soltar (computador): mover um lugar ou uma linha inteira ── */
let layDrag = null;
document.addEventListener('dragstart', e => {
  const t = e.target.closest && e.target.closest('.lay-tile,.lay-handle'); if (!t) return;
  layDrag = t.classList.contains('lay-handle') ? { t: 'row', r: +t.dataset.rowdrag } : { t: 'tile', r: +t.dataset.r, c: +t.dataset.c };
  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'lay'); } catch (_) { /* ok */ } }
});
document.addEventListener('dragover', e => {
  if (!layDrag) return; const tile = e.target.closest('.lay-tile'), row = e.target.closest('.lay-row');
  if ((layDrag.t === 'tile' && tile) || (layDrag.t === 'row' && row)) { e.preventDefault(); (layDrag.t === 'tile' ? tile : row).classList.add('drop'); }
});
document.addEventListener('dragleave', e => { const x = e.target.closest && e.target.closest('.lay-tile,.lay-row'); if (x) x.classList.remove('drop'); });
document.addEventListener('drop', e => {
  if (!layDrag || !ui.sala) return; const s = ui.sala;
  if (layDrag.t === 'tile') {
    const to = e.target.closest('.lay-tile'); if (!to) return; e.preventDefault(); const r2 = +to.dataset.r, c2 = +to.dataset.c, a = s.rows[layDrag.r].split(''), b = s.rows[r2].split('');
    if (layDrag.r === r2) { const x = a[layDrag.c]; a[layDrag.c] = a[c2]; a[c2] = x; s.rows[r2] = a.join(''); }
    else { const x = a[layDrag.c]; a[layDrag.c] = b[c2]; b[c2] = x; s.rows[layDrag.r] = a.join(''); s.rows[r2] = b.join(''); }
  } else {
    const to = e.target.closest('.lay-row'); if (!to) return; e.preventDefault(); const r2 = +to.dataset.lrow; if (r2 !== layDrag.r) { const [x] = s.rows.splice(layDrag.r, 1); s.rows.splice(r2, 0, x); }
  }
  layDrag = null; render();
});
document.addEventListener('dragend', () => { layDrag = null; document.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });
