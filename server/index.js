/**
 * Standalone server for `npm start`: serves the built app from dist/ and the
 * same CSV API the dev server exposes. Local use only — it binds to loopback
 * and has no auth, because the data it serves is personal.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import { handleApi } from './api.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const PORT = Number(process.env.PORT) || 5174;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  // normalize + prefix check keeps ../ out of the served tree.
  const candidate = normalize(join(DIST, decodeURIComponent(pathname)));
  const target = candidate.startsWith(DIST) ? candidate : DIST;

  let file = target;
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = join(file, 'index.html');
    await fs.access(file);
  } catch {
    file = join(DIST, 'index.html'); // SPA fallback
  }

  try {
    await fs.access(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Run `npm run build` first.');
    return;
  }

  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  handleApi(req, res)
    .then((handled) => (handled ? null : serveStatic(req, res)))
    .catch((err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(err));
    });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`dashboard on http://127.0.0.1:${PORT}`);
});
