import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { max } from 'd3-array';

import { todayKey } from '../lib/dates.js';
import {
  FORMATS,
  TOPICS,
  byRecent,
  col,
  derive,
  newId,
  nowTime,
  sampleRows,
  toCsv,
  toScored,
  xpFor,
} from '../lib/learning-rules.js';
import { useTable } from '../lib/use-table.js';
import { Cumulative, Timeline, TopicBars, Weekdays } from './learning/Charts.jsx';
import { TipCtx, fmt, useTip } from './learning/shared.js';
import './learning/learning.css';

/* =====================================================================
   Learning Quest: log what you learn on a topic × format grid, earn XP
   (minutes × format weight), and see where the effort went. Saved to
   data/learning_log.csv via the CSV API.
   ===================================================================== */

const pad = (n) => String(n).padStart(2, '0');

function Grid({ id, label, role, cell }) {
  return (
    <div className="mx" id={id} role={role} aria-label={label}>
      <div />
      {TOPICS.map((t) => (<div className="colh" key={t[0]}><span>{t[0]}</span></div>))}
      {FORMATS.map((f) => (
        <Fragment key={f}>
          <div className="rowh">{f}</div>
          {TOPICS.map((t) => cell(t[0], f))}
        </Fragment>
      ))}
    </div>
  );
}

function Tiles({ D }) {
  const tile = (k, v, n, bar) => (
    <div className="tile" key={k}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {bar != null && (<div className="bar"><i style={{ width: `${bar}%` }} /></div>)}
      <div className="n">{n}</div>
    </div>
  );
  return (
    <div className="tiles">
      {tile('Level', String(D.level), `${fmt(D.toNext)} XP to next`, D.pct)}
      {tile('Total XP', fmt(D.xp), 'minutes × format weight')}
      {tile('Streak', `${D.streak} d`, 'days in a row')}
      {tile('Days learned', String(D.days), `${D.entries} entries`)}
      {tile('Explored', `${Math.round((D.explored / D.total) * 100)}%`, `${D.total - D.explored} cells to go`)}
    </div>
  );
}

function Banner({ S, setRows, toast }) {
  const n = S.filter((r) => r.sample).length;
  const mode = n ? 'remove' : S.length === 0 ? 'load' : null;
  if (!mode) return null;
  const run = () => {
    if (mode === 'load') {
      setRows((p) => [...p, ...sampleRows()]);
      toast('Sample data loaded');
    } else {
      setRows((p) => p.filter((r) => r.sample !== 'true'));
      toast('Samples removed');
    }
  };
  return (
    <div className="banner">
      <span>{mode === 'remove' ? `${n} sample entries are loaded so you can see the charts. They are not your data.` : 'Nothing logged yet. Log your first entry below, or preview the charts with sample data.'}</span>
      <button className="ghost" type="button" onClick={run}>{mode === 'remove' ? 'Remove samples' : 'Load sample data'}</button>
    </div>
  );
}

function Register({ S, setRows, toast }) {
  const [sel, setSel] = useState(null);
  const [date, setDate] = useState(todayKey);
  const [time, setTime] = useState(nowTime);
  const [minutes, setMinutes] = useState('30');
  const [title, setTitle] = useState('');

  const counts = useMemo(() => {
    const c = {};
    S.forEach((r) => { const k = `${r.topic}|${r.format}`; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [S]);

  const pick = (t, f) => {
    setSel({ t, f });
    setTime(nowTime());
    if (!date) setDate(todayKey());
  };

  const save = () => {
    if (!sel) return;
    const min = Number(minutes);
    if (!(min > 0)) { toast('Enter the minutes first'); return; }
    setRows((p) => [...p, {
      id: newId(), date: date || todayKey(), time: time || nowTime(), topic: sel.t, format: sel.f,
      minutes: String(min), title: title.trim(), sample: 'false', created: String(Date.now()),
    }]);
    toast(`Logged +${xpFor(min, sel.f)} XP`);
    setTitle('');
  };

  return (
    <section className="card" aria-labelledby="h-reg">
      <h2 id="h-reg">Log what you learned</h2>
      <p className="note">Tap a topic and format, set the minutes, save. Every entry is stored in data/learning_log.csv.</p>
      <div className="mxwrap">
        <Grid id="mx-reg" role="group" label="Register matrix" cell={(t, f) => {
          const n = counts[`${t}|${f}`] || 0;
          return (
            <button key={t + f} type="button" className="cell" style={{ '--c': col(t) }}
              aria-label={`${f} for ${t}, ${n} logged`}
              aria-pressed={!!sel && sel.t === t && sel.f === f}
              onClick={() => pick(t, f)}>{n ? String(n) : '+'}</button>
          );
        }} />
      </div>
      <div className="panel">
        <div className="pick">
          <i style={{ background: sel ? col(sel.t) : 'var(--ink-2)' }} />
          <span>{sel ? `${sel.t}  ·  ${sel.f}` : 'Pick a cell above'}</span>
        </div>
        <div className="fields">
          <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label>Minutes<input type="number" min="1" max="1440" step="5" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
          <label className="wide">What did you read, watch or build?
            <input type="text" placeholder="e.g. LLVM IR in depth" maxLength={140} autoComplete="off" value={title}
              onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
          </label>
          <button className="primary" type="button" disabled={!sel} onClick={save}>Log it</button>
        </div>
        <div className="chips">
          {[15, 30, 60, 90, 120].map((m) => (<button key={m} type="button" onClick={() => setMinutes(String(m))}>{`${m} min`}</button>))}
        </div>
      </div>
    </section>
  );
}

function VizMatrix({ S }) {
  const tip = useTip();
  const by = useMemo(() => {
    const m = {};
    S.forEach((r) => { const k = `${r.topic}|${r.format}`; const o = m[k] || (m[k] = { n: 0, xp: 0, items: [] }); o.n++; o.xp += r.xp; o.items.push(r); });
    return m;
  }, [S]);
  const top = max(Object.values(by), (o) => o.xp) || 1;
  return (
    <section className="card" aria-labelledby="h-viz">
      <h2 id="h-viz">Skill matrix</h2>
      <p className="note">Same grid, read-only. Stronger color means more XP. Dashed cells are still unexplored.</p>
      <div className="mxwrap">
        <Grid id="mx-viz" role="img" label="Skill matrix of XP by topic and format" cell={(t, f) => {
          const o = by[`${t}|${f}`];
          if (!o) {
            return <div key={t + f} className="cell empty" onMouseMove={(e) => tip.show(e, [`${t} · ${f}`, 'Unexplored'])} onMouseLeave={tip.hide} />;
          }
          const pct = Math.round(18 + 82 * Math.sqrt(o.xp / top));
          const last = o.items.slice().sort(byRecent).slice(0, 3).map((r) => `${r.date}  ${r.title}`);
          return (
            <div key={t + f} className="cell" style={{ background: `color-mix(in srgb, ${col(t)} ${pct}%, transparent)`, borderColor: col(t) }}
              onMouseMove={(e) => tip.show(e, [`${t} · ${f}`, `${o.n} entries · ${fmt(o.xp)} XP`, ...last])} onMouseLeave={tip.hide}>{o.n}</div>
          );
        }} />
      </div>
    </section>
  );
}

function RemoveButton({ r, onRemove }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = () => {
    if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 3000); return; }
    clearTimeout(timer.current);
    onRemove(r.id);
  };
  return (
    <button className="ghost" type="button" style={{ padding: '4px 10px', borderColor: armed ? 'var(--t-math)' : undefined }}
      aria-label={`Remove entry ${r.title || r.topic}`} onClick={click}>
      {armed ? 'Confirm' : 'Remove'}
    </button>
  );
}

function Latest({ S, setRows, toast }) {
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => S.slice().sort(byRecent), [S]);
  const rows = all ? sorted : sorted.slice(0, 8);

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(S)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'learning-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(toCsv(S)); toast('CSV copied'); } catch { toast('Copy is blocked here, use Download'); }
  };
  const remove = (id) => { setRows((p) => p.filter((r) => r.id !== id)); toast('Entry removed'); };

  return (
    <section className="card" aria-labelledby="h-last">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h2 id="h-last">Latest entries</h2>
          <p className="note" style={{ marginBottom: 0 }}>Your most recent entries. Press Remove twice to delete one.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="ghost" type="button" onClick={download}>Download CSV</button>
          <button className="ghost" type="button" onClick={copy}>Copy CSV</button>
        </div>
      </div>
      <div className="tblwrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Topic</th><th>Format</th><th>What</th><th>XP</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="m">{r.date}</td>
                <td className="m">{r.time}</td>
                <td><i className="dot" style={{ background: col(r.topic) }} />{r.topic}</td>
                <td>{r.format}</td>
                <td>{r.title}</td>
                <td className="m">{fmt(r.xp)}</td>
                <td><RemoveButton r={r} onRemove={remove} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {S.length === 0 && (<div className="empty-state">No entries yet. Pick a cell in the register to log your first one.</div>)}
      {sorted.length > 8 && (
        <button className="ghost" type="button" style={{ marginTop: 12 }} onClick={() => setAll((v) => !v)}>
          {all ? 'Show only the latest 8' : `Show all ${sorted.length} entries`}
        </button>
      )}
    </section>
  );
}

export default function Learning() {
  const [rows, setRows, ready] = useTable('learning_log');
  const S = useMemo(() => toScored(rows), [rows]);
  const D = useMemo(() => derive(S), [S]);

  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null);
  const show = useCallback((ev, lines) => {
    const r = wrapRef.current.getBoundingClientRect();
    const x = Math.max(4, Math.min(ev.clientX - r.left + 14, r.width - 284));
    setTip({ x, y: ev.clientY - r.top + 16, lines });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const tipApi = useMemo(() => ({ show, hide }), [show, hide]);

  const [toastText, setToastText] = useState('');
  const toastTimer = useRef(null);
  const toast = useCallback((t) => {
    setToastText(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(''), 2200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const status = ready ? `LVL ${pad(D.level)}  ·  ${fmt(D.xp)} XP  ·  ${D.streak}-day streak` : 'Loading your log';

  return (
    <TipCtx.Provider value={tipApi}>
      <div className="lq">
        <div className="wrap" ref={wrapRef}>
          <header>
            <h1>Learning Quest</h1>
            <p className="sub">{status}</p>
          </header>

          {ready && (<>
            <Tiles D={D} />
            <Banner S={S} setRows={setRows} toast={toast} />
            <Register S={S} setRows={setRows} toast={toast} />
            <VizMatrix S={S} />

            <section className="card" aria-labelledby="h-time">
              <h2 id="h-time">Learning timeline</h2>
              <p className="note">One dot per entry: the day across, the time of day up and down. Bigger dot, more minutes. Hover for the title.</p>
              <div className="legend">
                {TOPICS.map((t) => (<span key={t[0]}><i style={{ background: col(t[0]) }} />{t[0]}</span>))}
              </div>
              <Timeline S={S} today={D.today} />
            </section>

            <div className="grid3">
              <section className="card"><h2>Cumulative XP</h2><p className="note">Total XP over time.</p><Cumulative S={S} today={D.today} /></section>
              <section className="card"><h2>Best weekdays</h2><p className="note">Days with at least one entry.</p><Weekdays S={S} /></section>
              <section className="card"><h2>XP by topic</h2><p className="note">Where the effort went.</p><TopicBars S={S} /></section>
            </div>

            <Latest S={S} setRows={setRows} toast={toast} />
          </>)}

          {tip && (
            <div className="tip" style={{ left: tip.x, top: tip.y }}>
              {tip.lines.map((l, i) => (<div key={i} style={i === 0 ? { fontWeight: 600 } : { color: 'var(--ink-2)' }}>{l}</div>))}
            </div>
          )}
        </div>
        {toastText && (<div className="toast" role="status">{toastText}</div>)}
      </div>
    </TipCtx.Provider>
  );
}
