import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { todayKey } from '../lib/dates.js';
import {
  MARKS,
  blankDay,
  buildIndex,
  count,
  focusKey,
  isSet,
  listOf,
  newId,
  nowTime,
  pickDay,
  weakest,
  weekStart,
} from '../lib/food-rules.js';
import { useSettings, useTable } from '../lib/use-table.js';
import Progress from './food/Progress.jsx';
import Today from './food/Today.jsx';
import './food/food.css';

/* =====================================================================
   Comer con calma: the day's 7 marks, meals, slips (tropiezos), a calorie
   counter, a daily challenge and progress, on one page. Saved to
   data/food_*.csv via the CSV API (meals, days, slips, log, settings).
   ===================================================================== */

const go = (id) =>
  document.getElementById(id)?.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });

const byDate = (a, b) => a.date.localeCompare(b.date);
const stamp = (date) => ({ id: newId(), timestamp: new Date().toISOString(), date, time: nowTime() });

export default function Food() {
  const [meals, setMeals, mealsReady] = useTable('food_meals');
  const [days, setDays, daysReady] = useTable('food_days');
  const [slips, setSlips, slipsReady] = useTable('food_slips');
  const [log, setLog, logReady] = useTable('food_log');
  const [settings, setSetting, settingsReady] = useSettings('food_settings');
  const ready = mealsReady && daysReady && slipsReady && logReady && settingsReady;

  const [toastMsg, setToastMsg] = useState('');
  const tt = useRef(null);
  const toast = useCallback((m) => {
    setToastMsg(m);
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToastMsg(''), 2200);
  }, []);
  useEffect(() => () => clearTimeout(tt.current), []);

  const ix = useMemo(() => buildIndex(meals, days, slips, log), [meals, days, slips, log]);
  const fk = focusKey(ix, settings);

  // Pin the habit of the week once per week, so it doesn't drift as you tick things.
  useEffect(() => {
    if (!ready || settings.focusWeek === weekStart()) return;
    setSetting('focusHabit', weakest(ix));
    setSetting('focusWeek', weekStart());
  }, [ready, settings.focusWeek, setSetting, ix]);

  const today = ready ? count(ix, todayKey()) : 0;
  const prev = useRef(null);
  useEffect(() => {
    if (!ready) return;
    if (prev.current != null && today > prev.current) {
      toast(today === MARKS ? '¡Día completo!' : today === 4 ? '¡Día de avance! Tu racha sigue.' : '¡Bien! Una más.');
    }
    prev.current = today;
  }, [ready, today, toast]);

  /* ---- writes ---- */
  const patchDay = useCallback((date, fn) => {
    setDays((rows) => {
      const cur = rows.find((r) => r.date === date) ?? blankDay(date);
      const next = { ...cur, ...fn(cur) };
      return [...rows.filter((r) => r.date !== date), next].sort(byDate);
    });
  }, [setDays]);

  const act = {
    patchDay,
    toggleHabit: (date, k) => patchDay(date, (r) => {
      const hs = listOf(r.habits);
      return { habits: (hs.includes(k) ? hs.filter((x) => x !== k) : [...hs, k]).join(' ') };
    }),
    /** fn gets and returns { id, done }; the first touch stores the day's pick. */
    setChallenge: (date, fn) => patchDay(date, (r) => {
      const n = fn({ id: r.challenge || pickDay(date), done: isSet(r.challenge_done) });
      return { challenge: n.id, challenge_done: n.done ? '1' : '' };
    }),
    setFocus: (k) => { setSetting('focusHabit', k); setSetting('focusWeek', weekStart()); },
    addMeal: (date, fields) => setMeals((rows) => [...rows, { ...stamp(date), type: 'c', ...fields }]),
    patchMeal: (id, fields) => setMeals((rows) => rows.map((r) => (r.id === id ? { ...r, ...fields } : r))),
    removeMeal: (id) => setMeals((rows) => rows.filter((r) => r.id !== id)),
    addSlip: (date, fields) => setSlips((rows) => [...rows, { ...stamp(date), ...fields }].sort(byDate)),
    removeSlip: (id) => setSlips((rows) => rows.filter((r) => r.id !== id)),
    addLog: (date, fields) => setLog((rows) => [...rows, { ...stamp(date), ...fields }].sort(byDate)),
    removeLog: (id) => setLog((rows) => rows.filter((r) => r.id !== id)),
    setCfg: (key, value) => setSetting(key, value),
  };

  return (
    <div className="cc">
      <div className="bar"><div>
        <div className="bl">
          <span>Hoy {today}/{MARKS}</span>
          <div className="track"><b style={{ width: `${(today / MARKS) * 100}%` }} /></div>
        </div>
        <div className="chips">
          <button type="button" onClick={() => go('s-hoy')}>Mi día</button>
          <button type="button" className="hot" onClick={() => go('s-slip')}>Tropiezo</button>
          <button type="button" onClick={() => go('s-prog')}>Progreso</button>
        </div>
      </div></div>
      <div id="toast" className={toastMsg ? 'on' : ''} role="status" aria-live="polite">{toastMsg}</div>
      <div className="wrap"><main>
        {!ready ? (
          <p className="mut">Cargando…</p>
        ) : (
          <>
            <Today ix={ix} fk={fk} settings={settings} act={act} toast={toast} />
            <Progress ix={ix} settings={settings} />
          </>
        )}
      </main></div>
    </div>
  );
}
