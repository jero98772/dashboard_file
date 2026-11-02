import { MARKS } from '../../lib/food-rules.js';

export function Ring({ n }) {
  const C = 263.9;
  return (
    <div className="ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--l0)" strokeWidth="10" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--pri)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - n / MARKS)} />
      </svg>
      <div>{n}/{MARKS}</div>
    </div>
  );
}

export function Tile({ x, on, onClick, star, sub }) {
  return (
    <button type="button" className={`tile${star ? ' star' : ''}`} role="switch" aria-checked={on} aria-pressed={on} title={x.s} onClick={onClick}>
      <span className="em">{x.e}</span><span>{x.t}</span>{sub && <small>{sub}</small>}
    </button>
  );
}

export function Empty({ e, t }) {
  return <div className="empty"><span>{e}</span><small>{t}</small></div>;
}

/** Single-select chips; tapping the selected one clears it. items: [value, label, emoji]. */
export function Chips({ items, val, set }) {
  return (
    <div className="chips2">
      {items.map(([v, l, e]) => (
        <button type="button" key={v} className="chip2" aria-pressed={val === v} onClick={() => set(val === v ? '' : v)}>{e} {l}</button>
      ))}
    </div>
  );
}
