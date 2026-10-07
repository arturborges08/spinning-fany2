/* ═══ código compartilhado (servidor e navegador) ═══ */
const DEFAULT_TERMS = 'Declaro que estou em condições de saúde para praticar atividade física e assumo a responsabilidade pela minha participação. Vou avisar a instrutora sobre qualquer lesão, gestação ou desconforto. Cancelamentos fora do prazo não devolvem o crédito.';
const DEFAULT_REMINDER = 'Oi {nome}! Lembrete da sua aula de spinning: {aula}, {quando}. Bike {bike}. Te esperamos! 🚴';
const OCC = ['confirmed', 'attended', 'no_show'];
let db = null;
const S = () => db.settings;
/* ── utilidades ── */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const num = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const digits = s => String(s ?? '').replace(/\D/g, '');
const brl = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((c || 0) / 100);
const reaisToCents = v => Math.round(parseFloat(String(v).replace(/\./g, '').replace(',', '.')) * 100) || 0;
const centsToReais = c => (c / 100).toFixed(2).replace('.', ',');
const D = v => (v instanceof Date ? v : new Date(v));
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const fWhen = v => cap1(new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(D(v)).replace('.', ''));
const fDay = v => cap1(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(D(v)));
const fTime = v => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(D(v));
const fDate = v => new Intl.DateTimeFormat('pt-BR').format(D(v));
const dayKey = v => { const d = D(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toLocalInput = v => { const d = D(v); return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const atHour = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
function isValidCpf(raw) {
  const c = digits(raw); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = len => { let s = 0; for (let i = 0; i < len; i++) s += Number(c[i]) * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}
function normPhone(raw) { let d = digits(raw); if (!d) return ''; if (d.length === 10 || d.length === 11) d = '55' + d; return d; }
const validPhone = raw => /^55\d{10,11}$/.test(normPhone(raw));
function fPhone(raw) { const d = digits(raw).replace(/^55(?=\d{10,11}$)/, ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return raw || ''; }
const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const cls = id => db.classes.find(c => c.id === id);
const usr = id => db.users.find(u => u.id === id);
const pkg = id => db.packages.find(p => p.id === id);
const occ = cid => db.reservations.filter(r => r.classId === cid && OCC.includes(r.status));
const isFuture = c => D(c.start) > new Date();
const shortName = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || '?'; };
const HOLD_MIN = 20;                                  // minutos que a bike fica segurada esperando o PIX
const isHeld = r => !!(r && r.holdUntil && r.status === 'confirmed');
function defaultSpecial() { return { id: 'sp-havai', name: 'Aula Temática Havai', price: 3500, theme: 'havai', layoutId: null, maxBikes: 8, duration: 90, desc: 'Aloha! Aula temática com música tropical e muito astral. Compra direta: não usa crédito.', active: true }; }
const purName = pu => pu.kind === 'event' ? (cls(pu.classId) ? cls(pu.classId).title : 'Aula avulsa') : (pkg(pu.pkgId) ? pkg(pu.pkgId).name : '—');
const maskCpf = c => { const d = digits(c); return d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : ''; };
const fmtCpf = c => { const d = digits(c); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : ''; };
/** Vagas oferecidas a quem estava na fila de espera (seguradas por alguns minutos até ela confirmar). */
const activeOffers = (classId, exceptUserId) => (db.waitlist || []).filter(w => w.classId === classId && w.offerUntil && D(w.offerUntil).getTime() > Date.now() && w.userId !== exceptUserId);
const offerOf = (classId, userId) => (db.waitlist || []).find(w => w.classId === classId && w.userId === userId && w.offerUntil && D(w.offerUntil).getTime() > Date.now()) || null;
const seatsLeft = (c, userId) => c.maxBikes - occ(c.id).length - activeOffers(c.id, userId).length;


/* ═══ sala: layout das bikes ═══
   Cada linha é um texto: X = bike, . = espaço vazio. As bikes são numeradas na ordem de leitura
   (de cima para baixo, da esquerda para a direita). Cada linha é centralizada na sala. */
const GRID_MAX_ROWS = 8, GRID_MAX_COLS = 9, GRID_MAX_BIKES = 60;
function autoGrid(n) {                                    // forma automática (usada em aulas antigas): corredor no meio
  n = Math.max(1, Math.min(GRID_MAX_BIKES, Math.round(Number(n)) || 8)); const cols = n <= 20 ? 4 : n <= 42 ? 6 : 8, L = cols / 2, rows = []; let left = n;
  while (left > 0) { const k = Math.min(cols, left); left -= k; rows.push('X'.repeat(Math.min(k, L)) + (k > L ? '.' + 'X'.repeat(k - L) : '')); }
  return rows;
}
const presetGrid = counts => counts.map(k => 'X'.repeat(k));
function gridError(rows) {
  if (!Array.isArray(rows) || !rows.length) return 'O layout precisa de pelo menos uma linha.';
  if (rows.length > GRID_MAX_ROWS) return `No máximo ${GRID_MAX_ROWS} linhas.`;
  let n = 0;
  for (const r of rows) { if (typeof r !== 'string' || !/^[X.]{1,9}$/.test(r)) return `Cada linha precisa ter de 1 a ${GRID_MAX_COLS} lugares.`; n += (r.match(/X/g) || []).length; }
  if (n < 1) return 'Coloque pelo menos uma bike.'; if (n > GRID_MAX_BIKES) return `No máximo ${GRID_MAX_BIKES} bikes.`;
  return null;
}
function parseGrid(rows) { const g = (Array.isArray(rows) && !gridError(rows) ? rows : autoGrid(8)).map(r => r.split('')); return { rows: g, maxLen: Math.max(...g.map(r => r.length)), count: g.reduce((a, r) => a + r.filter(x => x === 'X').length, 0) }; }
const gridCount = rows => parseGrid(rows).count;
const classGrid = c => (c && Array.isArray(c.grid) && !gridError(c.grid) ? c.grid : autoGrid(c ? c.maxBikes : 8));
/** onde a bike N está (linha, posição) — usado para destacar/ordenar */
function bikePos(rows, n) { let k = 0; for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === 'X' && ++k === n) return { r, c }; return null; }

/* ═══ temas das aulas especiais ═══ */
const THEME_PATTERNS = ['none', 'waves', 'dots', 'stripes', 'confetti', 'stars'], THEME_BTN = ['gradient', 'solid', 'outline'], THEME_ROUND = ['pill', 'soft', 'sharp'];
const hexOk = h => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h);
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hexRgba = (h, a) => { const [r, g, b] = hexRgb(hexOk(h) ? h : '#c99a0b'); return `rgba(${r},${g},${b},${a})`; };
const hexLum = h => { const [r, g, b] = hexRgb(hexOk(h) ? h : '#c99a0b'); return 0.299 * r + 0.587 * g + 0.114 * b; };
const autoText = t => ((hexLum(t.c1) + hexLum(t.c2) + hexLum(t.c3)) / 3 > 140 ? '#1a0b00' : '#ffffff');
function defaultThemes() {
  return [
    { id: 'gold', name: 'Dourado (tradicional)', builtin: true, emoji: '⭐', deco: '⭐', c1: '#f7cd2b', c2: '#c99a0b', c3: '#f5c518', tcAuto: true, tc: '#141100', btn: 'gradient', pattern: 'none', tag: 'AULA ESPECIAL', btnText: 'Garantir minha vaga · {preço}', glow: true, round: 'pill' },
    { id: 'havai', name: 'Havaí', builtin: true, emoji: '🌺', deco: '🌺🌴', c1: '#ffd23f', c2: '#ff9142', c3: '#ff5d8f', tcAuto: true, tc: '#2a0b00', btn: 'gradient', pattern: 'waves', tag: 'AULA ESPECIAL', btnText: 'Garantir minha vaga · {preço}', glow: true, round: 'pill' }
  ];
}
const themeById = id => { const l = (db && db.themes) || []; return l.find(t => t.id === id) || l.find(t => t.id === 'gold') || defaultThemes()[0]; };
function patternUri(t) {
  const c1 = encodeURIComponent(t.c1), c2 = encodeURIComponent(t.c2), c3 = encodeURIComponent(t.c3); const w = (inner, sz) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${sz[0]}' height='${sz[1]}'>${inner}</svg>`)}")`;
  switch (t.pattern) {
    case 'waves': return { img: w(`<path d='M0 6 Q11 0 22 6 T44 6' fill='none' stroke='${t.c3}' stroke-width='2' stroke-opacity='.8'/>`, [44, 12]), pos: 'left bottom 4px', rep: 'repeat-x' };
    case 'dots': return { img: w(`<circle cx='6' cy='6' r='2.2' fill='${t.c1}' fill-opacity='.4'/><circle cx='18' cy='18' r='2.2' fill='${t.c2}' fill-opacity='.4'/>`, [24, 24]), pos: '0 0', rep: 'repeat' };
    case 'stripes': return { img: w(`<path d='M-4 4L4 -4M0 16L16 0M12 20L20 12' stroke='${t.c2}' stroke-width='2' stroke-opacity='.22'/>`, [16, 16]), pos: '0 0', rep: 'repeat' };
    case 'confetti': return { img: w(`<rect x='4' y='6' width='5' height='3' fill='${t.c1}' fill-opacity='.55' transform='rotate(25 6 7)'/><rect x='26' y='12' width='5' height='3' fill='${t.c2}' fill-opacity='.55' transform='rotate(-30 28 13)'/><rect x='14' y='28' width='5' height='3' fill='${t.c3}' fill-opacity='.55' transform='rotate(60 16 29)'/><circle cx='32' cy='32' r='2' fill='${t.c1}' fill-opacity='.5'/>`, [40, 40]), pos: '0 0', rep: 'repeat' };
    case 'stars': return { img: w(`<path d='M9 2l1.8 5.2L16 9l-5.2 1.8L9 16l-1.8-5.2L2 9l5.2-1.8z' fill='${t.c1}' fill-opacity='.4'/><path d='M27 22l1.2 3.4 3.4 1.2-3.4 1.2L27 31l-1.2-3.4-3.4-1.2 3.4-1.2z' fill='${t.c2}' fill-opacity='.4'/>`, [36, 36]), pos: '0 0', rep: 'repeat' };
    default: return { img: 'none', pos: '0 0', rep: 'repeat' };
  }
}
/** variáveis de estilo (cores, padrão) do tema — vão no atributo style do cartão/botão/janela */
function themeVars(t) {
  const p = patternUri(t);
  return `--t1:${t.c1};--t2:${t.c2};--t3:${t.c3};--tt:${t.tcAuto === false && hexOk(t.tc) ? t.tc : autoText(t)};--t1a:${hexRgba(t.c1, .22)};--t2a:${hexRgba(t.c2, .18)};--t3a:${hexRgba(t.c3, .22)};--pat:${p.img};--patpos:${p.pos};--patrep:${p.rep}`;
}
