/**
 * Talks to the CSV API. Every table is loaded once and then written back in
 * full on change — these files are a few hundred rows at most, so a whole-file
 * PUT is simpler and safer than a row-level protocol.
 *
 * Writes are debounced and mirrored into localStorage. The mirror is what
 * makes a stopped server a degradation rather than a lost day: the UI keeps
 * working, and the next successful load prefers whichever copy is newer.
 */
const DEBOUNCE_MS = 400;
const mirrorKey = (table) => `dashboard-mirror:${table}`;

const pending = new Map(); // table -> { rows, timer }
const inFlight = new Map(); // table -> Promise

const listeners = new Set();
let online = true;

/** Subscribe to online/offline changes of the CSV backend. */
export function onStatus(fn) {
  listeners.add(fn);
  fn(online);
  return () => listeners.delete(fn);
}

function setOnline(next) {
  if (online === next) return;
  online = next;
  for (const fn of listeners) fn(online);
}

export const isOnline = () => online;

function readMirror(table) {
  try {
    const raw = localStorage.getItem(mirrorKey(table));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed; // { rows, savedAt, dirty }
  } catch {
    return null;
  }
}

function writeMirror(table, rows, dirty) {
  try {
    localStorage.setItem(
      mirrorKey(table),
      JSON.stringify({ rows, savedAt: Date.now(), dirty }),
    );
  } catch {
    /* private mode or quota: the server copy is still authoritative */
  }
}

/**
 * Load a table. Falls back to the localStorage mirror when the server is
 * unreachable, and prefers the mirror when it holds writes that never landed.
 */
export async function loadTable(table) {
  const mirror = readMirror(table);
  try {
    const res = await fetch(`/api/${table}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    setOnline(true);
    if (mirror?.dirty) {
      // Unsaved local edits outrank the stale file; push them back up.
      saveTable(table, mirror.rows);
      return mirror.rows;
    }
    writeMirror(table, data.rows, false);
    return data.rows;
  } catch {
    setOnline(false);
    return mirror ? mirror.rows : [];
  }
}

/** Queue a full-table write. Repeated calls inside the window collapse into one. */
export function saveTable(table, rows) {
  writeMirror(table, rows, true);
  const entry = pending.get(table);
  if (entry) clearTimeout(entry.timer);
  const timer = setTimeout(() => flush(table), DEBOUNCE_MS);
  pending.set(table, { rows, timer });
}

async function flush(table) {
  const entry = pending.get(table);
  if (!entry) return;
  pending.delete(table);

  // Never overlap writes to the same file: chain behind the one in flight.
  const prev = inFlight.get(table) ?? Promise.resolve();
  const run = prev.then(async () => {
    try {
      const res = await fetch(`/api/${table}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: entry.rows }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setOnline(true);
      writeMirror(table, entry.rows, false);
    } catch {
      setOnline(false); // mirror stays dirty and is retried on next load
    }
  });
  inFlight.set(table, run);
  await run;
  if (inFlight.get(table) === run) inFlight.delete(table);
}

/** Force every queued write out now (used on page hide). */
export function flushAll() {
  for (const table of [...pending.keys()]) {
    clearTimeout(pending.get(table).timer);
    flush(table);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}
