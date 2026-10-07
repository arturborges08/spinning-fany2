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
function defaultSpecial() { return { id: 'sp-havai', name: 'Aula Temática Havai', price: 3500, theme: 'havai', maxBikes: 8, duration: 90, desc: 'Aloha! Aula temática com música tropical e muito astral. Compra direta: não usa crédito.', active: true }; }
const purName = pu => pu.kind === 'event' ? (cls(pu.classId) ? cls(pu.classId).title : 'Aula avulsa') : (pkg(pu.pkgId) ? pkg(pu.pkgId).name : '—');
const maskCpf = c => { const d = digits(c); return d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : ''; };
const fmtCpf = c => { const d = digits(c); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : ''; };
/** Vagas oferecidas a quem estava na fila de espera (seguradas por alguns minutos até ela confirmar). */
const activeOffers = (classId, exceptUserId) => (db.waitlist || []).filter(w => w.classId === classId && w.offerUntil && D(w.offerUntil).getTime() > Date.now() && w.userId !== exceptUserId);
const offerOf = (classId, userId) => (db.waitlist || []).find(w => w.classId === classId && w.userId === userId && w.offerUntil && D(w.offerUntil).getTime() > Date.now()) || null;
const seatsLeft = (c, userId) => c.maxBikes - occ(c.id).length - activeOffers(c.id, userId).length;
