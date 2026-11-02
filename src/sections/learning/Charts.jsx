import { useEffect, useRef, useState } from 'react';
import { bisector, extent, max, min } from 'd3-array';
import { scaleBand, scaleLinear, scaleSqrt, scaleUtc } from 'd3-scale';
import { utcFormat } from 'd3-time-format';

import { col } from '../../lib/learning-rules.js';
import { fmt, useTip } from './shared.js';

// Charts place dates on a UTC axis; date keys are parsed as UTC midnight so
// "2026-10-22" lands on the 22nd whatever the local timezone is.
const pad = (n) => String(n).padStart(2, '0');
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (k) => new Date(`${k}T00:00:00Z`);

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function YAxis({ ticks, y, m, W, label }) {
  return ticks.map((v) => (
    <g key={v}>
      <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--grid)' }} />
      <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{label(v)}</text>
    </g>
  ));
}

export function Timeline({ S, today }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  let body = null;
  if (!S.length) {
    body = <div className="empty-state">Entries appear here once you log something.</div>;
  } else if (w > 0) {
    const W = Math.max(w, 300), H = 320, m = { l: 50, r: 12, t: 10, b: 26 };
    const P = S.map((r) => { const p = r.time.split(':'); return { ...r, d: utc(r.date), hr: Number(p[0]) + (Number(p[1]) || 0) / 60 }; });
    const x = scaleUtc().domain([min(P, (p) => p.d), utc(today)]).range([m.l + 8, W - m.r - 4]);
    const h0 = Math.max(0, Math.floor(min(P, (p) => p.hr)) - 1), h1 = Math.min(24, Math.ceil(max(P, (p) => p.hr)) + 1);
    const y = scaleLinear().domain([h0, h1]).range([m.t, H - m.b]);
    const rad = scaleSqrt().domain([0, max(P, (p) => p.minutes) || 1]).range([3.5, 9]);
    const hours = []; for (let v = h0; v <= h1; v++) if (v % 2 === 0) hours.push(v);
    body = (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        <YAxis ticks={hours} y={y} m={m} W={W} label={(v) => `${pad(v)}:00`} />
        {x.ticks(Math.max(2, Math.floor(W / 95))).map((t) => (<text key={+t} x={x(t)} y={H - 6} textAnchor="middle">{utcFormat('%b %-d')(t)}</text>))}
        {P.map((p) => (
          <circle key={p.id} cx={x(p.d)} cy={y(p.hr)} r={rad(p.minutes)} fillOpacity=".85" strokeWidth="1.5"
            style={{ fill: col(p.topic), stroke: 'var(--panel)' }}
            onMouseMove={(e) => tip.show(e, [p.title || '(untitled)', `${p.topic} · ${p.format}`, `${utcFormat('%a %b %-d')(p.d)} at ${p.time} · ${p.minutes} min`])}
            onMouseLeave={tip.hide} />
        ))}
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}

export function Cumulative({ S, today }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  let body = null;
  if (!S.length) body = <div className="empty-state">No data yet.</div>;
  else if (w > 0) {
    const by = {}; S.forEach((r) => { by[r.date] = (by[r.date] || 0) + r.xp; });
    const first = +utc(min(S, (r) => r.date)), last = +utc(today);
    let run = 0; const pts = [];
    for (let ms = first; ms <= last; ms += 864e5) { run += by[iso(ms)] || 0; pts.push({ d: new Date(ms), v: run }); }
    if (pts.length < 2) pts.push({ d: new Date(last + 864e5), v: run });
    const W = Math.max(w, 260), H = 200, m = { l: 48, r: 50, t: 10, b: 24 };
    const x = scaleUtc().domain(extent(pts, (p) => p.d)).range([m.l, W - m.r]);
    const y = scaleLinear().domain([0, run || 1]).nice().range([H - m.b, m.t]);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const l = pts[pts.length - 1];
    const bis = bisector((p) => p.d).center;
    body = (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        <YAxis ticks={y.ticks(4)} y={y} m={m} W={W} label={(v) => fmt(v)} />
        {x.ticks(Math.max(2, Math.floor(W / 110))).map((t) => (<text key={+t} x={x(t)} y={H - 6} textAnchor="middle">{utcFormat('%b %-d')(t)}</text>))}
        <path d={path} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--ink)' }} />
        <circle cx={x(l.d)} cy={y(l.v)} r="3.5" style={{ fill: 'var(--ink)' }} />
        <text x={x(l.d) + 7} y={y(l.v) + 4}>{fmt(l.v)}</text>
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent"
          onMouseMove={(e) => {
            const b = e.currentTarget.ownerSVGElement.getBoundingClientRect();
            const p = pts[bis(pts, x.invert(((e.clientX - b.left) * W) / b.width))];
            tip.show(e, [utcFormat('%b %-d')(p.d), `${fmt(p.v)} XP total`]);
          }} onMouseLeave={tip.hide} />
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}

export function Weekdays({ S }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  let body = null;
  if (!S.length) body = <div className="empty-state">No data yet.</div>;
  else if (w > 0) {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const seen = new Set(), c = [0, 0, 0, 0, 0, 0, 0];
    S.forEach((r) => { if (!seen.has(r.date)) { seen.add(r.date); c[(utc(r.date).getUTCDay() + 6) % 7]++; } });
    const W = Math.max(w, 240), H = 200, m = { l: 32, r: 6, t: 10, b: 24 };
    const x = scaleBand().domain(names).range([m.l, W - m.r]).padding(0.3);
    const y = scaleLinear().domain([0, Math.max(3, max(c))]).nice().range([H - m.b, m.t]);
    body = (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        <YAxis ticks={y.ticks(4).filter(Number.isInteger)} y={y} m={m} W={W} label={(v) => v} />
        {names.map((n, i) => (
          <g key={n}>
            <rect x={x(n)} y={y(c[i])} width={x.bandwidth()} height={y(0) - y(c[i])} rx="4" fillOpacity=".85" style={{ fill: 'var(--ink)' }}
              onMouseMove={(e) => tip.show(e, [n, `${c[i]} active days`])} onMouseLeave={tip.hide} />
            <text x={x(n) + x.bandwidth() / 2} y={H - 6} textAnchor="middle">{n}</text>
          </g>
        ))}
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}

export function TopicBars({ S }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  let body = null;
  if (!S.length) body = <div className="empty-state">No data yet.</div>;
  else if (w > 0) {
    const by = {};
    S.forEach((r) => { const o = by[r.topic] || (by[r.topic] = { t: r.topic, xp: 0, n: 0 }); o.xp += r.xp; o.n++; });
    const rows = Object.values(by).sort((a, b) => b.xp - a.xp);
    const W = Math.max(w, 260), bh = 18, gap = 7, left = 150, H = rows.length * (bh + gap) + 4;
    const x = scaleLinear().domain([0, rows[0].xp || 1]).range([0, Math.max(W - left - 48, 10)]);
    body = (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {rows.map((r, i) => {
          const yy = 2 + i * (bh + gap);
          return (
            <g key={r.t}>
              <text x={left - 8} y={yy + bh / 2 + 4} textAnchor="end">{r.t.length > 22 ? `${r.t.slice(0, 21)}…` : r.t}</text>
              <rect x={left} y={yy} width={Math.max(x(r.xp), 2)} height={bh} rx="4" style={{ fill: col(r.t) }}
                onMouseMove={(e) => tip.show(e, [r.t, `${fmt(r.xp)} XP · ${r.n} entries`])} onMouseLeave={tip.hide} />
              <text x={left + x(r.xp) + 6} y={yy + bh / 2 + 4}>{fmt(r.xp)}</text>
            </g>
          );
        })}
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}
