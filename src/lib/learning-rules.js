/**
 * Rules for the Learning section (Learning Quest), kept apart from the view
 * so the Overview can score the same rows of data/learning_log.csv.
 *
 * XP = minutes × format weight. Level n starts at 150·(n−1)² XP. The streak
 * counts consecutive local days with at least one entry, ending today (or
 * yesterday if nothing is logged yet today).
 */
import { sum } from 'd3-array';

import { addDays, todayKey } from './dates.js';

export const TOPICS = [
  ['Quantum', 'quantum'], ['Thermodynamics', 'thermo'], ['Photonics', 'photonics'], ['LLVM', 'llvm'],
  ['Programming semantics', 'sem'], ['AI', 'ai'], ['LLM', 'llm'], ['Digital signal processing', 'dsp'],
  ['Open-source integration', 'os'], ['Build a company', 'co'], ['Math', 'math'],
];
export const FORMATS = ['Conference', 'Video', 'Article', 'Book', 'Course', 'Script', 'Project'];
export const MULT = { Conference: 1.5, Video: 1, Article: 1, Book: 1.2, Course: 1.5, Script: 1.5, Project: 2 };
const KEY = Object.fromEntries(TOPICS);
export const col = (t) => `var(--t-${KEY[t] || 'sem'})`;
export const xpFor = (minutes, format) => Math.round(minutes * (MULT[format] || 1));

const pad = (n) => String(n).padStart(2, '0');
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const byRecent = (a, b) => { const ka = a.date + a.time, kb = b.date + b.time; return ka < kb ? 1 : ka > kb ? -1 : 0; };

export const newId = () => Math.random().toString(16).slice(2, 10);

/** CSV rows (all strings) -> scored entries. */
export function toScored(rows) {
  return rows.filter((e) => e.date).map((e) => {
    const m = Number(e.minutes) || 0;
    const f = e.format === 'Script project' ? 'Project' : e.format;
    return {
      id: e.id, date: String(e.date), time: String(e.time || '12:00').slice(0, 5), topic: e.topic, format: f,
      minutes: m, title: String(e.title || ''), sample: e.sample === 'true' || e.sample === true, xp: xpFor(m, f),
    };
  });
}

function levelOf(xp) {
  const level = Math.floor(Math.sqrt(xp / 150)) + 1;
  const lo = 150 * (level - 1) * (level - 1), hi = 150 * level * level;
  return { level, toNext: hi - xp, pct: Math.round(((xp - lo) / (hi - lo)) * 100) };
}

function streakOf(dates, today) {
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function derive(S) {
  const xp = sum(S, (r) => r.xp);
  const dates = new Set(S.map((r) => r.date));
  const today = todayKey();
  const explored = new Set(S.map((r) => `${r.topic}|${r.format}`)).size;
  return {
    xp, ...levelOf(xp), streak: streakOf(dates, today), days: dates.size, entries: S.length,
    explored, total: TOPICS.length * FORMATS.length, today,
  };
}

/** For the Overview: last `days` days plus the all-time level and streak. */
export function learningStats(rows, today, days = 7) {
  const S = toScored(rows);
  const from = addDays(today, -(days - 1));
  const recent = S.filter((r) => r.date >= from && r.date <= today);
  const xp = sum(S, (r) => r.xp);
  return {
    minutes: sum(recent, (r) => r.minutes),
    weekXp: sum(recent, (r) => r.xp),
    entries: recent.length,
    xp,
    level: levelOf(xp).level,
    streak: streakOf(new Set(S.map((r) => r.date)), today),
  };
}

export function toCsv(S) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = S.slice().sort((a, b) => -byRecent(a, b));
  return ['date,time,topic,format,minutes,xp,title']
    .concat(rows.map((r) => [r.date, r.time, q(r.topic), q(r.format), r.minutes, r.xp, q(r.title)].join(',')))
    .join('\n') + '\n';
}

const SAMPLE_TITLES = {
  Quantum: ['Quantum error correction primer', 'Qubits and the Bloch sphere'],
  Thermodynamics: ['Entropy and the second law', 'Heat engines and the Carnot cycle'],
  Photonics: ['Silicon photonics waveguides', 'Mach-Zehnder interferometers'],
  LLVM: ['Writing an LLVM pass', 'LLVM IR in depth'],
  'Programming semantics': ['Operational semantics notes', 'Type systems and soundness'],
  AI: ['Reinforcement learning intro', 'Neural network optimization'],
  LLM: ['Transformer attention explained', 'Building an eval harness'],
  'Digital signal processing': ['FFT from scratch', 'FIR filter design'],
  'Open-source integration': ['Contributing to an upstream repo', 'Packaging a Python library'],
  'Build a company': ['Customer discovery interviews', 'Pricing and unit economics'],
  Math: ['Linear algebra refresher', 'Probability and Bayes'],
};

/** ~90 days of deterministic fake entries, as CSV rows, flagged sample=true. */
export function sampleRows() {
  let s = 7;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a, w) => { const tot = w.reduce((x, y) => x + y, 0); let r = rnd() * tot; for (let i = 0; i < a.length; i++) { r -= w[i]; if (r <= 0) return a[i]; } return a[a.length - 1]; };
  const tn = TOPICS.map((t) => t[0]);
  const tw = [6, 3, 4, 7, 4, 12, 12, 5, 6, 5, 8];
  const fw = [2, 30, 24, 10, 10, 8, 10];
  const mr = { Conference: [60, 240], Video: [20, 70], Article: [10, 40], Book: [30, 90], Course: [40, 120], Script: [20, 90], Project: [45, 180] };
  const hr = { Conference: [9, 16], Video: [19, 23], Article: [7, 13], Book: [21, 23], Course: [7, 20], Script: [18, 23], Project: [14, 23] };
  const out = [];
  const today = todayKey();
  for (let i = 88; i >= 0; i--) {
    const date = addDays(today, -i);
    const wd = (new Date(`${date}T12:00`).getDay() + 6) % 7;
    if (rnd() < (wd < 5 ? 0.72 : 0.45)) {
      const k = [1, 1, 1, 2, 2, 3][Math.floor(rnd() * 6)];
      for (let j = 0; j < k; j++) {
        const t = pick(tn, tw), f = pick(FORMATS, fw), m = mr[f], hh = hr[f];
        const minutes = m[0] + 5 * Math.floor(rnd() * ((m[1] - m[0]) / 5 + 1));
        const H = hh[0] + Math.floor(rnd() * (hh[1] - hh[0] + 1));
        const M = 5 * Math.floor(rnd() * 12);
        out.push({
          id: `sample-${out.length}`, date, time: `${pad(H)}:${pad(M)}`, topic: t, format: f, minutes: String(minutes),
          title: SAMPLE_TITLES[t][Math.floor(rnd() * 2)], sample: 'true', created: String(Date.now() + out.length),
        });
      }
    }
  }
  return out;
}
