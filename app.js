/* Forma — registro de entrenamiento. Un solo módulo, sin dependencias. */
'use strict';
(() => {
const APP_VERSION = '2.1.2';
const KEY = 'forma-state-v2';
const OLD_KEY = 'forma-fitness-state-v1';
const BACKUP_KEY = 'forma-state-v2-backup';
const REST_KEY = 'forma-rest';
const WD = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const WDS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const TABS = ['hoy', 'calendario', 'rutinas', 'progreso'];
const ENERGY = ['Cansado', 'Normal', 'Con energía'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const IC = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>'
};

/* ---------- Utilidades ---------- */
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
}
const pad = n => String(n).padStart(2, '0');
const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => fmt(new Date());
function pd(s) { const [a, b, c] = s.split('-').map(Number); return new Date(a, b - 1, c); }
function addDays(s, n) { const d = pd(s); d.setDate(d.getDate() + n); return fmt(d); }
const wdOf = s => (pd(s).getDay() + 6) % 7 + 1;
const weekStart = s => addDays(s, 1 - wdOf(s));
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(pd(s).getTime());
const dlabel = (s, o = { weekday: 'long', day: 'numeric', month: 'long' }) => pd(s).toLocaleDateString('es-AR', o);
function relDay(s) {
  const diff = Math.round((pd(today()) - pd(s)) / 864e5);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff === -1) return 'mañana';
  if (diff > 1 && diff < 7) return 'hace ' + diff + ' días';
  return dlabel(s, { day: 'numeric', month: 'short' });
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  const s = String(v ?? '').trim().replace(',', '.');
  return /^(\d+(\.\d*)?|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
}
const r1 = n => Math.round(n * 10) / 10;
const kg = n => (Math.round(n * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const kgIn = n => (n === null || n === undefined) ? '' : String(Math.round(n * 100) / 100).replace('.', ',');
/** 1RM estimado con la fórmula de Epley. Con 1 repetición, el 1RM es el peso levantado. */
const e1rm = (w, r) => (!(w > 0) || !(r > 0)) ? 0 : r === 1 ? w : r1(w * (1 + r / 30));
const posInt = (v, max = 50) => { const n = parseInt(v, 10); return n >= 1 && n <= max ? n : null; };
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
const clone = o => JSON.parse(JSON.stringify(o));
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };
function mmss(ms) { const t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ':' + pad(t % 60); }
function hhmm(ms) { const m = Math.floor(ms / 60000); return m >= 60 ? Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min' : m + ' min'; }

/* ---------- Estado y persistencia ---------- */
function defaults() {
  return {
    version: 2, routines: [], exercises: [], sessions: [],
    settings: { activeRoutineId: null, restSeconds: 90, autoRest: true, wakeLock: true, lastExport: null, backupSnooze: null, override: null, theme: 'system' }
  };
}
const fnum = v => (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 2000) ? v : null;
const str = (v, max = 120) => typeof v === 'string' ? v.slice(0, max) : '';

/** Valida y repara cualquier estado (guardado, importado o migrado). Nunca lanza. */
function normalize(raw) {
  const s = defaults();
  if (!raw || typeof raw !== 'object') return s;
  const seenEx = new Set();
  s.exercises = (Array.isArray(raw.exercises) ? raw.exercises : [])
    .filter(x => x && x.id && str(x.name).trim() && !seenEx.has(String(x.id)) && seenEx.add(String(x.id)))
    .map(x => ({ id: String(x.id), name: str(x.name).trim() }));
  const exIds = new Set(s.exercises.map(x => x.id));
  s.routines = (Array.isArray(raw.routines) ? raw.routines : []).filter(r => r && r.id).map(r => ({
    id: String(r.id), name: str(r.name).trim() || 'Rutina', focus: str(r.focus, 200),
    days: (Array.isArray(r.days) ? r.days : []).filter(d => d && typeof d === 'object').map((d, i) => ({
      id: String(d.id || uid()), name: str(d.name).trim() || 'Día ' + (i + 1), focus: str(d.focus, 200),
      weekday: Number.isInteger(d.weekday) && d.weekday >= 1 && d.weekday <= 7 ? d.weekday : null,
      exercises: (Array.isArray(d.exercises) ? d.exercises : []).filter(x => x && exIds.has(x.exerciseId)).map(x => ({
        id: String(x.id || uid()), exerciseId: x.exerciseId, sets: posInt(x.sets), reps: str(x.reps, 20)
      }))
    }))
  }));
  let activeSeen = false;
  s.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).filter(x => x && x.id && isDate(x.date)).map(x => {
    let status = ['planned', 'active', 'done'].includes(x.status) ? x.status : 'done';
    if (status === 'active') { if (activeSeen) status = 'done'; activeSeen = true; }
    return {
      id: String(x.id), date: x.date, status,
      routineId: x.routineId ? String(x.routineId) : null, dayId: x.dayId ? String(x.dayId) : null,
      title: str(x.title).trim() || 'Entreno', sub: str(x.sub), note: str(x.note, 2000),
      energy: [0, 1, 2].includes(x.energy) ? x.energy : null,
      startedAt: typeof x.startedAt === 'number' ? x.startedAt : null,
      finishedAt: typeof x.finishedAt === 'number' ? x.finishedAt : null,
      entries: (Array.isArray(x.entries) ? x.entries : []).filter(e => e && exIds.has(e.exerciseId)).map(e => ({
        id: String(e.id || uid()), exerciseId: e.exerciseId,
        target: { sets: posInt(e.target && e.target.sets), reps: str(e.target && e.target.reps, 20) },
        sets: (Array.isArray(e.sets) ? e.sets : []).filter(t => t && typeof t === 'object').slice(0, 50).map(t => ({
          id: String(t.id || uid()), weight: fnum(t.weight), reps: fnum(t.reps), done: !!t.done
        }))
      }))
    };
  });
  const st = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const sd = s.settings;
  sd.activeRoutineId = s.routines.some(r => r.id === st.activeRoutineId) ? st.activeRoutineId : (s.routines[0] ? s.routines[0].id : null);
  sd.restSeconds = posInt(st.restSeconds, 900) || 90;
  sd.autoRest = st.autoRest !== false;
  sd.wakeLock = st.wakeLock !== false;
  sd.lastExport = isDate(st.lastExport) ? st.lastExport : null;
  sd.backupSnooze = isDate(st.backupSnooze) ? st.backupSnooze : null;
  sd.theme = ['system', 'light', 'dark'].includes(st.theme) ? st.theme : 'system';
  sd.override = st.override && isDate(st.override.date) && typeof st.override.dayId === 'string' ? { date: st.override.date, dayId: st.override.dayId } : null;
  return s;
}

/** Convierte los datos de la versión anterior (cualquiera de sus variantes) al formato actual. */
function migrateV1(o) {
  const s = defaults();
  const byName = new Map();
  const ens = name => {
    name = String(name || '').trim().slice(0, 120);
    if (!name) return null;
    const k = norm(name);
    if (!byName.has(k)) { const x = { id: uid(), name }; byName.set(k, x); s.exercises.push(x); }
    return byName.get(k).id;
  };
  const mapEx = x => { const id = ens(x && x.name); return id ? { id: uid(), exerciseId: id, sets: posInt(x.sets), reps: String(x.reps || '') } : null; };
  const poolMap = new Map();
  (Array.isArray(o.exercisePool) ? o.exercisePool : []).forEach(p => { const id = p && ens(p.name); if (id) poolMap.set(p.id, id); });
  (Array.isArray(o.routines) ? o.routines : []).forEach(r => {
    if (!r) return;
    let days;
    if (Array.isArray(r.days) && r.days.length && typeof r.days[0] === 'number') {
      days = r.days.filter(n => n >= 1 && n <= 7).map(n => ({ id: uid(), name: WD[n - 1], focus: r.focus || '', weekday: n, exercises: (r.exercises || []).map(mapEx).filter(Boolean) }));
    } else {
      days = (Array.isArray(r.days) ? r.days : []).filter(d => d && typeof d === 'object').map((d, i) => ({
        id: d.id || uid(), name: d.name || d.label || 'Día ' + (i + 1), focus: d.focus || '', weekday: null,
        exercises: (d.exercises || []).map(mapEx).filter(Boolean)
      }));
    }
    s.routines.push({ id: r.id || uid(), name: r.name || 'Rutina', focus: r.focus || '', days });
  });
  const rById = id => s.routines.find(r => r.id === id);
  const AUTO = ['Registro libre', 'Registro de entrenamiento'];
  (Array.isArray(o.sessions) ? o.sessions : []).forEach(x => {
    if (!x || !isDate(x.date)) return;
    const r = rById(x.routineId), d = r && r.days.find(d => d.id === x.dayId), auto = AUTO.includes(x.note);
    s.sessions.push({
      id: x.id || uid(), date: x.date, status: x.completed ? 'done' : 'planned',
      routineId: r && !auto ? r.id : null, dayId: d ? d.id : null,
      title: d ? d.name : auto ? 'Entreno libre' : r ? r.name : 'Entreno', sub: r && !auto ? r.name : '',
      note: auto ? '' : (x.note || ''), energy: null, startedAt: null, finishedAt: null, entries: []
    });
  });
  (Array.isArray(o.exercisePool) ? o.exercisePool : []).forEach(p => {
    const exId = p && poolMap.get(p.id);
    if (!exId) return;
    (Array.isArray(p.logs) ? p.logs : []).forEach(l => {
      if (!l || !isDate(l.date)) return;
      const w = +l.weight, rp = +l.reps;
      if (!(w >= 0) || !(rp > 0)) return;
      let ses = s.sessions.find(z => z.date === l.date && z.status === 'done') || s.sessions.find(z => z.date === l.date);
      if (!ses) { ses = { id: uid(), date: l.date, status: 'done', routineId: null, dayId: null, title: 'Entreno libre', sub: '', note: '', energy: null, startedAt: null, finishedAt: null, entries: [] }; s.sessions.push(ses); }
      ses.status = 'done';
      let en = ses.entries.find(e => e.exerciseId === exId);
      if (!en) { en = { id: uid(), exerciseId: exId, target: { sets: null, reps: '' }, sets: [] }; ses.entries.push(en); }
      const n = Math.min(Math.max(parseInt(l.sets, 10) || 1, 1), 20);
      for (let i = 0; i < n; i++) en.sets.push({ id: uid(), weight: w, reps: rp, done: true });
    });
  });
  s.settings.activeRoutineId = o.activeRoutineId && rById(o.activeRoutineId) ? o.activeRoutineId : null;
  return normalize(s);
}

let notice = '';
function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function load() {
  const raw = lsGet(KEY);
  if (raw) {
    try { return normalize(JSON.parse(raw)); }
    catch (e) {
      try { localStorage.setItem(KEY + '-danado-' + Date.now(), raw); } catch (_) {}
      try {
        const b = JSON.parse(lsGet(BACKUP_KEY));
        if (b && b.data) { notice = 'Los datos estaban dañados. Se recuperó la copia automática del ' + dlabel(b.date, { day: 'numeric', month: 'long' }) + '.'; return normalize(b.data); }
      } catch (_) {}
      notice = 'No se pudieron leer los datos guardados.';
    }
  }
  const old = lsGet(OLD_KEY);
  if (old) {
    try { const m = migrateV1(JSON.parse(old)); notice = 'Tus datos se pasaron al nuevo formato. Los récords se recalcularon con la fórmula de Epley.'; return m; } catch (_) {}
  }
  return defaults();
}

let state = load();
let saveFailed = false;
function save() {
  cache = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (saveFailed) toast('Se volvió a guardar correctamente.');
    saveFailed = false;
    return true;
  } catch (e) {
    if (!saveFailed) toast('No se pudo guardar en el teléfono. Exportá una copia desde Ajustes.', { ms: 8000 });
    saveFailed = true;
    return false;
  }
}
/** Copia automática diaria: guarda el estado tal como estaba al abrir la app ese día. */
function dailyBackup() {
  try {
    const b = JSON.parse(lsGet(BACKUP_KEY) || 'null');
    if (b && b.date === today()) return;
    if (!state.sessions.length && !state.routines.length) return;
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ date: today(), data: state }));
  } catch (_) {}
}
let persistAsked = false;
async function askPersist() {
  if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
  persistAsked = true;
  try { if (!(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (_) {}
}

/* ---------- Consultas ---------- */
const findRoutine = id => state.routines.find(r => r.id === id) || null;
const findSession = id => state.sessions.find(s => s.id === id) || null;
const findExercise = id => state.exercises.find(x => x.id === id) || null;
const exName = id => (findExercise(id) || {}).name || 'Ejercicio';
const activeRoutine = () => findRoutine(state.settings.activeRoutineId);
const activeSession = () => state.sessions.find(s => s.status === 'active') || null;
const logged = s => s.status !== 'planned';
const sortChrono = (a, b) => a.date.localeCompare(b.date) || (a.startedAt || 0) - (b.startedAt || 0);

function ensureExercise(name) {
  name = String(name).trim().slice(0, 120);
  const k = norm(name);
  let x = state.exercises.find(e => norm(e.name) === k);
  if (!x) { x = { id: uid(), name }; state.exercises.push(x); }
  return x;
}

let cache = null;
/** Recorre todas las sesiones en orden y calcula récords, resultados por sesión y series PR. */
function analysis() {
  if (cache) return cache;
  const ex = new Map(), ses = new Map(), prSets = new Set(), best = new Map();
  for (const s of state.sessions.filter(logged).sort(sortChrono)) {
    const per = new Map();
    let sets = 0, vol = 0;
    for (const en of s.entries) for (const t of en.sets) {
      if (!t.done || !(t.reps > 0) || t.weight === null) continue;
      let p = per.get(en.exerciseId);
      if (!p) { p = { top: 0, topSet: null, n: 0, maxW: 0 }; per.set(en.exerciseId, p); }
      const v = e1rm(t.weight, t.reps);
      p.n++; sets++; vol += t.weight * t.reps;
      if (t.weight > p.maxW) p.maxW = t.weight;
      if (v > p.top) { p.top = v; p.topSet = t; }
    }
    let pr = false;
    const ratios = [];
    for (const [id, p] of per) {
      let st = ex.get(id);
      if (!st) { st = { best: 0, bestSet: null, bestDate: null, maxW: 0, sets: 0, last: null, history: [] }; ex.set(id, st); }
      st.sets += p.n; st.last = s.date;
      if (p.maxW > st.maxW) st.maxW = p.maxW;
      const prev = best.get(id) || 0;
      if (p.top > 0) {
        st.history.push({ date: s.date, sessionId: s.id, top: p.top, set: p.topSet });
        if (prev > 0) ratios.push(p.top / prev);
        if (prev > 0 && p.top > prev) { pr = true; prSets.add(p.topSet.id); }
        if (p.top > prev) { best.set(id, p.top); st.best = p.top; st.bestSet = p.topSet; st.bestDate = s.date; }
      }
    }
    const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
    const result = s.status === 'active' ? 'active' : !per.size ? 'ok' : pr ? 'pr' : avg < 0.9 ? 'below' : 'ok';
    ses.set(s.id, { result, sets, vol, exCount: per.size });
  }
  cache = { ex, ses, prSets };
  return cache;
}
/** Mejor 1RM estimado del ejercicio sin contar una sesión (para comparar en vivo). */
function bestExcluding(exId, sid) {
  let b = 0;
  for (const s of state.sessions) {
    if (!logged(s) || s.id === sid) continue;
    for (const en of s.entries) if (en.exerciseId === exId) for (const t of en.sets) if (t.done && t.weight !== null) b = Math.max(b, e1rm(t.weight, t.reps));
  }
  return b;
}
/** Series hechas la última vez que se entrenó el ejercicio. */
function lastSets(exId, sid) {
  let found = null;
  for (const s of state.sessions) {
    if (!logged(s) || s.id === sid) continue;
    for (const en of s.entries) {
      if (en.exerciseId !== exId) continue;
      const sets = en.sets.filter(t => t.done && t.weight !== null && t.reps > 0);
      if (sets.length && (!found || sortChrono(s, found.s) > 0)) found = { s, date: s.date, sets };
    }
  }
  return found;
}
function dayResult(date) {
  const list = state.sessions.filter(s => s.date === date);
  if (!list.length) return '';
  const a = analysis().ses;
  const rs = list.map(s => s.status === 'planned' ? 'planned' : (a.get(s.id) || {}).result || 'ok');
  for (const k of ['pr', 'below', 'active', 'ok', 'planned']) if (rs.includes(k)) return k;
  return '';
}
function scheduledDay(date, r = activeRoutine()) {
  if (!r || !r.days.some(d => d.weekday)) return null;
  return r.days.find(d => d.weekday === wdOf(date)) || null;
}
/** Qué toca un día: día fijo por semana, descanso, o el siguiente en la rotación. */
function planFor(date, r) {
  if (!r) return { type: 'none' };
  if (!r.days.length) return { type: 'empty', routine: r };
  if (r.days.some(d => d.weekday)) {
    const d = scheduledDay(date, r);
    return d ? { type: 'day', routine: r, day: d } : { type: 'rest', routine: r };
  }
  const last = state.sessions.filter(s => s.routineId === r.id && s.status === 'done' && s.date <= date && r.days.some(d => d.id === s.dayId)).sort(sortChrono).pop();
  const i = last ? r.days.findIndex(d => d.id === last.dayId) : -1;
  return { type: 'day', routine: r, day: r.days[(i + 1) % r.days.length], rotation: true };
}
function todayPlan() {
  const r = activeRoutine(), ov = state.settings.override;
  if (r && ov && ov.date === today()) {
    if (ov.dayId === 'rest') return { type: 'rest', routine: r, manual: true };
    const d = r.days.find(x => x.id === ov.dayId);
    if (d) return { type: 'day', routine: r, day: d, manual: true };
  }
  return planFor(today(), r);
}
function weekStreak() {
  const weeks = new Set(state.sessions.filter(s => s.status === 'done').map(s => weekStart(s.date)));
  let w = weekStart(today()), n = 0;
  if (!weeks.has(w)) w = addDays(w, -7);
  while (weeks.has(w)) { n++; w = addDays(w, -7); }
  return n;
}
function sessionSummary(s) {
  const a = analysis().ses.get(s.id);
  if (!a || !a.sets) return s.status === 'planned' ? 'Planificado' : 'Sin series registradas';
  return plural(a.exCount, 'ejercicio', 'ejercicios') + ' · ' + plural(a.sets, 'serie', 'series');
}
function resultPill(s) {
  if (s.status === 'planned') return '<span class="pill">Planificado</span>';
  if (s.status === 'active') return '<span class="pill active">En curso</span>';
  const r = (analysis().ses.get(s.id) || {}).result;
  if (r === 'pr') return '<span class="pill pr">PR</span>';
  if (r === 'below') return '<span class="pill below">Bajo</span>';
  return '<span class="pill on">Hecho</span>';
}

/* ---------- Avisos ---------- */
function toast(msg, { action, onAction, ms } = {}) {
  const t = $('#toast');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button class="toast-btn">' + esc(action) + '</button>' : '');
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); onAction(); };
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms || (action ? 6500 : 2800));
}
/** Ejecuta un cambio y ofrece deshacerlo durante unos segundos. */
function undoable(msg, fn) {
  const snap = JSON.stringify(state);
  fn();
  save(); render();
  toast(msg, { action: 'Deshacer', onAction: () => { state = normalize(JSON.parse(snap)); save(); render(); toast('Cambio deshecho'); } });
}

/* ---------- Capas (hojas y diálogos) integradas con el botón Atrás de Android ---------- */
const layers = [];
const popWaiters = [];
function openLayer(html, { cls = '', guard = null, onClose = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = '<div class="sheet ' + cls + '" role="dialog" aria-modal="true">' + html + '</div>';
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) closeTop(); });
  const L = { wrap, guard, onClose, set(h) { wrap.firstElementChild.innerHTML = h; } };
  layers.push(L);
  history.pushState(Object.assign({}, history.state, { layer: layers.length }), '');
  document.body.classList.add('locked');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open', 'entering')));
  setTimeout(() => wrap.classList.remove('entering'), 800);
  const f = wrap.querySelector('[autofocus]');
  if (f) setTimeout(() => f.focus(), 60);
  return L;
}
function destroyLayer(L) {
  L.wrap.classList.remove('open');
  setTimeout(() => L.wrap.remove(), 420);
  if (!layers.length) document.body.classList.remove('locked');
  if (L.onClose) L.onClose();
}
function closeTop() { if (layers.length) history.back(); }
function closeAllLayers() {
  return new Promise(res => {
    if (!layers.length) return res();
    popWaiters.push(res);
    history.go(-layers.length);
  });
}
const topLayer = () => layers[layers.length - 1];
window.addEventListener('popstate', () => {
  const depth = (history.state && history.state.layer) || 0;
  if (layers.length > depth) {
    const L = topLayer();
    if (layers.length === depth + 1 && L.guard && L.guard()) {
      history.pushState(Object.assign({}, history.state, { layer: layers.length }), '');
      L.onBlocked && L.onBlocked();
      popWaiters.splice(0).forEach(f => f());
      return;
    }
    while (layers.length > depth) destroyLayer(layers.pop());
    popWaiters.splice(0).forEach(f => f());
    return;
  }
  popWaiters.splice(0).forEach(f => f());
  renderRoute();
});

/** Diálogo de confirmación propio (reemplaza confirm()). Devuelve el valor del botón o null. */
function ask({ title, msg = '', buttons }) {
  return new Promise(resolve => {
    let value = null;
    const html = '<div class="sheet-head"><h2>' + esc(title) + '</h2></div><div class="sheet-body"><p class="soft">' + esc(msg) + '</p></div>' +
      '<div class="sheet-foot" style="flex-wrap:wrap">' + buttons.map((b, i) => '<button class="btn ' + (b.kind || '') + '" data-ask="' + i + '">' + esc(b.label) + '</button>').join('') + '</div>';
    const L = openLayer(html, { cls: 'dialog', onClose: () => resolve(value) });
    L.wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-ask]');
      if (!b) return;
      value = buttons[+b.dataset.ask].value;
      closeTop();
    });
  });
}

/* ---------- Rutas ---------- */
let route = { view: 'hoy', id: null };
function parseHash() {
  const [v, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (v === 'entreno' && id && findSession(id) && findSession(id).status !== 'planned') return { view: 'entreno', id };
  if (v === 'rutina') return id && findRoutine(id) ? { view: 'rutina', id } : { view: 'rutinas', id: null };
  if (TABS.includes(v)) return { view: v, id: null };
  return { view: 'hoy', id: null };
}
function renderRoute() {
  const prev = route.view;
  route = parseHash();
  const hv = location.hash.slice(1).split('/')[0];
  if (hv === 'entreno' && route.view !== 'entreno') history.replaceState(null, '', '#hoy');
  if (hv === 'rutina' && route.view !== 'rutina') history.replaceState({ tab: 1 }, '', '#rutinas');
  render();
  if (prev !== route.view) window.scrollTo(0, 0);
}
const historyBack = () => new Promise(res => { popWaiters.push(res); history.back(); });
async function goTab(v) {
  if (route.view === 'rutina') {
    await routineBack();
    if (v === 'rutinas') return;
  }
  if (v === route.view) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (v === 'hoy') {
    if (history.state && history.state.tab) { history.back(); return; }
    history.replaceState(null, '', '#hoy');
  } else if (route.view === 'hoy') history.pushState({ tab: 1 }, '', '#' + v);
  else history.replaceState({ tab: 1 }, '', '#' + v);
  renderRoute();
}
async function openWorkout(id) {
  await closeAllLayers();
  if (route.view === 'entreno') history.replaceState({ wk: 1 }, '', '#entreno/' + id);
  else history.pushState({ wk: 1 }, '', '#entreno/' + id);
  renderRoute();
}
function openRoutineView(id) {
  history.pushState({ rt: 1 }, '', '#rutina/' + id);
  renderRoute();
}
async function routineBack() {
  if (history.state && history.state.rt) await historyBack();
  else { history.replaceState({ tab: 1 }, '', '#rutinas'); renderRoute(); }
}
function leaveWorkout() {
  if (history.state && history.state.wk) history.back();
  else { history.replaceState(null, '', '#hoy'); renderRoute(); }
}

/* ---------- Vistas ---------- */
let calCursor = today().slice(0, 7);
let calSel = today();
let historyLimit = 15;

let lastKey = '', animTimer = null, justChecked = null, calSlide = '';
const DEPTH = { entreno: 2, rutina: 1 };
function render() {
  cache = null;
  const v = route.view;
  document.body.classList.toggle('workout', v === 'entreno');
  const tab = v === 'rutina' ? 'rutinas' : v;
  $$('.nav-btn').forEach(b => b.setAttribute('aria-current', b.dataset.v === tab ? 'page' : 'false'));
  const html = v === 'entreno' ? viewWorkout() : v === 'calendario' ? viewCalendar() : v === 'rutina' ? viewRoutineDetail() : v === 'rutinas' ? viewRoutines() : v === 'progreso' ? viewProgress() : viewToday();
  const el = $('#view');
  const key = v + '/' + (route.id || '');
  if (key !== lastKey) {
    const from = DEPTH[lastKey.split('/')[0]] || 0, to = DEPTH[v] || 0;
    el.classList.remove('view-enter', 'view-push', 'view-pop');
    void el.offsetWidth;
    el.classList.add(!lastKey ? 'view-enter' : to > from ? 'view-push' : to < from ? 'view-pop' : 'view-enter');
    clearTimeout(animTimer);
    animTimer = setTimeout(() => el.classList.remove('view-enter', 'view-push', 'view-pop'), 900);
    lastKey = key;
  }
  el.innerHTML = html;
  justChecked = null;
  syncRestBar();
  syncWakeLock();
  tickClock();
}

function exPreview(day, max = 8) {
  if (!day.exercises.length) return '<p class="muted mt-s">Este día no tiene ejercicios cargados.</p>';
  const rows = day.exercises.slice(0, max).map(x => '<div class="ex-line"><span>' + esc(exName(x.exerciseId)) + '</span><span>' + (x.sets || '–') + ' × ' + esc(x.reps || '–') + '</span></div>').join('');
  return '<div class="mt">' + rows + (day.exercises.length > max ? '<div class="ex-line"><span class="muted">+' + (day.exercises.length - max) + ' más</span><span></span></div>' : '') + '</div>';
}
function dayChips(r, current) {
  const ov = state.settings.override, manual = ov && ov.date === today();
  return '<div class="chips mt" role="group" aria-label="Cambiar el día de hoy">' +
    r.days.map((d, i) => '<button class="chip" data-a="override" data-day="' + d.id + '" aria-pressed="' + (current === d.id) + '">' + esc(d.name || 'Día ' + (i + 1)) + '</button>').join('') +
    '<button class="chip" data-a="start-free" data-date="' + today() + '">Entreno libre</button>' +
    '<button class="chip" data-a="override" data-day="rest" aria-pressed="' + (current === 'rest') + '">Descanso</button>' +
    (manual ? '<button class="chip" data-a="override" data-day="auto">Volver al plan</button>' : '') + '</div>';
}

function viewToday() {
  const t = today(), act = activeSession(), r = activeRoutine(), plan = todayPlan();
  const doneToday = state.sessions.filter(s => s.date === t && s.status === 'done');
  const plannedToday = state.sessions.find(s => s.date === t && s.status === 'planned');
  let hero;
  if (act) {
    const all = act.entries.flatMap(e => e.sets), done = all.filter(x => x.done).length;
    hero = '<article class="card hero"><div class="eyebrow">Entreno en curso · ' + esc(relDay(act.date)) + '</div><h2>' + esc(act.title) + '</h2>' +
      '<p class="soft">' + done + ' de ' + all.length + ' series hechas</p><button class="btn primary xl block mt" data-a="open-workout" data-id="' + act.id + '">Continuar entreno</button></article>';
  } else if (doneToday.length) {
    const s = doneToday[doneToday.length - 1];
    hero = '<article class="card hero done"><div class="card-head" style="margin:0"><div><div class="eyebrow">Hoy ya entrenaste</div><h2>' + esc(s.title) + '</h2></div>' + resultPill(s) + '</div>' +
      '<p class="soft">' + sessionSummary(s) + '</p><div class="btn-row mt"><button class="btn" data-a="session" data-id="' + s.id + '">Ver detalle</button><button class="btn ghost" data-a="choose-day" data-date="' + t + '">Entrenar otra vez</button></div></article>';
  } else if (plannedToday) {
    hero = '<article class="card hero"><div class="eyebrow">Planificado para hoy</div><h2>' + esc(plannedToday.title) + '</h2>' + (plannedToday.note ? '<p class="soft">' + esc(plannedToday.note) + '</p>' : '') +
      '<button class="btn primary xl block mt" data-a="start-planned" data-id="' + plannedToday.id + '">Empezar entreno</button></article>';
  } else if (plan.type === 'none') {
    hero = '<article class="card hero"><div class="eyebrow">Bienvenido</div><h2>Armá tu rutina</h2><p class="soft">Cargá tus días y ejercicios una vez; después cada entreno se completa en segundos.</p>' +
      '<div class="stack mt"><button class="btn primary xl" data-a="routine-new">Crear mi rutina</button><button class="btn" data-a="templates">Usar una plantilla</button><button class="btn ghost" data-a="start-free" data-date="' + t + '">Entreno libre sin rutina</button></div></article>';
  } else if (plan.type === 'empty') {
    hero = '<article class="card hero"><div class="eyebrow">' + esc(plan.routine.name) + '</div><h2>Tu rutina no tiene días</h2><button class="btn primary block mt" data-a="routine-edit" data-id="' + plan.routine.id + '">Editar rutina</button></article>';
  } else if (plan.type === 'rest') {
    let nextTxt = '';
    for (let i = 1; i <= 7; i++) { const d = scheduledDay(addDays(t, i), plan.routine); if (d) { nextTxt = 'Próximo: ' + d.name + ' (' + relDay(addDays(t, i)) + (i > 1 ? ', ' + WD[wdOf(addDays(t, i)) - 1].toLowerCase() : '') + ')'; break; } }
    hero = '<article class="card hero"><div class="eyebrow">' + esc(plan.routine.name) + '</div><h2>Día de descanso</h2><p class="soft">' + esc(nextTxt || 'Recuperarse también es entrenar.') + '</p>' +
      '<p class="lbl mt">¿Querés entrenar igual? Elegí un día o un entreno libre:</p>' + dayChips(plan.routine, 'rest') + '</article>';
  } else {
    const d = plan.day;
    hero = '<article class="card hero"><div class="eyebrow">' + esc(plan.routine.name) + ' · ' + (plan.manual ? 'elegido para hoy' : plan.rotation ? 'sigue en tu rotación' : WD[wdOf(t) - 1].toLowerCase()) + '</div>' +
      '<h2>' + esc(d.name) + '</h2>' + (d.focus ? '<p class="soft">' + esc(d.focus) + '</p>' : '') + exPreview(d) +
      '<button class="btn primary xl block mt" data-a="start-plan" data-day="' + d.id + '">Empezar entreno</button>' +
      '<p class="lbl mt">¿Hoy hacés otra cosa? Elegí otro día o un entreno libre:</p>' + dayChips(plan.routine, d.id) + '</article>';
  }

  const ws = weekStart(t);
  const week = WDS.map((l, i) => {
    const d = addDays(ws, i);
    let res = dayResult(d);
    if (!res && d >= t && scheduledDay(d)) res = 'sched';
    return '<button class="wk-day ' + (res ? 'res-' + res : '') + (d === t ? ' today' : '') + '" data-a="cal-date" data-date="' + d + '" aria-label="' + esc(dlabel(d)) + '"><span class="l">' + l + '</span><span class="dot"></span><span class="n">' + pd(d).getDate() + '</span></button>';
  }).join('');
  const weekDone = state.sessions.filter(s => s.status === 'done' && s.date >= ws && s.date <= addDays(ws, 6)).length;
  const streak = weekStreak();
  const doneCount = state.sessions.filter(s => s.status === 'done').length;
  const needBackup = doneCount >= 3 && (!state.settings.lastExport || addDays(state.settings.lastExport, 14) < t) && (!state.settings.backupSnooze || addDays(state.settings.backupSnooze, 7) < t);
  const upcoming = state.sessions.filter(s => s.status === 'planned' && s.date > t).sort(sortChrono).slice(0, 4);

  return '<div class="page-head"><div><div class="eyebrow">' + esc(dlabel(t)) + '</div><h1>Hoy</h1></div></div>' +
    (notice ? '<div class="notice"><span>' + esc(notice) + '</span><button class="toast-btn" data-a="notice-close">Entendido</button></div>' : '') +
    '<div class="stack">' + hero +
    '<article class="card"><div class="card-head"><div><div class="eyebrow">Esta semana</div><h2>' + plural(weekDone, 'entreno', 'entrenos') + '</h2></div>' +
    (streak ? '<span class="pill on">' + streak + ' sem. seguidas</span>' : '') + '</div><div class="week">' + week + '</div>' + legend() + '</article>' +
    (needBackup ? '<article class="card"><div class="eyebrow">Copia de seguridad</div><h2 style="margin-top:4px">Guardá tus datos</h2><p class="muted mt-s">Todo vive solo en este teléfono. Exportá una copia por si cambiás de equipo o se borran los datos del navegador.</p><div class="btn-row mt"><button class="btn primary" data-a="export">Exportar copia</button><button class="btn ghost" data-a="backup-snooze">Más tarde</button></div></article>' : '') +
    (upcoming.length ? '<article class="card"><div class="eyebrow">Próximos planificados</div><div class="mt-s">' + upcoming.map(s => '<button class="list-row" data-a="session" data-id="' + s.id + '"><div class="main"><strong>' + esc(s.title) + '</strong><span>' + esc(dlabel(s.date, { weekday: 'long', day: 'numeric', month: 'short' })) + '</span></div>' + IC.next + '</button>').join('') + '</div></article>' : '') +
    (r && !act ? '<button class="btn ghost block" data-a="start-free" data-date="' + t + '">' + IC.plus + 'Entreno libre (sin rutina)</button>' : '') +
    '</div>';
}
function legend() {
  return '<div class="legend"><span class="res-pr"><i class="dot"></i>Nuevo PR</span><span class="res-ok"><i class="dot"></i>Mantenimiento</span><span class="res-below"><i class="dot"></i>&gt;10% bajo tu mejor marca</span><span class="res-planned"><i class="dot"></i>Planificado</span><span class="res-sched"><i class="dot"></i>Según rutina</span></div>';
}

function viewCalendar() {
  const t = today();
  const [y, m] = calCursor.split('-').map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), off = (first.getDay() + 6) % 7;
  let grid = WDS.map(l => '<div class="cal-wd">' + l + '</div>').join('');
  for (let i = 0; i < off; i++) grid += '<div class="cal-day blank"></div>';
  for (let i = 1; i <= days; i++) {
    const d = y + '-' + pad(m) + '-' + pad(i);
    let res = dayResult(d);
    if (!res && d >= t && scheduledDay(d)) res = 'sched';
    grid += '<button class="cal-day ' + (res ? 'res-' + res : '') + (d === t ? ' today' : '') + (d === calSel ? ' sel' : '') + (d < t ? ' past' : '') + '" data-a="cal-select" data-date="' + d + '" aria-label="' + esc(dlabel(d)) + '" aria-pressed="' + (d === calSel) + '">' + i + (res ? '<span class="dot"></span>' : '') + '</button>';
  }
  const slide = calSlide; calSlide = '';
  const list = state.sessions.filter(s => s.date === calSel).sort(sortChrono);
  const sch = scheduledDay(calSel);
  const monthName = first.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^./, ch => ch.toUpperCase());
  const actions = [];
  if (calSel <= t) actions.push('<button class="btn primary" data-a="choose-day" data-date="' + calSel + '">' + IC.plus + 'Registrar entreno</button>');
  if (calSel >= t) actions.push('<button class="btn' + (calSel > t ? ' primary' : '') + '" data-a="plan-date" data-date="' + calSel + '">Planificar</button>');
  return '<div class="page-head"><div><div class="eyebrow">Planificación e historial</div><h1>Calendario</h1></div>' + (calCursor !== t.slice(0, 7) || calSel !== t ? '<button class="btn sm" data-a="cal-today">Hoy</button>' : '') + '</div>' +
    '<article class="card"><div class="cal-bar"><button class="icon-btn" data-a="cal-move" data-n="-1" aria-label="Mes anterior">' + IC.prev + '</button><div class="cal-title">' + esc(monthName) + '</div><button class="icon-btn" data-a="cal-move" data-n="1" aria-label="Mes siguiente">' + IC.next + '</button></div>' +
    '<div class="cal-grid ' + slide + '">' + grid + '</div>' + legend() + '</article>' +
    '<article class="card mt"><div class="eyebrow">' + esc(relDay(calSel) === 'hoy' ? 'Hoy · ' + dlabel(calSel) : dlabel(calSel)) + '</div>' +
    (sch && !list.length ? '<p class="soft mt-s">Según tu rutina toca <strong>' + esc(sch.name) + '</strong>.</p>' : '') +
    (list.length ? '<div class="mt-s">' + list.map(s => '<button class="list-row" data-a="session" data-id="' + s.id + '"><div class="main"><strong>' + esc(s.title) + '</strong><span>' + esc(sessionSummary(s)) + '</span></div>' + resultPill(s) + '</button>').join('') + '</div>' : (!sch ? '<p class="muted mt-s">Sin entrenos este día.</p>' : '')) +
    '<div class="btn-row mt">' + actions.join('') + '</div></article>';
}

function viewRoutines() {
  const act = state.settings.activeRoutineId;
  const cards = state.routines.map(r => {
    const fixed = r.days.some(d => d.weekday);
    const total = r.days.reduce((n, d) => n + d.exercises.length, 0);
    return '<button class="card tap" data-a="routine-open" data-id="' + r.id + '"><div class="rt-head"><div><div class="eyebrow">' + plural(r.days.length, 'día', 'días') + ' · ' + (fixed ? 'días fijos' : 'en rotación') + ' · ' + plural(total, 'ejercicio', 'ejercicios') + '</div>' +
      '<h2 class="ellipsis">' + esc(r.name) + '</h2>' + (r.focus ? '<p class="muted sm ellipsis">' + esc(r.focus) + '</p>' : '') + '</div>' +
      (r.id === act ? '<span class="pill badge-active">Activa</span>' : '') + '<span class="chev">' + IC.next + '</span></div>' +
      '<div class="rt-days">' + r.days.map(d => '<span class="pill">' + (d.weekday ? WDS[d.weekday - 1] + ' · ' : '') + esc(d.name) + '</span>').join('') + '</div></button>';
  }).join('');
  return '<div class="page-head"><div><div class="eyebrow">Tu plan semanal</div><h1>Rutinas</h1></div><button class="btn primary" data-a="routine-new">' + IC.plus + 'Nueva</button></div>' +
    '<div class="stack">' + (cards || '<article class="card empty"><p>Todavía no tenés rutinas.</p><div class="btn-row mt"><button class="btn primary" data-a="routine-new">Crear rutina</button><button class="btn" data-a="templates">Usar plantilla</button></div></article>') +
    (cards ? '<button class="btn ghost block" data-a="templates">Agregar desde una plantilla</button>' : '') + '</div>';
}
function viewRoutineDetail() {
  const r = findRoutine(route.id);
  if (!r) return '';
  const act = state.settings.activeRoutineId === r.id, a = analysis();
  const fixed = r.days.some(d => d.weekday);
  const total = r.days.reduce((n, d) => n + d.exercises.length, 0);
  const lastOf = d => {
    const s = state.sessions.filter(x => x.status === 'done' && x.routineId === r.id && x.dayId === d.id).sort(sortChrono).pop();
    return s ? 'Última vez ' + relDay(s.date) : 'Sin hacer todavía';
  };
  const days = r.days.map((d, i) => '<article class="card day-card"><div class="card-head" style="margin-bottom:6px"><div><span class="day-tag">' + (d.weekday ? WD[d.weekday - 1] : 'Día ' + (i + 1)) + '</span><h2>' + esc(d.name) + '</h2>' +
    (d.focus ? '<p class="muted sm">' + esc(d.focus) + '</p>' : '') + '</div><span class="muted sm" style="white-space:nowrap">' + esc(lastOf(d)) + '</span></div>' +
    (d.exercises.length ? d.exercises.map(x => {
      const st = a.ex.get(x.exerciseId);
      return '<div class="ex-line"><button data-a="exercise" data-id="' + x.exerciseId + '">' + esc(exName(x.exerciseId)) + (st && st.best ? '<br><span class="muted sm">Mejor 1RM est. ' + kg(st.best) + ' kg</span>' : '') + '</button><span>' + (x.sets || '–') + ' × ' + esc(x.reps || '–') + '</span></div>';
    }).join('') : '<p class="muted sm">Este día no tiene ejercicios.</p>') +
    '<button class="btn sm block mt" data-a="routine-start-day" data-r="' + r.id + '" data-day="' + d.id + '">Empezar este día</button></article>').join('');
  return '<div class="back-row"><button class="btn ghost sm" data-a="routine-back">' + IC.back + 'Rutinas</button></div>' +
    '<div class="page-head" style="align-items:flex-start"><div style="min-width:0"><div class="eyebrow">' + plural(r.days.length, 'día', 'días') + ' · ' + (fixed ? 'días fijos' : 'en rotación') + ' · ' + plural(total, 'ejercicio', 'ejercicios') + '</div><h1>' + esc(r.name) + '</h1>' +
    (r.focus ? '<p class="soft mt-s">' + esc(r.focus) + '</p>' : '') + '</div>' + (act ? '<span class="pill badge-active" style="margin-top:4px">Activa</span>' : '') + '</div>' +
    '<div class="btn-row">' + (act ? '' : '<button class="btn primary sm" data-a="routine-activate" data-id="' + r.id + '">Usar esta</button>') +
    '<button class="btn sm" data-a="routine-edit" data-id="' + r.id + '">Editar</button><button class="btn sm" data-a="routine-dup" data-id="' + r.id + '">Duplicar</button><button class="btn sm danger" data-a="routine-del" data-id="' + r.id + '">Eliminar</button></div>' +
    '<div class="stack mt">' + days + '</div>';
}

function viewProgress() {
  const t = today(), a = analysis();
  const done = state.sessions.filter(s => s.status === 'done');
  const month = done.filter(s => s.date.slice(0, 7) === t.slice(0, 7)).length;
  let vol7 = 0;
  done.filter(s => s.date > addDays(t, -7)).forEach(s => { vol7 += (a.ses.get(s.id) || {}).vol || 0; });
  const withData = state.exercises.filter(x => a.ex.has(x.id)).sort((x, y) => a.ex.get(y.id).last.localeCompare(a.ex.get(x.id).last) || x.name.localeCompare(y.name));
  const noData = state.exercises.filter(x => !a.ex.has(x.id)).sort((x, y) => x.name.localeCompare(y.name));
  const rec = withData.map(x => {
    const st = a.ex.get(x.id), bs = st.bestSet;
    return '<button class="list-row" data-a="exercise" data-id="' + x.id + '"><div class="main"><strong>' + esc(x.name) + '</strong><span>' +
      (st.best ? '1RM est. ' + kg(st.best) + ' kg · mejor serie ' + kg(bs.weight) + '×' + bs.reps : 'Peso corporal · ' + plural(st.sets, 'serie', 'series')) + ' · ' + esc(relDay(st.last)) + '</span></div>' + IC.next + '</button>';
  }).join('');
  const hist = done.slice().sort(sortChrono).reverse();
  const histHtml = hist.slice(0, historyLimit).map(s => '<button class="list-row" data-a="session" data-id="' + s.id + '"><div class="main"><strong>' + esc(s.title) + '</strong><span>' + esc(dlabel(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: s.date.slice(0, 4) !== t.slice(0, 4) ? 'numeric' : undefined })) + ' · ' + esc(sessionSummary(s)) + '</span></div>' + resultPill(s) + '</button>').join('');
  return '<div class="page-head"><div><div class="eyebrow">Historial y récords</div><h1>Progreso</h1></div></div>' +
    '<div class="grid3"><div class="stat"><strong>' + month + '</strong><span>entrenos este mes</span></div><div class="stat"><strong>' + weekStreak() + '</strong><span>semanas seguidas</span></div><div class="stat"><strong>' + (vol7 >= 10000 ? r1(vol7 / 1000) + ' t' : Math.round(vol7)) + '</strong><span>kg movidos en 7 días</span></div></div>' +
    '<div class="section-title"><h2>Récords por ejercicio</h2><button class="btn sm" data-a="exercise-new">' + IC.plus + 'Ejercicio</button></div>' +
    '<article class="card">' + (rec || '<p class="empty">Cuando registres series vas a ver acá tu 1RM estimado y tu mejor serie.</p>') +
    (noData.length ? '<p class="hint mt">Sin registros todavía: ' + noData.map(x => '<button class="link-btn" data-a="exercise" data-id="' + x.id + '">' + esc(x.name) + '</button>').join(', ') + '</p>' : '') + '</article>' +
    '<div class="section-title"><h2>Entrenos completados</h2><span class="muted sm">' + hist.length + '</span></div>' +
    '<article class="card">' + (histHtml || '<p class="empty">Todavía no completaste entrenos.</p>') + '</article>' +
    (hist.length > historyLimit ? '<button class="btn block mt" data-a="history-more">Ver más</button>' : '') +
    '<p class="hint mt">El 1RM estimado usa la fórmula de Epley (peso × (1 + reps/30)). Es más preciso con 1 a 10 repeticiones.</p>';
}

/* ---------- Entreno en curso ---------- */
function curSession() { return route.view === 'entreno' ? findSession(route.id) : null; }
function firstNum(s) { const m = String(s || '').match(/\d+/); return m ? m[0] : ''; }
function viewWorkout() {
  const s = curSession();
  if (!s) return '';
  const isDone = s.status === 'done';
  const entries = s.entries.map((en, i) => entryCard(s, en, i)).join('');
  return '<div class="wk-head"><button class="icon-btn" data-a="wk-back" aria-label="Volver">' + IC.back + '</button><div class="t"><div class="eyebrow">' + (isDone ? 'Editando entreno' : 'Entreno en curso') + '</div><strong>' + esc(s.title) + '</strong></div><span class="wk-clock" id="wk-clock"></span></div>' +
    '<div class="card"><div class="wk-meta"><div class="field"><label for="wk-date">Fecha</label><input type="date" id="wk-date" data-in="wk-date" value="' + s.date + '" max="' + today() + '"></div>' +
    '<div class="field"><span class="lbl">Energía</span><div class="seg">' + ENERGY.map((e, i) => '<button class="chip" data-a="wk-energy" data-v="' + i + '" aria-pressed="' + (s.energy === i) + '" style="font-size:12px">' + e + '</button>').join('') + '</div></div></div></div>' +
    '<div class="stack mt">' + (entries || '<div class="card empty">Agregá el primer ejercicio para empezar.</div>') + '</div>' +
    '<button class="btn block mt" data-a="wk-add-ex">' + IC.plus + 'Agregar ejercicio</button>' +
    '<div class="field mt"><label for="wk-note">Notas del entreno</label><textarea id="wk-note" data-in="wk-note" placeholder="Sensaciones, molestias, ajustes para la próxima…">' + esc(s.note) + '</textarea></div>' +
    '<div class="wk-foot"><div class="btn-row">' + (isDone
      ? '<button class="btn danger" data-a="wk-delete">' + IC.trash + 'Eliminar</button><button class="btn primary" data-a="wk-back">Listo</button>'
      : '<button class="btn ghost" data-a="wk-discard">Descartar</button><button class="btn primary" data-a="wk-finish">' + IC.check + 'Finalizar</button>') + '</div></div>';
}
function entryCard(s, en, idx) {
  const prior = bestExcluding(en.exerciseId, s.id), prev = lastSets(en.exerciseId, s.id);
  const target = en.target.sets || en.target.reps ? 'Objetivo: ' + (en.target.sets || '?') + ' × ' + esc(en.target.reps || '?') : '';
  const prevTxt = prev ? 'Última vez (' + esc(relDay(prev.date)) + '): ' + prev.sets.map(t => kg(t.weight) + '×' + t.reps).join(' · ') : 'Primera vez con este ejercicio';
  const rows = en.sets.map((t, j) => setRow(en, t, j, prev, prior)).join('');
  const n = s.entries.length;
  return '<article class="card entry" data-entry="' + en.id + '"><div class="entry-head"><div><button data-a="exercise" data-id="' + en.exerciseId + '"><h3>' + esc(exName(en.exerciseId)) + '</h3></button>' + (target ? '<div class="muted sm">' + target + '</div>' : '') + '</div>' +
    '<div class="tools"><button class="icon-btn sm" data-a="wk-move" data-entry="' + en.id + '" data-n="-1" aria-label="Subir ejercicio"' + (idx === 0 ? ' disabled' : '') + '>' + IC.up + '</button><button class="icon-btn sm" data-a="wk-move" data-entry="' + en.id + '" data-n="1" aria-label="Bajar ejercicio"' + (idx === n - 1 ? ' disabled' : '') + '>' + IC.down + '</button><button class="icon-btn sm danger" data-a="wk-del-entry" data-entry="' + en.id + '" aria-label="Quitar ejercicio">' + IC.trash + '</button></div></div>' +
    '<div class="prev">' + prevTxt + (prior ? ' · Mejor 1RM est. ' + kg(prior) + ' kg' : '') + '</div>' +
    '<div class="set-h"><span>#</span><span style="text-align:center">Kg</span><span style="text-align:center">Reps</span><span></span><span></span></div>' + rows +
    '<button class="btn sm ghost mt-s" data-a="wk-add-set" data-entry="' + en.id + '">' + IC.plus + 'Serie</button></article>';
}
function placeholderFor(en, j, prev) {
  const before = en.sets[j - 1];
  if (before && before.weight !== null && before.reps) return { w: kgIn(before.weight), r: String(before.reps) };
  const p = prev && (prev.sets[j] || prev.sets[prev.sets.length - 1]);
  if (p) return { w: kgIn(p.weight), r: String(p.reps) };
  return { w: '', r: firstNum(en.target.reps) };
}
function setInfo(t, prior) {
  if (!t.done || t.weight === null || !t.reps) return '';
  const v = e1rm(t.weight, t.reps);
  if (!v) return 'Peso corporal';
  return '1RM est. ' + kg(v) + ' kg' + (prior > 0 && v > prior ? ' <span class="badge pr">PR</span>' : '');
}
function setRow(en, t, j, prev, prior) {
  const ph = placeholderFor(en, j, prev);
  return '<div class="set' + (t.done ? ' done' : '') + (t.id === justChecked ? ' just-done' : '') + '" data-set="' + t.id + '"><span class="set-n">' + (j + 1) + '</span>' +
    '<input class="in-w" inputmode="decimal" enterkeyhint="next" autocomplete="off" aria-label="Kilos, serie ' + (j + 1) + '" data-in="set-w" data-entry="' + en.id + '" data-set="' + t.id + '" value="' + kgIn(t.weight) + '" placeholder="' + esc(ph.w) + '">' +
    '<input class="in-r" inputmode="numeric" enterkeyhint="done" autocomplete="off" aria-label="Repeticiones, serie ' + (j + 1) + '" data-in="set-r" data-entry="' + en.id + '" data-set="' + t.id + '" value="' + (t.reps ?? '') + '" placeholder="' + esc(ph.r) + '">' +
    '<button class="check" data-a="wk-check" data-entry="' + en.id + '" data-set="' + t.id + '" aria-pressed="' + t.done + '" aria-label="Serie ' + (j + 1) + ' hecha">' + IC.check + '</button>' +
    '<button class="icon-btn sm" data-a="wk-del-set" data-entry="' + en.id + '" data-set="' + t.id + '" aria-label="Quitar serie ' + (j + 1) + '">' + IC.close + '</button>' +
    '<div class="set-info">' + setInfo(t, prior) + '</div></div>';
}
function getEntry(s, id) { return s && s.entries.find(e => e.id === id); }
function newSet() { return { id: uid(), weight: null, reps: null, done: false }; }
const validW = w => w >= 0 && w <= 1000;
const validR = r => Number.isInteger(r) && r >= 1 && r <= 200;

async function checkSet(entryId, setId) {
  const s = curSession(), en = getEntry(s, entryId), t = en && en.sets.find(x => x.id === setId);
  if (!t) return;
  if (t.done) { t.done = false; save(); render(); return; }
  const row = $('[data-set="' + setId + '"].set');
  const wIn = row.querySelector('.in-w'), rIn = row.querySelector('.in-r');
  const w = num(wIn.value.trim() || wIn.placeholder), r = num(rIn.value.trim() || rIn.placeholder);
  if (!validW(w)) { wIn.classList.add('invalid'); wIn.focus(); toast('Ingresá los kilos (0 si es peso corporal).'); return; }
  if (!validR(r)) { rIn.classList.add('invalid'); rIn.focus(); toast('Ingresá las repeticiones.'); return; }
  const prior = bestExcluding(en.exerciseId, s.id), v = e1rm(w, r);
  if (prior > 0 && v > prior * 1.4) {
    const ok = await ask({ title: '¿Los datos son correctos?', msg: kg(w) + ' kg × ' + r + ' reps da un 1RM estimado de ' + kg(v) + ' kg, muy por encima de tu mejor marca (' + kg(prior) + ' kg).', buttons: [{ label: 'Corregir', value: false }, { label: 'Sí, es correcto', value: true, kind: 'primary' }] });
    if (!ok) { render(); const i = $('[data-set="' + setId + '"].set .in-w'); i && i.focus(); return; }
  }
  t.weight = w; t.reps = r; t.done = true;
  save();
  vibrate(30);
  const bestInSession = Math.max(0, ...en.sets.filter(x => x.done && x !== t).map(x => e1rm(x.weight, x.reps)));
  if (prior > 0 && v > prior && v > bestInSession) { toast('¡Nuevo PR en ' + exName(en.exerciseId) + '! ' + kg(v) + ' kg estimados'); vibrate([30, 60, 30, 60, 80]); }
  justChecked = t.id;
  render();
  if (state.settings.autoRest && s.status === 'active') startRest();
}

function finalizeSession(s) {
  s.entries.forEach(en => { en.sets = en.sets.filter(t => t.done); });
  s.entries = s.entries.filter(en => en.sets.length);
  s.status = 'done';
  s.finishedAt = Date.now();
}
async function finishWorkout() {
  const s = curSession();
  if (!s) return;
  const pending = s.entries.flatMap(e => e.sets).filter(t => !t.done && validW(t.weight) && validR(t.reps));
  if (pending.length) {
    const c = await ask({ title: 'Series sin marcar', msg: 'Hay ' + plural(pending.length, 'serie', 'series') + ' con kilos y repeticiones que no marcaste como hechas.', buttons: [{ label: 'Descartarlas', value: 'drop' }, { label: 'Contarlas como hechas', value: 'mark', kind: 'primary' }] });
    if (!c) return;
    if (c === 'mark') pending.forEach(t => { t.done = true; });
  }
  if (!s.entries.some(e => e.sets.some(t => t.done))) {
    const c = await ask({ title: 'No registraste series', msg: 'Si finalizás ahora el entreno queda guardado sin ejercicios.', buttons: [{ label: 'Seguir entrenando', value: false }, { label: 'Guardar igual', value: true, kind: 'primary' }] });
    if (!c) return;
  }
  finalizeSession(s);
  if (state.settings.override && state.settings.override.date === s.date) state.settings.override = null;
  stopRest();
  save();
  askPersist();
  const res = analysis().ses.get(s.id) || {};
  const prs = s.entries.filter(en => en.sets.some(t => analysis().prSets.has(t.id))).length;
  leaveWorkout();
  toast(prs ? '¡Entreno guardado con ' + plural(prs, 'PR', 'PR') + '!' : 'Entreno guardado · ' + plural(res.sets || 0, 'serie', 'series'));
}

async function startWorkout({ date, routineId = null, dayId = null, plannedId = null }) {
  const act = activeSession();
  if (act && act.id !== plannedId) {
    const c = await ask({ title: 'Ya tenés un entreno en curso', msg: act.title + ' · ' + dlabel(act.date, { weekday: 'long', day: 'numeric', month: 'short' }), buttons: [{ label: 'Finalizarlo y empezar otro', value: 'finish' }, { label: 'Continuar ese', value: 'go', kind: 'primary' }] });
    if (!c) return;
    if (c === 'go') { openWorkout(act.id); return; }
    finalizeSession(act);
  }
  let s = plannedId ? findSession(plannedId) : null;
  if (s) { routineId = s.routineId; dayId = s.dayId; }
  const r = findRoutine(routineId), d = r && r.days.find(x => x.id === dayId);
  if (!s) {
    s = { id: uid(), date, status: 'active', routineId: r ? r.id : null, dayId: d ? d.id : null, title: d ? d.name : 'Entreno libre', sub: r && d ? r.name : '', note: '', energy: 1, startedAt: Date.now(), finishedAt: null, entries: [] };
    state.sessions.push(s);
  } else {
    s.status = 'active';
    s.startedAt = Date.now();
    if (s.energy === null) s.energy = 1;
  }
  if (d && !s.entries.length) {
    s.entries = d.exercises.map(x => {
      const prev = lastSets(x.exerciseId, s.id);
      const n = Math.min(x.sets || (prev ? prev.sets.length : 3), 20);
      return { id: uid(), exerciseId: x.exerciseId, target: { sets: x.sets, reps: x.reps }, sets: Array.from({ length: n }, newSet) };
    });
  }
  save();
  await openWorkout(s.id);
  if (!s.entries.length) openExercisePicker(id => addEntryToWorkout(id));
}

/* ---------- Temporizador de descanso ---------- */
let rest = null;
try { rest = JSON.parse(sessionStorage.getItem(REST_KEY) || 'null'); } catch (_) {}
function startRest(sec = state.settings.restSeconds) {
  rest = { end: Date.now() + sec * 1000, total: sec * 1000 };
  try { sessionStorage.setItem(REST_KEY, JSON.stringify(rest)); } catch (_) {}
  syncRestBar();
}
function stopRest() { rest = null; try { sessionStorage.removeItem(REST_KEY); } catch (_) {} syncRestBar(); }
function adjustRest(sec) {
  if (!rest) return;
  rest.end = Math.max(Date.now(), rest.end + sec * 1000);
  rest.total = Math.max(rest.total + sec * 1000, rest.end - Date.now());
  try { sessionStorage.setItem(REST_KEY, JSON.stringify(rest)); } catch (_) {}
  syncRestBar();
}
function syncRestBar() {
  const bar = $('#rest-bar');
  const left = rest ? rest.end - Date.now() : 0;
  if (rest && left <= 0) {
    rest = null;
    try { sessionStorage.removeItem(REST_KEY); } catch (_) {}
    vibrate([300, 150, 300, 150, 300]);
    toast('Descanso terminado. ¡A la próxima serie!');
  }
  if (!rest || route.view !== 'entreno') { bar.hidden = true; return; }
  bar.hidden = false;
  $('#rest-time').textContent = mmss(left);
  $('#rest-fill').style.width = (100 - left / rest.total * 100) + '%';
  bar.classList.toggle('over', left < 10000);
}
function tickClock() {
  const c = $('#wk-clock'), s = curSession();
  if (!c || !s) return;
  if (s.status === 'active' && s.startedAt) c.textContent = mmss(Date.now() - s.startedAt);
  else if (s.startedAt && s.finishedAt) c.textContent = hhmm(s.finishedAt - s.startedAt);
  else c.textContent = '';
}
let lastDay = today();
setInterval(() => {
  if (rest) syncRestBar();
  tickClock();
  if (today() !== lastDay) {
    lastDay = today();
    if (route.view !== 'entreno' && !layers.length) render();
  }
}, 500);

/* ---------- Pantalla siempre encendida durante el entreno ---------- */
let wakeLock = null, wakePending = false;
async function syncWakeLock() {
  const want = route.view === 'entreno' && state.settings.wakeLock && document.visibilityState === 'visible';
  if (want && !wakeLock && !wakePending && 'wakeLock' in navigator) {
    wakePending = true;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (_) {}
    wakePending = false;
  } else if (!want && wakeLock) {
    try { await wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }
}

/* ---------- Hojas: detalle de sesión, ejercicio, selección ---------- */
function sheetHead(title, eyebrow = '') {
  return '<div class="sheet-head"><div>' + (eyebrow ? '<div class="eyebrow">' + esc(eyebrow) + '</div>' : '') + '<h2>' + esc(title) + '</h2></div><button class="icon-btn" data-a="close" aria-label="Cerrar">' + IC.close + '</button></div>';
}
function openSessionSheet(id) {
  const s = findSession(id);
  if (!s) return;
  if (s.status === 'planned') return openPlanSheet(s.date, s);
  if (s.status === 'active') return openWorkout(s.id);
  const a = analysis();
  const body = s.entries.map(en => {
    const sets = en.sets.filter(t => t.done);
    const top = Math.max(0, ...sets.map(t => e1rm(t.weight, t.reps)));
    return '<div class="list-row" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><strong>' + esc(exName(en.exerciseId)) + '</strong>' + (sets.some(t => a.prSets.has(t.id)) ? '<span class="badge pr">PR</span>' : '') + '</div>' +
      '<div class="muted sm num">' + sets.map(t => kg(t.weight) + '×' + t.reps).join(' · ') + (top ? ' · 1RM est. ' + kg(top) + ' kg' : '') + '</div></div>';
  }).join('');
  const dur = s.startedAt && s.finishedAt ? hhmm(s.finishedAt - s.startedAt) : '';
  openLayer(sheetHead(s.title, dlabel(s.date)) +
    '<div class="sheet-body"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + resultPill(s) + (s.sub ? '<span class="muted sm">' + esc(s.sub) + '</span>' : '') + (dur ? '<span class="muted sm">· ' + dur + '</span>' : '') + (s.energy !== null ? '<span class="muted sm">· ' + ENERGY[s.energy] + '</span>' : '') + '</div>' +
    '<div class="mt">' + (body || '<p class="muted">Sin series registradas.</p>') + '</div>' + (s.note ? '<p class="soft mt" style="white-space:pre-wrap">' + esc(s.note) + '</p>' : '') + '</div>' +
    '<div class="sheet-foot"><button class="btn danger" data-a="session-del" data-id="' + s.id + '">' + IC.trash + 'Eliminar</button><button class="btn primary" data-a="open-workout" data-id="' + s.id + '">Editar</button></div>');
}

function routineDayOptions(selR, selD) {
  return state.routines.map(r => '<optgroup label="' + esc(r.name) + '">' + r.days.map(d => '<option value="' + r.id + '|' + d.id + '"' + (r.id === selR && d.id === selD ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('') + '</optgroup>').join('') +
    '<option value="|"' + (!selR ? ' selected' : '') + '>Entreno libre</option>';
}
function openPlanSheet(date, existing = null) {
  const r = activeRoutine(), sch = scheduledDay(date);
  const selR = existing ? existing.routineId : r && r.id, selD = existing ? existing.dayId : (sch ? sch.id : r && r.days[0] && r.days[0].id);
  const L = openLayer(sheetHead(existing ? 'Entreno planificado' : 'Planificar entreno', dlabel(date)) +
    '<div class="sheet-body"><div class="field"><label for="plan-day">Qué vas a entrenar</label><select id="plan-day">' + routineDayOptions(selR, selD) + '</select></div>' +
    '<div class="field mt"><label for="plan-note">Nota (opcional)</label><textarea id="plan-note" placeholder="Ej. probar 85 kg en banca">' + esc(existing ? existing.note : '') + '</textarea></div></div>' +
    '<div class="sheet-foot">' + (existing ? '<button class="btn danger" data-a="session-del" data-id="' + existing.id + '">' + IC.trash + '</button>' : '') +
    '<button class="btn" data-a="plan-save">Guardar</button>' + (existing && date <= today() ? '<button class="btn primary" data-a="start-planned" data-id="' + existing.id + '">Empezar</button>' : '') + '</div>');
  L.planDate = date; L.planExisting = existing;
}
function savePlan() {
  const L = topLayer();
  const [rid, did] = $('#plan-day', L.wrap).value.split('|');
  const r = findRoutine(rid), d = r && r.days.find(x => x.id === did);
  const note = $('#plan-note', L.wrap).value.trim().slice(0, 2000);
  const s = L.planExisting || { id: uid(), date: L.planDate, status: 'planned', energy: null, startedAt: null, finishedAt: null, entries: [] };
  Object.assign(s, { routineId: r ? r.id : null, dayId: d ? d.id : null, title: d ? d.name : 'Entreno libre', sub: r && d ? r.name : '', note });
  if (!L.planExisting) state.sessions.push(s);
  save();
  closeTop();
  render();
  toast('Entreno planificado para ' + relDay(s.date));
}

function openChooseDay(date) {
  const act = activeRoutine();
  const rs = state.routines.slice().sort((a, b) => (b === act) - (a === act));
  const html = rs.map(r => '<div class="eyebrow mt">' + esc(r.name) + '</div>' + r.days.map(d => '<button class="pick-row" data-a="choose-go" data-date="' + date + '" data-r="' + r.id + '" data-day="' + d.id + '"><div><strong>' + esc(d.name) + '</strong><br><span>' + plural(d.exercises.length, 'ejercicio', 'ejercicios') + (d.weekday ? ' · ' + WD[d.weekday - 1] : '') + '</span></div>' + IC.next + '</button>').join('')).join('');
  openLayer(sheetHead('¿Qué entrenaste?', dlabel(date)) + '<div class="sheet-body">' + html +
    '<div class="eyebrow mt">Otro</div><button class="pick-row" data-a="choose-go" data-date="' + date + '"><div><strong>Entreno libre</strong><br><span>Elegís los ejercicios sobre la marcha</span></div>' + IC.next + '</button></div>');
}

function openExercisePicker(onPick) {
  const L = openLayer(sheetHead('Agregar ejercicio') + '<div class="sheet-body"><input type="search" id="pick-q" placeholder="Buscar o escribir uno nuevo" autocomplete="off" enterkeyhint="search" autofocus><div id="pick-list" class="mt-s"></div></div>', { cls: 'full' });
  L.onPick = onPick;
  const a = analysis();
  const draw = () => {
    const q = $('#pick-q', L.wrap).value.trim(), nq = norm(q);
    const list = state.exercises.filter(x => !nq || norm(x.name).includes(nq))
      .sort((x, y) => ((a.ex.get(y.id) || {}).last || '').localeCompare((a.ex.get(x.id) || {}).last || '') || x.name.localeCompare(y.name));
    const exact = state.exercises.some(x => norm(x.name) === nq);
    $('#pick-list', L.wrap).innerHTML = (q && !exact ? '<button class="pick-row" data-a="pick-create"><div><strong>Crear «' + esc(q) + '»</strong><br><span>Nuevo ejercicio</span></div>' + IC.plus + '</button>' : '') +
      list.map(x => { const st = a.ex.get(x.id); return '<button class="pick-row" data-a="pick-ex" data-id="' + x.id + '"><div><strong>' + esc(x.name) + '</strong><br><span>' + (st ? (st.best ? '1RM est. ' + kg(st.best) + ' kg · ' : '') + esc(relDay(st.last)) : 'Sin registros') + '</span></div>' + IC.plus + '</button>'; }).join('') ||
      (!q ? '<p class="empty">Escribí el nombre del ejercicio.</p>' : '');
  };
  $('#pick-q', L.wrap).addEventListener('input', draw);
  $('#pick-q', L.wrap).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = $('#pick-list .pick-row', L.wrap); b && b.click(); } });
  draw();
}
function addEntryToWorkout(exId) {
  const s = curSession();
  if (!s) return;
  const prev = lastSets(exId, s.id);
  s.entries.push({ id: uid(), exerciseId: exId, target: { sets: null, reps: '' }, sets: Array.from({ length: prev ? Math.min(prev.sets.length, 10) : 3 }, newSet) });
  save();
  render();
  requestAnimationFrame(() => { const c = $$('.entry').pop(); c && c.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
}

function chartSvg(hist) {
  const pts = hist.slice(-24);
  if (pts.length < 2) return '<p class="muted sm">Con dos o más entrenos vas a ver la curva de progreso.</p>';
  const W = 600, H = 200, P = 30;
  const vals = pts.map(p => p.top), min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = i => P + i * (W - 2 * P) / (pts.length - 1), y = v => H - P - (v - min) / span * (H - 2 * P);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.top).toFixed(1)).join(' ');
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución del 1RM estimado"><line class="grid" x1="' + P + '" x2="' + (W - P) + '" y1="' + y(max) + '" y2="' + y(max) + '"/><line class="grid" x1="' + P + '" x2="' + (W - P) + '" y1="' + y(min) + '" y2="' + y(min) + '"/>' +
    '<path class="line" pathLength="1" d="' + path + '"/>' + pts.map((p, i) => '<circle class="pt' + (p.top === max ? ' max' : '') + '" style="animation-delay:' + (0.2 + i * 0.045).toFixed(2) + 's" cx="' + x(i) + '" cy="' + y(p.top) + '" r="4.5"/>').join('') +
    '<text x="' + P + '" y="' + (y(max) - 8) + '">' + kg(max) + ' kg</text><text x="' + P + '" y="' + (y(min) + 18) + '">' + kg(min) + ' kg</text>' +
    '<text x="' + P + '" y="' + (H - 4) + '">' + esc(dlabel(pts[0].date, { day: 'numeric', month: 'short' })) + '</text><text x="' + (W - P) + '" y="' + (H - 4) + '" text-anchor="end">' + esc(dlabel(pts[pts.length - 1].date, { day: 'numeric', month: 'short' })) + '</text></svg>';
}
function openExerciseSheet(id) {
  const x = findExercise(id);
  if (!x) return;
  const st = analysis().ex.get(id);
  const inRoutines = state.routines.filter(r => r.days.some(d => d.exercises.some(e => e.exerciseId === id)));
  const hist = state.sessions.filter(s => logged(s) && s.entries.some(e => e.exerciseId === id)).sort(sortChrono).reverse().slice(0, 30);
  const histHtml = hist.map(s => {
    const sets = s.entries.filter(e => e.exerciseId === id).flatMap(e => e.sets.filter(t => t.done));
    return sets.length ? '<button class="list-row" data-a="session" data-id="' + s.id + '"><div class="main"><strong>' + esc(dlabel(s.date, { weekday: 'short', day: 'numeric', month: 'short' })) + '</strong><span class="num">' + sets.map(t => kg(t.weight) + '×' + t.reps).join(' · ') + '</span></div>' + IC.next + '</button>' : '';
  }).join('');
  openLayer(sheetHead(x.name, 'Ejercicio') + '<div class="sheet-body">' +
    (st ? '<div class="grid3"><div class="stat"><strong>' + (st.best ? kg(st.best) : '–') + '</strong><span>1RM est. (kg)</span></div><div class="stat"><strong>' + (st.maxW ? kg(st.maxW) : '–') + '</strong><span>peso máximo</span></div><div class="stat"><strong>' + st.sets + '</strong><span>series totales</span></div></div>' +
      (st.bestSet ? '<p class="muted sm mt-s">Mejor serie: ' + kg(st.bestSet.weight) + ' kg × ' + st.bestSet.reps + ' (' + esc(relDay(st.bestDate)) + ')</p>' : '') + '<div class="mt">' + chartSvg(st.history) + '</div>' : '<p class="muted">Todavía no registraste series de este ejercicio.</p>') +
    '<div class="section-title"><h3>Historial</h3></div>' + (histHtml || '<p class="muted sm">Sin historial.</p>') +
    '<div class="section-title"><h3>Editar</h3></div><div style="display:flex;gap:8px"><input id="ex-rename" value="' + esc(x.name) + '" aria-label="Nombre del ejercicio"><button class="btn" data-a="ex-rename" data-id="' + id + '">Renombrar</button></div>' +
    (inRoutines.length ? '<p class="hint mt-s">Está en: ' + inRoutines.map(r => esc(r.name)).join(', ') + '. Quitalo de esas rutinas para poder eliminarlo.</p>' : '<button class="btn danger block mt" data-a="ex-del" data-id="' + id + '">' + IC.trash + 'Eliminar ejercicio' + (st ? ' y su historial' : '') + '</button>') +
    '</div>');
}

/* ---------- Editor de rutinas ---------- */
let editor = null;
function blankEx() { return { id: uid(), name: '', sets: '', reps: '' }; }
function openEditor(id, preset = null) {
  const r = id ? findRoutine(id) : null;
  const draft = r ? {
    id: r.id, name: r.name, focus: r.focus,
    days: r.days.map(d => ({ id: d.id, name: d.name, focus: d.focus, weekday: d.weekday, exercises: d.exercises.map(x => ({ id: x.id, name: exName(x.exerciseId), sets: x.sets ? String(x.sets) : '', reps: x.reps })) }))
  } : preset || { id: null, name: '', focus: '', days: [{ id: uid(), name: 'Día 1', focus: '', weekday: null, exercises: [blankEx()] }] };
  let dirty = !!preset;
  const L = openLayer('', { cls: 'full', guard: () => dirty, onClose: () => { editor = null; } });
  L.onBlocked = async () => {
    const c = await ask({ title: '¿Descartar los cambios?', msg: 'No guardaste los cambios de la rutina.', buttons: [{ label: 'Seguir editando', value: false }, { label: 'Descartar', value: true, kind: 'danger-fill' }] });
    if (c) { dirty = false; closeTop(); }
  };
  editor = { L, draft, setDirty() { dirty = true; }, clean() { dirty = false; } };
  drawEditor();
}
function drawEditor(focusSel) {
  const { L, draft } = editor;
  const body = L.wrap.querySelector('.sheet-body');
  const scroll = body ? body.scrollTop : 0;
  const n = draft.days.length;
  const days = draft.days.map((d, di) =>
    '<section class="ed-day" data-di="' + di + '"><div class="ed-day-head"><strong>Día ' + (di + 1) + '</strong><div style="display:flex">' +
    '<button class="icon-btn sm" data-a="ed-day-move" data-di="' + di + '" data-n="-1" aria-label="Subir día"' + (di === 0 ? ' disabled' : '') + '>' + IC.up + '</button>' +
    '<button class="icon-btn sm" data-a="ed-day-move" data-di="' + di + '" data-n="1" aria-label="Bajar día"' + (di === n - 1 ? ' disabled' : '') + '>' + IC.down + '</button>' +
    '<button class="icon-btn sm danger" data-a="ed-day-del" data-di="' + di + '" aria-label="Quitar día"' + (n === 1 ? ' disabled' : '') + '>' + IC.trash + '</button></div></div>' +
    '<div class="form-grid"><div class="field full"><label>Nombre del día</label><input data-ed="day-name" data-di="' + di + '" value="' + esc(d.name) + '" placeholder="Ej. Torso pesado" maxlength="120"></div>' +
    '<div class="field"><label>Objetivo</label><input data-ed="day-focus" data-di="' + di + '" value="' + esc(d.focus) + '" placeholder="Opcional" maxlength="200"></div>' +
    '<div class="field"><label>Día de la semana</label><select data-ed="day-wd" data-di="' + di + '"><option value="">Sin día fijo</option>' + WD.map((w, i) => '<option value="' + (i + 1) + '"' + (d.weekday === i + 1 ? ' selected' : '') + '>' + w + '</option>').join('') + '</select></div></div>' +
    '<div class="mt">' + d.exercises.map((x, ei) =>
      '<div class="ed-ex"><div class="field name"><label>Ejercicio ' + (ei + 1) + '</label><input data-ed="ex-name" data-di="' + di + '" data-ei="' + ei + '" value="' + esc(x.name) + '" list="ex-datalist" placeholder="Ej. Press banca" maxlength="120" autocomplete="off"></div>' +
      '<div class="field"><label>Series</label><input data-ed="ex-sets" data-di="' + di + '" data-ei="' + ei + '" value="' + esc(x.sets) + '" inputmode="numeric" placeholder="3" maxlength="2"></div>' +
      '<div class="field"><label>Reps</label><input data-ed="ex-reps" data-di="' + di + '" data-ei="' + ei + '" value="' + esc(x.reps) + '" placeholder="8-10" maxlength="20"></div>' +
      '<div class="tools"><button class="icon-btn sm" data-a="ed-ex-move" data-di="' + di + '" data-ei="' + ei + '" data-n="-1" aria-label="Subir"' + (ei === 0 ? ' disabled' : '') + '>' + IC.up + '</button><button class="icon-btn sm" data-a="ed-ex-move" data-di="' + di + '" data-ei="' + ei + '" data-n="1" aria-label="Bajar"' + (ei === d.exercises.length - 1 ? ' disabled' : '') + '>' + IC.down + '</button><button class="icon-btn sm danger" data-a="ed-ex-del" data-di="' + di + '" data-ei="' + ei + '" aria-label="Quitar ejercicio">' + IC.close + '</button></div></div>').join('') +
    '</div><button class="btn sm mt-s" data-a="ed-ex-add" data-di="' + di + '">' + IC.plus + 'Ejercicio</button></section>').join('');
  L.set(sheetHead(draft.id ? 'Editar rutina' : 'Nueva rutina') +
    '<div class="sheet-body"><div class="form-grid"><div class="field full"><label for="ed-name">Nombre de la rutina</label><input id="ed-name" data-ed="name" value="' + esc(draft.name) + '" placeholder="Ej. Fuerza 4 días" maxlength="120"></div>' +
    '<div class="field full"><label for="ed-focus">Objetivo (opcional)</label><input id="ed-focus" data-ed="focus" value="' + esc(draft.focus) + '" placeholder="Ej. Fuerza e hipertrofia" maxlength="200"></div></div>' +
    '<p class="hint mt">Asigná un día de la semana a cada sesión para que la app sepa qué toca hoy. Si no asignás ninguno, los días se alternan en rotación cada vez que entrenás.</p>' +
    '<div class="stack mt">' + days + '</div><button class="btn block mt" data-a="ed-day-add">' + IC.plus + 'Agregar día</button>' +
    '<datalist id="ex-datalist">' + state.exercises.map(x => '<option value="' + esc(x.name) + '">').join('') + '</datalist></div>' +
    '<div class="sheet-foot"><button class="btn ghost" data-a="close">Cancelar</button><button class="btn primary" data-a="ed-save">Guardar rutina</button></div>');
  const nb = L.wrap.querySelector('.sheet-body');
  nb.scrollTop = scroll;
  if (focusSel) { const f = $(focusSel, L.wrap); if (f) { f.focus(); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
}
function editorInput(el) {
  const d = editor.draft, k = el.dataset.ed, di = +el.dataset.di, ei = +el.dataset.ei;
  el.classList.remove('invalid');
  if (k === 'name') d.name = el.value;
  else if (k === 'focus') d.focus = el.value;
  else if (k === 'day-name') d.days[di].name = el.value;
  else if (k === 'day-focus') d.days[di].focus = el.value;
  else if (k === 'day-wd') d.days[di].weekday = el.value ? +el.value : null;
  else if (k === 'ex-name') d.days[di].exercises[ei].name = el.value;
  else if (k === 'ex-sets') d.days[di].exercises[ei].sets = el.value.replace(/\D/g, '');
  else if (k === 'ex-reps') d.days[di].exercises[ei].reps = el.value;
  editor.setDirty();
}
function saveEditor() {
  const { L, draft } = editor;
  const name = draft.name.trim();
  if (!name) { const i = $('#ed-name', L.wrap); i.classList.add('invalid'); i.focus(); toast('Poné un nombre a la rutina.'); return; }
  const wds = draft.days.map(d => d.weekday).filter(Boolean);
  const dup = wds.find((w, i) => wds.indexOf(w) !== i);
  if (dup) { toast('Hay dos días asignados al ' + WD[dup - 1].toLowerCase() + '.'); $$('[data-ed="day-wd"]', L.wrap).forEach(s => { if (+s.value === dup) s.classList.add('invalid'); }); return; }
  const badSets = draft.days.some(d => d.exercises.some(x => x.name.trim() && x.sets && !posInt(x.sets, 20)));
  if (badSets) { toast('Las series tienen que ser un número entre 1 y 20.'); return; }
  const days = draft.days.map((d, i) => ({
    id: d.id, name: d.name.trim() || 'Día ' + (i + 1), focus: d.focus.trim(), weekday: d.weekday || null,
    exercises: d.exercises.filter(x => x.name.trim()).map(x => ({ id: x.id, exerciseId: ensureExercise(x.name).id, sets: posInt(x.sets, 20), reps: x.reps.trim().slice(0, 20) }))
  }));
  let r = draft.id && findRoutine(draft.id), isNew = !r;
  if (r) Object.assign(r, { name, focus: draft.focus.trim(), days });
  else { r = { id: uid(), name, focus: draft.focus.trim(), days }; state.routines.push(r); }
  const firstOne = !activeRoutine();
  if (firstOne) state.settings.activeRoutineId = r.id;
  save();
  editor.clean();
  closeTop();
  render();
  if (isNew && !firstOne) toast('Rutina guardada', { action: 'Usar esta', onAction: () => { state.settings.activeRoutineId = r.id; state.settings.override = null; save(); render(); toast('Ahora usás ' + r.name); } });
  else toast(isNew ? 'Rutina creada y activada' : 'Cambios guardados');
}

const TEMPLATES = [
  { name: 'Full body 3 días', focus: 'Fuerza general, en rotación A/B/C', days: [
    ['Full body A', '', null, [['Sentadilla', 4, '6-8'], ['Press banca', 4, '6-8'], ['Remo con barra', 3, '8-10'], ['Plancha', 3, '30-45 s']]],
    ['Full body B', '', null, [['Peso muerto', 3, '5'], ['Press militar', 4, '6-8'], ['Dominadas', 3, 'máx'], ['Zancadas', 3, '10']]],
    ['Full body C', '', null, [['Prensa', 3, '10-12'], ['Press inclinado con mancuernas', 3, '8-10'], ['Remo con mancuerna', 3, '10'], ['Curl de bíceps', 3, '10-12'], ['Extensión de tríceps', 3, '10-12']]]] },
  { name: 'Torso / Pierna 4 días', focus: 'Hipertrofia, lunes, martes, jueves y viernes', days: [
    ['Torso pesado', 'Fuerza', 1, [['Press banca', 4, '5-6'], ['Remo con barra', 4, '6-8'], ['Press militar', 3, '6-8'], ['Dominadas', 3, '6-8']]],
    ['Pierna pesada', 'Fuerza', 2, [['Sentadilla', 4, '5-6'], ['Peso muerto rumano', 3, '8'], ['Prensa', 3, '10'], ['Gemelos', 4, '12']]],
    ['Torso volumen', 'Hipertrofia', 4, [['Press inclinado con mancuernas', 4, '8-10'], ['Jalón al pecho', 4, '10-12'], ['Elevaciones laterales', 3, '12-15'], ['Curl de bíceps', 3, '12'], ['Extensión de tríceps', 3, '12']]],
    ['Pierna volumen', 'Hipertrofia', 5, [['Sentadilla búlgara', 3, '10'], ['Curl femoral', 4, '12'], ['Extensión de cuádriceps', 3, '15'], ['Hip thrust', 3, '10']]]] }
];
function openTemplates() {
  openLayer(sheetHead('Plantillas') + '<div class="sheet-body"><p class="hint">Se abre en el editor para que la ajustes antes de guardarla.</p>' +
    TEMPLATES.map((t, i) => '<button class="pick-row" data-a="template-use" data-i="' + i + '"><div><strong>' + esc(t.name) + '</strong><br><span>' + esc(t.focus) + '</span></div>' + IC.next + '</button>').join('') + '</div>');
}
async function useTemplate(i) {
  const t = TEMPLATES[i];
  await closeAllLayers();
  openEditor(null, { id: null, name: t.name, focus: t.focus, days: t.days.map(([name, focus, weekday, exs]) => ({ id: uid(), name, focus, weekday, exercises: exs.map(([n, s, r]) => ({ id: uid(), name: n, sets: String(s), reps: r })) })) });
}

/* ---------- Tema ---------- */
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme, root = document.documentElement;
  if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && darkMq.matches);
  $$('meta[name="theme-color"]').forEach(m => m.remove());
  const m = document.createElement('meta');
  m.name = 'theme-color'; m.content = dark ? '#191919' : '#ffffff';
  document.head.appendChild(m);
}
darkMq.addEventListener('change', () => { if (state.settings.theme === 'system') applyTheme(); });

/* ---------- Ajustes y datos ---------- */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('App instalada'); });
const standalone = () => matchMedia('(display-mode: standalone)').matches;

async function openSettings() {
  let persisted = null, usage = '';
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (_) {}
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); usage = Math.round((e.usage || 0) / 1024) + ' KB usados'; } } catch (_) {}
  let backup = null;
  try { backup = JSON.parse(lsGet(BACKUP_KEY) || 'null'); } catch (_) {}
  const st = state.settings;
  const canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }));
  openLayer(sheetHead('Ajustes') + '<div class="sheet-body">' +
    '<div class="eyebrow mt">Apariencia</div><div class="card inner mt-s"><label class="toggle-row"><span>Tema</span><select data-set-opt="theme">' +
    [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => '<option value="' + v + '"' + (st.theme === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
    '<div class="eyebrow mt">Entreno</div><div class="card inner mt-s">' +
    '<label class="toggle-row"><span>Iniciar descanso al marcar una serie</span><input type="checkbox" data-set-opt="autoRest"' + (st.autoRest ? ' checked' : '') + '></label>' +
    '<label class="toggle-row"><span>Duración del descanso</span><select data-set-opt="restSeconds">' + [45, 60, 90, 120, 150, 180, 240, 300].map(v => '<option value="' + v + '"' + (st.restSeconds === v ? ' selected' : '') + '>' + mmss(v * 1000) + '</option>').join('') + '</select></label>' +
    '<label class="toggle-row"><span>Mantener la pantalla encendida durante el entreno</span><input type="checkbox" data-set-opt="wakeLock"' + (st.wakeLock ? ' checked' : '') + '></label></div>' +
    '<div class="eyebrow mt">Tus datos</div><div class="card inner mt-s"><p class="sm soft">Todo se guarda solo en este teléfono, sin cuenta ni internet. ' +
    (st.lastExport ? 'Última copia exportada: ' + esc(relDay(st.lastExport)) + '.' : 'Todavía no exportaste ninguna copia.') + '</p>' +
    '<p class="hint mt-s">' + (persisted === true ? 'Almacenamiento protegido: el sistema no borrará los datos para liberar espacio.' : persisted === false ? 'El navegador podría borrar los datos si falta espacio. Instalar la app y exportar copias lo evita.' : '') + (usage ? ' ' + usage + '.' : '') + '</p>' +
    '<div class="btn-row mt"><button class="btn primary" data-a="export">Descargar copia</button>' + (canShare ? '<button class="btn" data-a="share-export">Compartir copia</button>' : '') + '</div>' +
    '<button class="btn block mt-s" data-a="import">Importar copia (.json)</button>' +
    (backup && backup.data ? '<button class="btn ghost block mt-s" data-a="restore-backup">Restaurar copia automática (' + esc(dlabel(backup.date, { day: 'numeric', month: 'short' })) + ')</button>' : '') +
    (lsGet(OLD_KEY) ? '<button class="btn ghost block mt-s" data-a="reimport-v1">Volver a importar datos de la versión anterior</button>' : '') + '</div>' +
    '<div class="eyebrow mt">App</div><div class="card inner mt-s">' +
    (installPrompt ? '<button class="btn primary block" data-a="install">Instalar en el teléfono</button>' : standalone() ? '<p class="sm soft">La app está instalada.</p>' : '<p class="sm soft">Para instalarla en el Samsung: menú ⋮ de Chrome → <strong>Agregar a pantalla principal</strong> → Instalar.</p>') +
    '<div class="btn-row mt"><button class="btn" data-a="check-update">Buscar actualizaciones</button><button class="btn" data-a="reinstall">Reinstalar la app</button></div>' +
    '<p class="hint mt-s">Reinstalar vuelve a descargar la app sin tocar tus datos. Usalo si una actualización no se aplica.</p>' +
    '<button class="btn danger block mt" data-a="reset-all">Borrar todos los datos</button><p class="hint mt-s">Versión ' + APP_VERSION + '</p></div></div>');
}
function exportBlob() {
  const json = JSON.stringify({ app: 'forma', version: 2, exportedAt: new Date().toISOString(), data: state });
  return { name: 'forma-copia-' + today() + '.json', blob: new Blob([json], { type: 'application/json' }) };
}
function markExported() { state.settings.lastExport = today(); save(); if (!layers.length) render(); }
function exportData() {
  const { name, blob } = exportBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  markExported();
  toast('Copia descargada: ' + name);
}
async function shareExport() {
  const { name, blob } = exportBlob();
  try {
    await navigator.share({ files: [new File([blob], name, { type: 'application/json' })], title: 'Copia de Forma' });
    markExported();
    toast('Copia compartida');
  } catch (e) { if (e && e.name !== 'AbortError') toast('No se pudo compartir. Probá con Descargar copia.'); }
}
function parseImport(text) {
  const raw = JSON.parse(text);
  const data = raw && raw.app === 'forma' && raw.data ? raw.data : raw;
  if (!data || typeof data !== 'object') throw new Error('formato');
  if (Array.isArray(data.exercises) && Array.isArray(data.sessions)) return normalize(data);
  if (Array.isArray(data.routines) || Array.isArray(data.exercisePool)) return migrateV1(data);
  throw new Error('formato');
}
async function replaceData(next, what) {
  const n = next.sessions.filter(s => s.status === 'done').length;
  const c = await ask({ title: 'Reemplazar datos', msg: what + ' tiene ' + plural(next.routines.length, 'rutina', 'rutinas') + ' y ' + plural(n, 'entreno', 'entrenos') + '. Va a reemplazar lo que hay ahora en la app (podés deshacerlo enseguida).', buttons: [{ label: 'Cancelar', value: false }, { label: 'Reemplazar', value: true, kind: 'primary' }] });
  if (!c) return;
  await closeAllLayers();
  notice = '';
  undoable('Datos reemplazados', () => { state = next; stopRest(); });
  if (route.view === 'entreno') { history.replaceState(null, '', '#hoy'); renderRoute(); }
}

/* ---------- Acciones (delegación de eventos: nunca hay botones sin conectar) ---------- */
const actions = {
  tab: el => goTab(el.dataset.v),
  'notice-close': () => { notice = ''; render(); },
  close: () => closeTop(),
  settings: () => openSettings(),
  templates: () => openTemplates(),
  'template-use': el => useTemplate(+el.dataset.i),
  override: el => {
    const v = el.dataset.day;
    state.settings.override = v === 'auto' ? null : { date: today(), dayId: v };
    save(); render();
  },
  'start-plan': el => { const r = activeRoutine(); startWorkout({ date: today(), routineId: r && r.id, dayId: el.dataset.day }); },
  'start-free': el => startWorkout({ date: el.dataset.date || today() }),
  'start-planned': async el => { await closeAllLayers(); startWorkout({ date: today(), plannedId: el.dataset.id }); },
  'choose-day': el => openChooseDay(el.dataset.date),
  'choose-go': async el => { await closeAllLayers(); startWorkout({ date: el.dataset.date, routineId: el.dataset.r || null, dayId: el.dataset.day || null }); },
  'open-workout': el => openWorkout(el.dataset.id),
  session: el => openSessionSheet(el.dataset.id),
  'session-del': async el => {
    const s = findSession(el.dataset.id);
    if (!s) return;
    const c = await ask({ title: 'Eliminar entreno', msg: s.title + ' · ' + dlabel(s.date) + '. Se borran sus series y los récords se recalculan.', buttons: [{ label: 'Cancelar', value: false }, { label: 'Eliminar', value: true, kind: 'danger-fill' }] });
    if (!c) return;
    await closeAllLayers();
    undoable('Entreno eliminado', () => { state.sessions = state.sessions.filter(x => x !== s); });
  },
  'plan-date': el => openPlanSheet(el.dataset.date),
  'plan-save': () => savePlan(),
  'cal-date': el => { calSel = el.dataset.date; calCursor = calSel.slice(0, 7); goTab('calendario'); },
  'cal-select': el => { calSel = el.dataset.date; render(); },
  'cal-move': el => { const [y, m] = calCursor.split('-').map(Number); const d = new Date(y, m - 1 + +el.dataset.n, 1); calCursor = fmt(d).slice(0, 7); calSlide = +el.dataset.n > 0 ? 'slide-l' : 'slide-r'; render(); },
  'cal-today': () => { calSel = today(); calCursor = calSel.slice(0, 7); render(); },
  'routine-new': () => openEditor(null),
  'routine-open': el => openRoutineView(el.dataset.id),
  'routine-back': () => routineBack(),
  'routine-start-day': el => startWorkout({ date: today(), routineId: el.dataset.r, dayId: el.dataset.day }),
  'routine-edit': el => openEditor(el.dataset.id),
  'routine-activate': el => { const r = findRoutine(el.dataset.id); state.settings.activeRoutineId = r.id; state.settings.override = null; save(); render(); toast('Ahora usás ' + r.name); },
  'routine-dup': el => {
    const r = findRoutine(el.dataset.id), c = clone(r);
    c.id = uid(); c.name = (r.name + ' (copia)').slice(0, 120);
    c.days.forEach(d => { d.id = uid(); d.exercises.forEach(x => { x.id = uid(); }); });
    state.routines.push(c); save();
    if (route.view === 'rutina') { history.replaceState({ rt: 1 }, '', '#rutina/' + c.id); renderRoute(); } else render();
    toast('Rutina duplicada');
  },
  'routine-del': async el => {
    const r = findRoutine(el.dataset.id);
    const c = await ask({ title: 'Eliminar rutina', msg: '«' + r.name + '» se elimina. Tus entrenos ya hechos y sus récords se conservan.', buttons: [{ label: 'Cancelar', value: false }, { label: 'Eliminar', value: true, kind: 'danger-fill' }] });
    if (!c) return;
    if (route.view === 'rutina') await routineBack();
    undoable('Rutina eliminada', () => {
      state.routines = state.routines.filter(x => x !== r);
      state.sessions = state.sessions.filter(s => !(s.status === 'planned' && s.routineId === r.id));
      if (state.settings.activeRoutineId === r.id) { state.settings.activeRoutineId = state.routines[0] ? state.routines[0].id : null; state.settings.override = null; }
    });
  },
  'ed-save': () => saveEditor(),
  'ed-day-add': () => { editor.draft.days.push({ id: uid(), name: 'Día ' + (editor.draft.days.length + 1), focus: '', weekday: null, exercises: [blankEx()] }); editor.setDirty(); drawEditor('[data-ed="day-name"][data-di="' + (editor.draft.days.length - 1) + '"]'); },
  'ed-day-del': async el => {
    const d = editor.draft.days[+el.dataset.di];
    if (d.exercises.some(x => x.name.trim())) {
      const c = await ask({ title: 'Quitar día', msg: '«' + (d.name || 'Día') + '» tiene ejercicios cargados.', buttons: [{ label: 'Cancelar', value: false }, { label: 'Quitar', value: true, kind: 'danger-fill' }] });
      if (!c) return;
    }
    editor.draft.days.splice(+el.dataset.di, 1); editor.setDirty(); drawEditor();
  },
  'ed-day-move': el => { const a = editor.draft.days, i = +el.dataset.di, j = i + +el.dataset.n; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; editor.setDirty(); drawEditor(); },
  'ed-ex-add': el => { const di = +el.dataset.di, ex = editor.draft.days[di].exercises; ex.push(blankEx()); editor.setDirty(); drawEditor('[data-ed="ex-name"][data-di="' + di + '"][data-ei="' + (ex.length - 1) + '"]'); },
  'ed-ex-del': el => { editor.draft.days[+el.dataset.di].exercises.splice(+el.dataset.ei, 1); editor.setDirty(); drawEditor(); },
  'ed-ex-move': el => { const a = editor.draft.days[+el.dataset.di].exercises, i = +el.dataset.ei, j = i + +el.dataset.n; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; editor.setDirty(); drawEditor(); },
  'wk-back': () => leaveWorkout(),
  'wk-check': el => checkSet(el.dataset.entry, el.dataset.set),
  'wk-add-set': el => { const s = curSession(), en = getEntry(s, el.dataset.entry); if (en.sets.length >= 50) return; en.sets.push(newSet()); save(); render(); },
  'wk-del-set': el => {
    const s = curSession(), en = getEntry(s, el.dataset.entry), t = en.sets.find(x => x.id === el.dataset.set);
    if (t.done || t.weight !== null || t.reps !== null) undoable('Serie quitada', () => { en.sets = en.sets.filter(x => x !== t); });
    else { en.sets = en.sets.filter(x => x !== t); save(); render(); }
  },
  'wk-move': el => { const s = curSession(), a = s.entries, i = a.findIndex(e => e.id === el.dataset.entry), j = i + +el.dataset.n; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(); render(); },
  'wk-del-entry': el => { const s = curSession(), en = getEntry(s, el.dataset.entry); undoable(exName(en.exerciseId) + ' quitado del entreno', () => { s.entries = s.entries.filter(e => e !== en); }); },
  'wk-add-ex': () => openExercisePicker(id => addEntryToWorkout(id)),
  'wk-energy': el => { const s = curSession(); s.energy = +el.dataset.v; save(); render(); },
  'wk-finish': () => finishWorkout(),
  'wk-discard': async () => {
    const s = curSession();
    const any = s.entries.some(e => e.sets.some(t => t.done || t.weight !== null));
    if (any) {
      const c = await ask({ title: 'Descartar entreno', msg: 'Se borran todas las series que cargaste en este entreno.', buttons: [{ label: 'Seguir entrenando', value: false }, { label: 'Descartar', value: true, kind: 'danger-fill' }] });
      if (!c) return;
    }
    stopRest();
    const snap = JSON.stringify(state);
    state.sessions = state.sessions.filter(x => x !== s);
    save();
    leaveWorkout();
    toast('Entreno descartado', { action: 'Deshacer', onAction: () => { state = normalize(JSON.parse(snap)); save(); render(); } });
  },
  'wk-delete': async () => {
    const s = curSession();
    const c = await ask({ title: 'Eliminar entreno', msg: 'Se borran sus series y los récords se recalculan.', buttons: [{ label: 'Cancelar', value: false }, { label: 'Eliminar', value: true, kind: 'danger-fill' }] });
    if (!c) return;
    const snap = JSON.stringify(state);
    state.sessions = state.sessions.filter(x => x !== s);
    save();
    leaveWorkout();
    toast('Entreno eliminado', { action: 'Deshacer', onAction: () => { state = normalize(JSON.parse(snap)); save(); render(); } });
  },
  'rest-plus': () => adjustRest(15),
  'rest-minus': () => adjustRest(-15),
  'rest-skip': () => stopRest(),
  'pick-ex': el => { const cb = topLayer().onPick; closeTop(); cb(el.dataset.id); },
  'pick-create': () => { const L = topLayer(), q = $('#pick-q', L.wrap).value.trim(); if (!q) return; const x = ensureExercise(q); save(); closeTop(); L.onPick(x.id); },
  exercise: el => openExerciseSheet(el.dataset.id),
  'exercise-new': async () => {
    const L = openLayer(sheetHead('Nuevo ejercicio') + '<div class="sheet-body"><input id="new-ex" placeholder="Ej. Hip thrust" maxlength="120" autofocus></div><div class="sheet-foot"><button class="btn primary" data-a="exercise-create">Agregar</button></div>');
    $('#new-ex', L.wrap).addEventListener('keydown', e => { if (e.key === 'Enter') actions['exercise-create'](); });
  },
  'exercise-create': () => {
    const v = $('#new-ex', topLayer().wrap).value.trim();
    if (!v) return;
    const exists = state.exercises.some(x => norm(x.name) === norm(v));
    ensureExercise(v); save(); closeTop(); render();
    toast(exists ? 'Ese ejercicio ya existía' : 'Ejercicio agregado');
  },
  'ex-rename': el => {
    const x = findExercise(el.dataset.id), v = $('#ex-rename', topLayer().wrap).value.trim();
    if (!v) return toast('El nombre no puede quedar vacío.');
    const other = state.exercises.find(e => e !== x && norm(e.name) === norm(v));
    if (other) return toast('Ya existe un ejercicio llamado «' + other.name + '».');
    x.name = v.slice(0, 120); save(); closeTop(); render(); toast('Ejercicio renombrado');
  },
  'ex-del': async el => {
    const x = findExercise(el.dataset.id), st = analysis().ex.get(x.id);
    const c = await ask({ title: 'Eliminar ejercicio', msg: '«' + x.name + '»' + (st ? ' y sus ' + plural(st.sets, 'serie registrada', 'series registradas') : '') + ' se eliminan.', buttons: [{ label: 'Cancelar', value: false }, { label: 'Eliminar', value: true, kind: 'danger-fill' }] });
    if (!c) return;
    await closeAllLayers();
    undoable('Ejercicio eliminado', () => {
      state.exercises = state.exercises.filter(e => e !== x);
      state.sessions.forEach(s => { s.entries = s.entries.filter(e => e.exerciseId !== x.id); });
    });
  },
  'history-more': () => { historyLimit += 30; render(); },
  export: () => exportData(),
  'check-update': () => checkForUpdate(),
  reinstall: async () => {
    const c = await ask({ title: 'Reinstalar la app', msg: 'Se vuelve a descargar la última versión. Tus rutinas, entrenos y récords no se tocan. Necesita conexión a internet.', buttons: [{ label: 'Cancelar', value: false }, { label: 'Reinstalar', value: true, kind: 'primary' }] });
    if (!c) return;
    if (!navigator.onLine) { toast('Sin conexión: conectate a internet y probá de nuevo.'); return; }
    reinstallApp();
  },
  'share-export': () => shareExport(),
  'backup-snooze': () => { state.settings.backupSnooze = today(); save(); render(); },
  import: () => { const f = $('#import-file'); f.value = ''; f.click(); },
  'restore-backup': () => { try { const b = JSON.parse(lsGet(BACKUP_KEY)); replaceData(normalize(b.data), 'La copia automática'); } catch (_) { toast('La copia automática no se pudo leer.'); } },
  'reimport-v1': () => { try { replaceData(migrateV1(JSON.parse(lsGet(OLD_KEY))), 'La versión anterior'); } catch (_) { toast('No se pudieron leer los datos anteriores.'); } },
  install: async () => { if (!installPrompt) return; installPrompt.prompt(); try { await installPrompt.userChoice; } catch (_) {} installPrompt = null; closeTop(); },
  'reset-all': async () => {
    const c = await ask({ title: 'Borrar todos los datos', msg: 'Se eliminan rutinas, entrenos y récords de este teléfono. Exportá una copia antes si la querés conservar.', buttons: [{ label: 'Cancelar', value: false }, { label: 'Borrar todo', value: true, kind: 'danger-fill' }] });
    if (!c) return;
    await closeAllLayers();
    notice = '';
    undoable('Datos borrados', () => { state = defaults(); stopRest(); });
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.a];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve().then(() => fn(el, e)).catch(reportError);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.ed && editor) return editorInput(el);
  const k = el.dataset.in;
  if (!k) return;
  const s = curSession();
  if (!s) return;
  if (k === 'set-w' || k === 'set-r') {
    const en = getEntry(s, el.dataset.entry), t = en && en.sets.find(x => x.id === el.dataset.set);
    if (!t) return;
    const raw = el.value.trim(), v = num(raw);
    const ok = raw === '' || (k === 'set-w' ? validW(v) : validR(v));
    el.classList.toggle('invalid', !ok);
    if (!ok) return;
    if (k === 'set-w') t.weight = raw === '' ? null : v; else t.reps = raw === '' ? null : v;
    save();
    const info = el.closest('.set').querySelector('.set-info');
    if (info) info.innerHTML = setInfo(t, bestExcluding(en.exerciseId, s.id));
  } else if (k === 'wk-note') { s.note = el.value.slice(0, 2000); save(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.ed && editor) return editorInput(el);
  if (el.dataset.in === 'wk-date') {
    const s = curSession();
    if (s && isDate(el.value) && el.value <= today()) { s.date = el.value; save(); toast('Fecha cambiada a ' + dlabel(el.value, { day: 'numeric', month: 'long' })); }
    else { el.value = s.date; toast('Elegí una fecha válida, hasta hoy.'); }
  }
  if (el.dataset.setOpt) {
    const k = el.dataset.setOpt;
    state.settings[k] = el.type === 'checkbox' ? el.checked : k === 'theme' ? el.value : +el.value;
    save();
    if (k === 'theme') applyTheme();
    syncWakeLock();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (layers.length) closeTop(); else if (route.view === 'entreno') leaveWorkout(); }
  if (e.key === 'Enter' && e.target.dataset && (e.target.dataset.in === 'set-w')) { e.preventDefault(); const r = e.target.closest('.set').querySelector('.in-r'); r && r.focus(); }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.in === 'set-r') { e.preventDefault(); e.target.blur(); }
});
$('#import-file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (f.size > 20 * 1024 * 1024) return toast('El archivo es demasiado grande.');
  const rd = new FileReader();
  rd.onload = () => { try { replaceData(parseImport(rd.result), 'La copia'); } catch (_) { toast('Ese archivo no es una copia válida de Forma.'); } };
  rd.onerror = () => toast('No se pudo leer el archivo.');
  rd.readAsText(f);
});

/* ---------- Robustez general ---------- */
function reportError(err) {
  console.error(err);
  toast('Algo falló, pero tus datos guardados están a salvo. Si se repite, exportá una copia.', { ms: 6000 });
}
window.addEventListener('error', e => reportError(e.error || e.message));
window.addEventListener('unhandledrejection', e => reportError(e.reason));
window.addEventListener('storage', e => {
  if (e.key !== KEY || !e.newValue) return;
  try { state = normalize(JSON.parse(e.newValue)); if (!layers.length) render(); } catch (_) {}
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  else {
    if (today() !== lastDay) { lastDay = today(); if (route.view !== 'entreno' && !layers.length) render(); }
    syncRestBar();
  }
  syncWakeLock();
});

/* ---------- Actualizaciones de la app (service worker) ---------- */
let swReg = null, updateRequested = false;
/** Activa la versión que espera y recarga. Nunca se queda sin hacer nada: si algo falla, recarga igual. */
function applyUpdate(w) {
  updateRequested = true;
  const btn = $('#update-btn');
  btn.disabled = true;
  btn.textContent = 'Actualizando…';
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  if (!w || w.state !== 'installed') { location.reload(); return; }
  w.addEventListener('statechange', () => { if (w.state === 'activated') location.reload(); });
  w.postMessage('skipWaiting');
  setTimeout(() => location.reload(), 4000);
}
function showUpdate(w) {
  $('#update-bar').hidden = false;
  $('#update-btn').onclick = () => applyUpdate(w);
}
/** Busca una versión nueva a pedido (desde Ajustes). */
async function checkForUpdate() {
  if (!swReg) { toast('Las actualizaciones automáticas no están disponibles aquí.'); return; }
  toast('Buscando actualizaciones…');
  try { await swReg.update(); } catch (_) { toast('Sin conexión: probá más tarde.'); return; }
  await new Promise(r => setTimeout(r, 1500));
  const w = swReg.waiting || swReg.installing;
  if (w) { await closeAllLayers(); toast('Instalando la versión nueva…'); applyUpdate(w); }
  else toast('Ya tenés la última versión (' + APP_VERSION + ').');
}
/** Salida de emergencia: borra la app guardada en caché (no los datos) y la vuelve a descargar. */
async function reinstallApp() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch (_) {}
  try { for (const k of await caches.keys()) await caches.delete(k); } catch (_) {}
  location.reload();
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    // Solo hay "versión nueva esperando" si ya existe una versión activa: en la primera instalación no se avisa.
    if (reg.waiting && reg.active && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && reg.active && reg.waiting === w && navigator.serviceWorker.controller) showUpdate(w);
      });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
    else $('#update-bar').hidden = true;
  });
}

/* ---------- Inicio ---------- */
function init() {
  applyTheme();
  if (notice) save();
  dailyBackup();
  if (state.sessions.length) askPersist();
  const h = location.hash.slice(1).split('/')[0];
  const params = new URLSearchParams(location.search);
  if (TABS.includes(h) && h !== 'hoy') { history.replaceState(null, '', '#hoy'); history.pushState({ tab: 1 }, '', '#' + h); }
  else if (h === 'rutina') { const id = location.hash.split('/')[1]; history.replaceState(null, '', '#hoy'); history.pushState({ tab: 1 }, '', '#rutinas'); if (findRoutine(id)) history.pushState({ rt: 1 }, '', '#rutina/' + id); }
  else if (h === 'entreno') { const id = location.hash.split('/')[1]; history.replaceState(null, '', '#hoy'); if (findSession(id) && findSession(id).status !== 'planned') history.pushState({ wk: 1 }, '', '#entreno/' + id); }
  else history.replaceState(null, '', location.pathname + '#hoy');
  renderRoute();
  if (params.get('accion') === 'entrenar') {
    history.replaceState(history.state, '', location.pathname + location.hash);
    const act = activeSession(), plan = todayPlan();
    if (act) openWorkout(act.id);
    else if (plan.type === 'day') startWorkout({ date: today(), routineId: plan.routine.id, dayId: plan.day.id });
  }
}
init();

/* Acceso para depuración desde la consola. */
window.forma = { get state() { return state; }, analysis, version: APP_VERSION };
})();
