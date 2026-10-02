/**
 * Minimal RFC 4180 CSV reader/writer.
 *
 * Hand-rolled on purpose: the notes in these files are free-form Spanish that
 * contains commas, quotes and the occasional newline, so a naive split(',')
 * would corrupt them — but pulling in a parser dependency for ~80 lines of
 * well-understood code is not worth it either.
 */

/** Parse CSV text into { columns, rows } where each row is a plain object. */
export function parse(text) {
  const table = parseGrid(text);
  if (!table.length) return { columns: [], rows: [] };
  const columns = table[0];
  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    // A trailing newline yields one empty cell — that is not a row.
    if (cells.length === 1 && cells[0] === '') continue;
    const row = {};
    columns.forEach((c, j) => { row[c] = cells[j] ?? ''; });
    rows.push(row);
  }
  return { columns, rows };
}

/**
 * Rows of raw cells, with no header interpretation. Useful for files that were
 * not written by this app and may not start with a header row.
 */
export function parseGrid(text) {
  const src = text.replace(/^﻿/, '');
  const grid = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); grid.push(row); row = []; };

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue; }
    if (ch === ',') { endField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) endRow();
  return grid;
}

/** Serialize rows to CSV text using the given column order. */
export function serialize(columns, rows) {
  const lines = [columns.map(cell).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  return lines.join('\n') + '\n';
}

function cell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
