/**
 * The fixed daily routine — its items and everything derived from them —
 * kept apart from the view so the Overview can read the same CSV rows.
 *
 * Nothing derived is stored: chains, best chain and votes are all recomputed
 * from the check-ins in data/routine_days.csv, so fixing a past day by hand
 * always produces a consistent result.
 */
import { addDays, daysBetween } from './dates.js';

const at = (h, mi) => h * 60 + mi;

/**
 * `t` is the start minute of the day, `e` the end for anything that occupies a
 * block rather than a moment. `brk` marks the 5-minute break that follows a
 * learning block. Times are local minutes-since-midnight, never dates: the
 * routine is the same every day.
 */
export const ITEMS = [
  { id: 'wake', name: 'Wake up', t: at(6, 0), stack: 'Alarm across the room. Stand up, turn it off, drink water.' },
  { id: 'learn1', name: 'Learn, block 1', t: at(6, 0), e: at(6, 25), learn: true, brk: true, detail: 'Course, reading or video', stack: 'After the water, I sit down and start block 1.' },
  { id: 'learn2', name: 'Learn, block 2', t: at(6, 30), e: at(6, 55), learn: true, brk: true, detail: 'Course, reading or video', stack: 'After the 5-minute break, I start block 2.' },
  { id: 'learn3', name: 'Learn, block 3', t: at(7, 0), e: at(7, 25), learn: true, brk: true, detail: 'Course, reading or video', stack: 'After the break, I start block 3.' },
  { id: 'learn4', name: 'Learn, block 4', t: at(7, 30), e: at(7, 55), learn: true, detail: 'Course, reading or video', stack: 'After the break, I start the last block.' },
  { id: 'shower', name: 'Shower, cologne, sunscreen', t: at(7, 55), e: at(8, 30), stack: 'After block 4, I go straight to the shower. Cologne and sunscreen come last.' },
  { id: 'leave', name: 'Leave home', t: at(8, 30), detail: 'Walk to Lela’s house or the university', stack: 'After sunscreen, I put on my shoes and walk out.' },
  { id: 'lunch', name: 'Lunch', t: at(12, 15), stack: 'Sit down and eat.' },
  { id: 'teeth1', name: 'Brush teeth', t: at(13, 0), stack: 'After lunch, I brush my teeth.' },
  { id: 'sword', name: 'Longsword strength training', t: at(19, 0), e: at(19, 55), detail: 'Gym-style workout', stack: 'Gear is ready by the door. Warm up, then train for 55 minutes.' },
  { id: 'teeth2', name: 'Brush teeth, stop eating', t: at(19, 55), stack: 'After training, I brush my teeth. The kitchen is closed for the night.' },
  { id: 'walk', name: 'Walk with Chakur, shave', t: at(20, 0), e: at(21, 0), stack: 'Walk with Chakur first. Shave when I am back.' },
  { id: 'shower2', name: 'Shower', t: at(21, 0), e: at(21, 30), stack: 'After shaving, I shower.' },
  { id: 'nosc', name: 'No screens', t: at(21, 30), e: at(22, 0), detail: 'Where and what: see the plan below', stack: 'The phone goes on the charger outside the bedroom. Then I follow the plan below.' },
  { id: 'boxers', name: 'Wear boxers', t: at(21, 30), stack: 'Boxers on.' },
  { id: 'sleep', name: 'Go to sleep', t: at(22, 0), stack: 'Lights out. Tomorrow starts at 6.' },
];

export const ITEM_IDS = ITEMS.map((i) => i.id);
export const N = ITEMS.length;

/** A day counts towards the chain at this many ticks. */
export const THRESHOLD = 12;
export const MILESTONES = [3, 7, 14, 21, 30];

export const FOCUS_MS = 25 * 60 * 1000;
export const BREAK_MS = 5 * 60 * 1000;

export const DEFAULT_IDENTITY = 'I am someone who shows up at 6 AM.';
export const NIGHT_PLACES = ['In bed, lamp on', 'At the desk', 'On the couch'];

/* ---------- time ---------- */

const pad = (n) => String(n).padStart(2, '0');

/** 390 -> "6:30 AM". */
export const fmtTime = (min) =>
  `${((Math.floor(min / 60) + 11) % 12) + 1}:${pad(min % 60)} ${Math.floor(min / 60) >= 12 ? 'PM' : 'AM'}`;

export const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Milliseconds left on a timer as "MM:SS". */
export const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

/** Which part of the day an item belongs to, used for its accent colour. */
export const phaseOf = (t) =>
  t < at(8, 30) ? 'dawn' : t < at(19, 0) ? 'day' : t < at(21, 0) ? 'dusk' : 'night';

/* ---------- storage shape ---------- */

/** routine_days rows -> { 'YYYY-MM-DD': ['wake', 'learn1', ...] } */
export function rowsToDone(rows) {
  const done = {};
  for (const row of rows) {
    if (!row.date) continue;
    const ticked = new Set(String(row.done || '').split(/\s+/));
    done[row.date] = ITEM_IDS.filter((id) => ticked.has(id));
  }
  return done;
}

/** The inverse. Days are sorted and ids kept in ITEMS order, so diffs stay small. */
export function doneToRows(done) {
  return Object.keys(done)
    .filter((date) => done[date] && done[date].length)
    .sort()
    .map((date) => ({ date, done: ITEM_IDS.filter((id) => done[date].includes(id)).join(' ') }));
}

/* ---------- derived numbers ---------- */

export const countOn = (done, key) => (done[key] ? done[key].length : 0);
export const isChainDay = (done, key) => countOn(done, key) >= THRESHOLD;

/**
 * The chain survives one slipped day; two in a row end it. Walks backwards
 * from today only as far as there is data, so an empty file is not a 4000-day
 * loop.
 */
export function streakInfo(done, today) {
  const recorded = Object.keys(done).sort();
  const floor = recorded.length ? recorded[0] : today;
  const todayOk = isChainDay(done, today);
  let len = todayOk ? 1 : 0;
  let start = todayOk ? today : null;
  let missed = 0;

  for (let d = addDays(today, -1); d >= floor; d = addDays(d, -1)) {
    if (isChainDay(done, d)) {
      len += 1;
      start = d;
      missed = 0;
    } else if (++missed >= 2) {
      break;
    }
  }
  return { len, start, todayOk };
}

/** Longest run of chain days, allowing the same one-day forgiveness. */
export function bestStreak(done) {
  const keys = Object.keys(done).filter((k) => isChainDay(done, k)).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    run = prev && daysBetween(prev, k) <= 2 ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  return best;
}

export function totalVotes(done) {
  let n = 0;
  for (const key of Object.keys(done)) n += done[key].length;
  return n;
}

/**
 * The one item the day is waiting on: whatever started most recently and is
 * still unticked, else the next one due, else the first thing left behind.
 */
export function computeFocus(doneIds, now) {
  const done = new Set(doneIds);
  let latest = -1;
  for (const it of ITEMS) if (it.t <= now && it.t > latest) latest = it.t;

  if (latest >= 0) {
    const due = ITEMS.find((it) => it.t === latest && !done.has(it.id));
    if (due) return { item: due, kind: 'due', latest };
  }
  const upcoming = ITEMS.find((it) => it.t > now && !done.has(it.id));
  if (upcoming) return { item: upcoming, kind: 'upcoming', latest };

  const late = ITEMS.find((it) => !done.has(it.id));
  return late ? { item: late, kind: 'late', latest } : null;
}

/* ---------- rewards ---------- */

/** Settings hold one `reward.<days>` key per milestone. */
export const rewardFor = (settings, days) => settings[`reward.${days}`] || '';

/**
 * Claimed milestones only count for the chain they were claimed in, so a
 * broken chain puts every reward back on the board.
 */
export function claimedIn(settings, chainStart) {
  if (!chainStart || settings.claimChainStart !== chainStart) return new Set();
  return new Set(String(settings.claimed || '').split(/\s+/).filter(Boolean).map(Number));
}
