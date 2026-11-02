import { useState } from 'react';

import { addDays, parseKey, todayKey } from '../../lib/dates.js';
import {
  CH,
  CHM,
  GOOD_DAY,
  H,
  MK,
  MS,
  chOf,
  count,
  dayOn,
  done,
  dots,
  he,
  isSet,
  listOf,
  mealHas,
  mealPatch,
  mealsOn,
  msg,
  rate,
  slipsOn,
  streak,
} from '../../lib/food-rules.js';
import Calories from './Calories.jsx';
import Slips from './Slips.jsx';
import { Ring, Tile } from './ui.jsx';

const fmtDay = { weekday: 'long', day: 'numeric', month: 'short' };

export default function Today({ ix, fk, settings, act, toast }) {
  const [off, setOff] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const today = todayKey();
  const k = addDays(today, off);
  const r = dayOn(ix, k);
  const meals = mealsOn(ix, k);
  const n = count(ix, k);
  const isT = off === 0;
  const warn = isT && n < GOOD_DAY && count(ix, addDays(today, -1)) < GOOD_DAY && ix.dates.size > 1;
  const lbl = isT ? 'Hoy' : off === -1 ? 'Ayer' : parseKey(k).toLocaleDateString('es', fmtDay);
  const st = streak(ix);

  const newMeal = (ok) => act.addMeal(k, Object.assign({}, ...MK.map((hk) => mealPatch(hk, ok))));
  const toggleMeal = (m, hk) => act.patchMeal(m.id, mealPatch(hk, !mealHas(m, hk)));
  const dayHabit = (hk) => listOf(r.habits).includes(hk);

  const fx = H.find((h) => h.k === fk);
  const fHasMeals = MK.includes(fk) && meals.length > 0;
  const nw = ix.dates.size < 3;
  const others = H.filter((x) => x.k !== fk);

  const ch = chOf(ix, k);
  const c1 = CHM[ch.id];
  const swap = () => act.setChallenge(k, (c) => {
    const o = CH.filter((x) => x.i !== c.id);
    return { id: o[Math.floor(Math.random() * o.length)].i, done: false };
  });

  return (
    <section id="s-hoy">
      <div className="day">
        <button type="button" onClick={() => setOff(Math.max(-60, off - 1))} aria-label="Día anterior">‹</button>
        <h2 style={{ margin: 0 }}>{lbl}</h2>
        <button type="button" onClick={() => setOff(Math.min(0, off + 1))} aria-label="Día siguiente" disabled={off >= 0} style={off >= 0 ? { opacity: 0.4 } : null}>›</button>
      </div>
      <div className="grid two">
        <div>
          <div className="card hero">
            <Ring n={n} />
            <div>
              <h3>{msg(n)}</h3>
              <div className="pills">
                <span title="Días de racha">🔥 {st}</span>
                <span title="Comidas registradas">🍽️ {meals.length}</span>
                <span title="Tropiezos">🍪 {slipsOn(ix, k).length}</span>
              </div>
            </div>
          </div>
          {warn && <div className="note">⚠️ 2 días sin avanzar. Hoy basta con 1 hábito.</div>}

          <div className="card">
            <div className="hhead"><h2>🎲 Reto del día</h2><span className="rdif" title="Dificultad">{dots(c1.n)}</span></div>
            <div className="rbody"><span className="rem">{c1.e}</span><div><h3>{c1.t}</h3><p className="mut">{c1.s}</p></div></div>
            <div className="row2">
              <button type="button" className={`btn${ch.done ? ' alt' : ''}`} aria-pressed={ch.done} onClick={() => act.setChallenge(k, (c) => ({ ...c, done: !c.done }))}>{ch.done ? '✓ Cumplido' : 'Lo cumplí'}</button>
              <button type="button" className="ghost" onClick={swap}>🔄 Otro reto</button>
            </div>
          </div>

          <div className="card" style={{ border: '2px solid var(--gold)' }}>
            <h2>⭐ Hábito de la semana</h2>
            <div className="fx">
              <div className="fxm">
                {fHasMeals
                  ? <div className="chips2" style={{ marginTop: 0 }}>{meals.map((m) => (
                    <button type="button" key={m.id} className="chip2" aria-pressed={mealHas(m, fk)} onClick={() => toggleMeal(m, fk)}>{fx.e} {m.time}</button>
                  ))}</div>
                  : <Tile x={fx} star on={done(ix, k, fk)} onClick={() => act.toggleHabit(k, fk)} sub={MK.includes(fk) ? 'o por comida ↓' : ''} />}
              </div>
              {!nw && <div className="pct"><b>{Math.round(rate(ix, fk, 1, 14) * 100)}%</b><small>14 días</small></div>}
            </div>
            <div className="sub">Elige el de la semana</div>
            <div className="chips2">{H.map((h) => (
              <button type="button" key={h.k} className="chip2" aria-pressed={h.k === fk} onClick={() => act.setFocus(h.k)}>{h.e} {h.t}</button>
            ))}</div>
          </div>

          <div className="card">
            <h2>🍽️ Mis comidas</h2>
            {meals.map((m) => (
              <div className="meal" key={m.id}>
                <div className="mh">
                  <b>{m.type === 's' ? '🍿 Snack' : '🍽️ Comida'}</b>
                  <input type="time" value={m.time || ''} aria-label="Hora de la comida" onChange={(e) => e.target.value && act.patchMeal(m.id, { time: e.target.value })} />
                  <button type="button" className="ghost" onClick={() => act.patchMeal(m.id, { type: m.type === 's' ? 'c' : 's' })}>{m.type === 's' ? '→ Comida' : '→ Snack'}</button>
                  <button type="button" className="ghost" aria-label="Borrar comida" onClick={() => act.removeMeal(m.id)}>✕</button>
                </div>
                <div className="chips2">{MK.map((hk) => (
                  <button type="button" key={hk} className="chip2" aria-pressed={mealHas(m, hk)} onClick={() => toggleMeal(m, hk)}>{he(hk)} {MS[hk]}</button>
                ))}</div>
              </div>
            ))}
            <div className="row2" style={{ marginTop: 8 }}>
              <button type="button" className="btn" onClick={() => newMeal(true)}>+ Comí bien</button>
              <button type="button" className="btn alt" onClick={() => newMeal(false)}>+ A revisar</button>
            </div>
          </div>

          <Slips list={slipsOn(ix, k)} date={k} act={act} toast={toast} />

          <div className="card">
            <h2>✅ Mis hábitos</h2>
            <div className="tiles2">
              {others.map((x) => {
                if (MK.includes(x.k) && meals.length) {
                  const c = meals.filter((m) => mealHas(m, x.k)).length;
                  return (
                    <div className="tile" key={x.k} aria-pressed={done(ix, k, x.k)} style={{ cursor: 'default' }} title={x.s}>
                      <span className="em">{x.e}</span><span>{x.t}</span><small>{c}/{meals.length} comidas</small>
                    </div>
                  );
                }
                return <Tile key={x.k} x={x} on={x.k === 'sugar' ? done(ix, k, x.k) : dayHabit(x.k)} onClick={() => act.toggleHabit(k, x.k)} />;
              })}
            </div>
          </div>
        </div>

        <div>
          <Calories ix={ix} date={k} settings={settings} act={act} />
          <div className="card">
            <h2>📝 Notas</h2>
            {!(noteOpen || r.who || r.note) && <button type="button" className="ghost" style={{ width: '100%' }} onClick={() => setNoteOpen(true)}>+ Agregar nota</button>}
            {(noteOpen || r.who || r.note) && (<div>
              <label htmlFor="who">👥 ¿Con quién comí?</label>
              <input type="text" id="who" value={r.who || ''} onChange={(e) => act.patchDay(k, () => ({ who: e.target.value }))} placeholder="Nombre, si fue mala influencia" />
              <label htmlFor="nt">¿Qué noté hoy?</label>
              <textarea id="nt" value={r.note || ''} onChange={(e) => act.patchDay(k, () => ({ note: e.target.value }))} placeholder="Una frase basta" />
            </div>)}
            <button type="button" className="habit" style={{ marginTop: 12 }} role="switch" aria-checked={isSet(r.up)} aria-pressed={isSet(r.up)} onClick={() => act.patchDay(k, (cur) => ({ up: isSet(cur.up) ? '' : '1' }))}>
              <span className="box">✓</span><span>⚖️ Subí de peso hoy</span>
            </button>
            {isSet(r.up) && <div className="note">Un número no define tu progreso. Sin castigo: anota y sigue mañana.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
