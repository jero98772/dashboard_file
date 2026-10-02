import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  ComposedChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from "recharts";
import {
  Flame,
  Trophy,
  Footprints,
  Dumbbell,
  Timer,
  Swords,
  TrendingDown,
  Target,
  Sparkles,
  Plus,
} from "lucide-react";

import {
  MAX_WEEKLY_PCT,
  MIN_PLANNING_PCT,
  PERIODS,
  buildChain,
  calcStreak,
  computePoints,
  dateLabel,
  describeNaive,
  describeRealistic,
  describeWaterSplit,
  entriesToRows,
  goalForecast,
  goalProgress,
  groupWeights,
  motivationMessage,
  describeTrend,
  multiplierColor,
  naiveCheck,
  realisticForecast,
  realisticSeries,
  rowsToEntries,
  shortLabel,
  signedKg,
  signedPercent,
  stepMultiplier,
  sum,
  weeksLabel,
  weightRates,
  weightTrend,
  withTrend,
} from "../lib/body-rules.js";
import { addDays, toKey, todayKey as currentDayKey } from "../lib/dates.js";
import { useSettings, useTable } from "../lib/use-table.js";

/* ---------------------------------------------------------------------- */
/*  CONFIG — tune these to change how points are earned                    */
/* ---------------------------------------------------------------------- */
/* ---------------------------------------------------------------------- */
/*  Embedded styles — no external CSS framework required                  */
/* ---------------------------------------------------------------------- */
const CSS = `
.rb-root { min-height: 100vh; background: #020617; color: #f1f5f9; padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.rb-container { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }

.rb-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 16px; border-bottom: 1px solid #1e293b; padding-bottom: 20px; }
.rb-title { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.rb-subtitle { color: #94a3b8; margin: 8px 0 0; max-width: 440px; line-height: 1.5; }
.rb-streak { display: flex; align-items: center; gap: 8px; color: #f59e0b; }
.rb-streak-num { font-size: 1.5rem; font-weight: 700; }
.rb-streak-label { color: #94a3b8; font-size: 0.875rem; }

.rb-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 24px; }
.rb-section-title { font-size: 1.05rem; font-weight: 600; margin: 0 0 16px; color: #f1f5f9; }

.rb-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
.rb-stat-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 20px;
  display: flex; flex-direction: column; gap: 10px; }
.rb-stat-value { font-size: 1.5rem; font-weight: 700; }
.rb-stat-label { color: #94a3b8; font-size: 0.8rem; }
.rb-ring-card { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; text-align: center; }

.rb-banner { border: 1px solid rgba(245,158,11,0.3);
  background: linear-gradient(to right, rgba(245,158,11,0.12), transparent);
  border-radius: 16px; padding: 18px 20px; display: flex; align-items: center; gap: 12px; }
.rb-banner p { margin: 0; color: #e2e8f0; line-height: 1.5; }

.rb-two-col { display: grid; grid-template-columns: 1fr 2fr; gap: 24px; align-items: start; }
@media (max-width: 880px) { .rb-two-col { grid-template-columns: 1fr; } }

.rb-field { margin-bottom: 14px; }
.rb-field-label { display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 6px; }
.rb-required::after { content: " *"; color: #f87171; }
.rb-input { width: 100%; box-sizing: border-box; background: #020617; border: 1px solid #334155;
  border-radius: 8px; padding: 9px 12px; color: #f1f5f9; font-size: 0.95rem; }
.rb-textarea { resize: vertical; font-family: inherit; line-height: 1.5; }
.rb-input:focus { outline: none; border-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,0.35); }
.rb-error-text { color: #f87171; font-size: 0.8rem; margin: 6px 0 0; }
.rb-hint { font-size: 0.8rem; color: #64748b; line-height: 1.5; margin: 14px 0 0; }
.rb-inline-hint { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 0.8rem; color: #64748b; }
.rb-multiplier-badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px;
  font-size: 0.78rem; font-weight: 700; }

.rb-button { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  background: #f59e0b; color: #020617; font-weight: 700; border: none; border-radius: 12px;
  padding: 11px; cursor: pointer; font-size: 0.95rem; margin-top: 4px; }
.rb-button:hover { background: #fbbf24; }

.rb-divider { border-top: 1px solid #1e293b; margin: 18px 0; padding-top: 18px; }
.rb-subhead { font-size: 0.85rem; font-weight: 600; color: #cbd5e1; margin: 0 0 12px; }

.rb-charts { display: flex; flex-direction: column; gap: 20px; }
.rb-chart-title { font-size: 0.85rem; font-weight: 600; color: #cbd5e1; margin: 0 0 12px; }
.rb-empty { color: #64748b; font-size: 0.9rem; text-align: center; padding: 46px 12px; line-height: 1.6; }

.rb-chain-grid { display: grid; grid-template-columns: repeat(14, 1fr); gap: 6px; }
@media (max-width: 600px) { .rb-chain-grid { grid-template-columns: repeat(7, 1fr); } }
.rb-chain-cell { aspect-ratio: 1; border-radius: 4px; background: #1e293b; }
.rb-chain-cell-filled { background: #f59e0b; }
.rb-chain-cell-today { box-shadow: 0 0 0 2px #f1f5f9 inset; }
.rb-chain-legend { display: flex; align-items: center; gap: 16px; margin-top: 12px; font-size: 0.78rem; color: #64748b; }
.rb-legend-swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-right: 6px; vertical-align: -1px; }

.rb-challenge-row { margin-bottom: 16px; }
.rb-challenge-top { display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; margin-bottom: 6px; gap: 8px; }
.rb-challenge-label { display: flex; align-items: center; gap: 8px; color: #cbd5e1; }
.rb-challenge-count { color: #64748b; white-space: nowrap; }
.rb-progress-track { height: 8px; background: #1e293b; border-radius: 999px; overflow: hidden; }
.rb-progress-fill { height: 100%; background: #f59e0b; border-radius: 999px; transition: width 0.3s ease; }

.rb-badges-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.rb-badge { border-radius: 12px; padding: 12px; border: 1px solid #1e293b; background: #0b1220; }
.rb-badge-earned { border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.08); }
.rb-badge-name { font-size: 0.85rem; font-weight: 600; margin: 8px 0 2px; color: #64748b; }
.rb-badge-earned .rb-badge-name { color: #f1f5f9; }
.rb-badge-desc { font-size: 0.75rem; color: #64748b; margin: 0; }

.rb-table-wrap { overflow-x: auto; }
.rb-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; }
.rb-table th { color: #64748b; border-bottom: 1px solid #1e293b; padding: 8px 16px 8px 0; font-weight: 600; }
.rb-table td { padding: 8px 16px 8px 0; border-bottom: 1px solid #1e293b; color: #94a3b8; }
.rb-summary { cursor: pointer; font-size: 0.85rem; font-weight: 600; color: #cbd5e1; }

.rb-rate-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.rb-rate-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr)); }
.rb-rate { background: #0b1220; border: 1px solid #1e293b; border-radius: 12px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 3px; }
.rb-rate-label { font-size: 0.74rem; color: #64748b; }
.rb-rate-value { font-size: 1.45rem; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }
.rb-rate-pct { font-size: 0.82rem; color: #cbd5e1; font-variant-numeric: tabular-nums; }
.rb-rate-foot { font-size: 0.72rem; color: #475569; }
.rb-down { color: #2dd4bf; }
.rb-up { color: #f43f5e; }
.rb-flat { color: #94a3b8; }
.rb-num { font-variant-numeric: tabular-nums; }

.rb-toggle { display: inline-flex; gap: 4px; background: #0b1220; border: 1px solid #1e293b;
  border-radius: 999px; padding: 3px; }
.rb-toggle button { border: none; background: none; color: #94a3b8; font: inherit; font-size: 0.82rem;
  padding: 6px 15px; border-radius: 999px; cursor: pointer; }
.rb-toggle button:hover { color: #f1f5f9; }
.rb-toggle button[aria-pressed="true"] { background: #f59e0b; color: #020617; font-weight: 700; }

.rb-footer-note { font-size: 0.75rem; color: #475569; text-align: center; padding-top: 4px; line-height: 1.6; }
`;

/* ---------------------------------------------------------------------- */
/*  Small building blocks                                                  */
/* ---------------------------------------------------------------------- */
function Field({ label, required, children, error }) {
  return (
    <div className="rb-field">
      <label className={`rb-field-label ${required ? "rb-required" : ""}`}>{label}</label>
      {children}
      {error ? <p className="rb-error-text">{error}</p> : null}
    </div>
  );
}

/** Loss reads teal, gain reads rose, and a flat number stays neutral. */
function moveClass(value) {
  if (value < -0.005) return "rb-down";
  if (value > 0.005) return "rb-up";
  return "rb-flat";
}

function FactTile({ label, value, tone, sub, foot }) {
  return (
    <div className="rb-rate">
      <span className="rb-rate-label">{label}</span>
      <span className={`rb-rate-value ${tone || ""}`}>{value}</span>
      {sub ? <span className="rb-rate-pct">{sub}</span> : null}
      {foot ? <span className="rb-rate-foot">{foot}</span> : null}
    </div>
  );
}

function RateTile({ label, rate, foot }) {
  return (
    <FactTile
      label={label}
      value={signedKg(rate.kg)}
      tone={moveClass(rate.kg)}
      sub={`${signedPercent(rate.percent)} of body weight`}
      foot={foot}
    />
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rb-stat-card">
      <Icon size={20} color={color} />
      <div>
        <div className="rb-stat-value">{value}</div>
        <div className="rb-stat-label">{label}</div>
      </div>
    </div>
  );
}

function RadialProgress({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div style={{ position: "relative", width: 112, height: 112 }}>
      <svg viewBox="0 0 100 100" width={112} height={112} style={{ transform: "rotate(-90deg)" }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="#f59e0b" strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</span>
        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>/ {max}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Main dashboard                                                         */
/* ---------------------------------------------------------------------- */
export default function RebuildDashboard() {
  const [entryRows, setEntryRows] = useTable("body_entries");
  const [settings, setSetting] = useSettings("body_settings");
  const [formError, setFormError] = useState("");

  // Settings live in the CSV as strings; coerce here and fall back to the
  // targets from notes.md (70 kg goal weight, 70 points a day).
  const goalWeight = Number(settings.goalWeight) || 70;
  const dailyGoal = Number(settings.dailyGoal) || 70;
  const identity = settings.identity || "";
  const habitStack = settings.habitStack || "";

  const setGoalWeight = (v) => setSetting("goalWeight", v);
  const setDailyGoal = (v) => setSetting("dailyGoal", v);
  const setIdentity = (v) => setSetting("identity", v);
  const setHabitStack = (v) => setSetting("habitStack", v);

  const todayKey = currentDayKey();

  const [form, setForm] = useState({
    date: todayKey,
    steps: "",
    swordSets: "",
    pushupSets: "",
    stretchBreaks: "",
    weight: "",
    note: "",
  });

  // rowsToEntries already returns them sorted oldest-first.
  const sorted = useMemo(() => rowsToEntries(entryRows), [entryRows]);

  function handleSubmit(e) {
    e.preventDefault();
    if (form.weight === "") {
      setFormError("Weight is required — it's how the trend and streak stay accurate.");
      return;
    }
    setFormError("");
    const parsed = {
      date: form.date,
      steps: Number(form.steps) || 0,
      swordSets: Number(form.swordSets) || 0,
      pushupSets: Number(form.pushupSets) || 0,
      stretchBreaks: Number(form.stretchBreaks) || 0,
      weight: Number(form.weight),
      note: form.note.trim(),
    };
    // One row per day: logging the same date again replaces it.
    setEntryRows((prev) =>
      entriesToRows([...rowsToEntries(prev).filter((en) => en.date !== parsed.date), parsed])
    );
    setForm({ date: todayKey, steps: "", swordSets: "", pushupSets: "", stretchBreaks: "", weight: "", note: "" });
  }

  const todayEntry = sorted.find((e) => e.date === todayKey);
  const todayPoints = todayEntry ? computePoints(todayEntry) : 0;
  const todayLogged = Boolean(todayEntry);

  const previewSteps = todayEntry ? todayEntry.steps : Number(form.steps) || 0;
  const liveMultiplier = stepMultiplier(previewSteps);

  const startWeight = sorted.length ? sorted[0].weight : null;
  const latestWeight = sorted.length ? sorted[sorted.length - 1].weight : null;
  const weightLost =
    startWeight != null && latestWeight != null ? +(startWeight - latestWeight).toFixed(1) : 0;

  const streak = useMemo(() => calcStreak(sorted), [sorted]);
  const chain = useMemo(() => buildChain(sorted, 28), [sorted]);

  const trend = useMemo(() => weightTrend(sorted, goalWeight), [sorted, goalWeight]);

  // How fast the weight is actually moving, and the same weigh-ins bucketed by
  // day, week or month. Both are derived on the fly — nothing extra is stored.
  const [period, setPeriod] = useState("week");
  const rates = useMemo(() => weightRates(sorted, trend), [sorted, trend]);
  const goal = useMemo(() => goalProgress(sorted, goalWeight), [sorted, goalWeight]);
  // The forecast the card leads with: a rate measured past the water-loss
  // window, capped at what fat loss can physically do, carried forward with
  // compounding, and given as a band rather than a single date.
  const outlook = useMemo(() => realisticForecast(sorted, goalWeight), [sorted, goalWeight]);
  // The straight line through everything, kept only to show why it is wrong.
  const naive = useMemo(() => {
    const line = goalForecast(sorted, goalWeight, trend);
    return outlook ? naiveCheck(line, outlook.current) : null;
  }, [sorted, goalWeight, trend, outlook]);
  const outlookPlot = useMemo(
    () => realisticSeries(sorted, outlook, naive),
    [sorted, outlook, naive],
  );
  const groups = useMemo(() => groupWeights(sorted, period), [sorted, period]);
  const periodLabel = PERIODS.find((p) => p.id === period).label.toLowerCase();
  // The same buckets read either as kilos or as a share of what you weighed
  // when the bucket started — the honest comparison across a changing body.
  const [unit, setUnit] = useState("kg");
  const asPercent = unit === "pct";

  const chartData = sorted.map((e) => ({
    date: shortLabel(e.date),
    key: e.date,
    points: computePoints(e),
    sword: e.swordSets,
    pushup: e.pushupSets,
    stretch: e.stretchBreaks,
    weight: e.weight,
  }));

  // withTrend keys off `date`, so hand it the ISO day rather than the label.
  const weightData = withTrend(chartData.map((d) => ({ ...d, date: d.key })), trend)
    .map((d, i) => ({ ...d, date: chartData[i].date }));

  const weekEntries = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    const cutoffKey = toKey(cutoff);
    return sorted.filter((e) => e.date >= cutoffKey);
  }, [sorted]);

  const weekSword = sum(weekEntries.map((e) => e.swordSets));
  const weekPushup = sum(weekEntries.map((e) => e.pushupSets));
  const weekStretchDays = weekEntries.filter((e) => e.stretchBreaks > 0).length;
  const weekSteps = sum(weekEntries.map((e) => e.steps));

  const challenges = [
    { id: "sword", label: "20 sword-strike sets this week", current: weekSword, target: 20, Icon: Swords },
    { id: "pushup", label: "15 push-up sets this week", current: weekPushup, target: 15, Icon: Dumbbell },
    { id: "stretch", label: "Stretch on 5 different days", current: weekStretchDays, target: 5, Icon: Timer },
    { id: "steps", label: "50,000 steps this week", current: weekSteps, target: 50000, Icon: Footprints },
  ];

  const totalSets = sum(sorted.map((e) => e.swordSets + e.pushupSets));
  const maxDayPoints = sorted.length ? Math.max(...sorted.map(computePoints)) : 0;

  const badges = [
    { id: "first", name: "First step", earned: sorted.length >= 1, desc: "Log your first day" },
    { id: "week", name: "One week strong", earned: streak >= 7, desc: "7-day streak" },
    { id: "fifty", name: "50 sets club", earned: totalSets >= 50, desc: "50 total training sets" },
    { id: "century", name: "Century day", earned: maxDayPoints >= 100, desc: "100+ points in one day" },
    { id: "melt", name: "First kilo down", earned: weightLost >= 1, desc: "1kg+ below your start" },
  ];

  return (
    <div className="rb-root">
      <style>{CSS}</style>
      <div className="rb-container">
        {/* Header */}
        <header className="rb-header">
          <div>
            <h1 className="rb-title">Rebuild</h1>
            <p className="rb-subtitle">
              Small reps, repeated daily, compound into someone new. Log today's training below.
            </p>
          </div>
          <div className="rb-streak">
            <Flame size={26} color="#f59e0b" />
            <span className="rb-streak-num">{streak}</span>
            <span className="rb-streak-label">day chain</span>
          </div>
        </header>

        {/* Habit loop: identity + cue, the "make it obvious" / identity-based habit ideas */}
        <section className="rb-card">
          <h2 className="rb-section-title">Your habit loop</h2>
          <Field label="Identity — who are you becoming?">
            <input
              className="rb-input"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="I'm becoming someone who trains every day."
            />
          </Field>
          <Field label="Habit stack cue">
            <input
              className="rb-input"
              value={habitStack}
              onChange={(e) => setHabitStack(e.target.value)}
              placeholder="After I pour my morning coffee, I'll do one set."
            />
          </Field>
          <p className="rb-hint">
            Two-minute rule: if motivation is low, just do one set. Showing up today matters more
            than a perfect session — you can always add more once you've started.
          </p>
        </section>

        {/* Stat cards */}
        <section className="rb-stats-grid">
          <div className="rb-stat-card rb-ring-card">
            <RadialProgress value={todayPoints} max={dailyGoal} />
            <div className="rb-stat-label">today's points</div>
          </div>
          <StatCard
            label="weight lost"
            value={weightLost > 0 ? `${weightLost} kg` : "—"}
            icon={TrendingDown}
            color="#2dd4bf"
          />
          <StatCard
            label="current weight"
            value={latestWeight != null ? `${latestWeight} kg` : "—"}
            icon={Target}
            color="#cbd5e1"
          />
          <StatCard
            label="sets today"
            value={todayEntry ? todayEntry.swordSets + todayEntry.pushupSets : 0}
            icon={Dumbbell}
            color="#f59e0b"
          />
          <StatCard
            label={todayLogged ? "today's multiplier" : "multiplier (live)"}
            value={`${liveMultiplier.toFixed(1)}×`}
            icon={Footprints}
            color={multiplierColor(liveMultiplier)}
          />
        </section>

        {/* Motivator banner */}
        <section className="rb-banner">
          <Sparkles size={20} color="#f59e0b" />
          <p>{motivationMessage({ streak, weightLost, todayLogged })}</p>
        </section>

        {/* Don't break the chain */}
        <section className="rb-card">
          <h2 className="rb-section-title">Don't break the chain</h2>
          <div className="rb-chain-grid">
            {chain.map((d) => (
              <div
                key={d.date}
                title={d.date}
                className={`rb-chain-cell ${d.logged ? "rb-chain-cell-filled" : ""} ${
                  d.isToday ? "rb-chain-cell-today" : ""
                }`}
              />
            ))}
          </div>
          <div className="rb-chain-legend">
            <span><span className="rb-legend-swatch" style={{ background: "#f59e0b" }} />logged</span>
            <span><span className="rb-legend-swatch" style={{ background: "#1e293b" }} />missed</span>
            <span>last 28 days</span>
          </div>
        </section>

        {/* Entry form + charts */}
        <section className="rb-two-col">
          <div className="rb-card">
            <h2 className="rb-section-title">Log today</h2>
            <form onSubmit={handleSubmit}>
              <Field label="Date">
                <input
                  type="date"
                  className="rb-input"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </Field>
              <Field label="Steps">
                <input
                  type="number"
                  min="0"
                  className="rb-input"
                  value={form.steps}
                  onChange={(e) => setForm({ ...form, steps: e.target.value })}
                  placeholder="e.g. 8500"
                />
                <div className="rb-inline-hint">
                  <span
                    className="rb-multiplier-badge"
                    style={{ background: multiplierColor(stepMultiplier(Number(form.steps) || 0)), color: "#020617" }}
                  >
                    {stepMultiplier(Number(form.steps) || 0).toFixed(1)}×
                  </span>
                  <span>points multiplier at this step count</span>
                </div>
              </Field>
              <Field label="Sword-strike sets (x10 each)">
                <input
                  type="number"
                  min="0"
                  className="rb-input"
                  value={form.swordSets}
                  onChange={(e) => setForm({ ...form, swordSets: e.target.value })}
                />
              </Field>
              <Field label="Push-up sets">
                <input
                  type="number"
                  min="0"
                  className="rb-input"
                  value={form.pushupSets}
                  onChange={(e) => setForm({ ...form, pushupSets: e.target.value })}
                />
              </Field>
              <Field label="Stretch breaks">
                <input
                  type="number"
                  min="0"
                  className="rb-input"
                  value={form.stretchBreaks}
                  onChange={(e) => setForm({ ...form, stretchBreaks: e.target.value })}
                />
              </Field>
              <Field label="Weight (kg)" required error={formError}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  className="rb-input"
                  value={form.weight}
                  onChange={(e) => {
                    setForm({ ...form, weight: e.target.value });
                    if (formError) setFormError("");
                  }}
                  placeholder="e.g. 86.4"
                />
              </Field>
              <Field label="Note">
                <textarea
                  className="rb-input rb-textarea"
                  rows={3}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="What you ate, how you felt, anything worth remembering."
                />
              </Field>
              <button type="submit" className="rb-button">
                <Plus size={16} /> Save entry
              </button>
            </form>

            <div className="rb-divider">
              <h3 className="rb-subhead">Goals</h3>
              <Field label="Daily point goal">
                <input
                  type="number"
                  min="1"
                  className="rb-input"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Number(e.target.value) || 1)}
                />
              </Field>
              <Field label="Goal weight (kg)">
                <input
                  type="number"
                  step="0.1"
                  className="rb-input"
                  value={goalWeight}
                  onChange={(e) => setGoalWeight(Number(e.target.value) || 0)}
                />
              </Field>
            </div>
          </div>

          <div className="rb-charts">
            <div className="rb-card">
              <h3 className="rb-chart-title">Points over time</h3>
              {chartData.length === 0 ? (
                <p className="rb-empty">Log your first day and this chart starts tracking your points.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }} />
                    <Line type="monotone" dataKey="points" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rb-card">
              <h3 className="rb-chart-title">Training volume (sets)</h3>
              {chartData.length === 0 ? (
                <p className="rb-empty">Your sword, push-up, and stretch sets will stack up here day by day.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                    <Bar dataKey="sword" stackId="a" fill="#f59e0b" name="Sword sets" />
                    <Bar dataKey="pushup" stackId="a" fill="#2dd4bf" name="Push-up sets" />
                    <Bar dataKey="stretch" stackId="a" fill="#64748b" name="Stretch breaks" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rb-card">
              <h3 className="rb-chart-title">Weight trend</h3>
              {chartData.length === 0 ? (
                <p className="rb-empty">Your weight trend line — with a marker for your goal — appears once you've logged a few days.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={weightData}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }} />
                      <ReferenceLine y={goalWeight} stroke="#2dd4bf" strokeDasharray="4 4" label={{ value: "goal", fill: "#2dd4bf", fontSize: 11 }} />
                      {trend && (
                        <Line
                          type="linear"
                          dataKey="trend"
                          name="trend"
                          stroke="#94a3b8"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          dot={false}
                          activeDot={false}
                        />
                      )}
                      <Line type="monotone" dataKey="weight" name="weight" stroke="#e2e8f0" strokeWidth={2} dot={{ r: 4 }} />
                      {trend && <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} iconType="plainline" />}
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="rb-hint" style={{ marginTop: 10 }}>
                    {describeTrend(trend)}
                    {/* No date here on purpose: extending this line is exactly
                        what Goal progress below refuses to do. */}
                    {" Goal progress, below, turns this into a date."}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* How much of the way to the goal is covered */}
        <section className="rb-card">
          <div className="rb-rate-head">
            <h2 className="rb-section-title" style={{ margin: 0 }}>Goal progress</h2>
            {goal ? (
              <span className="rb-hint rb-num" style={{ margin: 0 }}>
                {goal.start} kg → {goal.goal} kg goal
              </span>
            ) : null}
          </div>

          {!goal ? (
            <p className="rb-empty">
              Set a goal weight above and log a weigh-in to see how much of the way you have
              covered.
            </p>
          ) : (
            <>
              <div className="rb-rate-grid" style={{ marginTop: 16 }}>
                <FactTile
                  label="of the way there"
                  value={
                    !goal.hasDistance ? "—"
                    : goal.percentDone <= 0 ? "0%"
                    : `${Math.min(100, goal.percentDone)}%`
                  }
                  tone={goal.hasDistance && goal.percentDone > 0 ? "rb-down" : "rb-flat"}
                  sub={
                    !goal.hasDistance ? "you started below your goal"
                    : goal.lost > 0 ? `${goal.lost} of ${goal.distance} kg lost`
                    : `${Math.abs(goal.lost).toFixed(1)} kg above your start`
                  }
                />
                <FactTile
                  label={goal.reached ? "past your goal" : "still to go"}
                  value={`${Math.abs(goal.toGo).toFixed(1)} kg`}
                  tone={goal.reached ? "rb-down" : "rb-flat"}
                  sub={
                    goal.reached ? "goal reached"
                      : `${goal.percentOfCurrentToLose}% of the ${goal.current} kg you weigh now`
                  }
                  foot={
                    goal.hasDistance && !goal.reached
                      ? `${goal.percentRemaining}% of the journey left`
                      : undefined
                  }
                />
                <FactTile
                  label={goal.reached ? "below your goal" : "above your goal"}
                  value={`${Math.abs(goal.percentAboveGoal)}%`}
                  tone={goal.reached ? "rb-down" : "rb-flat"}
                  sub={`of the ${goal.goal} kg goal`}
                  foot={`now ${goal.current} kg`}
                />
                {outlook && outlook.state === "projected" ? (
                  <>
                    <FactTile
                      label={`to reach ${goal.goal} kg`}
                      value={`${weeksLabel(outlook.fast.weeks)} – ${weeksLabel(outlook.slow.weeks)}`}
                      tone="rb-down"
                      sub={`${dateLabel(outlook.fast.date)} – ${dateLabel(outlook.slow.date)}`}
                      foot={`at ${MIN_PLANNING_PCT}–${MAX_WEEKLY_PCT}% of body weight a week`}
                    />
                    <FactTile
                      label="most likely"
                      value={weeksLabel(outlook.likely.weeks)}
                      tone="rb-down"
                      sub={dateLabel(outlook.likely.date)}
                      foot={
                        outlook.basis === "measured" ? `your measured ${Math.abs(outlook.measured.weeklyPct)}% a week`
                        : outlook.basis === "capped" ? `capped at the ${MAX_WEEKLY_PCT}% ceiling`
                        : `planning rate, ${outlook.likely.pct}% a week`
                      }
                    />
                    <FactTile
                      label="what that asks of you"
                      value={`${outlook.likely.kgPerWeekNow} kg`}
                      tone="rb-flat"
                      sub={`a week — about ${outlook.likely.deficit.toLocaleString("en-US")} kcal a day`}
                      foot={`${outlook.likely.kgPerWeekAtGoal} kg a week once you are at ${goal.goal} kg`}
                    />
                  </>
                ) : null}
              </div>

              {goal.hasDistance ? (
                <div style={{ marginTop: 18 }}>
                  <div className="rb-progress-track">
                    <div className="rb-progress-fill" style={{ width: `${goal.barPercent}%`, background: "#2dd4bf" }} />
                  </div>
                  <div className="rb-rate-head" style={{ marginTop: 8 }}>
                    <span className="rb-rate-foot rb-num">{goal.start} kg start</span>
                    <span className="rb-rate-foot rb-num">{goal.goal} kg goal</span>
                  </div>
                </div>
              ) : null}

              <p className="rb-hint" style={{ marginTop: 12 }}>
                {goal.reached
                  ? `You are ${Math.abs(goal.toGo).toFixed(1)} kg below the ${goal.goal} kg you set out for — time to pick the next goal or hold here.`
                  : goal.percentDone <= 0
                    ? `No ground covered yet: you are ${Math.abs(goal.lost).toFixed(1)} kg ${goal.lost < 0 ? "above" : "from"} where you started. The bar fills as the weight comes down.`
                    : `${goal.lost} kg of the ${goal.distance} kg you set out to lose, which is ${goal.percentDone}% of the way. The ${goal.toGo} kg left is ${goal.percentOfCurrentToLose}% of the ${goal.current} kg you weigh today — the same ${goal.toGo} kg was ${(((goal.toGo / goal.start) * 100)).toFixed(1)}% of your ${goal.start} kg starting weight, because the same kilos are a bigger share of a lighter body.`}
              </p>

              {/* The realistic outlook: a band, not a date. */}
              <div className="rb-divider">
                <h3 className="rb-chart-title" style={{ margin: 0, marginBottom: 12 }}>
                  When you reach {goal.goal} kg
                </h3>

                {outlookPlot ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={outlookPlot.rows} margin={{ top: 8, right: 14, bottom: 0, left: -14 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                      {/* Days, not row numbers: the gap between weigh-ins has
                          to occupy real width or the slope misleads. */}
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={[0, outlookPlot.maxX]}
                        ticks={outlookPlot.ticks}
                        tickFormatter={(x) => shortLabel(addDays(outlookPlot.firstDate, x))}
                        stroke="#64748b"
                        fontSize={12}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={12}
                        width={64}
                        unit=" kg"
                        domain={[
                          (min) => Math.floor(Math.min(min, goal.goal) - 1),
                          (max) => Math.ceil(max + 1),
                        ]}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }}
                        labelFormatter={(x) => dateLabel(addDays(outlookPlot.firstDate, x))}
                        formatter={(value, name) => [
                          Array.isArray(value) ? `${value[0]} – ${value[1]} kg` : `${value} kg`,
                          name,
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} iconType="plainline" />
                      <ReferenceLine
                        y={goal.goal}
                        stroke="#2dd4bf"
                        strokeDasharray="4 4"
                        label={{ value: `goal ${goal.goal} kg`, fill: "#2dd4bf", fontSize: 11, position: "insideBottomRight" }}
                      />
                      {/* The band is the forecast. Its width is the honesty:
                          anything narrower would be invented precision. */}
                      <Area
                        dataKey="band"
                        name={`${MIN_PLANNING_PCT}–${MAX_WEEKLY_PCT}% of body weight a week`}
                        stroke="none"
                        fill="#2dd4bf"
                        fillOpacity={0.16}
                        connectNulls
                        activeDot={false}
                      />
                      <Line
                        type="monotone" dataKey="likely" name="most likely"
                        stroke="#2dd4bf" strokeWidth={2} strokeDasharray="6 4"
                        dot={false} activeDot={false} connectNulls
                      />
                      {outlookPlot.showNaive && (
                        <Line
                          type="linear" dataKey="naive" name="straight line (impossible)"
                          stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="2 4"
                          dot={false} activeDot={false} connectNulls
                        />
                      )}
                      <Line
                        type="monotone" dataKey="weight" name="logged"
                        stroke="#e2e8f0" strokeWidth={2} dot={{ r: 3 }} connectNulls={false}
                      />
                      {outlookPlot.likelyX != null && (
                        <ReferenceDot x={outlookPlot.likelyX} y={goal.goal} r={5} fill="#2dd4bf" stroke="#020617" strokeWidth={2} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : null}

                {outlookPlot?.capped ? (
                  <p className="rb-rate-foot" style={{ marginTop: 8 }}>
                    The slow end of the band runs past the right edge — the chart stops at{" "}
                    {dateLabel(addDays(outlookPlot.firstDate, outlookPlot.maxX))}.
                  </p>
                ) : null}

                <p className="rb-hint" style={{ marginTop: 10 }}>{describeRealistic(outlook)}</p>
                {describeWaterSplit(outlook?.water) ? (
                  <p className="rb-hint" style={{ marginTop: 8 }}>{describeWaterSplit(outlook.water)}</p>
                ) : null}
                {naive ? (
                  <details style={{ marginTop: 10 }}>
                    <summary className="rb-summary">Why not just extend the trend line?</summary>
                    <p className="rb-hint" style={{ marginTop: 8 }}>{describeNaive(naive, rates.weighIns)}</p>
                  </details>
                ) : null}
              </div>
            </>
          )}
        </section>

        {/* How fast the weight is moving, per day, week and month */}
        <section className="rb-card">
          <div className="rb-rate-head">
            <h2 className="rb-section-title" style={{ margin: 0 }}>Rate of weight loss</h2>
            {rates ? (
              <span className="rb-hint rb-num" style={{ margin: 0 }}>
                {signedKg(rates.change)} ({signedPercent(rates.percent)}) since {shortLabel(rates.from)}
                {" — "}{rates.days} days, {rates.weighIns} weigh-ins
              </span>
            ) : null}
          </div>

          {!rates ? (
            <p className="rb-empty">
              Log a weight on two different days and the rate per day, per week and per month
              appears here.
            </p>
          ) : (
            <>
              <div className="rb-rate-grid" style={{ marginTop: 16 }}>
                <RateTile label="per day" rate={rates.day} />
                <RateTile
                  label="per week"
                  rate={rates.week}
                  foot="0.5 to 1% a week is the sustainable band"
                />
                <RateTile label="per month" rate={rates.month} />
              </div>
              <p className="rb-hint" style={{ marginTop: 12 }}>
                {rates.source === "trend"
                  ? "Read off the fitted trend line, so one heavy or dehydrated morning does not move it."
                  : "The plain average between your first and last weigh-in — a few more entries and this switches to the fitted line."}
                {" Percentages are of your current "}{rates.current} kg.
              </p>

              <div className="rb-divider">
                <div className="rb-rate-head" style={{ marginBottom: 14 }}>
                  <h3 className="rb-chart-title" style={{ margin: 0 }}>
                    {asPercent ? "Percent lost per" : "Change per"} {periodLabel}
                  </h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <div className="rb-toggle" role="group" aria-label="Group weigh-ins by">
                      {PERIODS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={period === p.id}
                          onClick={() => setPeriod(p.id)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="rb-toggle" role="group" aria-label="Show change as">
                      <button type="button" aria-pressed={!asPercent} onClick={() => setUnit("kg")}>kg</button>
                      <button type="button" aria-pressed={asPercent} onClick={() => setUnit("pct")}>%</button>
                    </div>
                  </div>
                </div>

                {groups.length < 2 ? (
                  <p className="rb-empty">
                    Only one {periodLabel} has a weigh-in so far. Keep logging and the bars build up.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={groups} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} unit={asPercent ? "%" : " kg"} width={64} />
                      <Tooltip
                        cursor={{ fill: "rgba(148,163,184,0.08)" }}
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }}
                        formatter={(value, name, item) => [
                          `${signedKg(item.payload.change)} (${signedPercent(item.payload.percent)}) over ${item.payload.days} day${item.payload.days === 1 ? "" : "s"}` +
                          `, ${signedPercent(item.payload.percentPerDay)} a day`,
                          item.payload.range,
                        ]}
                      />
                      <ReferenceLine y={0} stroke="#475569" />
                      {/* Each bar is coloured by direction, so a gain is
                          readable as a gain without checking the axis. */}
                      <Bar dataKey={asPercent ? "percent" : "change"} name={asPercent ? "percent" : "change"} radius={[3, 3, 0, 0]}>
                        {groups.map((g) => (
                          <Cell key={g.key} fill={g.change <= 0 ? "#2dd4bf" : "#f43f5e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}

                <details style={{ marginTop: 14 }}>
                  <summary className="rb-summary">Show every {periodLabel} as a table</summary>
                  <div className="rb-table-wrap" style={{ marginTop: 12 }}>
                    <table className="rb-table">
                      <thead>
                        <tr>
                          <th>{PERIODS.find((p) => p.id === period).label}</th>
                          <th>Weigh-ins</th>
                          <th>Ended at</th>
                          <th>Change</th>
                          <th>%</th>
                          <th>Per day</th>
                          <th>% per day</th>
                          <th>Per week</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...groups].reverse().map((g) => (
                          <tr key={g.key}>
                            <td>{g.label}<div style={{ color: "#475569", fontSize: "0.75rem" }}>{g.range}</div></td>
                            <td className="rb-num">{g.count}</td>
                            <td className="rb-num">{g.last} kg</td>
                            <td className={`rb-num ${moveClass(g.change)}`}>{signedKg(g.change)}</td>
                            <td className={`rb-num ${moveClass(g.percent)}`}>{signedPercent(g.percent)}</td>
                            <td className="rb-num">{signedKg(g.perDay)}</td>
                            <td className={`rb-num ${moveClass(g.percentPerDay)}`}>{signedPercent(g.percentPerDay)}</td>
                            <td className="rb-num">{signedKg(g.perWeek)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="rb-hint" style={{ marginTop: 10 }}>
                    Each {periodLabel} is measured from the previous one&rsquo;s last weigh-in, so the
                    changes add up to the {signedKg(rates.change)} total. The percentages are of the
                    weight you carried at the start of that {periodLabel}, so a kilo lost at{" "}
                    {rates.start} kg and a kilo lost at {rates.current} kg are directly comparable.
                  </p>
                </details>
              </div>
            </>
          )}
        </section>

        {/* Challenges + badges */}
        <section className="rb-two-col" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rb-card">
            <h2 className="rb-section-title">This week's challenges</h2>
            {challenges.map((c) => {
              const pct = Math.min(100, Math.round((c.current / c.target) * 100));
              const Icon = c.Icon;
              return (
                <div key={c.id} className="rb-challenge-row">
                  <div className="rb-challenge-top">
                    <span className="rb-challenge-label">
                      <Icon size={16} color="#f59e0b" />
                      {c.label}
                    </span>
                    <span className="rb-challenge-count">
                      {Math.min(c.current, c.target).toLocaleString()} / {c.target.toLocaleString()}
                    </span>
                  </div>
                  <div className="rb-progress-track">
                    <div className="rb-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rb-card">
            <h2 className="rb-section-title">Badges</h2>
            <div className="rb-badges-grid">
              {badges.map((b) => (
                <div key={b.id} className={`rb-badge ${b.earned ? "rb-badge-earned" : ""}`}>
                  <Trophy size={16} color={b.earned ? "#f59e0b" : "#475569"} />
                  <p className="rb-badge-name">{b.name}</p>
                  <p className="rb-badge-desc">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Full log */}
        <section className="rb-card">
          <details>
            <summary className="rb-summary">Full training log ({sorted.length} days)</summary>
            <div style={{ marginTop: 16 }}>
              {sorted.length === 0 ? (
                <p className="rb-empty">No entries yet. Your first log starts the chain.</p>
              ) : (
                <div className="rb-table-wrap">
                  <table className="rb-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Steps</th>
                        <th>Multiplier</th>
                        <th>Sword</th>
                        <th>Push-ups</th>
                        <th>Stretch</th>
                        <th>Weight</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...sorted].reverse().map((e) => (
                        <tr key={e.date}>
                          <td>{e.date}</td>
                          <td>{e.steps.toLocaleString()}</td>
                          <td>{stepMultiplier(e.steps).toFixed(1)}×</td>
                          <td>{e.swordSets}</td>
                          <td>{e.pushupSets}</td>
                          <td>{e.stretchBreaks}</td>
                          <td>{e.weight}</td>
                          <td style={{ color: "#f59e0b", fontWeight: 600 }}>{computePoints(e)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        </section>

        <p className="rb-footer-note">
          Points = (sword sets ×10 + push-up sets ×8 + stretch breaks ×3) × step multiplier (0.7–1.5×,
          based on daily steps). Tune the formula in <code>src/lib/body-rules.js</code>. Every entry is
          saved to <code>data/body_entries.csv</code>, which you can open, edit or graph elsewhere.
        </p>
      </div>
    </div>
  );
}