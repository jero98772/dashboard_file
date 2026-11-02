import { useState } from 'react';

import { addDays } from '../../lib/dates.js';
import { ACTS, em, exOn, foodOn, frequent, kEx, kFood } from '../../lib/food-rules.js';
import { Chips } from './ui.jsx';

/** Calorie counter: food and exercise rows in food_log, weight and goal in food_settings. */
export default function Calories({ ix, date, settings, act }) {
  const [fn, setFn] = useState('');
  const [fk, setFk] = useState('');
  const [activity, setActivity] = useState('caminar');
  const [mn, setMn] = useState('');
  const [ek, setEk] = useState('');

  const kgSet = Number(settings.kg) > 0;
  const kg = kgSet ? Number(settings.kg) : 70;
  const goal = Number(settings.goal) > 0 ? Number(settings.goal) : 0;
  const food = foodOn(ix, date);
  const ex = exOn(ix, date);
  const eaten = kFood(ix, date);
  const burned = kEx(ix, date);
  const net = eaten - burned;
  const yk = addDays(date, -1);
  const yHas = foodOn(ix, yk).length > 0;
  const yE = kFood(ix, yk);
  const A = ACTS.find((a) => a.k === activity);
  const minutes = parseFloat(mn);
  const est = minutes > 0 ? Math.round(A.met * kg * (minutes / 60)) : 0;
  const fq = frequent(ix);

  const addFood = (name, kc) => {
    const v = Math.round(parseFloat(kc));
    if (!(v > 0 && v < 10000)) return;
    act.addLog(date, { kind: 'food', name: (name || '').trim().slice(0, 40), minutes: '', kcal: String(v) });
    setFn('');
    setFk('');
  };
  const addEx = () => {
    const v = Math.round(parseFloat(ek) > 0 ? parseFloat(ek) : est);
    if (!(v > 0 && v < 10000)) return;
    act.addLog(date, { kind: 'ex', name: A.t, minutes: minutes > 0 ? String(minutes) : '', kcal: String(v) });
    setMn('');
    setEk('');
  };

  return (
    <div className="card">
      <h2>🔥 Calorías</h2>
      <div className="tiles">
        <div className="stat"><b>{eaten}</b><span>🍽️ comí</span></div>
        <div className="stat"><b>{burned}</b><span>🏃 ejercicio</span></div>
        <div className="stat"><b>{net}</b><span>⚖️ neto</span></div>
      </div>
      {goal > 0 && <p className="how">🎯 {goal - net >= 0 ? `Quedan ${goal - net} de ${goal}` : `+${net - goal} sobre tu meta (sin castigo)`}</p>}
      {yHas && eaten > 0 && <p className="how">📅 Ayer {yE} · hoy {eaten > yE ? '+' : '−'}{Math.abs(eaten - yE)}</p>}

      <div className="sub">🍽️ Lo que comí</div>
      {fq.length > 0 && (
        <div className="chips2">{fq.map((f) => (
          <button type="button" key={f.n} className="chip2" onClick={() => addFood(f.n, f.k)}>{f.n} · {f.k}</button>
        ))}</div>
      )}
      <div className="alt-row" style={{ marginTop: 8 }}>
        <input type="text" value={fn} onChange={(e) => setFn(e.target.value)} placeholder="¿Qué? (opcional)" aria-label="Nombre del alimento" />
        <input type="number" inputMode="numeric" min="0" value={fk} onChange={(e) => setFk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFood(fn, fk)} placeholder="kcal" aria-label="Calorías del alimento" style={{ width: 90, flex: 'none' }} />
        <button type="button" className="btn" aria-label="Agregar alimento" onClick={() => addFood(fn, fk)}>+</button>
      </div>
      {food.map((f) => (
        <div className="slip-row" key={f.id}>
          <span><b>{f.name || 'Comida'}</b> · {f.kcal} kcal · {f.time}</span>
          <button type="button" className="ghost" aria-label="Borrar alimento" onClick={() => act.removeLog(f.id)}>✕</button>
        </div>
      ))}

      <div className="sub">🏃 Mi ejercicio</div>
      <Chips items={ACTS.map((a) => [a.k, a.t, em(a.k)])} val={activity} set={(v) => setActivity(v || activity)} />
      <div className="alt-row" style={{ marginTop: 8 }}>
        <input type="number" inputMode="numeric" min="0" value={mn} onChange={(e) => setMn(e.target.value)} placeholder="Minutos" aria-label="Minutos de ejercicio" />
        <input type="number" inputMode="numeric" min="0" value={ek} onChange={(e) => setEk(e.target.value)} placeholder={est ? `~${est} kcal` : 'kcal'} aria-label="Calorías del ejercicio (estimadas si lo dejas vacío)" style={{ width: 110, flex: 'none' }} />
        <button type="button" className="btn" aria-label="Agregar ejercicio" onClick={addEx}>+</button>
      </div>
      {ex.map((x) => (
        <div className="slip-row" key={x.id}>
          <span>{em(ACTS.find((a) => a.t === x.name)?.k)} <b>{x.name}</b>{x.minutes ? ` · ${x.minutes} min` : ''} · {x.kcal} kcal</span>
          <button type="button" className="ghost" aria-label="Borrar ejercicio" onClick={() => act.removeLog(x.id)}>✕</button>
        </div>
      ))}

      <details>
        <summary>⚙️ Mis datos</summary>
        <div className="row2">
          <div><label htmlFor="kg">Peso (kg)</label><input type="number" inputMode="decimal" id="kg" value={settings.kg ?? ''} onChange={(e) => act.setCfg('kg', e.target.value)} /></div>
          <div><label htmlFor="gl">Meta (kcal/día)</label><input type="number" inputMode="numeric" id="gl" value={settings.goal ?? ''} onChange={(e) => act.setCfg('goal', e.target.value)} /></div>
        </div>
        <p className="how">Estimado con {kg} kg{kgSet ? '' : ' (por defecto)'}. El ejercicio es para sentirte bien, no para compensar.</p>
      </details>
    </div>
  );
}
