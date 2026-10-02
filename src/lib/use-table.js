import { useCallback, useEffect, useRef, useState } from 'react';

import { loadTable, onStatus, saveTable } from './csv-store.js';

/**
 * A CSV table as React state.
 *
 * Returns [rows, setRows, ready]. `ready` is false until the first load
 * resolves, so a section can avoid rendering an empty chart — and, more
 * importantly, avoid writing an empty array over a file it has not read yet.
 */
export function useTable(table) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    loadTable(table).then((loaded) => {
      if (!alive) return;
      setRows(loaded);
      readyRef.current = true;
      setReady(true);
    });
    return () => { alive = false; };
  }, [table]);

  const update = useCallback((next) => {
    setRows((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      // Guard against clobbering the file with [] before the load lands.
      if (readyRef.current) saveTable(table, value);
      return value;
    });
  }, [table]);

  return [rows, update, ready];
}

/**
 * A key/value table (settings) as a plain object, with the same persistence.
 * Values are stored as strings — the CSV has no types — so callers coerce.
 *
 * Returns [values, set, ready, clear]; setting a key to '' removes its row
 * rather than storing a blank, which keeps the file free of dead keys.
 */
export function useSettings(table) {
  const [rows, setRows, ready] = useTable(table);

  const values = {};
  for (const row of rows) if (row.key) values[row.key] = row.value ?? '';

  const set = useCallback((key, value) => {
    setRows((prev) => {
      const kept = prev.filter((r) => r.key !== key);
      if (value === null || value === undefined || value === '') return kept;
      return [...kept, { key, value: String(value) }].sort((a, b) => a.key.localeCompare(b.key));
    });
  }, [setRows]);

  const clear = useCallback(() => setRows([]), [setRows]);

  return [values, set, ready, clear];
}

/** Tracks whether the CSV backend is reachable, for the header indicator. */
export function useBackendStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => onStatus(setOnline), []);
  return online;
}
