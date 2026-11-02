/**
 * Rules and stats for the Food section (comer con calma), kept apart from the
 * view so the Overview can score the same CSV rows.
 *
 * Nothing derived is stored: the daily X/7 score, streaks, levels, insights
 * and challenge runs are all recomputed from the raw rows in data/food_*.csv,
 * so editing a past row by hand always produces a consistent result.
 *
 * A day scores up to 7 marks, one per habit in H. The per-meal habits (MK)
 * count only when every meal that day had them; on a day with no meals logged
 * they are ticked directly on the day row instead. A sweet slip (tropiezo)
 * that day always cancels «Sin azúcar».
 */
import { addDays, offsetKey, parseKey, todayKey } from './dates.js';

export const MARKS = 7;
export const GOOD_DAY = 4; // marks needed for a "día de avance"

export const H = [
  { k: 'sit', e: '🪑', t: 'Sentado', s: 'Comí sentado, sin caminar' },
  { k: 'wait', e: '⏱️', t: 'Esperé 30 s', s: 'Esperé 30 segundos antes de comer' },
  { k: 'free', e: '📵', t: 'Sin pantallas', s: 'Sin celular, video ni estudio' },
  { k: 'small', e: '🥣', t: 'Porción pequeña', s: 'Plato pequeño, de a poquitos' },
  { k: 'sugar', e: '🍬', t: 'Sin azúcar', s: 'Sin azúcar añadida' },
  { k: 'cal', e: '🔥', t: 'Menos kcal que ayer', s: 'Comí menos calorías que ayer' },
  { k: 'comp', e: '🤝', t: 'Buena compañía', s: 'Nadie me empujó a comer de más' },
];
export const MK = ['sit', 'wait', 'free', 'small', 'sugar']; // marked on each meal
export const MS = { sit: 'Sentado', wait: 'Esperé 30 s', free: 'Sin pantallas', small: 'Porción pequeña', sugar: 'Sin azúcar' };
export const LV = [['Semilla', 0], ['Brote', 20], ['Tallo', 60], ['Hojas', 120], ['Árbol', 250]];

export const FOODS = [
  { k: 'pizza', t: 'Pizza' }, { k: 'galletas', t: 'Galletas', sweet: true }, { k: 'dulces', t: 'Dulces o chocolate', sweet: true },
  { k: 'gaseosa', t: 'Gaseosa o jugo', sweet: true }, { k: 'fritos', t: 'Fritos' }, { k: 'harinas', t: 'Pan o harinas' },
  { k: 'mani', t: 'Maní' }, { k: 'helado', t: 'Helado', sweet: true }, { k: 'otro', t: 'Otro' },
];
export const SWEET = FOODS.filter((f) => f.sweet).map((f) => f.k);
export const WHY = [
  { k: 'ansiedad', t: 'Ansiedad' }, { k: 'aburrimiento', t: 'Aburrimiento' }, { k: 'estres', t: 'Estrés' }, { k: 'social', t: 'Compañía o evento' },
  { k: 'hambre', t: 'Hambre real' }, { k: 'antojo', t: 'Antojo' }, { k: 'cansancio', t: 'Cansancio' },
];
export const ACTS = [
  { k: 'caminar', t: 'Caminar', met: 3.5 }, { k: 'correr', t: 'Correr', met: 9 }, { k: 'bici', t: 'Bicicleta', met: 7 },
  { k: 'pesas', t: 'Pesas', met: 4 }, { k: 'baile', t: 'Baile', met: 5 }, { k: 'otro', t: 'Otro', met: 4 },
];
export const DOW = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const DS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
export const BLOCKS = [
  { n: 'la mañana temprano', r: '5–9' }, { n: 'media mañana', r: '9–12' }, { n: 'el mediodía', r: '12–15' },
  { n: 'la tarde', r: '15–18' }, { n: 'la noche', r: '18–21' }, { n: 'la madrugada', r: '21–5' },
];

const EM = {
  pizza: '🍕', galletas: '🍪', dulces: '🍫', gaseosa: '🥤', fritos: '🍟', harinas: '🍞', mani: '🥜', helado: '🍦', otro: '➕',
  ansiedad: '😰', aburrimiento: '🥱', estres: '😤', social: '👥', hambre: '🍽️', antojo: '🤤', cansancio: '😴',
  caminar: '🚶', correr: '🏃', bici: '🚴', pesas: '🏋️', baile: '💃', poco: '🤏', medio: '🙂', mucho: '😬',
};
export const em = (k) => EM[k] || '';
export const he = (k) => H.find((h) => h.k === k)?.e || '';
export const foodName = (k) => (FOODS.find((f) => f.k === k) || { t: k }).t;
export const whyName = (k) => (WHY.find((w) => w.k === k) || { t: k }).t;

export const isSet = (v) => v === '1' || v === 'true' || v === 'yes';
export const isNo = (v) => v === '0' || v === 'false' || v === 'no';
export const answered = (v) => isSet(v) || isNo(v);
export const yn = (b) => (b ? '1' : '0');
export const listOf = (v) => (v || '').split(' ').filter(Boolean);

export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const pad2 = (n) => String(n).padStart(2, '0');
export const nowTime = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/* ---------- meal rows <-> habit flags ---------- */

// CSV column per meal habit, and the stored answer that means "done".
// "Sin pantallas" and "Sin azúcar" are stored as distracted=0 / sugar=0.
const MEAL_FIELD = {
  sit: ['sitting', true],
  wait: ['waited30', true],
  free: ['distracted', false],
  small: ['small', true],
  sugar: ['sugar', false],
};

export function mealHas(row, k) {
  const [f, good] = MEAL_FIELD[k];
  return answered(row[f]) && isSet(row[f]) === good;
}

/** The column patch that marks habit `k` as done (`on`) or not on a meal row. */
export function mealPatch(k, on) {
  const [f, good] = MEAL_FIELD[k];
  return { [f]: yn(on === good) };
}

export const blankDay = (date) => ({
  date, water: '', weight: '', weight_note: '', habits: '', who: '', note: '', up: '', challenge: '', challenge_done: '',
});

/* ---------- index ---------- */

function groupByDate(rows, sortKey) {
  const map = new Map();
  for (const r of rows) {
    if (!r.date) continue;
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r);
  }
  if (sortKey) for (const list of map.values()) list.sort((a, b) => (a[sortKey] || '').localeCompare(b[sortKey] || ''));
  return map;
}

/**
 * Groups the rows by date once, so the 365-day loops below are lookups.
 * `dates` holds every day with anything logged on it.
 */
export function buildIndex(meals, days, slips = [], log = []) {
  const dayMap = new Map();
  for (const r of days) if (r.date) dayMap.set(r.date, r);
  const mealMap = groupByDate(meals, 'time');
  const slipMap = groupByDate(slips, 'time');
  const logMap = groupByDate(log, 'time');
  return {
    days: dayMap,
    meals: mealMap,
    slips: slipMap,
    log: logMap,
    dates: new Set([...dayMap.keys(), ...mealMap.keys(), ...slipMap.keys(), ...logMap.keys()]),
  };
}

export const mealsOn = (ix, date) => ix.meals.get(date) || [];
export const dayOn = (ix, date) => ix.days.get(date) || blankDay(date);
export const slipsOn = (ix, date) => ix.slips.get(date) || [];
export const foodOn = (ix, date) => (ix.log.get(date) || []).filter((r) => r.kind === 'food');
export const exOn = (ix, date) => (ix.log.get(date) || []).filter((r) => r.kind === 'ex');
const sumK = (rows) => rows.reduce((s, r) => s + (Number(r.kcal) || 0), 0);
export const kFood = (ix, date) => sumK(foodOn(ix, date));
export const kEx = (ix, date) => sumK(exOn(ix, date));

/* ---------- scoring ---------- */

export function done(ix, date, k) {
  if (k === 'sugar' && slipsOn(ix, date).some((s) => SWEET.includes(s.food))) return false;
  const m = mealsOn(ix, date);
  if (MK.includes(k) && m.length) return m.every((r) => mealHas(r, k));
  return listOf(ix.days.get(date)?.habits).includes(k);
}

export function count(ix, date) {
  if (!ix.dates.has(date)) return 0;
  return H.filter((x) => done(ix, date, x.k)).length;
}

/** Share of days `from`..`from+len-1` days ago on which habit `k` was done. */
export function rate(ix, k, from, len) {
  let c = 0;
  for (let i = from; i < from + len; i++) if (done(ix, offsetKey(i), k)) c++;
  return c / len;
}

/** Consecutive days with GOOD_DAY+ marks, ending today (or yesterday if today isn't there yet). */
export function streak(ix) {
  let d = todayKey();
  let n = 0;
  if (count(ix, d) < GOOD_DAY) d = addDays(d, -1);
  while (count(ix, d) >= GOOD_DAY) { n++; d = addDays(d, -1); }
  return n;
}

export function best(ix) {
  let b = 0;
  let r = 0;
  for (let i = 364; i >= 0; i--) {
    if (count(ix, offsetKey(i)) >= GOOD_DAY) { r++; b = Math.max(b, r); } else r = 0;
  }
  return b;
}

export const total = (ix) => [...ix.dates].reduce((a, d) => a + count(ix, d), 0);

export function avg(ix, from, len) {
  let s = 0;
  for (let i = from; i < from + len; i++) s += count(ix, offsetKey(i));
  return s / len;
}

export function level(ix) {
  const t = total(ix);
  let i = 0;
  LV.forEach((l, j) => { if (t >= l[1]) i = j; });
  const nx = LV[i + 1];
  return { name: LV[i][0], t, nx, pct: nx ? (t - LV[i][1]) / (nx[1] - LV[i][1]) : 1 };
}

/** Monday of the current week. */
export function weekStart() {
  const t = todayKey();
  return addDays(t, -((parseKey(t).getDay() + 6) % 7));
}

/** The habit done least often over the last 14 days (yesterday back). */
export function weakest(ix) {
  let b = H[0].k;
  let lo = 2;
  for (const x of H) {
    const r = rate(ix, x.k, 1, 14);
    if (r < lo) { lo = r; b = x.k; }
  }
  return b;
}

export const focusKey = (ix, settings) =>
  (settings.focusWeek === weekStart() && H.some((h) => h.k === settings.focusHabit) ? settings.focusHabit : weakest(ix));

export const msg = (n) => (n === 0 ? 'Empieza con uno' : n < 4 ? '¡Buen comienzo!' : n < 7 ? '¡Día de avance!' : '¡Día excelente!');

/* ---------- slips (tropiezos) ---------- */

/** Every slip of the last n days, newest day first. */
export function allSlips(ix, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...slipsOn(ix, offsetKey(i)));
  return out;
}

export function slipsIn(ix, from, len) {
  let c = 0;
  for (let i = from; i < from + len; i++) c += slipsOn(ix, offsetKey(i)).length;
  return c;
}

export const countBy = (arr, f) => arr.reduce((m, x) => { const v = f(x); m[v] = (m[v] || 0) + 1; return m; }, {});
export const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

/** Index into BLOCKS for an HH:MM time. */
export function block(t) {
  const h = parseInt((t || '12').slice(0, 2), 10);
  return h >= 5 && h < 9 ? 0 : h >= 9 && h < 12 ? 1 : h >= 12 && h < 15 ? 2 : h >= 15 && h < 18 ? 3 : h >= 18 && h < 21 ? 4 : 5;
}

/* ---------- calories ---------- */

/** Average kcal eaten on logged days in the window; null with fewer than 3 logged days. */
export function avgFood(ix, from, len) {
  let s = 0;
  let c = 0;
  for (let i = from; i < from + len; i++) {
    const d = offsetKey(i);
    if (foodOn(ix, d).length) { s += kFood(ix, d); c++; }
  }
  return c >= 3 ? s / c : null;
}

/** The foods logged most often by name in the last 60 days, for one-tap re-entry. */
export function frequent(ix) {
  const m = {};
  for (let i = 0; i < 60; i++) {
    for (const f of foodOn(ix, offsetKey(i))) {
      if (!f.name) continue;
      const e = m[f.name] || (m[f.name] = { n: f.name, k: Number(f.kcal) || 0, c: 0 });
      e.c++;
    }
  }
  return Object.values(m).sort((a, b) => b.c - a.c).slice(0, 6);
}

/* ---------- daily challenge (reto) ---------- */

// i = id · e = icon · t = title · s = detail · n = difficulty 1-3
export const CH = [
  { i: 'sin1h', e: '⏳', t: '1 hora sin picar', s: 'Después de comer, nada por 1 hora. Si hay antojo: agua y espera', n: 1 },
  { i: 'vent3', e: '⏳', t: 'Ventana sin snacks', s: '2 a 3 horas sin picar entre dos comidas', n: 2 },
  { i: 'calma4', e: '🍵', t: 'Ventana de calma', s: '4 horas por la tarde sin picoteo: solo agua, té o infusión', n: 3 },
  { i: 'cocina', e: '🌙', t: 'Cocina cerrada', s: 'Nada de comer 3 horas antes de dormir', n: 2 },
  { i: 'noche12', e: '🛌', t: 'Descanso de 12 horas', s: '12 horas entre la cena y el desayuno. Sin forzar: si hay hambre, desayuna', n: 2 },
  { i: 'lento20', e: '⏱️', t: 'Comida de 20 minutos', s: 'Haz que una comida dure al menos 20 minutos', n: 1 },
  { i: 'bocados', e: '🐢', t: '10 bocados lentos', s: 'Los primeros 10 bocados, muy despacio', n: 1 },
  { i: 'cierre', e: '🕗', t: 'Hora fija de cierre', s: 'Define una hora para tu última comida del día', n: 2 },
  { i: 'sentado', e: '🪑', t: 'Todas sentado', s: 'Ninguna comida de pie ni caminando', n: 1 },
  { i: 'sinpant', e: '📵', t: 'Una comida sin pantallas', s: 'Solo la que tú elijas. Una sola ya cuenta', n: 1 },
  { i: 'seg30', e: '👀', t: 'Los 30 segundos', s: 'Antes de cada comida, mírala y respira medio minuto', n: 1 },
  { i: 'platop', e: '🥣', t: 'Plato pequeño', s: 'Sírvete en el plato más chico y espera 5 minutos antes de repetir', n: 1 },
  { i: 'cubier', e: '🥄', t: 'Cubiertos abajo', s: 'Deja el tenedor en la mesa entre bocado y bocado, en la primera comida', n: 2 },
  { i: 'liquid', e: '🚫', t: 'Cero líquidos azucarados', s: 'Solo agua, té o café sin azúcar', n: 2 },
  { i: 'verdura', e: '🥦', t: 'Verdura primero', s: 'La mitad del plato antes de lo demás', n: 1 },
  { i: 'prote', e: '🥩', t: 'Proteína en cada comida', s: 'Huevo, pollo, pescado, legumbres o yogur griego', n: 2 },
  { i: 'ultra', e: '🥗', t: 'Día sin ultraprocesados', s: 'Solo comida que reconozcas: fruta, huevos, arroz, legumbres, pollo, verdura', n: 3 },
  { i: 'todas3', e: '🧘', t: 'Todas sin pantallas', s: 'Todas las comidas sentado, sin pantallas y en 20 minutos o más', n: 3 },
  { i: 'despensa', e: '🧊', t: 'Despensa limpia', s: 'Saca de la casa lo que más picas, o regálalo', n: 3 },
  { i: 'encasa', e: '🍳', t: 'Todo cocinado en casa', s: 'Ninguna comida de paquete ni a domicilio', n: 2 },
  { i: 'etiqueta', e: '🔍', t: 'Detective de etiquetas', s: 'Lee la etiqueta de un producto antes de comerlo', n: 1 },
  { i: 'porcion', e: '📏', t: 'Porción real', s: 'Mide o pesa una porción de algo que comes a ojo', n: 1 },
  { i: 'lugar', e: '🚪', t: 'Cambio de lugar', s: 'Si llega un antojo, cámbiate de cuarto antes de decidir', n: 1 },
  { i: 'primero', e: '🍓', t: 'Primero lo bueno', s: 'Antes de un dulce, come fruta o yogur griego con arándanos y luego decides', n: 2 },
  { i: 'apoyo', e: '🤝', t: 'Pedir apoyo', s: 'Dile a alguien cercano que hoy no te ofrezca postre', n: 2 },
  { i: 'honesto', e: '📝', t: 'Registro honesto', s: 'Anota cada tropiezo del día, sin juzgarte', n: 1 },
  { i: 'cierredia', e: '🌟', t: 'Cierre del día', s: 'Antes de dormir, anota una cosa que salió bien', n: 1 },
  { i: 'solo1', e: '🎯', t: 'Solo mi hábito de la semana', s: 'Hoy cumple ese y con eso basta', n: 1 },
];
/** Difficulty as ●●○. */
export const dots = (n) => `${'●'.repeat(n)}${'○'.repeat(3 - n)}`;
export const CHM = Object.fromEntries(CH.map((c) => [c.i, c]));

const seedOf = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let x = Math.imul(a ^ (a >>> 15), 1 | a);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const shuf = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dayNum = (k) => { const [y, m, d] = k.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };

/** One challenge per day; none repeats until all have come up (each cycle is shuffled differently). */
export function pickDay(k) {
  const n = dayNum(k);
  const L = CH.length;
  return shuf(CH.map((c) => c.i), rng(seedOf(`ciclo${Math.floor(n / L)}`)))[n % L];
}

/** The challenge for a day: the stored one once the user has touched it, otherwise the day's pick. */
export function chOf(ix, k) {
  const r = ix.days.get(k);
  const id = r?.challenge && CHM[r.challenge] ? r.challenge : pickDay(k);
  return { id, done: isSet(r?.challenge_done) };
}
export const chDone = (ix, k) => (isSet(ix.days.get(k)?.challenge_done) ? 1 : 0);
export const chShown = (ix, k) => !!ix.days.get(k)?.challenge;
export function chRun(ix) {
  let d = todayKey();
  let n = 0;
  if (!chDone(ix, d)) d = addDays(d, -1);
  while (chDone(ix, d)) { n++; d = addDays(d, -1); }
  return n;
}
export const chTotal = (ix) => [...ix.days.keys()].reduce((a, k) => a + chDone(ix, k), 0);

/* ---------- insights ---------- */

export function weekdayAvg(ix) {
  const sum = Array(7).fill(0);
  const c = Array(7).fill(0);
  for (let i = 0; i < 56; i++) {
    const d = offsetKey(i);
    if (!ix.dates.has(d)) continue;
    const w = (parseKey(d).getDay() + 6) % 7;
    sum[w] += count(ix, d);
    c[w]++;
  }
  return sum.map((s, i) => (c[i] ? s / c[i] : null));
}

export const iconOf = (s) => (s.includes('retos') ? '🎲' : s.includes('mejor día') ? '📅' : s.includes('detonante') ? '🎯'
  : s.includes('más se repite') ? '🍪' : s.includes('concentran') ? '🕘' : s.includes('kcal') ? '🔥'
    : s.includes('distracciones') ? '📵' : '📉');

/** Plain-language sentences about what the data says. */
export function insights(ix) {
  const out = [];
  const sl = allSlips(ix, 30);
  const wd = weekdayAvg(ix);
  const ok = wd.map((v, i) => (v == null ? null : i)).filter((i) => i != null);
  if (ok.length >= 3) {
    const hi = ok.reduce((a, b) => (wd[b] > wd[a] ? b : a));
    const lo = ok.reduce((a, b) => (wd[b] < wd[a] ? b : a));
    if (wd[hi] > wd[lo]) out.push(`Tu mejor día suele ser el ${DOW[hi]} (${wd[hi].toFixed(1)} marcas) y el más difícil el ${DOW[lo]} (${wd[lo].toFixed(1)}). Prepara con más cuidado ese día.`);
  }
  if (sl.length >= 3) {
    const w = top(countBy(sl.filter((s) => s.why), (s) => s.why))[0];
    if (w) out.push(`Tu detonante principal es «${whyName(w[0]).toLowerCase()}»: ${Math.round((w[1] / sl.length) * 100)}% de tus tropiezos. Ahí conviene poner tu plan.`);
    const f = top(countBy(sl, (s) => s.food))[0];
    out.push(`Lo que más se repite es ${foodName(f[0]).toLowerCase()} (${f[1]} de ${sl.length} tropiezos en 30 días).`);
    const b = top(countBy(sl, (s) => block(s.time)))[0];
    out.push(`Tus tropiezos se concentran en ${BLOCKS[b[0]].n} (${BLOCKS[b[0]].r} h). Ten a mano una alternativa a esa hora.`);
  }
  const a = slipsIn(ix, 0, 7);
  const p = slipsIn(ix, 7, 7);
  if (a + p > 0) {
    out.push(a < p ? `Esta semana tuviste ${a} tropiezos frente a ${p} la anterior: vas bajando.`
      : a === p ? `Tuviste ${a} tropiezos esta semana, igual que la anterior.`
        : `Esta semana tuviste ${a} tropiezos frente a ${p} la anterior. Una semana difícil no borra el avance: revisa tu detonante principal.`);
  }
  const g = [0, 0];
  const c = [0, 0];
  for (let i = 0; i < 30; i++) {
    const d = offsetKey(i);
    if (mealsOn(ix, d).length || listOf(ix.days.get(d)?.habits).length) {
      const j = done(ix, d, 'free') ? 0 : 1;
      g[j] += slipsOn(ix, d).length;
      c[j]++;
    }
  }
  if (c[0] >= 3 && c[1] >= 3 && g[0] / c[0] !== g[1] / c[1]) {
    out.push(`Los días que comes sin distracciones tienes ${(g[0] / c[0]).toFixed(1)} tropiezos por día; los demás días, ${(g[1] / c[1]).toFixed(1)}.`);
  }
  const f1 = avgFood(ix, 0, 7);
  const f0 = avgFood(ix, 7, 7);
  if (f1 != null && f0 != null && Math.abs(f1 - f0) >= 20) {
    out.push(`Tu consumo registrado promedia ${Math.round(f1)} kcal por día esta semana, ${f1 < f0 ? `${Math.round(f0 - f1)} menos` : `${Math.round(f1 - f0)} más`} que la semana anterior.`);
  }
  let rs = 0;
  let rd = 0;
  for (let i = 0; i < 14; i++) { const d = offsetKey(i); if (chShown(ix, d)) { rs++; rd += chDone(ix, d); } }
  if (rs >= 3) out.push(`Cumpliste ${rd} de tus últimos ${rs} retos.`);
  return out.slice(0, 6);
}

/* ---------- used by the Overview tile ---------- */

const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
const inRange = (rows, from, to) => rows.filter((r) => r.date >= from && r.date <= to);

/** A meal is mindful when it was eaten sitting, after waiting, small, and without distractions. */
export const isMindful = (row) =>
  isSet(row.sitting) && isSet(row.waited30) && isSet(row.small) && !isSet(row.distracted);

export function mealStats(meals, today, days = 7, slips = []) {
  const from = addDays(today, -(days - 1));
  const m = inRange(meals, from, today);
  return {
    meals: m.length,
    mindful: pct(m.filter(isMindful).length, m.length),
    slips: inRange(slips, from, today).length,
  };
}
