/**
 * One-time import: ../notes_weight.csv  ->  data/body_entries.csv
 *
 * The notes file is a hand-kept log — a header sentence, then one line per
 * weigh-in where the first field is the weight in kg and the rest is a
 * free-form Spanish note. Steps and set counts are pulled out of that note
 * where they are stated plainly; everything else is preserved verbatim in the
 * `note` column so no context is lost.
 *
 *   node scripts/seed-weight.mjs [--force]
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import { parseGrid, serialize } from '../server/csv.js';
import { DATA_DIR, TABLES } from '../server/api.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '..', '..', 'notes_weight.csv');
const TARGET = resolve(DATA_DIR, 'body_entries.csv');

const force = process.argv.includes('--force');

/** "29 000 pasos" / "45589 paso" -> 29000 / 45589 */
function readSteps(note) {
  const m = note.match(/camin\w*\s+([\d][\d\s.]*)\s*pasos?/i);
  if (!m) return 0;
  return Number(m[1].replace(/[^\d]/g, '')) || 0;
}

/** "3*20 espadasos" -> 3 sets. A count with no leading number cannot be read. */
function readSets(note, word) {
  const m = note.match(new RegExp(`(\\d+)\\s*\\*\\s*\\d+\\s*${word}`, 'i'));
  return m ? Number(m[1]) : 0;
}

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const raw = await fs.readFile(SOURCE, 'utf8');
// Read it as a bare grid: line 1 of this file is a sentence, not a header, and
// the rows have wildly different field counts.
const lines = parseGrid(raw);

const parsed = [];
const skipped = [];
for (const line of lines) {
  const weight = Number(String(line[0] ?? '').trim());
  const note = line.slice(1).join(',').replace(/\s+/g, ' ').trim();
  if (!weight) {
    skipped.push(note || String(line[0] ?? '').trim());
    continue;
  }
  parsed.push({ weight, note });
}

if (!parsed.length) {
  console.error('No weighed rows found in', SOURCE);
  process.exit(1);
}

// The notes carry no dates, only order — assign consecutive days ending today.
const today = new Date();
const entries = parsed.map((p, i) => {
  const d = new Date(today);
  d.setDate(d.getDate() - (parsed.length - 1 - i));
  return {
    date: key(d),
    steps: String(readSteps(p.note)),
    sword_sets: String(readSets(p.note, 'espadasos')),
    pushup_sets: String(readSets(p.note, 'lagartijas')),
    stretch_breaks: '0',
    weight: String(p.weight),
    note: p.note,
  };
});

try {
  await fs.access(TARGET);
  if (!force) {
    console.error(`${TARGET} already exists. Re-run with --force to overwrite it.`);
    process.exit(1);
  }
} catch { /* nothing there yet, good */ }

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.writeFile(TARGET, serialize(TABLES.body_entries, entries), 'utf8');

console.log(`Wrote ${entries.length} entries to ${TARGET}`);
for (const e of entries) {
  console.log(`  ${e.date}  ${e.weight} kg  steps=${e.steps} sword=${e.sword_sets} pushups=${e.pushup_sets}`);
}
if (skipped.length) console.log(`\nSkipped ${skipped.length} line(s) with no weight.`);
console.log(
  '\n⚠  notes_weight.csv has no dates, so the days above were assigned as ' +
  `${entries.length} consecutive days ending today. Open the CSV and correct them ` +
  'if the real weigh-ins were spread out differently — everything downstream ' +
  '(streak, chain, trend) is keyed on those dates.',
);
