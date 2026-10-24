/**
 * Scoring rules for the Food section, kept apart from the view so the
 * Overview can score the same CSV rows without importing a dashboard.
 *
 * Nothing derived is ever stored: points, streaks, multipliers and levels are
 * all recomputed from the raw check-ins in data/food_days.csv, so editing a
 * past day by hand always produces a consistent result.
 */
import { addDays } from './dates.js';

export const BASE = 100; // points for a perfect day, before the streak multiplier
export const DEFAULT_IDENTITY = 'I am someone who eats real food.';

export const HABITS = [
  {
    id: 'breakfast',
    name: 'Real-food breakfast',
    cue: 'After I brush my teeth in the morning, I eat eggs, oats or fruit, nothing from a wrapper.',
    small: 'Eat one piece of fruit before you leave the kitchen.',
    lever: 'Make it easy',
    tip: 'Boil eggs or soak oats the night before, so breakfast takes under two minutes.',
  },
  {
    id: 'plants',
    name: 'Plants fill half my plate',
    cue: 'When I serve lunch and dinner, I fill half the plate with vegetables or fruit first.',
    small: 'Add one handful of vegetables to whatever you are eating.',
    lever: 'Make it attractive',
    tip: 'Roast or season vegetables the way you love them, and keep a dip or sauce you enjoy nearby.',
  },
  {
    id: 'water',
    name: 'Water, not sugary drinks',
    cue: 'When I feel thirsty, I drink a full glass of water before anything else.',
    small: 'Pour one glass of water and finish it.',
    lever: 'Make it obvious',
    tip: 'Keep a full bottle where you will see it, and keep soda out of sight.',
  },
  {
    id: 'pause',
    name: 'Ten-minute craving pause',
    cue: 'When I want a processed snack, I set a 10-minute timer and eat a piece of fruit first.',
    small: 'Take three slow breaths before you open the wrapper.',
    lever: 'Make it difficult',
    tip: 'Keep snacks out of the house, or in a high cupboard, so wanting one takes effort.',
  },
  {
    id: 'prep',
    name: "Set up tomorrow's food",
    cue: "After I finish dinner, I put out tomorrow's fruit, fill my water bottle and plan one real-food meal.",
    small: 'Put one piece of fruit on the counter.',
    lever: 'Make it obvious',
    tip: 'What you see first is what you eat first. Put the healthy option at eye level.',
  },
];
export const PER = BASE / HABITS.length; // points per habit (20)

// Streak multipliers apply to perfect days only. A miss resets the streak.
export const TIERS = [
  { from: 1, to: 3, mult: 1, label: '×1.0', days: 'Days 1 to 3' },
  { from: 4, to: 7, mult: 1.25, label: '×1.25', days: 'Days 4 to 7' },
  { from: 8, to: 14, mult: 1.5, label: '×1.5', days: 'Days 8 to 14' },
  { from: 15, to: Infinity, mult: 2, label: '×2.0', days: 'Day 15+' },
];

// Levels are permanent: points are never subtracted.
export const LEVELS = [
  { n: 1, name: 'Clean Beginner', min: 0, range: '0 to 500 points' },
  { n: 2, name: 'Anti-Sugar Shield', min: 501, range: '501 to 1,500 points' },
  { n: 3, name: 'Impulse Master', min: 1501, range: '1,501 to 3,500 points' },
  { n: 4, name: 'Real Food Mind', min: 3501, range: '3,501 to 7,000 points' },
  { n: 5, name: 'Processed-Immune', min: 7001, range: '7,001 points and up' },
];

export function tierIndex(day) {
  const d = Math.max(day, 1);
  const i = TIERS.findIndex((t) => d >= t.from && d <= t.to);
  return i === -1 ? TIERS.length - 1 : i;
}
export const multFor = (day) => TIERS[tierIndex(day)].mult;

export function levelFor(total) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (total >= l.min) cur = l;
  return cur;
}

export const HABIT_IDS = HABITS.map((h) => h.id);
export const isSet = (v) => v === '1' || v === 'true' || v === 'yes';

/** food_days rows -> { 'YYYY-MM-DD': ['water', 'plants', ...] } */
export function rowsToDone(rows) {
  const done = {};
  for (const row of rows) {
    if (!row.date) continue;
    done[row.date] = HABIT_IDS.filter((id) => isSet(row[id]));
  }
  return done;
}

/** Pull the `cue.<id>` / `setup.<id>` families out of the flat settings table. */
export function byPrefix(settings, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(settings)) {
    if (k.startsWith(prefix) && v) out[k.slice(prefix.length)] = v;
  }
  return out;
}

/**
 * Walks every day from the start date to today and derives points, streaks and
 * multipliers from the raw check-ins. Nothing derived is stored, so editing a
 * past day always produces a consistent result.
 */
export function compute(state, today) {
  const start = state.startedOn && state.startedOn <= today ? state.startedOn : today;
  const ids = HABITS.map((x) => x.id);
  const perDay = {};
  const totals = { points: 0, votes: 0, perfect: 0, longest: 0, tracked: 0 };
  let streak = 0;
  let d = start;
  let guard = 0;
  while (d <= today && guard++ < 3660) {
    const done = (state.done[d] || []).filter((id) => ids.includes(id));
    const n = done.length;
    const perfect = n === ids.length;
    const before = streak;
    const projected = Math.round(BASE * multFor(before + 1));
    let points;
    let mult = 1;
    if (perfect) {
      streak = before + 1;
      mult = multFor(streak);
      points = Math.round(BASE * mult);
    } else {
      points = n * PER; // partial days: base points, no multiplier
      if (d < today) streak = 0; // a finished, imperfect day breaks the chain
    }
    perDay[d] = { date: d, done, n, perfect, before, streakAfter: streak, mult, points, projected };
    totals.points += points;
    totals.votes += n;
    if (perfect) totals.perfect += 1;
    if (n > 0) totals.tracked += 1;
    if (streak > totals.longest) totals.longest = streak;
    d = addDays(d, 1);
  }
  return { perDay, totals, start };
}

/* ---------- mindful eating log (separate from points) ---------- */

export const MINDFUL_RULES = [
  { id: 'ask', text: 'Am I hungry or anxious? Wait 10 seconds.' },
  { id: 'small', text: 'Small portions, small plate, eat slowly in small bites.' },
  { id: 'alt', text: 'Anxious? Pick a satisfying alternative instead.' },
  { id: 'observe', text: 'Take 30 seconds to observe how I feel.' },
  { id: 'focus', text: 'Eat without distractions.' },
  { id: 'sit', text: 'Eat while sitting down.' },
];

export const REVIEW_CHECKS = [
  { id: 'sitting', q: 'Did I eat sitting down?', label: 'Sitting' },
  { id: 'waited', q: 'Did I wait 30 seconds?', label: 'Waited' },
  { id: 'small', q: 'Did I eat a small portion?', label: 'Small portion' },
];

export const DISTRACTIONS = [
  { id: 'phone', label: 'Phone' },
  { id: 'video', label: 'Video' },
  { id: 'study', label: 'Studying' },
];

export const DEFAULT_ALTERNATIVES = ['Go for a walk', 'Study personal interests'];

/** `alternatives` is stored as one `|`-separated setting. */
export function alternativesFrom(settings) {
  const raw = settings.alternatives;
  if (!raw) return DEFAULT_ALTERNATIVES;
  return raw.split('|').map((s) => s.trim()).filter(Boolean);
}

export const distractionsOf = (row) => (row.distractions || '').split(' ').filter(Boolean);

/** A meal is mindful when every review check passed and nothing distracted me. */
export const isMindful = (row) =>
  REVIEW_CHECKS.every((c) => isSet(row[c.id])) && distractionsOf(row).length === 0;

/** Shares (0..100, or null with no meals) over the last `days` days, today included. */
export function mealStats(rows, today, days = 7) {
  const from = addDays(today, -(days - 1));
  const inWindow = rows.filter((r) => r.date >= from && r.date <= today);
  const meals = inWindow.filter((r) => r.outcome === 'ate');
  const pct = (n) => (meals.length ? Math.round((n / meals.length) * 100) : null);
  const share = {};
  for (const c of REVIEW_CHECKS) share[c.id] = pct(meals.filter((r) => isSet(r[c.id])).length);
  share.focused = pct(meals.filter((r) => distractionsOf(r).length === 0).length);

  const counts = {};
  for (const r of meals) for (const d of distractionsOf(r)) counts[d] = (counts[d] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  return {
    meals: meals.length,
    mindful: pct(meals.filter(isMindful).length),
    alternatives: inWindow.filter((r) => r.outcome === 'alternative').length,
    anxious: inWindow.filter((r) => r.feeling === 'anxious').length,
    share,
    topDistraction: top ? { id: top[0], count: top[1] } : null,
  };
}
