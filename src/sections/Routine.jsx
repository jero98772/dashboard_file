import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { addDays, daysBetween, parseKey, todayKey } from '../lib/dates.js';
import {
  BREAK_MS,
  DEFAULT_IDENTITY,
  FOCUS_MS,
  ITEMS,
  LEARN_ITEMS,
  MILESTONES,
  N,
  NIGHT_PLACES,
  THRESHOLD,
  bestStreak,
  claimedIn,
  computeFocus,
  countOn,
  fmtTime,
  learnSlotAt,
  mmss,
  nowMinutes,
  patchDay,
  phaseOf,
  rowsToDone,
  rewardFor,
  streakInfo,
  todayAtMinute,
  totalVotes,
  withTick,
} from '../lib/routine-rules.js';
import { useSettings, useTable } from '../lib/use-table.js';

/* ---------------------------------------------------------------------- */
/*  Palette                                                                */
/*  The four phase hues are the dawn/day/dusk/night set, in the tints that */
/*  clear contrast on the #0f172a card: they encode time of day, not       */
/*  quantity, so they are categorical and must stay distinguishable from   */
/*  each other rather than forming a ramp.                                 */
/* ---------------------------------------------------------------------- */
const BG = '#020617';
const SURFACE = '#0f172a';
const LINE = '#1e293b';
const INK = '#f1f5f9';
const MUTED = '#94a3b8';
const DIM = '#64748b';
const DAWN = '#e3a64a';
const DAY = '#6fa8dc';
const DUSK = '#d98bae';
const NIGHT = '#9599f0';

/* ---------------------------------------------------------------------- */
/*  Dial geometry                                                          */
/*  5:30 AM sits at the top and 10:30 PM closes the circle, so the whole   */
/*  routine spans the dial instead of being squeezed into half a clock.    */
/* ---------------------------------------------------------------------- */
const CENTER = 180;
const R_ARC = 134;
const R_DOT = 106;
const DIAL_START = 330;
const DIAL_SPAN = 1020;

const angleOf = (min) => ((min - DIAL_START) * 360) / DIAL_SPAN;

function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [CENTER + r * Math.sin(a), CENTER - r * Math.cos(a)];
}

function arcPath(r, a1, a2) {
  const [x1, y1] = polar(r, a1);
  const [x2, y2] = polar(r, a2);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const hourLabel = (h) => (h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`);

/* ---------------------------------------------------------------------- */
/*  Section                                                                */
/* ---------------------------------------------------------------------- */
export default function Routine() {
  const [dayRows, setDayRows] = useTable('routine_days');
  const [settings, setSetting] = useSettings('routine_settings');

  const [today, setToday] = useState(todayKey);
  const [minute, setMinute] = useState(nowMinutes);
  const [timer, setTimer] = useState(null); // { mode: 'focus' | 'break', endsAt, id }
  const [remaining, setRemaining] = useState(0);
  const [toast, setToast] = useState('');
  const [popId, setPopId] = useState(null);
  // The day the auto pomodoro was stopped by hand; it stays off until tomorrow.
  const [autoOff, setAutoOff] = useState(null);

  const done = useMemo(() => rowsToDone(dayRows), [dayRows]);
  const doneToday = useMemo(() => done[today] ?? [], [done, today]);
  const doneSet = useMemo(() => new Set(doneToday), [doneToday]);

  const streak = useMemo(() => streakInfo(done, today), [done, today]);
  const claimed = useMemo(() => claimedIn(settings, streak.start), [settings, streak.start]);
  const focus = useMemo(() => computeFocus(doneToday, minute), [doneToday, minute]);

  // The settings table drops empty values, so an emptied field would snap back
  // to the default on the very keystroke that emptied it. The draft holds what
  // is being typed and lets go on blur, where falling back is not disruptive.
  const [identityDraft, setIdentityDraft] = useState(null);
  const identity = identityDraft ?? settings.identity ?? DEFAULT_IDENTITY;
  const nightWhere = settings.nightWhere ?? '';

  /* ---- the clock drives everything time-bound ---- */
  // The running timer is mirrored into a ref so the one interval below can
  // read it without being torn down and rebuilt on every tick.
  const timerRef = useRef(null);
  useEffect(() => { timerRef.current = timer; }, [timer]);

  // The auto-start check runs inside the interval, so it reads these via refs.
  const doneRef = useRef(doneSet);
  useEffect(() => { doneRef.current = doneSet; }, [doneSet]);
  const autoOffRef = useRef(autoOff);
  useEffect(() => { autoOffRef.current = autoOff; }, [autoOff]);

  const expiredRef = useRef(null);

  useEffect(() => {
    // Half-second ticks so the countdown never looks stuck; the minute and day
    // setters bail out on an unchanged value, so this is not a render loop.
    const id = setInterval(() => {
      setMinute(nowMinutes());
      setToday(todayKey());
      const running = timerRef.current;
      if (!running) {
        // Auto pomodoro: follow the morning schedule, so opening the page at
        // 6:12 gives block 1 its remaining 13 minutes.
        if (autoOffRef.current === todayKey()) return;
        const slot = learnSlotAt(nowMinutes());
        if (!slot) return;
        if (slot.mode === 'focus' && doneRef.current.has(slot.item.id)) return;
        const next = { mode: slot.mode, endsAt: todayAtMinute(slot.endMin), id: slot.item.id, auto: true };
        timerRef.current = next;
        setTimer(next);
        setRemaining(next.endsAt - Date.now());
        return;
      }
      const left = running.endsAt - Date.now();
      if (left > 0) {
        setRemaining(left);
        return;
      }
      // Clear the ref before handing over, so a tick that lands before the
      // state settles cannot fire the same expiry twice.
      timerRef.current = null;
      setRemaining(0);
      expiredRef.current(running);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const toastTimer = useRef(null);
  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3400);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ---- ticking an item ---- */
  const setTicked = useCallback((id, next) => {
    setDayRows((prev) => patchDay(prev, today, (row) => ({ done: withTick(row.done, id, next) })));
  }, [setDayRows, today]);

  const toggle = useCallback((id) => {
    const adding = !doneSet.has(id);
    setTicked(id, adding);
    if (!adding) return;

    setPopId(id);
    setTimeout(() => setPopId(null), 400);
    try { navigator.vibrate?.(12); } catch { /* not supported */ }

    const n = doneToday.length + 1;
    if (n === N) say(`Perfect day. All ${N} votes cast.`);
    else if (n === THRESHOLD) say(`Chain kept for today. ${streak.len + (streak.todayOk ? 0 : 1)}-day chain.`);
  }, [doneSet, doneToday.length, say, setTicked, streak.len, streak.todayOk]);

  /* ---- 25-minute focus, 5-minute break ---- */
  const audio = useRef(null);
  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    try {
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.24;
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } catch { /* audio is a nicety, never a failure */ }
  }, []);

  // The context has to be built inside a user gesture to be allowed to make
  // sound, so the first click anywhere on the page unlocks it for the auto timer.
  const unlockAudio = useCallback(() => {
    try {
      audio.current = audio.current || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.current.state === 'suspended') audio.current.resume();
    } catch { /* no audio in this browser */ }
  }, []);
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, [unlockAudio]);

  const startFocus = useCallback((id) => {
    unlockAudio();
    setAutoOff(null);
    setTimer({ mode: 'focus', endsAt: Date.now() + FOCUS_MS, id });
    setRemaining(FOCUS_MS);
  }, [unlockAudio]);

  const stopTimer = useCallback(() => {
    setAutoOff(todayKey());
    setTimer(null);
  }, []);

  // Skipping a break goes straight into the next unfinished block.
  const skipBreak = useCallback(() => {
    const next = LEARN_ITEMS.find((it) => !doneSet.has(it.id));
    if (next) startFocus(next.id); else setTimer(null);
  }, [doneSet, startFocus]);

  const onExpire = useCallback((expired) => {
    beep();
    if (expired.mode === 'break') {
      setTimer(null);
      say('Break over. Start the next block.');
      return;
    }
    // A finished block ticks itself off, which is the whole point of running it.
    setTicked(expired.id, true);
    const last = expired.id === 'learn4';
    if (last) {
      setTimer(null);
    } else {
      setTimer({ mode: 'break', endsAt: Date.now() + BREAK_MS, id: expired.id });
      setRemaining(BREAK_MS);
    }
    say(last ? 'Last block done. Shower next.' : 'Block done. Take your 5 minutes.');
  }, [beep, say, setTicked]);
  useEffect(() => { expiredRef.current = onExpire; }, [onExpire]);

  // The countdown in the tab title is the reason you can leave this tab.
  useEffect(() => {
    if (!timer) return undefined;
    document.title = `${mmss(remaining)} ${timer.mode === 'focus' ? 'Focus' : 'Break'}`;
    return () => { document.title = 'Routine · Dashboard'; };
  }, [timer, remaining]);

  /* ---- rewards ---- */
  function claim(days) {
    if (!streak.start || streak.len < days) return;
    const next = new Set(claimed);
    next.add(days);
    setSetting('claimChainStart', streak.start);
    setSetting('claimed', [...next].sort((a, b) => a - b).join(' '));
    const reward = rewardFor(settings, days).trim();
    say(reward ? `Claimed: ${reward}` : 'Claimed. Enjoy it.');
  }

  /* ---- the four-week grid ---- */
  const grid = useMemo(() => {
    const monday = addDays(today, -(((parseKey(today).getDay() + 6) % 7) + 21));
    return Array.from({ length: 28 }, (_, i) => {
      const date = addDays(monday, i);
      const n = countOn(done, date);
      return {
        date,
        day: parseKey(date).getDate(),
        n,
        state:
          date > today ? 'future'
          : n === N ? 'perfect'
          : n >= THRESHOLD ? 'chain'
          : n > 0 ? 'part'
          : 'empty',
      };
    });
  }, [done, today]);

  const votes = totalVotes(done);
  const ticks = doneToday.length;
  const dateLabel = parseKey(today).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const yesterday = addDays(today, -1);
  const banner =
    votes === 0
      ? `Day one. Reach ${THRESHOLD} of ${N} today to start your chain.`
      : ticks < THRESHOLD && countOn(done, yesterday) > 0 && countOn(done, yesterday) < THRESHOLD
        ? `Yesterday slipped. Never miss twice: reach ${THRESHOLD} of ${N} today and ${streak.len > 0 ? 'the chain survives.' : 'a new chain begins.'}`
        : '';

  return (
    <div className="rt-root">
      <style>{CSS}</style>
      <div className="rt-wrap">
        <header className="rt-head">
          <h1 className="rt-title">{dateLabel}</h1>
          <label className="rt-sr" htmlFor="rt-identity">Who I am becoming</label>
          <input
            id="rt-identity"
            className="rt-identity"
            type="text"
            maxLength={90}
            autoComplete="off"
            value={identity}
            placeholder={DEFAULT_IDENTITY}
            onChange={(e) => {
              setIdentityDraft(e.target.value);
              setSetting('identity', e.target.value);
            }}
            onBlur={() => setIdentityDraft(null)}
          />
          <p className="rt-sub">Every tick is a vote for this person.</p>
        </header>

        <Pomodoro
          timer={timer}
          remaining={remaining}
          doneSet={doneSet}
          minute={minute}
          autoOff={autoOff === today}
          onStart={startFocus}
          onStop={stopTimer}
        />

        {banner ? <p className="rt-banner" role="status">{banner}</p> : null}

        <div className="rt-cols">
          <section className="rt-left" aria-label="Progress">
            <div className="rt-card">
              <Dial doneSet={doneSet} focus={focus} minute={minute} ticks={ticks} />
              <p className="rt-note">
                {ticks === N ? `Perfect day. All ${N} votes cast.`
                  : ticks >= THRESHOLD ? `Chain kept for today. ${N - ticks} more for a perfect day.`
                    : `${THRESHOLD - ticks} more ${THRESHOLD - ticks === 1 ? 'tick keeps' : 'ticks keep'} today’s chain.`}
              </p>

              <Now
                timer={timer}
                remaining={remaining}
                focus={focus}
                minute={minute}
                onToggle={toggle}
                onStart={startFocus}
                onStop={stopTimer}
                onSkipBreak={skipBreak}
              />

              <div className="rt-stats">
                <div className="rt-stat">
                  <b>{streak.len}</b><span>chain days</span>
                </div>
                <div className="rt-stat">
                  <b>{bestStreak(done)}</b><span>best chain</span>
                </div>
                <div className="rt-stat">
                  <b>{votes}</b><span>votes cast</span>
                </div>
              </div>
              <p className="rt-rule">
                A day counts at {THRESHOLD} of {N}. One slipped day is forgiven. Two in a row end
                the chain.
              </p>
            </div>
          </section>

          <div className="rt-right">
            <section className="rt-card">
              <h2 className="rt-card-title">Today</h2>
              <ol className="rt-list">
                {ITEMS.map((item) => {
                  const isDone = doneSet.has(item.id);
                  const isDue = focus?.kind === 'due' && focus.item.id === item.id;
                  const isLate = !isDone && !isDue && item.t < (focus?.latest ?? -1);
                  return (
                    <li key={item.id} className="rt-row-wrap">
                      <div
                        className={`rt-row rt-ph-${phaseOf(item.t)}${isDone ? ' is-done' : ''}${isDue ? ' is-due' : ''}${isLate ? ' is-late' : ''}${popId === item.id ? ' is-pop' : ''}`}
                      >
                        <button
                          type="button"
                          className="rt-tick"
                          aria-pressed={isDone}
                          aria-label={`${item.name}${isDone ? ', done' : ''}`}
                          onClick={() => toggle(item.id)}
                        >
                          <CheckIcon />
                        </button>
                        <span className="rt-when">{fmtTime(item.t)}</span>
                        <span>
                          <span className="rt-name">{item.name}</span>
                          {item.detail ? <span className="rt-detail">{item.detail}</span> : null}
                        </span>
                      </div>
                      {item.brk ? (
                        <div className="rt-break" aria-hidden="true">
                          <span />
                          <span className="rt-when">{fmtTime(item.e)}</span>
                          <span>5-minute break</span>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="rt-card">
              <div className="rt-card-head">
                <h2 className="rt-card-title">Rewards</h2>
                <p className="rt-card-note">
                  Choose what you will give yourself at each chain length. Claim it when you get
                  there.
                </p>
              </div>
              {MILESTONES.map((days) => {
                const reached = streak.len >= days;
                const isClaimed = claimed.has(days);
                const left = days - streak.len;
                return (
                  <div
                    key={days}
                    className={`rt-reward${isClaimed ? ' is-claimed' : reached ? ' is-ready' : ''}`}
                  >
                    <div className="rt-reward-num">
                      {days}<small>days</small>
                    </div>
                    <div>
                      <label className="rt-sr" htmlFor={`rt-reward-${days}`}>
                        Reward for a {days}-day chain
                      </label>
                      <input
                        id={`rt-reward-${days}`}
                        className="rt-input"
                        type="text"
                        maxLength={80}
                        autoComplete="off"
                        placeholder="Choose your reward"
                        value={rewardFor(settings, days)}
                        onChange={(e) => setSetting(`reward.${days}`, e.target.value)}
                      />
                      <div className="rt-reward-meta">
                        <span className="rt-bar">
                          <i style={{ width: `${Math.min(100, Math.round((streak.len / days) * 100))}%` }} />
                        </span>
                        {isClaimed ? (
                          <span>Claimed</span>
                        ) : reached ? (
                          <button type="button" className="rt-btn rt-btn-small" onClick={() => claim(days)}>
                            Claim reward
                          </button>
                        ) : (
                          <span>{left} more {left === 1 ? 'day' : 'days'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="rt-card">
              <h2 className="rt-card-title">The last four weeks</h2>
              <div className="rt-weeks">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, i) => (
                  <span key={i} className="rt-dayhead" aria-hidden="true">{letter}</span>
                ))}
                {grid.map((cell) => (
                  <span
                    key={cell.date}
                    className={`rt-cell is-${cell.state}${cell.date === today ? ' is-today' : ''}`}
                    title={`${parseKey(cell.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${cell.state === 'future' ? 'upcoming' : `${cell.n} of ${N}`}`}
                  >
                    {cell.day}
                  </span>
                ))}
              </div>
              <p className="rt-legend">
                <span><i className="rt-swatch is-perfect" />perfect day</span>
                <span><i className="rt-swatch is-chain" />chain kept, {THRESHOLD} or more</span>
                <span><i className="rt-swatch is-part" />some</span>
              </p>
            </section>

            <section className="rt-card">
              <div className="rt-card-head">
                <h2 className="rt-card-title">9:30 PM, screens off</h2>
                <p className="rt-card-note">
                  The phone goes out of sight, so you never have to resist it. Pick where you will
                  spend these 30 minutes.
                </p>
              </div>
              <div className="rt-chips" role="radiogroup" aria-label="Where I spend 9:30 PM">
                {NIGHT_PLACES.map((place) => (
                  <button
                    key={place}
                    type="button"
                    role="radio"
                    aria-checked={nightWhere === place}
                    className="rt-chip"
                    onClick={() => setSetting('nightWhere', nightWhere === place ? '' : place)}
                  >
                    {place}
                  </button>
                ))}
              </div>
              <ol className="rt-steps">
                <li><span className="rt-when">9:30 PM</span><p>Phone on the charger outside the bedroom. Boxers on.</p></li>
                <li><span className="rt-when">9:35 PM</span><p>On paper, write tomorrow&rsquo;s four 25-minute topics. Lay out clothes and sunscreen.</p></li>
                <li>
                  <span className="rt-when">9:40 PM</span>
                  <p>
                    Read a paper book for 15 minutes
                    {nightWhere ? ` (${nightWhere.charAt(0).toLowerCase()}${nightWhere.slice(1)})` : ''}.
                  </p>
                </li>
                <li><span className="rt-when">9:55 PM</span><p>Lights out. Asleep by 10:00.</p></li>
              </ol>
              <p className="rt-hint">
                No paper book yet? Stretch for 10 minutes or write five lines about today instead.
              </p>
            </section>

            <section className="rt-card">
              <details>
                <summary>Four setups from Atomic Habits that make this easier</summary>
                <p><b>Make it obvious.</b> Put the alarm across the room and the longsword gear by the door before you sleep. Write tomorrow&rsquo;s four learning topics on paper at 9:35 PM, so 6:00 AM needs no decisions.</p>
                <p><b>Make it attractive.</b> Save your favorite music or podcast for the walk with Chakur, so the walk is something you look forward to.</p>
                <p><b>Make it easy.</b> On a bad day, shrink each item to two minutes instead of skipping it. Showing up matters more than the size.</p>
                <p><b>Make it satisfying.</b> Tick each item the moment you finish it. The tick, the dial filling and the chain are the immediate reward. The ladder is the bigger one.</p>
              </details>
            </section>

            <ItemHistogram done={done} today={today} />
          </div>
        </div>
      </div>

      <div className={`rt-toast${toast ? ' is-on' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Pieces                                                                 */
/* ---------------------------------------------------------------------- */

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * The day as a dial: blocks are arcs, moments are dots, and the hand is a
 * longsword because that is what the 7 PM block trains for. Unticked items are
 * drawn in the same hue at low opacity, so the dial fills rather than changes
 * colour as the day goes.
 */
function Dial({ doneSet, focus, minute, ticks }) {
  const hand = minute < DIAL_START || minute > DIAL_START + DIAL_SPAN ? 0 : angleOf(minute);
  return (
    <svg
      className="rt-dial"
      viewBox="0 0 360 360"
      role="img"
      aria-label={`Day dial: ${ticks} of ${N} routine items done`}
    >
      <circle className="rt-track" cx={CENTER} cy={CENTER} r={R_ARC} />
      <circle className="rt-hair" cx={CENTER} cy={CENTER} r={R_DOT} />

      {[6, 9, 12, 15, 18, 21].map((h) => {
        const [x, y] = polar(162, angleOf(h * 60));
        return (
          <text key={h} className="rt-hour" x={x.toFixed(1)} y={y.toFixed(1)}
            textAnchor="middle" dominantBaseline="central">
            {hourLabel(h)}
          </text>
        );
      })}

      {ITEMS.map((item) => {
        const isDone = doneSet.has(item.id);
        const isFocus = focus?.kind === 'due' && focus.item.id === item.id;
        const cls = `rt-ph-${phaseOf(item.t)}${isDone ? '' : ' is-off'}`;
        const label = <title>{`${fmtTime(item.t)} ${item.name}${isDone ? ', done' : ''}`}</title>;

        if (item.e) {
          const a1 = angleOf(item.t) + 0.5;
          const a2 = angleOf(item.e) - 0.5;
          return (
            <g key={item.id}>
              {isFocus && <path className="rt-ring-arc" d={arcPath(R_ARC, a1 - 0.9, a2 + 0.9)} />}
              <path className={`rt-arc ${cls}`} d={arcPath(R_ARC, a1, a2)}>{label}</path>
            </g>
          );
        }
        const [x, y] = polar(R_DOT, angleOf(item.t));
        return (
          <g key={item.id}>
            {isFocus && <circle className="rt-ring-dot" cx={x.toFixed(2)} cy={y.toFixed(2)} r={10.5} />}
            <circle className={`rt-dot ${cls}`} cx={x.toFixed(2)} cy={y.toFixed(2)} r={6.5}>{label}</circle>
          </g>
        );
      })}

      <g transform={`rotate(${hand.toFixed(2)} ${CENTER} ${CENTER})`}>
        <circle className="rt-blade" cx="180" cy="116" r="3.6" />
        <rect className="rt-blade" x="178.5" y="101" width="3" height="14" />
        <rect className="rt-blade" x="170" y="97" width="20" height="4" rx="2" />
        <path className="rt-blade" d="M177.4 97 L180 32 L182.6 97 Z" />
      </g>

      <text className={`rt-big${ticks === N ? ' is-gold' : ''}`} x={CENTER} y="196" textAnchor="middle">
        {ticks}
      </text>
      <text className="rt-small" x={CENTER} y="220" textAnchor="middle">of {N} done</text>
    </svg>
  );
}

/** The one thing to do right now, or the countdown that replaced it. */
function Now({ timer, remaining, focus, minute, onToggle, onStart, onStop, onSkipBreak }) {
  if (timer?.mode === 'break') {
    return (
      <div className="rt-now rt-ph-dawn">
        <span className="rt-chip-now">Break</span>
        <h3>5-minute break</h3>
        <div className="rt-clock">{mmss(remaining)}</div>
        <p className="rt-stack">Stand up and drink water. The next block starts when this ends.</p>
        <div className="rt-actions">
          <button type="button" className="rt-btn rt-btn-ghost" onClick={onSkipBreak}>Skip break</button>
        </div>
      </div>
    );
  }

  if (timer?.mode === 'focus') {
    const item = ITEMS.find((i) => i.id === timer.id);
    return (
      <div className={`rt-now rt-ph-${phaseOf(item.t)}`}>
        <span className="rt-chip-now">Focus</span>
        <h3>{item.name}</h3>
        <div className="rt-clock">{mmss(remaining)}</div>
        <p className="rt-stack">It ticks itself off when the timer ends.</p>
        <div className="rt-actions">
          <button type="button" className="rt-btn rt-btn-ghost" onClick={onStop}>Stop timer</button>
        </div>
      </div>
    );
  }

  if (!focus) {
    return (
      <div className="rt-now rt-ph-night">
        <span className="rt-chip-now">Complete</span>
        <h3>All {N} done</h3>
        <p className="rt-stack">Every item today is a vote you cast. Sleep well.</p>
      </div>
    );
  }

  const { item, kind } = focus;
  const chip =
    kind === 'due' ? 'Now'
    : kind === 'late' ? 'Catch up'
    : item.t - minute < 60 ? `In ${item.t - minute} min`
    : `At ${fmtTime(item.t)}`;

  return (
    <div className={`rt-now rt-ph-${phaseOf(item.t)}`}>
      <span className="rt-chip-now">{chip}</span>
      <h3>{item.name}</h3>
      <div className="rt-range">
        {fmtTime(item.t)}{item.e ? ` to ${fmtTime(item.e)}` : ''}{item.detail ? `. ${item.detail}` : ''}
      </div>
      <p className="rt-stack">{item.stack}</p>
      <div className="rt-actions">
        <button type="button" className="rt-btn" onClick={() => onToggle(item.id)}>Mark done</button>
        {item.learn && (
          <button type="button" className="rt-btn rt-btn-ghost" onClick={() => onStart(item.id)}>
            Start 25-minute timer
          </button>
        )}
      </div>
    </div>
  );
}

/** Small always-visible pomodoro: 25 min focus, 5 min break, four times. */
function Pomodoro({ timer, remaining, doneSet, minute, autoOff, onStart, onStop }) {
  const doneCount = LEARN_ITEMS.filter((it) => doneSet.has(it.id)).length;
  const nextBlock = LEARN_ITEMS.find((it) => !doneSet.has(it.id));
  const running = timer && LEARN_ITEMS.some((it) => it.id === timer.id);
  const idx = running ? LEARN_ITEMS.findIndex((it) => it.id === timer.id) : -1;
  const first = LEARN_ITEMS[0];
  const last = LEARN_ITEMS[LEARN_ITEMS.length - 1];

  let chip; let label; let clock = null;
  if (running && timer.mode === 'focus') {
    chip = 'Focus'; label = `Block ${idx + 1} of ${LEARN_ITEMS.length}`; clock = mmss(remaining);
  } else if (running && timer.mode === 'break') {
    chip = 'Break'; label = `Next: block ${Math.min(idx + 2, LEARN_ITEMS.length)}`; clock = mmss(remaining);
  } else if (!nextBlock) {
    chip = 'Done'; label = `${LEARN_ITEMS.length} of ${LEARN_ITEMS.length} blocks done`;
  } else if (autoOff) {
    chip = 'Paused'; label = 'Auto start is off for today';
  } else if (minute < first.t) {
    chip = 'Waiting'; label = `Starts automatically at ${fmtTime(first.t)}`;
  } else if (minute >= last.e) {
    chip = 'Missed'; label = `${doneCount} of ${LEARN_ITEMS.length} blocks done`;
  } else {
    chip = 'Waiting'; label = 'Next block starts on schedule';
  }

  const mode = running ? timer.mode : 'idle';
  return (
    <div className={`rt-pomo is-${mode}`} role="timer" aria-label={`Pomodoro: ${chip}. ${label}`}>
      <span className="rt-pomo-chip">{chip}</span>
      {clock ? <span className="rt-pomo-clock">{clock}</span> : null}
      <span className="rt-pomo-label">{label}</span>
      <span className="rt-pomo-dots" aria-hidden="true">
        {LEARN_ITEMS.map((it, i) => (
          <i key={it.id} className={`${doneSet.has(it.id) ? 'is-done' : ''}${i === idx ? ' is-now' : ''}`} />
        ))}
      </span>
      {running ? (
        <button type="button" className="rt-btn rt-btn-ghost rt-btn-small" onClick={onStop}>Stop</button>
      ) : nextBlock ? (
        <button type="button" className="rt-btn rt-btn-small" onClick={() => onStart(nextBlock.id)}>
          Start now
        </button>
      ) : null}
    </div>
  );
}

/** How often each routine item gets ticked, over the last 30 days or all time. */
function ItemHistogram({ done, today }) {
  const [range, setRange] = useState('30');
  const stats = useMemo(() => {
    const recorded = Object.keys(done).sort();
    if (!recorded.length) return { days: 0, rows: [] };
    let from = recorded[0];
    if (range === '30') {
      const cut = addDays(today, -29);
      if (cut > from) from = cut;
    }
    const days = Math.max(1, daysBetween(from, today) + 1);
    const counts = Object.fromEntries(ITEMS.map((it) => [it.id, 0]));
    for (const key of recorded) {
      if (key < from || key > today) continue;
      for (const id of done[key]) counts[id] += 1;
    }
    return { days, rows: ITEMS.map((it) => ({ item: it, n: counts[it.id], pct: Math.round((counts[it.id] / days) * 100) })) };
  }, [done, today, range]);

  return (
    <section className="rt-card">
      <div className="rt-card-head">
        <h2 className="rt-card-title">How often each item gets done</h2>
        <p className="rt-card-note">
          Share of days each item was ticked{stats.days ? `, over ${stats.days} ${stats.days === 1 ? 'day' : 'days'}` : ''}.
        </p>
        <div className="rt-chips" role="radiogroup" aria-label="Time range">
          {[['30', 'Last 30 days'], ['all', 'All time']].map(([v, text]) => (
            <button key={v} type="button" role="radio" aria-checked={range === v} className="rt-chip"
              onClick={() => setRange(v)}>
              {text}
            </button>
          ))}
        </div>
      </div>
      {stats.days === 0 ? (
        <p className="rt-hint">Tick items to see how often each one gets done.</p>
      ) : (
        <ol className="rt-hist">
          {stats.rows.map(({ item, n, pct }) => (
            <li key={item.id} className={`rt-hist-row rt-ph-${phaseOf(item.t)}`}
              title={`${item.name}: ${n} of ${stats.days} days`}>
              <span className="rt-when">{fmtTime(item.t)}</span>
              <span className="rt-hist-name">{item.name}</span>
              <span className="rt-hist-bar"><i style={{ width: `${pct}%` }} /></span>
              <span className="rt-hist-val">{n}/{stats.days} · {pct}%</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const CSS = `
.rt-root { background: ${BG}; color: ${INK}; padding: 24px 16px 60px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
.rt-root *, .rt-root *::before, .rt-root *::after { box-sizing: border-box; }
.rt-wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }
.rt-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.rt-ph-dawn { --rt-c: ${DAWN}; }
.rt-ph-day { --rt-c: ${DAY}; }
.rt-ph-dusk { --rt-c: ${DUSK}; }
.rt-ph-night { --rt-c: ${NIGHT}; }

.rt-head { display: flex; flex-direction: column; gap: 8px; }
.rt-title { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.rt-identity { width: 100%; max-width: 560px; background: none; border: none;
  border-bottom: 1px dashed ${MUTED}; color: ${INK}; font: italic 1.05rem/1.4 inherit;
  padding: 6px 0; }
.rt-identity:focus-visible { outline: none; border-bottom-color: ${DAY}; }
.rt-identity::placeholder { color: ${DIM}; }
.rt-sub { margin: 0; color: ${MUTED}; font-size: 0.85rem; }

.rt-banner { margin: 0; background: ${SURFACE}; border: 1px solid ${LINE};
  border-left: 3px solid ${DAWN}; border-radius: 12px; padding: 14px 16px; line-height: 1.5; }

.rt-cols { display: grid; grid-template-columns: 1fr; gap: 22px; align-items: start; }
@media (min-width: 900px) { .rt-cols { grid-template-columns: 400px 1fr; } }
.rt-right { display: grid; gap: 22px; align-content: start; }

.rt-card { background: ${SURFACE}; border: 1px solid ${LINE}; border-radius: 16px; padding: 22px; }
.rt-card-head { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.rt-card-head .rt-card-title { margin: 0; }
.rt-card-note { margin: 0; color: ${MUTED}; font-size: 0.83rem; line-height: 1.5; max-width: 60ch; }
.rt-card-title { font-size: 1.05rem; font-weight: 600; margin: 0 0 16px; }

/* dial */
.rt-dial { display: block; width: 100%; height: auto; overflow: visible; }
.rt-track { fill: none; stroke: ${LINE}; stroke-width: 20; }
.rt-hair { fill: none; stroke: ${LINE}; stroke-width: 1; stroke-dasharray: 2 4; }
.rt-hour { fill: ${DIM}; font-size: 13px; }
.rt-arc { fill: none; stroke: var(--rt-c); stroke-width: 16; }
.rt-dot { fill: var(--rt-c); }
.rt-arc.is-off, .rt-dot.is-off { opacity: .3; }
.rt-ring-arc { fill: none; stroke: ${INK}; stroke-width: 22; }
.rt-ring-dot { fill: ${INK}; }
.rt-blade { fill: ${INK}; opacity: .9; }
.rt-big { fill: ${INK}; font-size: 64px; font-weight: 700; }
.rt-big.is-gold { fill: ${DAWN}; }
.rt-small { fill: ${MUTED}; font-size: 14px; }
.rt-note { text-align: center; color: ${MUTED}; font-size: 0.85rem; margin: 6px 0 0; min-height: 1.5em; }

/* now */
.rt-now { margin-top: 18px; background: ${BG}; border: 1px solid ${LINE};
  border-left: 3px solid var(--rt-c, ${DAWN}); border-radius: 14px; padding: 18px; }
.rt-now h3 { font-size: 1.25rem; font-weight: 700; margin: 10px 0 4px; }
.rt-chip-now { display: inline-flex; align-items: center; gap: 7px; padding: 3px 12px 3px 9px;
  border-radius: 999px; background: ${LINE}; color: ${INK}; font-size: 0.78rem; font-weight: 600; }
.rt-chip-now::before { content: ""; width: 8px; height: 8px; border-radius: 50%;
  background: var(--rt-c, ${DAWN}); }
.rt-range { color: ${MUTED}; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.rt-stack { margin: 10px 0 0; line-height: 1.5; font-size: 0.92rem; max-width: 46ch; }
.rt-clock { font-size: 3.4rem; font-weight: 700; font-variant-numeric: tabular-nums;
  line-height: 1.1; margin: 8px 0 0; color: var(--rt-c, ${INK}); }
.rt-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }

.rt-btn { background: ${DAY}; color: ${BG}; border: 1px solid ${DAY}; border-radius: 10px;
  font: inherit; font-weight: 700; font-size: 0.9rem; padding: 10px 18px; cursor: pointer; }
.rt-btn:hover { filter: brightness(1.08); }
.rt-btn:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
.rt-btn-ghost { background: none; color: ${INK}; border-color: ${MUTED}; font-weight: 500; }
.rt-btn-ghost:hover { border-color: ${INK}; filter: none; }
.rt-btn-small { padding: 6px 12px; font-size: 0.8rem; border-radius: 8px; }

/* stats */
.rt-stats { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 18px;
  border-top: 1px solid ${LINE}; border-bottom: 1px solid ${LINE}; }
.rt-stat { padding: 14px 4px; text-align: center; }
.rt-stat + .rt-stat { border-left: 1px solid ${LINE}; }
.rt-stat b { display: block; font-size: 1.8rem; font-weight: 700; line-height: 1; }
.rt-stat span { color: ${MUTED}; font-size: 0.76rem; }
.rt-rule { color: ${DIM}; font-size: 0.78rem; line-height: 1.5; margin: 12px 0 0; }

/* today list */
.rt-list { list-style: none; margin: 0; padding: 0; }
.rt-row { display: grid; grid-template-columns: 40px 76px 1fr; gap: 12px; align-items: start;
  padding: 9px 10px; border-radius: 10px; border-bottom: 1px solid ${LINE}; }
.rt-row.is-due { background: ${BG}; border-bottom-color: transparent; box-shadow: inset 3px 0 0 var(--rt-c); }
.rt-tick { width: 40px; height: 40px; padding: 0; border-radius: 50%; border: 2px solid ${DIM};
  background: none; color: ${BG}; display: grid; place-items: center; cursor: pointer; }
.rt-tick svg { opacity: 0; }
.rt-tick:focus-visible { outline: 2px solid ${DAY}; outline-offset: 2px; }
.rt-row.is-due .rt-tick { border-color: var(--rt-c); }
.rt-row.is-late .rt-tick { border-color: ${DAWN}; border-style: dashed; }
.rt-row.is-done .rt-tick { background: var(--rt-c); border-color: var(--rt-c); }
.rt-row.is-done .rt-tick svg { opacity: 1; }
.rt-row.is-pop .rt-tick path { stroke-dasharray: 26; stroke-dashoffset: 26;
  animation: rt-draw .35s ease-out forwards; }
@keyframes rt-draw { to { stroke-dashoffset: 0; } }
.rt-when { color: ${MUTED}; font-size: 0.83rem; font-variant-numeric: tabular-nums;
  white-space: nowrap; padding-top: 11px; }
.rt-name { display: block; font-weight: 600; font-size: 0.95rem; padding-top: 10px; line-height: 1.3; }
.rt-detail { display: block; color: ${MUTED}; font-size: 0.8rem; }
.rt-row.is-done .rt-name { color: ${MUTED}; text-decoration: line-through; }
.rt-break { display: grid; grid-template-columns: 40px 76px 1fr; gap: 12px; padding: 0 10px;
  color: ${DIM}; font-size: 0.8rem; line-height: 26px; }
.rt-break .rt-when { padding: 0; line-height: 26px; }

/* rewards */
.rt-reward { display: grid; grid-template-columns: 56px 1fr; gap: 14px; align-items: start;
  padding: 14px 0; border-bottom: 1px solid ${LINE}; }
.rt-reward:last-child { border-bottom: none; padding-bottom: 0; }
.rt-reward-num { font-size: 1.7rem; font-weight: 700; line-height: 1; text-align: center; color: ${MUTED}; }
.rt-reward-num small { display: block; font-size: 0.68rem; font-weight: 500; color: ${DIM}; margin-top: 3px; }
.rt-reward.is-ready .rt-reward-num { color: ${DAWN}; }
.rt-reward.is-claimed .rt-reward-num { color: ${DIM}; }
.rt-input { width: 100%; background: ${BG}; border: 1px solid ${LINE}; border-radius: 10px;
  color: ${INK}; font: inherit; font-size: 0.92rem; padding: 10px 12px; }
.rt-input::placeholder { color: ${DIM}; }
.rt-input:focus-visible { outline: 2px solid ${DAY}; outline-offset: 1px; border-color: ${DAY}; }
.rt-reward-meta { display: flex; align-items: center; gap: 12px; margin-top: 8px;
  color: ${MUTED}; font-size: 0.8rem; min-height: 32px; }
.rt-bar { flex: 1; height: 5px; background: ${LINE}; border-radius: 3px; overflow: hidden; }
.rt-bar i { display: block; height: 100%; background: ${DAWN}; border-radius: 3px; }
.rt-reward.is-claimed .rt-bar i { background: ${DIM}; }

/* four weeks */
.rt-weeks { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; max-width: 420px; }
.rt-dayhead { color: ${DIM}; font-size: 0.72rem; text-align: center; }
.rt-cell { aspect-ratio: 1; border-radius: 9px; display: grid; place-items: center;
  font-size: 0.78rem; font-variant-numeric: tabular-nums; background: ${LINE}; color: ${DIM};
  border: 1px solid transparent; }
.rt-cell.is-future { background: none; border: 1px dashed ${LINE}; }
.rt-cell.is-part { background: #4a3a1c; color: ${INK}; }
.rt-cell.is-chain { background: ${DAWN}; color: #2a1c05; }
.rt-cell.is-perfect { background: ${DAWN}; color: #2a1c05; box-shadow: inset 0 0 0 2px #2a1c05; }
.rt-cell.is-today { border-color: ${INK}; }
.rt-legend { display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 14px 0 0;
  color: ${DIM}; font-size: 0.78rem; }
.rt-legend > span { display: flex; align-items: center; gap: 6px; }
.rt-swatch { width: 12px; height: 12px; border-radius: 4px; display: inline-block; }
.rt-swatch.is-perfect { background: ${DAWN}; box-shadow: inset 0 0 0 2px #2a1c05; }
.rt-swatch.is-chain { background: ${DAWN}; }
.rt-swatch.is-part { background: #4a3a1c; }

/* night plan */
.rt-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.rt-chip { padding: 9px 16px; border-radius: 999px; border: 1px solid ${LINE};
  background: ${BG}; color: ${MUTED}; font: inherit; font-size: 0.86rem; cursor: pointer; }
.rt-chip:hover { color: ${INK}; border-color: ${MUTED}; }
.rt-chip[aria-checked="true"] { background: ${NIGHT}; border-color: ${NIGHT}; color: ${BG}; font-weight: 600; }
.rt-steps { list-style: none; margin: 16px 0 0; padding: 0; }
.rt-steps li { display: grid; grid-template-columns: 76px 1fr; gap: 12px; padding: 10px 0;
  border-bottom: 1px solid ${LINE}; }
.rt-steps li:last-child { border-bottom: none; }
.rt-steps .rt-when { padding-top: 0; }
.rt-steps p { margin: 0; font-size: 0.92rem; line-height: 1.5; }
.rt-hint { color: ${DIM}; font-size: 0.8rem; line-height: 1.5; margin: 12px 0 0; max-width: 60ch; }

.rt-root details summary { cursor: pointer; font-weight: 600; font-size: 0.95rem; }
.rt-root details p { margin: 12px 0 0; color: ${MUTED}; line-height: 1.6; max-width: 64ch; font-size: 0.9rem; }
.rt-root details p b { color: ${INK}; }

/* pomodoro */
.rt-pomo { position: sticky; top: 0; z-index: 40; display: flex; flex-wrap: wrap; align-items: center;
  gap: 8px 14px; background: ${SURFACE}; border: 1px solid ${LINE}; border-left: 3px solid ${DIM};
  border-radius: 12px; padding: 8px 14px; font-size: 0.86rem; }
.rt-pomo.is-focus { border-left-color: ${DAWN}; --rt-c: ${DAWN}; }
.rt-pomo.is-break { border-left-color: ${DAY}; --rt-c: ${DAY}; }
.rt-pomo-chip { padding: 2px 10px; border-radius: 999px; background: ${LINE}; font-weight: 600; font-size: 0.76rem; }
.rt-pomo-clock { font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--rt-c, ${INK}); line-height: 1; }
.rt-pomo-label { color: ${MUTED}; flex: 1; min-width: 140px; }
.rt-pomo-dots { display: inline-flex; gap: 5px; }
.rt-pomo-dots i { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid ${DIM}; display: inline-block; }
.rt-pomo-dots i.is-done { background: ${DAWN}; border-color: ${DAWN}; }
.rt-pomo-dots i.is-now { border-color: ${INK}; }

/* item histogram */
.rt-hist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.rt-hist-row { display: grid; grid-template-columns: 70px minmax(110px, 1.1fr) 2fr 92px; gap: 10px; align-items: center; }
.rt-hist-row .rt-when { padding: 0; }
.rt-hist-name { font-size: 0.86rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-hist-bar { height: 12px; background: ${LINE}; border-radius: 4px; overflow: hidden; }
.rt-hist-bar i { display: block; height: 100%; background: var(--rt-c); border-radius: 4px; }
.rt-hist-val { color: ${MUTED}; font-size: 0.78rem; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
@media (max-width: 640px) {
  .rt-hist-row { grid-template-columns: 1fr 84px; }
  .rt-hist-row .rt-when { display: none; }
  .rt-hist-bar { grid-column: 1 / -1; grid-row: 2; }
}

.rt-toast { position: fixed; left: 50%; bottom: 22px; transform: translate(-50%, 16px);
  background: ${INK}; color: ${BG}; padding: 12px 18px; border-radius: 12px;
  max-width: min(92vw, 440px); text-align: center; font-weight: 600; font-size: 0.9rem;
  opacity: 0; pointer-events: none; transition: opacity .25s, transform .25s; z-index: 60; }
.rt-toast.is-on { opacity: 1; transform: translate(-50%, 0); }

@media (max-width: 640px) {
  .rt-root { padding: 18px 12px 48px; }
  .rt-title { font-size: 1.6rem; }
  .rt-card { padding: 18px 14px; }
  .rt-row, .rt-break { grid-template-columns: 40px 66px 1fr; gap: 8px; }
  .rt-clock { font-size: 2.8rem; }
}
@media (prefers-reduced-motion: reduce) {
  .rt-root *, .rt-root *::before, .rt-root *::after { animation: none !important; transition: none !important; }
}
`;
