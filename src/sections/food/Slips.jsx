import { useState } from 'react';

import { FOODS, SWEET, em, foodName } from '../../lib/food-rules.js';
import { Chips } from './ui.jsx';

/** «Comí algo que quería evitar»: one food_slips row per tropiezo. */
export default function Slips({ list, date, act, toast }) {
  const [f, setF] = useState('');
  const [done, setDone] = useState(null);

  const save = () => {
    if (!f) return;
    act.addSlip(date, { food: f, why: '', amount: 'medio' });
    setDone({ sweet: SWEET.includes(f) });
    setF('');
    toast('Registrado. Tu racha sigue.');
  };

  return (
    <div className="card" id="s-slip">
      <h2>🍪 Comí algo que quería evitar</h2>
      <Chips items={FOODS.map((x) => [x.k, x.t, em(x.k)])} val={f} set={setF} />
      <button type="button" className="btn big" style={{ marginTop: 12, opacity: f ? 1 : 0.5 }} disabled={!f} onClick={save}>Registrar</button>
      {done && (
        <div className="note">
          ✓ Registrado. Sin castigo.{done.sweet && ' Hoy no cuenta «Sin azúcar».'}
          <button type="button" className="ghost" style={{ marginLeft: 8 }} onClick={() => setDone(null)}>OK</button>
        </div>
      )}
      {list.map((s) => (
        <div className="slip-row" key={s.id}>
          <span>{em(s.food)} <b>{foodName(s.food)}</b> · {s.time}</span>
          <button type="button" className="ghost" aria-label="Borrar tropiezo" onClick={() => act.removeSlip(s.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
