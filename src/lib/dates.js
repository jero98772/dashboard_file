/**
 * Shared date helpers. All three sections key their data by local calendar
 * day as YYYY-MM-DD; using toISOString() instead would silently shift the day
 * for anyone west of UTC, which is how a clean streak gets lost at 7pm.
 */
const pad = (n) => String(n).padStart(2, '0');

export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayKey = () => toKey(new Date());

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** YYYY-MM-DD for n days before today. */
export const offsetKey = (n) => addDays(todayKey(), -n);

export const daysBetween = (a, b) =>
  Math.round((parseKey(b) - parseKey(a)) / 86400000);
