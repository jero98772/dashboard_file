import { useState, useEffect, useMemo } from 'react';

import { addDays, parseKey, toKey } from '../lib/dates.js';
import {
  DEFAULT_IDENTITY,
  HABITS,
  HABIT_IDS,
  LEVELS,
  PER,
  TIERS,
  byPrefix,
  compute,
  isSet,
  levelFor,
  multFor,
  rowsToDone,
  tierIndex,
} from '../lib/food-rules.js';
import { useSettings, useTable } from '../lib/use-table.js';

/* =====================================================================
   Real Food Dashboard: an Atomic Habits tracker for healthy eating.
   Progress is saved to data/food_days.csv via the CSV API.
   ===================================================================== */

/* ---------- rules & data ---------- */
const LAWS = {
  build: [
    { id: 'b1', law: 'Make it obvious', text: 'Put a fruit bowl on the counter and a full water bottle on your desk. Then edit each cue above so it names a real moment and place in your day.' },
    { id: 'b2', law: 'Make it attractive', text: 'Bundle a good habit with something you enjoy, like saving your favorite podcast or playlist for the time you cook real food.' },
    { id: 'b3', law: 'Make it easy', text: 'Wash and cut vegetables once a week, so the healthy choice takes two minutes or less when you are hungry.' },
    { id: 'b4', law: 'Make it satisfying', text: 'Check the plate the moment you finish, and let that small win land. Tell a friend about your chain so someone notices.' },
  ],
  break: [
    { id: 'x1', law: 'Make it invisible', text: 'Move sweets, soda and packaged snacks out of sight. Better still, keep them out of the house.' },
    { id: 'x2', law: 'Make it unattractive', text: 'After a sugary snack, write down how you feel 30 minutes later. Read that note the next time a craving shows up.' },
    { id: 'x3', law: 'Make it difficult', text: 'Stop stocking it. If you want a treat, you have to leave the house and buy a single portion.' },
    { id: 'x4', law: 'Make it unsatisfying', text: 'Make a habit contract with someone you trust: a small, agreed cost each time you slip.' },
  ],
};

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKS = 12;
const EDIT_WINDOW_DAYS = 7; // today plus the 6 days before it

/* ---------- helpers ---------- */
const fmtLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const num = (n) => Number(n).toLocaleString('en-US');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmtMult = (m) => `×${Number.isInteger(m) ? m.toFixed(1) : m}`;

/* annular sector path for one wedge of the plate (angles in degrees, 0 = top) */
function sector(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => {
    const t = ((a - 90) * Math.PI) / 180;
    return [(cx + r * Math.cos(t)).toFixed(2), (cy + r * Math.sin(t)).toFixed(2)];
  };
  const [ax, ay] = p(r1, a0);
  const [bx, by] = p(r1, a1);
  const [cx2, cy2] = p(r0, a1);
  const [dx, dy] = p(r0, a0);
  return `M${ax} ${ay}A${r1} ${r1} 0 0 1 ${bx} ${by}L${cx2} ${cy2}A${r0} ${r0} 0 0 0 ${dx} ${dy}Z`;
}

/* ---------- small pieces ---------- */
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Masthead({ identity, votes, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(identity);
  const save = () => {
    onSave(draft.trim() || DEFAULT_IDENTITY);
    setEditing(false);
  };
  return (
    <header className="rf-masthead">
      {editing ? (
        <div className="rf-identity-edit">
          <input
            value={draft}
            maxLength={80}
            autoFocus
            aria-label="Who you are becoming"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <button type="button" className="rf-btn" onClick={save}>Save</button>
          <button type="button" className="rf-link" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <h1 className="rf-identity">{identity}</h1>
      )}
      <p className="rf-lede">
        Every meal is a vote for that person. You have cast <strong>{num(votes)}</strong>{' '}
        {votes === 1 ? 'vote' : 'votes'} so far.
      </p>
      {!editing && (
        <button type="button" className="rf-link" onClick={() => { setDraft(identity); setEditing(true); }}>
          Change who you are becoming
        </button>
      )}
    </header>
  );
}

function Plate({ info, doneSet, editable, onToggle }) {
  const cx = 120;
  const cy = 120;
  return (
    <svg
      className={`rf-plate${info.perfect ? ' perfect' : ''}`}
      viewBox="0 0 240 240"
      role="img"
      aria-label={`${info.n} of ${HABITS.length} votes cast, ${info.points} points`}
    >
      <circle className="rim" cx={cx} cy={cy} r="116" />
      {HABITS.map((hb, i) => {
        const a0 = i * 72;
        const a1 = (i + 1) * 72;
        const isDone = doneSet.has(hb.id);
        const t = (((a0 + a1) / 2 - 90) * Math.PI) / 180;
        const mx = cx + 72 * Math.cos(t);
        const my = cy + 72 * Math.sin(t);
        return (
          <g key={hb.id} onClick={editable ? () => onToggle(hb.id) : undefined}>
            <title>{`${hb.name}${isDone ? ' (done)' : ''}`}</title>
            <path
              className={`wedge${editable ? ' live' : ''}`}
              d={sector(cx, cy, 44, 100, a0, a1)}
              style={{ fill: isDone ? `var(--c-${hb.id})` : 'var(--surface)', stroke: 'var(--surface-2)' }}
              strokeWidth="4"
              strokeLinejoin="round"
            />
            {isDone && (
              <path
                d="M-8 0L-2.5 6L8 -6"
                transform={`translate(${mx.toFixed(1)} ${my.toFixed(1)})`}
                fill="none"
                style={{ stroke: `var(--on-${hb.id})` }}
                strokeWidth="3.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="37" style={{ fill: 'var(--surface)', stroke: 'var(--line)' }} strokeWidth="1.5" />
      <text className="rf-plate-num" x={cx} y={cy + 5} textAnchor="middle">{info.points}</text>
      <text className="rf-plate-sub" x={cx} y={cy + 22} textAnchor="middle">points</text>
    </svg>
  );
}

function HabitRow({ habit, done, editable, cue, onToggle, onCue }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cue);
  const save = () => {
    const v = draft.trim();
    onCue(habit.id, v && v !== habit.cue ? v : null);
    setEditing(false);
  };
  return (
    <li
      className={`rf-habit${done ? ' is-done' : ''}`}
      style={{ '--hc': `var(--c-${habit.id})`, '--on': `var(--on-${habit.id})` }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={habit.name}
        className="rf-check"
        disabled={!editable}
        onClick={() => onToggle(habit.id)}
      >
        <CheckIcon />
      </button>
      <div>
        <h3 className="rf-habit-name">{habit.name}</h3>
        {editing ? (
          <div className="rf-cue-edit">
            <textarea
              value={draft}
              rows={3}
              autoFocus
              aria-label={`Your cue for ${habit.name}`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <p className="hint">Write it as: After I [something I already do], I will [this habit], in [place].</p>
            <div className="row">
              <button type="button" className="rf-btn" onClick={save}>Save cue</button>
              <button type="button" className="rf-link" onClick={() => { onCue(habit.id, null); setEditing(false); }}>Use the suggested cue</button>
              <button type="button" className="rf-link" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="rf-cue">{cue}</p>
            <div className="rf-habit-actions">
              <button type="button" className="rf-link" onClick={() => { setDraft(cue); setEditing(true); }}>Edit cue</button>
              <details className="rf-more">
                <summary>Start small and tips</summary>
                <p><strong>Start small: </strong>{habit.small}</p>
                <p><strong>{habit.lever}: </strong>{habit.tip}</p>
              </details>
            </div>
          </>
        )}
      </div>
      <span className="rf-pts">+{PER}</span>
    </li>
  );
}

function DayPanel({ sel, isToday, info, editable, cues, banner, onToggle, onCue, onBack }) {
  const doneSet = new Set(info.done);
  const long = fmtLong.format(parseKey(sel));
  const next = multFor(info.before + 1);
  let caption;
  if (info.perfect) {
    caption = (
      <span>
        <strong>Perfect day.</strong> +{info.points} points{info.mult > 1 ? ` with the ${fmtMult(info.mult)} streak bonus.` : '.'}
      </span>
    );
  } else if (!editable) {
    caption = `This day is locked. You can edit the last ${EDIT_WINDOW_DAYS} days.`;
  } else {
    caption = `Cast all ${HABITS.length} votes for ${info.projected} points${next > 1 ? ` (${fmtMult(next)} streak bonus).` : '.'}`;
  }
  return (
    <section className="rf-day" id="rf-day" aria-labelledby="rf-day-title">
      <div className="rf-day-head">
        <div>
          <h2 id="rf-day-title">{isToday ? 'Today' : long}</h2>
          <p className="sub">{isToday ? `${long}. ` : ''}{info.n} of {HABITS.length} votes cast.</p>
        </div>
        {!isToday && <button type="button" className="rf-btn ghost" onClick={onBack}>Back to today</button>}
      </div>
      {banner && <div className={`rf-banner${banner.kind === 'warn' ? ' warn' : ''}`} role="status">{banner.text}</div>}
      <div className="rf-day-body">
        <div className="rf-plate-wrap">
          <Plate info={info} doneSet={doneSet} editable={editable} onToggle={onToggle} />
          <p className="rf-caption" aria-live="polite">{caption}</p>
        </div>
        <ul className="rf-habits">
          {HABITS.map((hb) => (
            <HabitRow
              key={hb.id}
              habit={hb}
              done={doneSet.has(hb.id)}
              editable={editable}
              cue={cues[hb.id] || hb.cue}
              onToggle={onToggle}
              onCue={onCue}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function LevelPanel({ total }) {
  const cur = levelFor(total);
  const idx = LEVELS.indexOf(cur);
  const next = LEVELS[idx + 1];
  const pct = next ? Math.min(100, Math.round(((total - cur.min) / (next.min - cur.min)) * 100)) : 100;
  return (
    <section aria-labelledby="rf-lv-title">
      <h2 id="rf-lv-title">Level {cur.n}: {cur.name}</h2>
      <p className="rf-big">{num(total)}<small>points</small></p>
      <div className="rf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to next level">
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="rf-note">
        {next
          ? `${num(next.min - total)} points to reach Level ${next.n}, ${next.name}. Levels never go down.`
          : 'Top level reached. Keep casting votes.'}
      </p>
      <ol className="rf-levels">
        {LEVELS.map((l) => {
          const state = total >= l.min ? (l === cur ? 'current' : 'done') : 'locked';
          return (
            <li key={l.n} className={state}>
              <span className="lv-mark">{state === 'done' ? <CheckIcon /> : l.n}</span>
              <span>
                <span className="lv-name">{l.name}</span>
                <span className="lv-range">{l.range}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StreakPanel({ info }) {
  const streak = info.streakAfter;
  const active = tierIndex(info.before + 1);
  const next = TIERS[active + 1];
  return (
    <section aria-labelledby="rf-st-title">
      <h2 id="rf-st-title">Streak</h2>
      <p className="rf-big">{streak}<small>{streak === 1 ? 'perfect day in a row' : 'perfect days in a row'}</small></p>
      <div className="rf-tiers">
        {TIERS.map((t, i) => (
          <div
            key={t.label}
            className={`seg t${i + 1}${i <= active ? ' on' : ''}${i === active ? ' cur' : ''}`}
            aria-current={i === active ? 'true' : undefined}
          >
            <span className="m">{t.label}</span>
            <span className="d">{t.days}</span>
          </div>
        ))}
      </div>
      <p className="rf-note">
        {info.perfect ? 'Today earned ' : 'Today is worth '}
        {fmtMult(TIERS[active].mult)}
        {info.perfect ? '. ' : ' if you finish all five. '}
        {next
          ? `${next.label} starts on day ${next.from}: ${plural(next.from - streak, 'more perfect day')} to go.`
          : 'Legend Mode is on. Perfect days pay double.'}
      </p>
    </section>
  );
}

function ChainPanel({ perDay, today, start, sel, totals, onSelect }) {
  const dow = (parseKey(today).getDay() + 6) % 7; // Monday = 0
  const first = addDays(addDays(today, -dow), -7 * (WEEKS - 1));

  const renderCell = (k) => {
    const future = k > today;
    const info = perDay[k];
    const before = k < start || !info;
    let cls = 'cell';
    let style;
    let label = fmtLong.format(parseKey(k));
    if (future) {
      cls += ' future';
      label += ': upcoming';
    } else if (before) {
      cls += ' pre';
      label += ': before you started';
    } else if (info.perfect) {
      cls += ` t${tierIndex(info.streakAfter) + 1}`;
      label += `: perfect day, chain day ${info.streakAfter}, ${fmtMult(info.mult)}, ${info.points} points`;
    } else if (info.n === 0) {
      if (k < today) cls += ' miss';
      label += ': no votes cast';
    } else {
      const pct = Math.round((info.n / HABITS.length) * 100);
      style = { background: `linear-gradient(to top, var(--partial) ${pct}%, var(--surface-2) ${pct}%)` };
      label += `: ${info.n} of ${HABITS.length} votes`;
    }
    if (k === today) cls += ' today';
    if (k === sel) cls += ' sel';
    return (
      <button
        key={k}
        type="button"
        className={cls}
        style={style}
        disabled={future || before}
        aria-label={label}
        aria-pressed={k === sel}
        onClick={() => onSelect(k)}
      >
        {parseKey(k).getDate()}
      </button>
    );
  };

  const cells = [<span key="c0" />];
  DAY_LETTERS.forEach((l, i) => cells.push(<span key={`wd${i}`} className="wd" aria-hidden="true">{l}</span>));
  for (let w = 0; w < WEEKS; w++) {
    const mon = addDays(first, 7 * w);
    cells.push(<span key={`wk${w}`} className="wk">{fmtShort.format(parseKey(mon))}</span>);
    for (let i = 0; i < 7; i++) cells.push(renderCell(addDays(mon, i)));
  }

  const stats = [
    ['Perfect days', totals.perfect],
    ['Longest chain', totals.longest],
    ['Votes cast', totals.votes],
    ['Days tracked', totals.tracked],
  ];

  return (
    <section className="rf-section" aria-labelledby="rf-ch-title">
      <h2 id="rf-ch-title">Your chain</h2>
      <p className="lead">
        A filled square is a perfect day, and its color deepens with your streak multiplier. Select any of the last {EDIT_WINDOW_DAYS} days to fix what you forgot to log.
      </p>
      <div className="rf-chain-grid">
        <div className="rf-cal" role="group" aria-label={`Last ${WEEKS} weeks`}>{cells}</div>
        <div>
          <dl className="rf-stats">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{num(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="rf-legend">
            <span><i className="t1" />×1.0</span>
            <span><i className="t2" />×1.25</span>
            <span><i className="t3" />×1.5</span>
            <span><i className="t4" />×2.0</span>
            <span><i className="part" />Some votes</span>
            <span><i className="miss" />Missed</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function LawsPanel({ tab, setTab, setup, onSetup }) {
  const all = [...LAWS.build, ...LAWS.break];
  const doneCount = all.filter((x) => setup[x.id]).length;
  const count = (t) => LAWS[t].filter((x) => setup[x.id]).length;
  const tabs = [
    ['build', 'Build real-food habits'],
    ['break', 'Break sugar and snack habits'],
  ];
  return (
    <section className="rf-section" aria-labelledby="rf-lw-title">
      <div className="rf-laws-head">
        <div>
          <h2 id="rf-lw-title">Design your surroundings</h2>
          <p className="lead">Willpower runs out by evening. Your environment does not. Set each of these up once, and tick it when it is done.</p>
        </div>
        <p className="rf-progress-inline">{doneCount} of {all.length} set up</p>
      </div>
      <div className="rf-tabs" role="tablist" aria-label="Four laws of behavior change">
        {tabs.map(([id, label], i) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`rf-tab-${id}`}
            className="tab"
            aria-selected={tab === id}
            aria-controls="rf-panel-laws"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const other = tabs[(i + 1) % 2][0];
                setTab(other);
                document.getElementById(`rf-tab-${other}`)?.focus();
              }
            }}
          >
            {label} ({count(id)}/4)
          </button>
        ))}
      </div>
      <ul className="rf-law-list" role="tabpanel" id="rf-panel-laws" aria-labelledby={`rf-tab-${tab}`}>
        {LAWS[tab].map((it) => (
          <li key={it.id} className="law">
            <label>
              <input type="checkbox" checked={!!setup[it.id]} onChange={() => onSetup(it.id)} />
              <span className="law-body">
                <span className="law-title">{it.law}</span>
                <span className="law-text">{it.text}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer({ onReset }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <footer className="rf-foot">
      <p>Saved to <code>data/food_days.csv</code> and <code>data/food_settings.csv</code>. Built on the ideas in Atomic Habits by James Clear.</p>
      {armed ? (
        <span>
          <button type="button" className="rf-btn danger" onClick={() => { setArmed(false); onReset(); }}>Erase everything</button>{' '}
          <button type="button" className="rf-link" onClick={() => setArmed(false)}>Keep my progress</button>
        </span>
      ) : (
        <button type="button" className="rf-link" onClick={() => setArmed(true)}>Reset all progress</button>
      )}
    </footer>
  );
}

/* ---------- app ---------- */
export default function RealFoodDashboard() {
  const [dayRows, setDayRows, daysReady] = useTable('food_days');
  const [settings, setSetting, settingsReady, clearSettings] = useSettings('food_settings');
  const [today, setToday] = useState(() => toKey(new Date()));
  const [selected, setSelected] = useState(null); // null = today
  const [tab, setTab] = useState('build');

  const done = useMemo(() => rowsToDone(dayRows), [dayRows]);
  const cues = useMemo(() => byPrefix(settings, 'cue.'), [settings]);
  const setup = useMemo(() => byPrefix(settings, 'setup.'), [settings]);
  const identity = settings.identity || DEFAULT_IDENTITY;
  // Before the first day is logged the chain starts today; once there is
  // history, the oldest row wins so an imported CSV reads correctly.
  const startedOn = settings.startedOn || Object.keys(done).sort()[0] || today;

  // Stamp the start date the first time this dashboard is opened, so the
  // chain length stays stable even if the earliest day is later deleted.
  useEffect(() => {
    if (daysReady && settingsReady && !settings.startedOn) setSetting('startedOn', startedOn);
  }, [daysReady, settingsReady, settings.startedOn, startedOn, setSetting]);

  const state = useMemo(
    () => ({ startedOn, identity, cues, done, setup }),
    [startedOn, identity, cues, done, setup],
  );

  // roll over at midnight
  useEffect(() => {
    const id = setInterval(() => {
      const k = toKey(new Date());
      setToday((prev) => (prev === k ? prev : k));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const { perDay, totals, start } = useMemo(() => compute(state, today), [state, today]);

  const sel = selected && perDay[selected] ? selected : today;
  const info = perDay[sel];
  const todayInfo = perDay[today];
  const isToday = sel === today;
  const earliest = addDays(today, -(EDIT_WINDOW_DAYS - 1)) > start ? addDays(today, -(EDIT_WINDOW_DAYS - 1)) : start;
  const editable = sel >= earliest && sel <= today;

  const toggle = (id) => {
    if (!editable) return;
    setDayRows((prev) => {
      const i = prev.findIndex((r) => r.date === sel);
      const base = i >= 0
        ? prev[i]
        : { date: sel, ...Object.fromEntries(HABIT_IDS.map((h) => [h, '0'])) };
      const row = { ...base, [id]: isSet(base[id]) ? '0' : '1' };
      const next = i >= 0 ? prev.map((r, j) => (j === i ? row : r)) : [...prev, row];
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
  };
  const setCue = (id, val) => setSetting(`cue.${id}`, val || '');
  const toggleSetup = (id) => setSetting(`setup.${id}`, setup[id] ? '' : '1');
  const reset = () => {
    setSelected(null);
    setDayRows([]);
    clearSettings();
  };
  const select = (k) => {
    setSelected(k === today ? null : k);
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('rf-day')?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  };

  // one gentle message at most
  const yesterday = perDay[addDays(today, -1)];
  let banner = null;
  if (isToday && !todayInfo.perfect) {
    if (yesterday && !yesterday.perfect) {
      banner = { kind: 'warn', text: 'Yesterday was a miss, so today starts at ×1.0. The rule is never miss twice: cast all five votes and your chain starts again.' };
    } else if (totals.votes === 0) {
      banner = { kind: 'info', text: 'Start with the vote that feels easiest. Each check is a small proof of who you are becoming.' };
    }
  }

  return (
    <div className="rf-root">
      <style>{CSS}</style>
      <div className="rf-wrap">
        <Masthead
          key={state.identity}
          identity={state.identity}
          votes={totals.votes}
          onSave={(v) => setSetting('identity', v)}
        />
        <div className="rf-grid">
          <DayPanel
            sel={sel}
            isToday={isToday}
            info={info}
            editable={editable}
            cues={state.cues}
            banner={banner}
            onToggle={toggle}
            onCue={setCue}
            onBack={() => setSelected(null)}
          />
          <aside className="rf-side" aria-label="Your progress">
            <LevelPanel total={totals.points} />
            <StreakPanel info={todayInfo} />
          </aside>
        </div>
        <ChainPanel perDay={perDay} today={today} start={start} sel={sel} totals={totals} onSelect={select} />
        <LawsPanel tab={tab} setTab={setTab} setup={state.setup} onSetup={toggleSetup} />
        <Footer onReset={reset} />
      </div>
    </div>
  );
}

/* ---------- styles (fonts load from Google Fonts) ---------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&display=swap');

.rf-root{
  --bg:#F3F6EF; --surface:#FFFFFF; --surface-2:#E8EEE4; --ink:#17261E; --muted:#556960; --line:#D1DBCD;
  --leaf:#2D7A4E; --gold:#D9A00E; --tomato:#C4442A; --focus:#1F63C9; --partial:#A9D3B6;
  --t1:#9CCFAA; --t2:#5FB27C; --t3:#2D7A4E; --t4:#E3AC16;
  --t1-ink:#10201A; --t2-ink:#0F1F16; --t3-ink:#FFFFFF; --t4-ink:#231A02;
  --c-breakfast:#E0AA12; --c-plants:#3C8D57; --c-water:#3F8FBF; --c-pause:#D2522F; --c-prep:#7B4F92;
  --on-breakfast:#231A02; --on-plants:#FFFFFF; --on-water:#FFFFFF; --on-pause:#FFFFFF; --on-prep:#FFFFFF;
}
@media (prefers-color-scheme: dark){
  .rf-root:not([data-theme="light"]){
    --bg:#0E1813; --surface:#15231B; --surface-2:#1D2F25; --ink:#E6EFE7; --muted:#9BAEA2; --line:#2B3E33;
    --leaf:#5DBA84; --gold:#F0BE3A; --tomato:#EE7658; --focus:#8AB8FF; --partial:#2F5E42;
    --t1:#2C5A40; --t2:#4A9C69; --t3:#5DBA84; --t4:#F0BE3A;
    --t1-ink:#E6EFE7; --t2-ink:#0B140F; --t3-ink:#0B140F; --t4-ink:#231A02;
    --c-breakfast:#EDBB3C; --c-plants:#58B478; --c-water:#63AEDB; --c-pause:#EE7658; --c-prep:#A57BBB;
    --on-breakfast:#0B140F; --on-plants:#0B140F; --on-water:#0B140F; --on-pause:#0B140F; --on-prep:#0B140F;
  }
}
.rf-root[data-theme="dark"],:root[data-theme="dark"] .rf-root{
  --bg:#0E1813; --surface:#15231B; --surface-2:#1D2F25; --ink:#E6EFE7; --muted:#9BAEA2; --line:#2B3E33;
  --leaf:#5DBA84; --gold:#F0BE3A; --tomato:#EE7658; --focus:#8AB8FF; --partial:#2F5E42;
  --t1:#2C5A40; --t2:#4A9C69; --t3:#5DBA84; --t4:#F0BE3A;
  --t1-ink:#E6EFE7; --t2-ink:#0B140F; --t3-ink:#0B140F; --t4-ink:#231A02;
  --c-breakfast:#EDBB3C; --c-plants:#58B478; --c-water:#63AEDB; --c-pause:#EE7658; --c-prep:#A57BBB;
  --on-breakfast:#0B140F; --on-plants:#0B140F; --on-water:#0B140F; --on-pause:#0B140F; --on-prep:#0B140F;
}

.rf-root,.rf-root *,.rf-root *::before,.rf-root *::after{box-sizing:border-box}
.rf-root{
  min-height:100vh; background:var(--bg); color:var(--ink);
  font-family:'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  font-size:16px; line-height:1.5; font-optical-sizing:auto;
}
.rf-root button,.rf-root input,.rf-root textarea{font:inherit;color:inherit}
.rf-root button{cursor:pointer}
.rf-root button:disabled{cursor:default}
.rf-root :focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:6px}
.rf-root h1,.rf-root h2,.rf-root h3,.rf-root p,.rf-root ul,.rf-root ol,.rf-root dl,.rf-root dd{margin:0}
.rf-root ul,.rf-root ol{padding:0;list-style:none}

.rf-wrap{max-width:1120px;margin:0 auto;padding:clamp(24px,4vw,56px) clamp(16px,4vw,40px) 80px}

/* masthead */
.rf-masthead{margin-bottom:clamp(28px,5vw,52px)}
.rf-identity{font-size:clamp(2.2rem,5.6vw,4rem);line-height:1.03;letter-spacing:-.028em;font-weight:700;max-width:15ch;font-variation-settings:"opsz" 96}
.rf-identity-edit{display:flex;gap:10px;flex-wrap:wrap;align-items:center;max-width:640px}
.rf-identity-edit input{flex:1 1 280px;min-width:0;font-size:1.5rem;font-weight:600;padding:12px 16px;border-radius:14px;border:2px solid var(--ink);background:var(--surface)}
.rf-lede{margin-top:16px;font-family:'Newsreader',Georgia,serif;font-size:1.25rem;color:var(--muted);max-width:52ch}
.rf-lede strong{color:var(--ink);font-weight:600}
.rf-masthead .rf-link{margin-top:10px}

.rf-link{background:none;border:0;padding:2px 0;color:var(--muted);text-decoration:underline;text-underline-offset:3px;font-size:.88rem}
.rf-link:hover{color:var(--ink)}
.rf-btn{background:var(--ink);color:var(--bg);border:0;border-radius:999px;padding:9px 18px;font-weight:600}
.rf-btn:hover{opacity:.9}
.rf-btn.ghost{background:transparent;color:var(--ink);border:1.5px solid var(--line)}
.rf-btn.danger{background:var(--tomato);color:#fff}

/* layout */
.rf-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:clamp(32px,5vw,64px);align-items:start}
@media (max-width:900px){.rf-grid{grid-template-columns:minmax(0,1fr)}}

/* day panel */
.rf-day{background:var(--surface);border:1px solid var(--line);border-radius:30px;padding:clamp(20px,3.2vw,34px);scroll-margin-top:16px}
.rf-day-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.rf-day-head h2{font-size:1.75rem;letter-spacing:-.015em;line-height:1.15}
.rf-day-head .sub{color:var(--muted);margin-top:2px}
.rf-banner{margin-top:20px;padding:12px 16px;border-left:4px solid var(--leaf);background:var(--surface-2);border-radius:0 12px 12px 0;font-size:.98rem}
.rf-banner.warn{border-left-color:var(--tomato)}
.rf-day-body{display:grid;grid-template-columns:236px minmax(0,1fr);gap:clamp(20px,3vw,36px);margin-top:26px;align-items:start}
@media (max-width:640px){.rf-day-body{grid-template-columns:minmax(0,1fr)}}
.rf-plate-wrap{position:sticky;top:20px;text-align:center}
@media (max-width:640px){.rf-plate-wrap{position:static}}
.rf-plate{width:100%;max-width:236px;height:auto;display:block;margin:0 auto}
.rf-plate .wedge{transition:fill .25s ease}
.rf-plate .wedge.live{cursor:pointer}
.rf-plate .rim{fill:var(--surface-2);stroke:var(--line);stroke-width:2}
.rf-plate.perfect .rim{stroke:var(--gold);stroke-width:5;animation:rf-pop .7s ease-out}
.rf-plate-num{font-size:27px;font-weight:700;fill:var(--ink);letter-spacing:-.02em}
.rf-plate-sub{font-size:11px;fill:var(--muted)}
@keyframes rf-pop{0%{stroke-width:0}60%{stroke-width:9}100%{stroke-width:5}}
.rf-caption{margin-top:14px;font-size:.94rem;color:var(--muted);line-height:1.4}
.rf-caption strong{color:var(--ink)}

/* habit rows */
.rf-habits{border-bottom:1px solid var(--line)}
.rf-habit{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:14px;padding:18px 0;border-top:1px solid var(--line)}
.rf-check{width:36px;height:36px;border-radius:50%;border:2.5px solid var(--hc);background:transparent;color:var(--on);display:grid;place-items:center;padding:0;transition:background .18s ease,transform .18s ease}
.rf-check svg{opacity:0;transform:scale(.6);transition:opacity .18s ease,transform .18s ease}
.rf-check[aria-checked="true"]{background:var(--hc)}
.rf-check[aria-checked="true"] svg{opacity:1;transform:scale(1)}
.rf-check:active:not(:disabled){transform:scale(.92)}
.rf-check:disabled{opacity:.6}
.rf-habit-name{font-size:1.1rem;font-weight:600;letter-spacing:-.005em;line-height:1.3;padding-top:5px}
.rf-cue{margin-top:4px;font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:1.06rem;line-height:1.5;color:var(--muted);max-width:60ch}
.rf-habit-actions{margin-top:8px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
.rf-pts{padding-top:6px;font-weight:600;font-size:.95rem;color:var(--muted);white-space:nowrap}
.rf-habit.is-done .rf-pts{color:var(--leaf)}
.rf-more summary{cursor:pointer;color:var(--muted);font-size:.88rem;text-decoration:underline;text-underline-offset:3px;list-style:none;display:inline-block}
.rf-more summary::-webkit-details-marker{display:none}
.rf-more summary:hover{color:var(--ink)}
.rf-more[open] summary{margin-bottom:8px}
.rf-more p{font-size:.94rem;line-height:1.5;max-width:58ch;margin-top:6px}
.rf-cue-edit{margin-top:6px}
.rf-cue-edit textarea{width:100%;font-family:'Newsreader',Georgia,serif;font-size:1.06rem;line-height:1.45;padding:10px 12px;border-radius:12px;border:2px solid var(--ink);background:var(--surface);resize:vertical}
.rf-cue-edit .row{margin-top:8px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.rf-cue-edit .hint{margin-top:6px;font-size:.85rem;color:var(--muted)}

/* side */
.rf-side>section+section{margin-top:40px;padding-top:36px;border-top:1px solid var(--line)}
.rf-side h2{font-size:1.5rem;letter-spacing:-.012em;line-height:1.2}
.rf-big{font-size:2.6rem;font-weight:700;letter-spacing:-.03em;line-height:1.1;margin-top:10px}
.rf-big small{font-size:1.05rem;font-weight:400;letter-spacing:0;color:var(--muted);margin-left:8px}
.rf-bar{height:12px;border-radius:999px;background:var(--surface-2);overflow:hidden;margin-top:14px}
.rf-bar i{display:block;height:100%;background:var(--leaf);border-radius:999px;transition:width .6s ease}
.rf-note{margin-top:10px;color:var(--muted);font-size:.96rem}
.rf-levels{margin-top:22px}
.rf-levels li{display:grid;grid-template-columns:30px 1fr;gap:12px;align-items:center;padding:7px 0}
.rf-levels .lv-mark{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:.8rem;font-weight:700;border:2px solid var(--line);color:var(--muted)}
.rf-levels .done .lv-mark{background:var(--leaf);border-color:var(--leaf);color:var(--bg)}
.rf-levels .current .lv-mark{border-color:var(--ink);color:var(--ink)}
.rf-levels .current .lv-name{font-weight:700}
.rf-levels .locked{opacity:.6}
.rf-levels .lv-name{display:block;line-height:1.25}
.rf-levels .lv-range{display:block;font-size:.85rem;color:var(--muted)}

.rf-tiers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:18px}
.rf-tiers .seg{border-radius:12px;padding:10px 8px;background:var(--surface-2);color:var(--muted);text-align:center;line-height:1.2}
.rf-tiers .seg .m{display:block;font-weight:700;font-size:1.05rem}
.rf-tiers .seg .d{display:block;font-size:.76rem;margin-top:3px}
.rf-tiers .seg.on.t1{background:var(--t1);color:var(--t1-ink)}
.rf-tiers .seg.on.t2{background:var(--t2);color:var(--t2-ink)}
.rf-tiers .seg.on.t3{background:var(--t3);color:var(--t3-ink)}
.rf-tiers .seg.on.t4{background:var(--t4);color:var(--t4-ink)}
.rf-tiers .seg.cur{outline:2.5px solid var(--ink);outline-offset:2px}

/* chain */
.rf-section{margin-top:clamp(48px,7vw,84px)}
.rf-section>h2{font-size:1.9rem;letter-spacing:-.018em;line-height:1.15}
.rf-section .lead{margin-top:8px;color:var(--muted);max-width:58ch}
.rf-chain-grid{display:grid;grid-template-columns:minmax(0,460px) minmax(0,1fr);gap:clamp(28px,5vw,64px);margin-top:26px;align-items:start}
@media (max-width:760px){.rf-chain-grid{grid-template-columns:minmax(0,1fr)}}
.rf-cal{display:grid;grid-template-columns:3.4rem repeat(7,minmax(0,1fr));gap:5px;align-items:center}
.rf-cal .wd,.rf-cal .wk{font-size:.78rem;color:var(--muted)}
.rf-cal .wd{text-align:center}
.rf-cal .cell{height:32px;border-radius:9px;border:0;background:var(--surface-2);font-size:.78rem;color:var(--muted);padding:0;position:relative}
.rf-cal .cell:not(:disabled):hover{filter:brightness(.95)}
.rf-cal .cell.future,.rf-cal .cell.pre{background:transparent;border:1px dashed var(--line)}
.rf-cal .cell.pre{opacity:.45}
.rf-cal .cell.miss::after{content:"";position:absolute;left:50%;bottom:4px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:var(--tomato)}
.rf-cal .cell.t1{background:var(--t1);color:var(--t1-ink)}
.rf-cal .cell.t2{background:var(--t2);color:var(--t2-ink)}
.rf-cal .cell.t3{background:var(--t3);color:var(--t3-ink)}
.rf-cal .cell.t4{background:var(--t4);color:var(--t4-ink)}
.rf-cal .cell.today{font-weight:800}
.rf-cal .cell.sel{box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--ink)}
.rf-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 20px}
.rf-stats div{display:flex;flex-direction:column}
.rf-stats dt{color:var(--muted);font-size:.92rem;order:2}
.rf-stats dd{font-size:2.1rem;font-weight:700;letter-spacing:-.025em;line-height:1.1;order:1}
.rf-legend{margin-top:30px;display:flex;flex-wrap:wrap;gap:10px 18px;font-size:.86rem;color:var(--muted)}
.rf-legend span{display:inline-flex;align-items:center;gap:7px}
.rf-legend i{width:16px;height:16px;border-radius:5px;background:var(--surface-2);display:inline-block;position:relative}
.rf-legend i.t1{background:var(--t1)}.rf-legend i.t2{background:var(--t2)}.rf-legend i.t3{background:var(--t3)}.rf-legend i.t4{background:var(--t4)}
.rf-legend i.part{background:linear-gradient(to top,var(--partial) 50%,var(--surface-2) 50%)}
.rf-legend i.miss::after{content:"";position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:var(--tomato)}

/* laws */
.rf-laws-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.rf-tabs{display:inline-flex;gap:4px;margin-top:22px;padding:4px;border-radius:999px;background:var(--surface-2);flex-wrap:wrap}
.rf-tabs .tab{border:0;background:transparent;border-radius:999px;padding:9px 18px;font-weight:600;color:var(--muted)}
.rf-tabs .tab[aria-selected="true"]{background:var(--ink);color:var(--bg)}
.rf-law-list{margin-top:14px;border-bottom:1px solid var(--line)}
.rf-law-list .law{border-top:1px solid var(--line)}
.rf-law-list label{display:grid;grid-template-columns:26px minmax(0,1fr);gap:16px;padding:18px 0;cursor:pointer;align-items:start}
.rf-law-list input{width:22px;height:22px;margin:2px 0 0;accent-color:var(--leaf)}
.rf-law-list .law-title{display:block;font-weight:700;font-size:1.08rem;line-height:1.3}
.rf-law-list .law-text{display:block;margin-top:3px;color:var(--muted);max-width:66ch}
.rf-law-list input:checked + .law-body .law-title{color:var(--leaf)}
.rf-progress-inline{color:var(--muted);font-size:.98rem}

/* footer */
.rf-foot{margin-top:72px;padding-top:24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:.9rem}

@media (prefers-reduced-motion:reduce){
  .rf-root *,.rf-root *::before,.rf-root *::after{animation:none!important;transition:none!important}
}
`;