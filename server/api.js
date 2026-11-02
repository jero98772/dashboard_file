/**
 * The whole backend: GET/PUT /api/<table>, backed by one CSV file per table
 * in dashboard/data/. Exported as a plain Node handler so it can be mounted
 * both on Vite's dev server and on a standalone http server, with no
 * framework dependency.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import { parse, serialize } from './csv.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(HERE, '..', 'data');

/**
 * Column order per table. Declared here so every write produces a stable,
 * diffable file no matter what order the client sends its keys in.
 */
export const TABLES = {
  food_meals: [
    'id', 'timestamp', 'date', 'time', 'sitting', 'waited30', 'distracted', 'distractions',
    'distraction_other', 'small', 'sugar', 'lowered', 'feeling', 'craving_id', 'with_whom',
    'bad_influence', 'note', 'type',
  ],
  food_cravings: [
    'id', 'timestamp', 'date', 'feeling', 'waited10', 'strategies', 'observed30', 'outcome',
    'alternative', 'note',
  ],
  food_days: [
    'date', 'water', 'weight', 'weight_note', 'habits', 'who', 'note', 'up', 'challenge', 'challenge_done',
  ],
  food_slips: ['id', 'timestamp', 'date', 'time', 'food', 'why', 'amount'],
  // Calorie counter: kind is `food` (eaten) or `ex` (exercise).
  food_log: ['id', 'timestamp', 'date', 'time', 'kind', 'name', 'minutes', 'kcal'],
  food_settings: ['key', 'value'],
  body_entries: ['date', 'steps', 'sword_sets', 'pushup_sets', 'stretch_breaks', 'weight', 'note'],
  body_settings: ['key', 'value'],
  freedom_days: ['date', 'status'],
  freedom_logs: ['timestamp', 'date', 'type', 'location', 'note'],
  freedom_settings: ['key', 'value'],
  // `done` is a space-separated list of routine item ids, in ITEMS order.
  routine_days: ['date', 'done', 'woke', 'slept'],
  routine_settings: ['key', 'value'],
  learning_log: ['id', 'date', 'time', 'topic', 'format', 'minutes', 'title', 'sample', 'created'],
};

const filePath = (table) => join(DATA_DIR, `${table}.csv`);

export async function readTable(table) {
  const columns = TABLES[table];
  try {
    const text = await fs.readFile(filePath(table), 'utf8');
    const { rows } = parse(text);
    return { columns, rows };
  } catch (err) {
    // A table nobody has written yet is empty, not an error.
    if (err.code === 'ENOENT') return { columns, rows: [] };
    throw err;
  }
}

export async function writeTable(table, rows) {
  const columns = TABLES[table];
  await fs.mkdir(DATA_DIR, { recursive: true });
  const target = filePath(table);
  const tmp = `${target}.${process.pid}.tmp`;
  // Write-then-rename: a crash mid-write can never leave a truncated log.
  await fs.writeFile(tmp, serialize(columns, rows), 'utf8');
  await fs.rename(tmp, target);
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) fail(new Error('payload too large'));
    });
    req.on('end', () => ok(raw));
    req.on('error', fail);
  });
}

/**
 * Returns true when the request was an /api/ one and has been answered, so
 * callers can fall through to their own handling otherwise.
 */
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  const table = url.pathname.slice('/api/'.length);
  // Whitelist lookup, never a path join on user input.
  if (!Object.hasOwn(TABLES, table)) {
    send(res, 404, { error: `unknown table: ${table}` });
    return true;
  }

  try {
    if (req.method === 'GET') {
      send(res, 200, await readTable(table));
      return true;
    }
    if (req.method === 'PUT') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!Array.isArray(body.rows)) {
        send(res, 400, { error: 'body must be { rows: [...] }' });
        return true;
      }
      await writeTable(table, body.rows);
      send(res, 200, { ok: true, count: body.rows.length });
      return true;
    }
    send(res, 405, { error: `${req.method} not allowed` });
  } catch (err) {
    send(res, 500, { error: String(err && err.message ? err.message : err) });
  }
  return true;
}

/** Vite plugin: mounts the same handler on the dev and preview servers. */
export function csvApiPlugin() {
  const mount = (server) => {
    server.middlewares.use((req, res, next) => {
      handleApi(req, res).then((handled) => { if (!handled) next(); }).catch(next);
    });
  };
  return {
    name: 'csv-api',
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

/**
 * Vite plugin for the static (GitHub Pages) build: snapshots every table into
 * the bundle as data/<table>.json, so the app can run with no server.
 */
export function csvSnapshotPlugin() {
  return {
    name: 'csv-snapshot',
    apply: 'build',
    async generateBundle() {
      for (const table of Object.keys(TABLES)) {
        this.emitFile({
          type: 'asset',
          fileName: `data/${table}.json`,
          source: JSON.stringify(await readTable(table)),
        });
      }
    },
  };
}
