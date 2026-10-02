/**
 * Rules for the Freedom section. Kept out of the view so the Overview can
 * score the same CSV rows.
 *
 * XP, resisted-urge counts and trigger tallies are *derived from the log* and
 * never stored, so the totals can never drift away from the entries that
 * produced them — recounting data/freedom_logs.csv always gives the same answer.
 */
import { offsetKey, todayKey } from './dates.js';

export const LEVELS = [
  { min: 0,    name: "Principiante Consciente" },
  { min: 100,  name: "Aprendiz con Voluntad" },
  { min: 250,  name: "Guardián del Hábito" },
  { min: 500,  name: "Arquitecto Mental" },
  { min: 1000, name: "Maestro del Autocontrol" },
  { min: 2000, name: "Estoico Digital" },
  { min: 4000, name: "Leyenda de Hábitos Atómicos" },
];

export const TRIGGER_LABELS = {
  bedroom:  { emoji: "🛏️", label: "Dormitorio" },
  bathroom: { emoji: "🚿", label: "Baño" },
  phone:    { emoji: "📱", label: "Con el teléfono" },
  night:    { emoji: "🌙", label: "De noche" },
  stressed: { emoji: "😤", label: "Estrés / aburrimiento" },
  alone:    { emoji: "🚶", label: "Solo en casa" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

export function computeStreak(heatmap) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const val = heatmap[offsetKey(i)];
    if (val === "relapse") break;
    if (val === "clean") streak++;
    else break;
  }
  return streak;
}

export function getLevelInfo(xp) {
  let lvlIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].min) lvlIdx = i;
  }
  const level  = lvlIdx + 1;
  const curr   = LEVELS[lvlIdx];
  const next   = LEVELS[lvlIdx + 1] ?? null;
  const prevMin = curr.min;
  const nextMin = next ? next.min : curr.min * 3;
  const pct    = next ? Math.min(100, ((xp - prevMin) / (nextMin - prevMin)) * 100) : 100;
  return { level, name: curr.name, pct, nextMin, nextLevel: level + 1, hasNext: !!next };
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export const XP_PER_URGE = 20;   // resisting an urge
export const XP_PER_WIN = 30;    // closing a clean day

export const TRIGGER_KEYS = ['bedroom', 'bathroom', 'phone', 'night', 'stressed', 'alone'];

/** freedom_days.csv rows -> { 'YYYY-MM-DD': 'clean' | 'relapse' } */
export function rowsToHeatmap(rows) {
  const map = {};
  for (const row of rows) if (row.date && row.status) map[row.date] = row.status;
  return map;
}

/** freedom_logs.csv rows -> the log shape the tabs render. */
export function rowsToLogs(rows) {
  return rows
    .filter((r) => r.type)
    .map((r) => ({
      type: r.type,
      location: r.location || '',
      note: r.note || '',
      date: r.timestamp || r.date,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Recount XP, resisted urges and trigger tallies straight from the log. */
export function deriveStats(logs) {
  const triggerCounts = Object.fromEntries(TRIGGER_KEYS.map((k) => [k, 0]));
  let xp = 0;
  let urgesResisted = 0;
  for (const log of logs) {
    if (log.type === 'urge') { xp += XP_PER_URGE; urgesResisted += 1; }
    else if (log.type === 'win') { xp += XP_PER_WIN; }
    if (log.location && Object.hasOwn(triggerCounts, log.location)) {
      triggerCounts[log.location] += 1;
    }
  }
  return { xp, urgesResisted, triggerCounts };
}

/** Longest clean run ever recorded, so the record survives a cleared setting. */
export function longestStreak(heatmap) {
  const days = Object.keys(heatmap).sort();
  if (!days.length) return 0;
  let best = 0;
  let run = 0;
  let cursor = days[0];
  const last = days[days.length - 1];
  while (cursor <= last) {
    if (heatmap[cursor] === 'clean') { run += 1; best = Math.max(best, run); }
    else run = 0;
    const d = new Date(`${cursor}T00:00:00`);
    d.setDate(d.getDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return best;
}

export { offsetKey, todayKey };

/* ---------------------------------------------------------------------- */
/*  Fases de riesgo                                                        */
/*                                                                         */
/*  Ventanas conocidas en las que la recaída es más probable. No son una   */
/*  predicción: son avisos para bajar la guardia lo menos posible          */
/*  justamente cuando el cuerpo o la mente empujan más fuerte.             */
/* ---------------------------------------------------------------------- */
export const RISK_PHASES = [
  {
    id: 'acute',
    from: 1,
    to: 3,
    name: 'Abstinencia aguda',
    short: 'Pico físico',
    why: 'El cuerpo nota la ausencia completa del estímulo. Es el pico físico más intenso.',
    plan: 'Sal de la casa, mueve el cuerpo, duerme temprano. No te quedes solo en el sofá.',
  },
  {
    id: 'crisis',
    from: 7,
    to: 10,
    name: 'Primera crisis psicológica',
    short: 'Se acaba la novedad',
    why: 'Se cumple la primera semana completa. La novedad de "estar intentándolo" se gasta y la rutina diaria pone a prueba el autocontrol.',
    plan: 'Vuelve al plan escrito, no a la fuerza de voluntad. Revisa tus disparadores y bloquea el que más se repite.',
  },
  {
    id: 'consolidation',
    from: 21,
    to: 30,
    name: 'Consolidación del hábito',
    short: 'Exceso de confianza',
    why: 'El ciclo clásico de cambio de conducta. Aparece el exceso de confianza y la falsa creencia de que "ya está superado", y ahí baja la guardia.',
    plan: 'Mantén los bloqueos puestos aunque sientas que ya no los necesitas. Justo ahí es cuando sirven.',
  },
  {
    id: 'paws',
    from: 60,
    to: 90,
    name: 'Recaída emocional (SPA)',
    short: 'Altibajos emocionales',
    why: 'Síndrome de abstinencia post-agudo: el cerebro tiene altos y bajos emocionales profundos porque el sistema de recompensa aún se está reajustando.',
    plan: 'Trata el bajón como clima, no como señal. Habla con alguien, entrena, y no tomes decisiones grandes en el valle.',
  },
];

/** La fase de riesgo en la que cae este día de racha, o null si estás entre fases. */
export function phaseFor(day) {
  return RISK_PHASES.find((p) => day >= p.from && day <= p.to) || null;
}

/** La siguiente ventana de riesgo, con cuántos días faltan para entrar en ella. */
export function nextPhase(day) {
  const p = RISK_PHASES.find((ph) => ph.from > day);
  return p ? { ...p, inDays: p.from - day } : null;
}

/* ---------------------------------------------------------------------- */
/*  Felicitación diaria                                                    */
/*                                                                         */
/*  Un mensaje distinto por cada día de racha: los hitos tienen el suyo y  */
/*  el resto rota de forma determinista según el número de día, para que   */
/*  cambie cada mañana pero sea siempre el mismo para ese día.             */
/* ---------------------------------------------------------------------- */
const MILESTONES = {
  1: '¡Día 1 limpio! El día más difícil ya está hecho. Nada se decide hoy salvo que empezaste.',
  2: '¡Día 2! Dos decisiones seguidas. Eso ya es un patrón, no una casualidad.',
  3: '¡Día 3! Saliste del pico físico más duro. A partir de aquí el cuerpo deja de gritar.',
  4: '¡Día 4! Primera vez que dices "no" desde la calma y no desde la urgencia.',
  5: '¡Día 5! Ya tienes una racha de la que cuidar. Eso, por sí solo, protege.',
  6: '¡Día 6! Casi una semana. Mañana empieza la prueba de verdad: prepárala hoy.',
  7: '¡UNA SEMANA LIMPIA! 🎉 Siete días. Esto ya no es un intento, es una decisión sostenida.',
  10: '¡Día 10! Cruzaste la primera crisis psicológica completa. Esa era la grande.',
  14: '¡Dos semanas! 🔥 Tu cerebro ya está reescribiendo qué cuenta como normal.',
  21: '¡Día 21! Tres semanas. Aquí el hábito se consolida — y aquí es donde la confianza engaña.',
  30: '¡UN MES LIMPIO! 🏆 Treinta días. Mira atrás: eras otra persona hace un mes.',
  45: '¡Día 45! Mes y medio. Ya no estás dejando algo, estás construyendo otra cosa.',
  60: '¡DOS MESES! 💎 Sesenta días. Si viene un bajón ahora, es el sistema reajustándose, no tú fallando.',
  90: '¡TRES MESES! 👑 Noventa días. Saliste del tramo más largo y más silencioso.',
  180: '¡MEDIO AÑO! 🌟 Ciento ochenta días. Esto ya es tu vida normal.',
  365: '¡UN AÑO COMPLETO! 🎆 Cambiaste la historia que te cuentas sobre ti mismo.',
};

const DAILY = [
  'Otro día que tu yo de la semana pasada no creía posible.',
  'No pasó nada espectacular hoy, y eso es exactamente la victoria.',
  'Un día más de energía que no le regalaste a nada.',
  'Cada día limpio es un voto por la persona que quieres ser.',
  'Hoy elegiste otra vez. Eso es todo lo que hace falta.',
  'Sumaste un eslabón más. No rompas la cadena mañana.',
  'La disciplina de hoy es la libertad de la próxima semana.',
];

/**
 * El mensaje de felicitación del día `day` de la racha.
 * Determinista: el mismo día siempre da el mismo texto.
 */
export function dayCongrats(day) {
  if (day <= 0) return 'Cada racha empieza en cero. Hoy puede ser el día 1.';
  if (MILESTONES[day]) return MILESTONES[day];
  return `¡Día ${day} limpio! ${DAILY[day % DAILY.length]}`;
}

/** Los hitos que ya pasaste en esta racha, del más reciente al más antiguo. */
export function milestonesReached(day) {
  return Object.keys(MILESTONES)
    .map(Number)
    .filter((d) => d <= day)
    .sort((a, b) => b - a);
}

/**
 * Para cada día limpio registrado, qué número de racha le tocó.
 * Así cada celda del historial puede mostrar su propia felicitación.
 */
export function streakDayMap(heatmap) {
  const days = Object.keys(heatmap).sort();
  const map = {};
  let run = 0;
  let cursor = days[0];
  const last = days[days.length - 1];
  while (cursor && cursor <= last) {
    if (heatmap[cursor] === 'clean') { run += 1; map[cursor] = run; }
    else run = 0;
    const d = new Date(`${cursor}T00:00:00`);
    d.setDate(d.getDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return map;
}
