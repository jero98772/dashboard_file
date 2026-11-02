import { Fragment } from 'react';

import { addDays, todayKey } from '../../lib/dates.js';
import { H, MARKS, count, kEx, kFood, rate, slipsIn, slipsOn } from '../../lib/food-rules.js';

const lastDays = (n) => { const t = todayKey(); return Array.from({ length: n }, (_, i) => addDays(t, i - (n - 1))); };
const dom = (d) => Number(d.slice(8));

/** Marks per day over 30 days, with a 7-day moving average and slip dots. */
export function Trend({ ix }) {
  const N = 30, W = 420, Hh = 210, L = 24, R = 8, T = 12, B = 40, pw = W - L - R, ph = Hh - T - B;
  const ds = lastDays(N);
  const v = ds.map((d) => count(ix, d));
  const sl = ds.map((d) => slipsOn(ix, d).length);
  const ma = v.map((_, i) => { const s = v.slice(Math.max(0, i - 6), i + 1); return s.reduce((a, b) => a + b, 0) / s.length; });
  const bw = pw / N, x = (i) => L + i * bw + bw / 2, y = (n) => T + ph * (1 - n / MARKS);
  const path = ma.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="svg" role="img" aria-label="Marcas por día en los últimos 30 días, con promedio de 7 días y días con tropiezos">
      {[0, 4, MARKS].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className={g === 4 ? 's-gold dash' : 's-line'} />
          <text x={L - 5} y={y(g) + 4} textAnchor="end" className="t-mut">{g}</text>
        </g>
      ))}
      <text x={W - R} y={y(4) - 5} textAnchor="end" className="t-gold">día de avance (4)</text>
      {v.map((n, i) => <rect key={ds[i]} x={x(i) - bw * 0.36} width={bw * 0.72} y={y(n)} height={n ? Math.max(ph * (n / MARKS), 2) : 0} rx="2" className={i === N - 1 ? 'f-l2' : 'f-l1'} />)}
      <path d={path} className="s-pri" fill="none" />
      {sl.map((n, i) => n > 0 && <circle key={ds[i]} cx={x(i)} cy={T + ph + 14} r={Math.min(3 + n, 6)} className="f-bad" />)}
      {ds.map((d, i) => (i % 5 === 4 || i === 0) && <text key={d} x={x(i)} y={Hh - 6} textAnchor="middle" className="t-mut">{dom(d)}</text>)}
    </svg>
  );
}

/** Each habit's weekly rate over the last 4 weeks. */
export function Matrix({ ix }) {
  const cols = ['Hace 3 sem', 'Hace 2 sem', 'Sem. pasada', 'Últimos 7 días'];
  return (
    <div className="mx">
      <span />{cols.map((c) => <i key={c}>{c}</i>)}<span />
      {H.map((h) => {
        const r = [21, 14, 7, 0].map((f) => rate(ix, h.k, f, 7));
        const d = r[3] - r[0];
        return (
          <Fragment key={h.k}>
            <span>{h.t}</span>
            {r.map((p, i) => <span key={cols[i]} className="mc" style={{ background: `color-mix(in srgb, var(--l4) ${Math.round(p * 100)}%, var(--l0))`, color: p > 0.5 ? '#fff' : 'var(--ink)' }}>{Math.round(p * 100)}%</span>)}
            <span className={`tr${d > 0.1 ? ' up' : d < -0.1 ? ' dn' : ''}`} title="Cambio entre hace 3 semanas y ahora">{d > 0.1 ? '▲' : d < -0.1 ? '▼' : '–'}</span>
          </Fragment>
        );
      })}
    </div>
  );
}

export function HBars({ items, max, cls }) {
  return <>{items.map(([label, n]) => (
    <div className="hb" key={label}><span>{label}</span><div className="track"><b className={cls} style={{ width: `${(n / max) * 100}%` }} /></div><span>{n}</span></div>
  ))}</>;
}

/** Slips per week, last 8 weeks. */
export function Pairs({ ix }) {
  const W = 420, Hh = 170, L = 22, R = 6, T = 14, B = 30, pw = W - L - R, ph = Hh - T - B, n = 8;
  const data = Array.from({ length: n }, (_, i) => { const w = n - 1 - i; return { w, sl: slipsIn(ix, w * 7, 7) }; });
  const max = Math.max(2, ...data.map((d) => d.sl)), y = (v) => T + ph * (1 - v / max), gw = pw / n;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="svg" role="img" aria-label="Tropiezos por semana, últimas 8 semanas">
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="s-line" />
      {data.map((d, i) => {
        const x0 = L + i * gw;
        return (
          <g key={d.w}>
            <rect x={x0 + gw * 0.2} width={gw * 0.6} y={y(d.sl)} height={ph * (d.sl / max)} rx="3" className="f-bad" />
            {d.sl > 0 && <text x={x0 + gw / 2} y={y(d.sl) - 4} textAnchor="middle" className="t-mut">{d.sl}</text>}
            <text x={x0 + gw / 2} y={Hh - 10} textAnchor="middle" className="t-mut">{d.w === 0 ? 'Hoy' : `-${d.w}s`}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** kcal eaten vs. exercise per day, last 14 days, with the goal line. */
export function CalChart({ ix, goal }) {
  const N = 14, W = 420, Hh = 200, L = 34, R = 6, T = 12, B = 30, pw = W - L - R, ph = Hh - T - B;
  const ds = lastDays(N);
  const f = ds.map((d) => kFood(ix, d)), e = ds.map((d) => kEx(ix, d));
  const max = Math.max(100, ...f, ...e, goal * 1.05), y = (v) => T + ph * (1 - v / max), gw = pw / N;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="svg" role="img" aria-label="Calorías comidas y de ejercicio por día, últimos 14 días">
      {[0, 0.5, 1].map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(max * g)} y2={y(max * g)} className="s-line" /><text x={L - 5} y={y(max * g) + 4} textAnchor="end" className="t-mut">{Math.round(max * g)}</text></g>)}
      {goal > 0 && <><line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} className="s-gold dash" /><text x={W - R} y={y(goal) - 4} textAnchor="end" className="t-gold">tu meta</text></>}
      {ds.map((d, i) => {
        const x0 = L + i * gw;
        return (
          <g key={d}>
            {f[i] > 0 && <rect x={x0 + gw * 0.1} width={gw * 0.38} y={y(f[i])} height={ph * (f[i] / max)} rx="2" className="f-l3" />}
            {e[i] > 0 && <rect x={x0 + gw * 0.52} width={gw * 0.38} y={y(e[i])} height={ph * (e[i] / max)} rx="2" className="f-gold" />}
            <text x={x0 + gw / 2} y={Hh - 10} textAnchor="middle" className="t-mut">{dom(d)}</text>
          </g>
        );
      })}
    </svg>
  );
}
