import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  calcStreak,
  computePoints,
  describeTrend,
  entriesToRows,
  goalProgress,
  realisticForecast,
  rowsToEntries,
  shortLabel,
  weeksLabel,
  weightTrend,
  withTrend,
} from '../lib/body-rules.js';
import { flushAll } from '../lib/csv-store.js';
import { addDays, todayKey } from '../lib/dates.js';
import { mealStats } from '../lib/food-rules.js';
import { learningStats } from '../lib/learning-rules.js';
import {
  computeStreak,
  dayCongrats,
  deriveStats,
  getLevelInfo,
  nextPhase,
  phaseFor,
  rowsToHeatmap,
  rowsToLogs,
  streakDayMap,
} from '../lib/freedom-rules.js';
import {
  N as ROUTINE_ITEMS,
  SLEEP_TARGET,
  THRESHOLD as ROUTINE_THRESHOLD,
  WAKE_TARGET,
  clockToMinutes,
  fmtTime,
  patchDay,
  rowsToDone as rowsToRoutineDone,
  rowsToTimes,
  withTick,
  streakInfo as routineStreak,
  totalVotes as routineVotes,
} from '../lib/routine-rules.js';
import { useSettings, useTable } from '../lib/use-table.js';

/* ---------------------------------------------------------------------- */
/*  Palette                                                                */
/*  The two categorical hues below were validated for the dark surface     */
/*  #0f172a: lightness band, chroma floor, CVD separation (ΔE 12.5 protan) */
/*  and contrast all pass. Do not swap them for lighter Tailwind steps —   */
/*  the 400/500 tints sit above the band and fail.                         */
/* ---------------------------------------------------------------------- */
const SURFACE = '#0f172a';
const FOOD = '#0d9488';
const BODY = '#d97706';
const WEIGHT = '#38bdf8';
const GOAL = '#f43f5e';
const FREEDOM = '#3fb950';
const ROUTINE = '#9599f0';
const LEARNING = '#3b6bf0';
const INK = '#f1f5f9';
const MUTED = '#94a3b8';
const GRID = '#1e293b';
const TREND = '#94a3b8';

const DAYS = 14;

export default function Overview({ onOpen }) {
  const [foodRows] = useTable('food_meals');
  const [foodSlips] = useTable('food_slips');
  const [bodyRows, setBodyRows] = useTable('body_entries');
  const [bodySettings] = useSettings('body_settings');
  const [freedomDays] = useTable('freedom_days');
  const [freedomLogs] = useTable('freedom_logs');
  const [routineRows, setRoutineRows] = useTable('routine_days');
  const [learningRows] = useTable('learning_log');

  const today = todayKey();
  const goalWeight = Number(bodySettings.goalWeight) || 70;

  /* ---- food ---- */
  const food = useMemo(() => mealStats(foodRows, today, 7, foodSlips), [foodRows, foodSlips, today]);

  /* ---- learning ---- */
  const learning = useMemo(() => learningStats(learningRows, today, 7), [learningRows, today]);

  /* ---- body ---- */
  const body = useMemo(() => {
    const entries = rowsToEntries(bodyRows);
    const latest = entries.length ? entries[entries.length - 1] : null;
    const start = entries.length ? entries[0] : null;
    return {
      entries,
      latest,
      lost: start && latest ? +(start.weight - latest.weight).toFixed(1) : 0,
      toGoal: latest ? +(latest.weight - goalWeight).toFixed(1) : null,
      goal: goalProgress(entries, goalWeight),
      outlook: realisticForecast(entries, goalWeight),
      streak: calcStreak(entries),
      pointsToday: entries.filter((e) => e.date === today).map(computePoints)[0] ?? 0,
    };
  }, [bodyRows, goalWeight, today]);

  /* ---- freedom ---- */
  const freedom = useMemo(() => {
    const heatmap = rowsToHeatmap(freedomDays);
    const logs = rowsToLogs(freedomLogs);
    const stats = deriveStats(logs);
    const streak = computeStreak(heatmap);
    return {
      heatmap,
      streak,
      ...stats,
      level: getLevelInfo(stats.xp),
      congrats: dayCongrats(streak),
      phase: phaseFor(streak),
      upcoming: nextPhase(streak),
    };
  }, [freedomDays, freedomLogs]);

  /* ---- routine ---- */
  const routine = useMemo(() => {
    const done = rowsToRoutineDone(routineRows);
    const { len } = routineStreak(done, today);
    return { ticks: (done[today] ?? []).length, chain: len, votes: routineVotes(done) };
  }, [routineRows, today]);

  /* ---- chart series ---- */
  const trend = useMemo(() => weightTrend(body.entries, goalWeight), [body.entries, goalWeight]);

  const weightSeries = useMemo(
    () => withTrend(
      body.entries
        .filter((e) => e.weight > 0)
        .map((e) => ({ date: e.date, label: shortLabel(e.date), weight: e.weight })),
      trend,
    ),
    [body.entries, trend],
  );

  const pointsSeries = useMemo(() => {
    const byDate = new Map(body.entries.map((e) => [e.date, computePoints(e)]));
    const out = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = addDays(today, -i);
      out.push({
        date,
        label: shortLabel(date),
        body: byDate.get(date) ?? 0,
      });
    }
    return out;
  }, [body.entries, today]);

  /**
   * One row per calendar day for the freedom strip: its status, which streak
   * day it was, and what was logged on it. The cells and the table below read
   * this same array, so the two can never disagree.
   *
   * The tally counts the log's own `date` column rather than its timestamp —
   * the timestamp is UTC, and slicing it would move a late-night urge onto the
   * next day for anyone west of UTC.
   */
  const freedomSeries = useMemo(() => {
    const dayNumbers = streakDayMap(freedom.heatmap);
    const tally = new Map();
    for (const row of freedomLogs) {
      const date = row.date || String(row.timestamp || '').slice(0, 10);
      if (!date) continue;
      const at = tally.get(date) ?? { urges: 0, wins: 0 };
      if (row.type === 'urge') at.urges += 1;
      else if (row.type === 'win') at.wins += 1;
      tally.set(date, at);
    }
    const out = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = addDays(today, -i);
      const status = freedom.heatmap[date] ?? 'none';
      const day = dayNumbers[date] ?? null;
      const { urges = 0, wins = 0 } = tally.get(date) ?? {};
      out.push({
        date,
        label: shortLabel(date),
        status,
        day,
        urges,
        wins,
        tip:
          status === 'clean' && day ? `${date} — ${dayCongrats(day)}`
          : status === 'relapse' ? `${date} — recaída. Vuelves a empezar, más informado.`
          : `${date} — sin registro`,
      });
    }
    return out;
  }, [freedom.heatmap, freedomLogs, today]);

  /* ---- log today's weight without leaving this page ---- */
  const todayWeight = body.entries.find((e) => e.date === today)?.weight ?? null;
  const [weightInput, setWeightInput] = useState('');
  const [weightError, setWeightError] = useState('');

  function saveWeight(e) {
    e.preventDefault();
    const value = Number(weightInput);
    if (!weightInput.trim() || !Number.isFinite(value) || value <= 0) {
      setWeightError('Type today\u2019s weight first, e.g. 82.1');
      return;
    }
    setWeightError('');
    // One row per day, same as the Body form. Everything else already on
    // today's row (steps, sets, note) is kept — this only sets the weight.
    setBodyRows((prev) => {
      const entries = rowsToEntries(prev);
      const existing = entries.find((en) => en.date === today);
      const rest = entries.filter((en) => en.date !== today);
      return entriesToRows([...rest, { ...(existing ?? BLANK_DAY), date: today, weight: value }]);
    });
    setWeightInput('');
  }

  /* ---- wake-up and bedtime, one press each ---- */
  const times = useMemo(() => rowsToTimes(routineRows), [routineRows]);
  const hourNow = new Date().getHours();
  const yesterday = addDays(today, -1);
  const wokeToday = times[today]?.woke || '';
  // Before noon the sleep time is last night's, so an after-midnight bedtime
  // still closes the previous day.
  const shownSleepDay = times[today]?.slept ? today : hourNow < 12 ? yesterday : today;
  const sleptShown = times[shownSleepDay]?.slept || '';

  const sleepAvg = useMemo(() => {
    const avg = (vals) => (vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null);
    const wakes = []; const beds = [];
    for (let i = 0; i < 7; i++) {
      const t = times[addDays(today, -i)];
      if (!t) continue;
      if (t.woke) wakes.push(clockToMinutes(t.woke));
      if (t.slept) beds.push(clockToMinutes(t.slept, { night: true }));
    }
    return { wake: avg(wakes.filter((v) => v != null)), bed: avg(beds.filter((v) => v != null)) };
  }, [times, today]);

  // Edits stay in a draft until Save; saving a time ticks the routine item and
  // clearing it unticks it.
  const [clockDraft, setClockDraft] = useState(null);
  const [clockSaved, setClockSaved] = useState('');
  const savedTimer = useRef(null);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const wokeValue = clockDraft?.woke ?? wokeToday;
  const sleptValue = clockDraft?.slept ?? sleptShown;
  const clockDirty = wokeValue !== wokeToday || sleptValue !== sleptShown;
  const editClock = (field, value) => setClockDraft((d) => ({ woke: wokeToday, slept: sleptShown, ...d, [field]: value }));

  function saveClock(e) {
    e.preventDefault();
    if (!clockDirty) return;
    const woke = wokeValue;
    const slept = sleptValue;
    setRoutineRows((prev) => {
      let next = prev;
      if (woke !== wokeToday) {
        next = patchDay(next, today, (row) => ({ woke, done: withTick(row.done, 'wake', Boolean(woke)) }));
      }
      if (slept !== sleptShown) {
        next = patchDay(next, shownSleepDay, (row) => ({ slept, done: withTick(row.done, 'sleep', Boolean(slept)) }));
      }
      return next;
    });
    // Write the CSV now rather than after the debounce.
    setTimeout(flushAll, 0);
    setClockDraft(null);
    setClockSaved(`Saved ✓ wake ${woke ? fmtClock(woke) : '—'} · sleep ${slept ? fmtClock(slept) : '—'}`);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setClockSaved(''), 3500);
  }
  const nowHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const hasWeight = weightSeries.length > 1;
  const hasPoints = pointsSeries.some((d) => d.body > 0);

  return (
    <div className="ov-root">
      <style>{CSS}</style>
      <div className="ov-wrap">
        <header className="ov-head">
          <h1 className="ov-title">Today</h1>
          <p className="ov-sub">
            Everything the sections know, on one page. Each number below is recomputed from
            the CSV files in <code>data/</code> — nothing here is stored twice.
          </p>
        </header>

        <p className={`ov-congrats${freedom.phase ? ' is-risk' : ''}`}>
          <span aria-hidden="true">{freedom.phase ? '⚠️' : '🎉'}</span>
          <span>{freedom.congrats}</span>
        </p>

        {/* Stat tiles: single numbers do not need a plot. */}
        <section className="ov-tiles">
          <Tile
            label="current weight"
            value={body.latest ? `${body.latest.weight}` : '—'}
            unit={body.latest ? 'kg' : ''}
            foot={body.lost > 0 ? `${body.lost} kg down since you started` : 'log a weight to start the trend'}
            accent={WEIGHT}
          />
          <Tile
            label={`to your ${goalWeight} kg goal`}
            value={body.toGoal == null ? '—' : body.toGoal <= 0 ? 'reached' : `${body.toGoal}`}
            unit={body.toGoal > 0 ? 'kg' : ''}
            foot={
              body.toGoal > 0
                ? `${body.goal?.percentDone > 0 ? `${body.goal.percentDone}% of the way · ` : ''}${body.outlook?.state === 'projected' ? `likely ${weeksLabel(body.outlook.likely.weeks)}` : 'log a weigh-in to project'}`
                : 'goal met'
            }
            accent={GOAL}
          />
          <Tile
            label="mindful meals, last 7 days"
            value={food.mindful == null ? '—' : `${food.mindful}`}
            unit={food.mindful == null ? '' : '%'}
            foot={food.meals ? `${food.meals} meals · ${food.slips} slips` : 'log a meal to start'}
            accent={FOOD}
          />
          <Tile
            label="training points today"
            value={`${body.pointsToday}`}
            foot={body.streak > 0 ? `${body.streak}-day training chain` : 'nothing logged yet today'}
            accent={BODY}
          />
          <Tile
            label="routine ticks today"
            value={`${routine.ticks}`}
            unit={`/ ${ROUTINE_ITEMS}`}
            foot={
              routine.ticks >= ROUTINE_THRESHOLD
                ? `chain kept — ${routine.chain}-day chain`
                : `${ROUTINE_THRESHOLD - routine.ticks} more keeps today\u2019s chain`
            }
            accent={ROUTINE}
          />
          <Tile
            label="clean streak"
            value={`${freedom.streak}`}
            unit={freedom.streak === 1 ? 'day' : 'days'}
            foot={
              freedom.phase
                ? `⚠ ${freedom.phase.name} (días ${freedom.phase.from}–${freedom.phase.to})`
                : freedom.upcoming
                  ? `${freedom.upcoming.name} en ${freedom.upcoming.inDays} día${freedom.upcoming.inDays === 1 ? '' : 's'}`
                  : `${freedom.urgesResisted} urges resisted · ${freedom.xp} XP`
            }
            accent={FREEDOM}
          />
          <Tile
            label="learning, last 7 days"
            value={`${learning.minutes}`}
            unit="min"
            foot={learning.xp ? `level ${learning.level} · ${learning.xp.toLocaleString('en-US')} XP · ${learning.streak}-day streak` : 'log something you learned to start'}
            accent={LEARNING}
          />
        </section>

        <section className="ov-card">
          <div className="ov-card-head">
            <h2 className="ov-card-title">Log today&rsquo;s weight</h2>
            <p className="ov-card-note">
              {todayWeight
                ? `${today} is logged at ${todayWeight} kg — saving again replaces it.`
                : `Nothing logged for ${today} yet.`}
            </p>
          </div>
          <form className="ov-weigh" onSubmit={saveWeight}>
            <label className="ov-weigh-label" htmlFor="ov-weight">Weight (kg)</label>
            <input
              id="ov-weight"
              className="ov-weigh-input"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={weightInput}
              onChange={(e) => {
                setWeightInput(e.target.value);
                if (weightError) setWeightError('');
              }}
              placeholder={body.latest ? String(body.latest.weight) : 'e.g. 82.1'}
            />
            <button type="submit" className="ov-weigh-save">
              {todayWeight ? 'Update' : 'Save'}
            </button>
            <button type="button" className="ov-weigh-more" onClick={() => onOpen('body')}>
              steps, sets &amp; note →
            </button>
          </form>
          {weightError ? <p className="ov-weigh-error" role="alert">{weightError}</p> : null}
        </section>

        <section className="ov-card">
          <div className="ov-card-head">
            <h2 className="ov-card-title">Wake up &amp; go to sleep</h2>
            <p className="ov-card-note">
              Enter the times (or press now), then Save. Saving ticks the routine item; clearing a time unticks it.
            </p>
          </div>
          <form className="ov-clock-form" onSubmit={saveClock}>
          <div className="ov-clock">
            <div className="ov-clock-btn is-wake">
              <span className="ov-clock-icon" aria-hidden="true">☀</span>
              <span className="ov-clock-body">
                <label htmlFor="ov-woke"><b>Wake-up time</b></label>
                <span className="ov-clock-row">
                  <input
                    id="ov-woke"
                    type="time"
                    className="ov-clock-input"
                    value={wokeValue}
                    onChange={(e) => editClock('woke', e.target.value)}
                  />
                  <button type="button" className="ov-clock-now" onClick={() => editClock('woke', nowHHMM())}>
                    now
                  </button>
                </span>
                <small>
                  {wokeToday
                    ? `${fmtClock(wokeToday)} · ${vsTarget(clockToMinutes(wokeToday), WAKE_TARGET)}`
                    : `target ${fmtTime(WAKE_TARGET)}`}
                </small>
              </span>
            </div>
            <div className="ov-clock-btn is-sleep">
              <span className="ov-clock-icon" aria-hidden="true">☾</span>
              <span className="ov-clock-body">
                <label htmlFor="ov-slept">
                  <b>{shownSleepDay === today ? 'Sleep time tonight' : 'Sleep time last night'}</b>
                </label>
                <span className="ov-clock-row">
                  <input
                    id="ov-slept"
                    type="time"
                    className="ov-clock-input"
                    value={sleptValue}
                    onChange={(e) => editClock('slept', e.target.value)}
                  />
                  <button type="button" className="ov-clock-now" onClick={() => editClock('slept', nowHHMM())}>
                    now
                  </button>
                </span>
                <small>
                  {sleptShown
                    ? `${fmtClock(sleptShown)} · ${vsTarget(clockToMinutes(sleptShown, { night: true }), SLEEP_TARGET)}`
                    : `target ${fmtTime(SLEEP_TARGET)}`}
                </small>
              </span>
            </div>
          </div>
          <div className="ov-clock-actions">
            <button type="submit" className="ov-weigh-save" disabled={!clockDirty}>Save times</button>
            {clockDirty ? <span className="ov-clock-status is-dirty">Unsaved changes</span> : null}
            {!clockDirty && clockSaved ? <span className="ov-clock-status" role="status">{clockSaved}</span> : null}
          </div>
          </form>
          <p className="ov-clock-avg">
            Last 7 days: wake {sleepAvg.wake == null ? '—' : fmtTime(sleepAvg.wake % 1440)}
            {' · '}bed {sleepAvg.bed == null ? '—' : fmtTime(sleepAvg.bed % 1440)}
            
          </p>
        </section>

        <section className="ov-levels">
          <LevelRow
            name="Food"
            detail={`${food.meals} meals this week · ${food.slips} slips`}
            color={FOOD}
            onOpen={() => onOpen('food')}
          />
          <LevelRow
            name="Body"
            detail={body.latest ? `${body.entries.length} days logged · ${body.lost} kg down` : 'no entries yet'}
            color={BODY}
            onOpen={() => onOpen('body')}
          />
          <LevelRow
            name="Routine"
            detail={
              routine.votes
                ? `${routine.chain}-day chain · ${routine.votes.toLocaleString('en-US')} ticks logged`
                : 'nothing ticked yet'
            }
            color={ROUTINE}
            onOpen={() => onOpen('routine')}
          />
          <LevelRow
            name="Freedom"
            detail={`Nivel ${freedom.level.level} · ${freedom.level.name}`}
            color={FREEDOM}
            onOpen={() => onOpen('freedom')}
          />
          <LevelRow
            name="Learning"
            detail={learning.xp ? `LVL ${learning.level} · ${learning.xp.toLocaleString('en-US')} XP · ${learning.streak}-day streak` : 'nothing logged yet'}
            color={LEARNING}
            onOpen={() => onOpen('learning')}
          />
        </section>

        {/* One series, so the title names it and no legend box is needed. */}
        <section className="ov-card">
          <div className="ov-card-head">
            <h2 className="ov-card-title">Weight, every day you logged one</h2>
            {trend && (
              <p className="ov-card-note">
                {describeTrend(trend)}
                {body.outlook?.state === 'projected'
                  ? ` Allowing for water weight and a physiological ceiling, ${goalWeight} kg lands in ${weeksLabel(body.outlook.fast.weeks)} to ${weeksLabel(body.outlook.slow.weeks)}.`
                  : ''}
              </p>
            )}
          </div>
          {hasWeight ? (
            <div className="ov-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={weightSeries} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke={MUTED} tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis
                    stroke={MUTED}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    domain={[(min) => Math.floor(Math.min(min, goalWeight) - 1), (max) => Math.ceil(max + 1)]}
                    unit=" kg"
                    width={64}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP}
                    labelStyle={{ color: MUTED }}
                    formatter={(v, name) => [`${v} kg`, name]}
                  />
                  {trend && <Legend wrapperStyle={{ fontSize: 13, color: MUTED }} iconType="plainline" />}
                  <ReferenceLine
                    y={goalWeight}
                    stroke={GOAL}
                    strokeDasharray="6 4"
                    label={{ value: `goal ${goalWeight} kg`, position: 'insideTopRight', fill: GOAL, fontSize: 12 }}
                  />
                  {/* The fit is drawn under the measurements, dashed and in
                      recessive ink, so it reads as an annotation of the same
                      series rather than a second thing being measured. */}
                  {trend && (
                    <Line
                      type="linear"
                      dataKey="trend"
                      name="trend"
                      stroke={TREND}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={false}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="weight"
                    name="weight"
                    stroke={WEIGHT}
                    strokeWidth={2}
                    dot={{ r: 4, fill: WEIGHT, stroke: SURFACE, strokeWidth: 2 }}
                    activeDot={{ r: 6, stroke: SURFACE, strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty>Log a weight on two different days and the trend line appears here.</Empty>
          )}
        </section>

        <section className="ov-card">
          <h2 className="ov-card-title">Points earned, last {DAYS} days</h2>
          {hasPoints ? (
            <>
              <div className="ov-chart">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={pointsSeries} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke={MUTED} tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis stroke={MUTED} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: MUTED }} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Legend wrapperStyle={{ fontSize: 13, color: MUTED }} iconType="circle" />
                    {/* 1px surface stroke on each segment reads as the 2px gap
                        that keeps stacked fills legible. */}
                    <Bar dataKey="body" name="Body" stackId="p" fill={BODY} stroke={SURFACE} strokeWidth={1} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <details className="ov-table-toggle">
                <summary>Show as a table</summary>
                <table className="ov-table">
                  <thead>
                    <tr><th>Day</th><th>Body</th></tr>
                  </thead>
                  <tbody>
                    {pointsSeries.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{d.body}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <Empty>Log a training day and the bars fill in.</Empty>
          )}
        </section>

        {/* Freedom is a status per day, not a quantity, so it is a strip of
            days rather than a chart: the number in each cell is the streak day
            that cell was, which is the thing worth reading back. */}
        <section className="ov-card">
          <div className="ov-card-head">
            <h2 className="ov-card-title">Freedom, day by day</h2>
            <p className="ov-card-note">
              {freedom.streak} día{freedom.streak === 1 ? '' : 's'} limpio
              {freedom.streak === 1 ? '' : 's'} · {freedom.urgesResisted} urges resistidas ·{' '}
              {freedom.xp} XP
            </p>
          </div>
          <div className="ov-days">
            {freedomSeries.map((d) => (
              <div key={d.date} className="ov-day" title={d.tip}>
                <span className="ov-day-label">{d.label}</span>
                <span className={`ov-day-cell is-${d.status}${d.date === today ? ' is-today' : ''}`}>
                  {d.status === 'clean' ? (d.day ?? '✓') : d.status === 'relapse' ? '×' : '·'}
                </span>
                <span className="ov-day-tally">
                  {d.urges > 0 ? `${d.urges}u` : ''}
                  {d.urges > 0 && d.wins > 0 ? ' ' : ''}
                  {d.wins > 0 ? `${d.wins}w` : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="ov-legend">
            <span><span className="ov-swatch" style={{ background: FREEDOM }} />limpio</span>
            <span><span className="ov-swatch" style={{ background: GOAL }} />recaída</span>
            <span><span className="ov-swatch" style={{ background: GRID }} />sin registro</span>
            <span>u = urge resistida · w = win · el número es el día de racha</span>
          </p>
          <details className="ov-table-toggle">
            <summary>Show as a table</summary>
            <table className="ov-table">
              <thead>
                <tr><th>Day</th><th>Status</th><th>Streak day</th><th>Urges</th><th>Wins</th></tr>
              </thead>
              <tbody>
                {freedomSeries.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.status === 'none' ? '—' : d.status}</td>
                    <td>{d.day ?? '—'}</td>
                    <td>{d.urges}</td>
                    <td>{d.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </div>
    </div>
  );
}

/** A day with nothing on it yet, so the quick weigh-in can create one. */
const BLANK_DAY = { steps: 0, swordSets: 0, pushupSets: 0, stretchBreaks: 0, note: '' };

function Tile({ label, value, unit, foot, accent }) {
  return (
    <div className="ov-tile">
      <span className="ov-tile-label">{label}</span>
      <span className="ov-tile-value" style={{ borderBottomColor: accent }}>
        {value}
        {unit ? <span className="ov-tile-unit"> {unit}</span> : null}
      </span>
      <span className="ov-tile-foot">{foot}</span>
    </div>
  );
}

function LevelRow({ name, detail, color, onOpen }) {
  return (
    <button type="button" className="ov-level" onClick={onOpen}>
      <span className="ov-dot" style={{ background: color }} />
      <span className="ov-level-name">{name}</span>
      <span className="ov-level-detail">{detail}</span>
      <span className="ov-level-go" aria-hidden="true">→</span>
    </button>
  );
}

function Empty({ children }) {
  return <p className="ov-empty">{children}</p>;
}

const TOOLTIP = {
  background: '#020617',
  border: '1px solid #1e293b',
  borderRadius: 10,
  color: INK,
  fontSize: 13,
};

/** "06:12" -> "6:12 AM". */
function fmtClock(hhmm) {
  const m = clockToMinutes(hhmm);
  return m == null ? hhmm : fmtTime(m);
}

/** Minutes against the routine's target, e.g. "12 min late", "on time". */
function vsTarget(actual, target) {
  if (actual == null) return '';
  const diff = actual - target;
  if (Math.abs(diff) <= 5) return 'on time';
  const abs = Math.abs(diff);
  const text = abs >= 60 ? `${Math.floor(abs / 60)} h ${abs % 60} min` : `${abs} min`;
  return `${text} ${diff > 0 ? 'late' : 'early'}`;
}

const CSS = `
.ov-root { background: #020617; color: ${INK}; padding: 24px 16px 60px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
.ov-root *, .ov-root *::before, .ov-root *::after { box-sizing: border-box; }
.ov-wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }

.ov-head { display: flex; flex-direction: column; gap: 8px; }
.ov-title { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.ov-sub { margin: 0; color: ${MUTED}; line-height: 1.55; max-width: 62ch; }
.ov-sub code { background: #0f172a; border: 1px solid ${GRID}; border-radius: 5px;
  padding: 1px 5px; font-size: 0.85em; }

.ov-tiles { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(178px, 1fr)); }
.ov-tile { background: ${SURFACE}; border: 1px solid ${GRID}; border-radius: 16px;
  padding: 18px; display: flex; flex-direction: column; gap: 8px; }
.ov-tile-label { color: ${MUTED}; font-size: 0.78rem; text-transform: lowercase; letter-spacing: 0.02em; }
.ov-tile-value { font-size: 1.85rem; font-weight: 700; line-height: 1.1;
  align-self: flex-start; border-bottom: 3px solid transparent; padding-bottom: 3px; }
.ov-tile-unit { font-size: 0.95rem; font-weight: 500; color: ${MUTED}; }
.ov-tile-foot { color: #64748b; font-size: 0.78rem; line-height: 1.45; }

.ov-levels { display: grid; gap: 10px; }
.ov-level { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  background: ${SURFACE}; border: 1px solid ${GRID}; border-radius: 12px; padding: 14px 16px;
  color: inherit; font: inherit; cursor: pointer; transition: border-color .15s, transform .15s; }
.ov-level:hover { border-color: #334155; transform: translateX(2px); }
.ov-level:focus-visible { outline: 2px solid ${WEIGHT}; outline-offset: 2px; }
.ov-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.ov-level-name { font-weight: 600; min-width: 74px; }
.ov-level-detail { color: ${MUTED}; font-size: 0.88rem; flex: 1; }
.ov-level-go { color: #475569; }

.ov-card { background: ${SURFACE}; border: 1px solid ${GRID}; border-radius: 16px; padding: 22px; }
.ov-card-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: 8px; margin-bottom: 16px; }
.ov-card-head .ov-card-title { margin: 0; }
.ov-card-note { margin: 0; color: ${MUTED}; font-size: 0.83rem; }
.ov-card-title { font-size: 1.05rem; font-weight: 600; margin: 0 0 16px; }

.ov-congrats { display: flex; align-items: flex-start; gap: 10px; margin: 0; line-height: 1.5;
  background: ${SURFACE}; border: 1px solid ${GRID}; border-left: 3px solid #3fb950;
  border-radius: 12px; padding: 14px 16px; }
.ov-congrats.is-risk { border-left-color: #fbbf24; }
.ov-chart { width: 100%; }
.ov-empty { margin: 0; color: #64748b; line-height: 1.55; }

.ov-table-toggle { margin-top: 14px; }
.ov-table-toggle summary { cursor: pointer; color: ${MUTED}; font-size: 0.85rem; }
.ov-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.85rem; }
.ov-table th, .ov-table td { text-align: left; padding: 7px 10px; border-bottom: 1px solid ${GRID}; }
.ov-table th { color: ${MUTED}; font-weight: 500; }

.ov-clock { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.ov-clock-btn { display: flex; align-items: center; gap: 14px; text-align: left;
  background: #020617; color: ${INK}; border: 1px solid ${GRID}; border-left: 3px solid var(--c);
  border-radius: 14px; padding: 14px 16px; font: inherit; }
.ov-clock-btn:hover, .ov-clock-btn:focus-within { border-color: var(--c); }
.ov-clock-btn:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }
.ov-clock-btn.is-wake { --c: #e3a64a; }
.ov-clock-btn.is-sleep { --c: ${ROUTINE}; }
.ov-clock-icon { font-size: 1.6rem; color: var(--c); line-height: 1; }
.ov-clock-btn b { display: block; font-size: 1rem; }
.ov-clock-btn small { display: block; color: ${MUTED}; font-size: 0.8rem; margin-top: 2px; }
.ov-clock-body { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.ov-clock-body label { cursor: pointer; }
.ov-clock-row { display: flex; gap: 8px; align-items: center; }
.ov-clock-input { background: #020617; border: 1px solid ${GRID}; border-radius: 8px; color: ${INK};
  font: inherit; font-size: 1.05rem; font-variant-numeric: tabular-nums; padding: 6px 10px; color-scheme: dark; }
.ov-clock-input:focus-visible { outline: 2px solid var(--c); outline-offset: 1px; }
.ov-clock-now { background: none; border: 1px solid ${MUTED}; border-radius: 8px; color: ${INK};
  font: inherit; font-size: 0.8rem; padding: 6px 10px; cursor: pointer; }
.ov-clock-now:hover { border-color: var(--c); }
.ov-clock-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }
.ov-clock-actions .ov-weigh-save:disabled { opacity: .45; cursor: default; filter: none; }
.ov-clock-status { color: ${FREEDOM}; font-size: 0.85rem; }
.ov-clock-status.is-dirty { color: #e3a64a; }
.ov-clock-avg { margin: 12px 0 0; color: ${MUTED}; font-size: 0.8rem; }
.ov-weigh { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.ov-weigh-label { color: ${MUTED}; font-size: 0.85rem; }
.ov-weigh-input { width: 120px; background: #020617; border: 1px solid ${GRID}; border-radius: 10px;
  color: ${INK}; font: inherit; font-size: 1rem; padding: 10px 12px; }
.ov-weigh-input:focus-visible { outline: 2px solid ${WEIGHT}; outline-offset: 1px; border-color: ${WEIGHT}; }
.ov-weigh-save { background: ${WEIGHT}; color: #020617; border: none; border-radius: 10px;
  font: inherit; font-weight: 700; padding: 10px 18px; cursor: pointer; }
.ov-weigh-save:hover { filter: brightness(1.08); }
.ov-weigh-more { background: none; border: none; color: ${MUTED}; font: inherit; font-size: 0.85rem;
  cursor: pointer; padding: 10px 4px; }
.ov-weigh-more:hover { color: ${INK}; }
.ov-weigh-error { margin: 10px 0 0; color: ${GOAL}; font-size: 0.85rem; }

.ov-days { display: grid; grid-template-columns: repeat(auto-fit, minmax(42px, 1fr)); gap: 8px; }
.ov-day { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.ov-day-label { color: #64748b; font-size: 0.68rem; white-space: nowrap; }
.ov-day-cell { display: flex; align-items: center; justify-content: center; width: 100%;
  aspect-ratio: 1; min-height: 34px; border-radius: 9px; font-size: 0.85rem; font-weight: 700;
  background: ${GRID}; color: #64748b; border: 1px solid transparent; }
.ov-day-cell.is-clean { background: ${FREEDOM}; color: #041c0c; }
.ov-day-cell.is-relapse { background: ${GOAL}; color: #2a0510; }
.ov-day-cell.is-today { border-color: ${INK}; }
.ov-day-tally { color: ${MUTED}; font-size: 0.66rem; min-height: 0.95em; }

.ov-legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 14px 0 0;
  color: #64748b; font-size: 0.78rem; }
.ov-legend > span { display: flex; align-items: center; gap: 6px; }
.ov-swatch { width: 10px; height: 10px; border-radius: 3px; }

@media (max-width: 640px) { .ov-title { font-size: 1.6rem; } .ov-root { padding: 18px 12px 48px; } }
`;
