import { useMemo } from 'react';

import { addDays, offsetKey, parseKey, todayKey } from '../../lib/dates.js';
import {
  BLOCKS,
  CHM,
  DS,
  GOOD_DAY,
  MARKS,
  allSlips,
  avg,
  avgFood,
  best,
  block,
  chDone,
  chOf,
  chRun,
  chShown,
  chTotal,
  count,
  dots,
  countBy,
  foodName,
  iconOf,
  insights,
  level,
  slipsIn,
  slipsOn,
  streak,
  top,
  weekdayAvg,
} from '../../lib/food-rules.js';
import { CalChart, HBars, Matrix, Pairs, Trend } from './charts.jsx';
import { Empty } from './ui.jsx';

export default function Progress({ ix, settings }) {
  const today = todayKey();
  const goal = Number(settings.goal) > 0 ? Number(settings.goal) : 0;

  const s = useMemo(() => {
    const L = level(ix);
    const a1 = avg(ix, 0, 7);
    const sl30 = allSlips(ix, 30);
    const blocks = Array(6).fill(0);
    for (const x of sl30) blocks[block(x.time)]++;
    const lv = [1, 2, 3].map((n) => {
      let sh = 0;
      let d2 = 0;
      for (let i = 0; i < 60; i++) {
        const k = offsetKey(i);
        if (chShown(ix, k) && CHM[chOf(ix, k).id].n === n) { sh++; if (chDone(ix, k)) d2++; }
      }
      return [n, sh, d2];
    });
    return {
      L, a1, df: a1 - avg(ix, 7, 7), b: best(ix), st: streak(ix),
      af: avgFood(ix, 0, 14), ins: insights(ix), wd: weekdayAvg(ix),
      sl30, slAll: allSlips(ix, 365).length, s7: slipsIn(ix, 0, 7),
      d30: Array.from({ length: 30 }, (_, i) => count(ix, offsetKey(i))).filter((c) => c >= GOOD_DAY).length,
      foods: top(countBy(sl30, (x) => x.food)).map(([k, n]) => [foodName(k), n]),
      blocks, lv, chTot: chTotal(ix), cr: chRun(ix),
    };
  }, [ix]);

  const { L, a1, df, b, st, af, ins, wd, sl30, slAll, s7, d30, foods, blocks, lv, chTot, cr } = s;
  const t = L.t;
  const wdv = wd.filter((v) => v != null);
  const hi = Math.max(...wdv);
  const lo = Math.min(...wdv);
  const mb = Math.max(1, ...blocks);
  const chDays = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const start = addDays(today, -34);
  const pad = (parseKey(start).getDay() + 6) % 7;
  const B = [
    ['Primer paso', 'Marca tu primer hábito', t >= 1], ['3 días de avance', 'Racha de 3', b >= 3], ['Una semana', 'Racha de 7', b >= 7],
    ['Dos semanas', 'Racha de 14', b >= 14], ['Un mes', 'Racha de 30', b >= 30],
    ['Constancia', '100 marcas en total', t >= 100],
    ['Honestidad', 'Registra 5 tropiezos sin castigo', slAll >= 5], ['Reto cumplido', 'Cumple tu primer reto', chTot >= 1],
    ['7 retos seguidos', 'Una semana de retos', cr >= 7], ['30 retos', '30 retos cumplidos', chTot >= 30],
  ];

  return (
    <section id="s-prog">
      <h2>Tu evolución</h2>
      <div className="stats">
        <div className="stat"><b>{st}</b><span>días de racha</span></div>
        <div className="stat"><b>{a1.toFixed(1)}</b><span>marcas por día ({df >= 0 ? '+' : ''}{df.toFixed(1)} vs. semana previa)</span></div>
        <div className="stat"><b>{d30}</b><span>días de avance (30 días)</span></div>
        <div className="stat"><b>{s7}</b><span>tropiezos (7 días)</span></div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Lo que dicen tus datos</h3>
        {ins.length ? ins.map((x) => <p className="ins" key={x}><span>{iconOf(x)}</span>{x}</p>) : <Empty e="🔎" t="Aún sin patrones" />}
      </div>

      <div className="card">
        <h3>{df >= 0 ? 'Tu promedio sube o se mantiene' : 'Tu promedio bajó esta semana'}: {a1.toFixed(1)} marcas por día</h3>
        <Trend ix={ix} />
        <div className="leg">
          <span><i style={{ background: 'var(--l1)' }} />Marcas de cada día</span>
          <span><i style={{ background: 'var(--pri)' }} />Promedio de 7 días</span>
          <span><i style={{ background: 'var(--bad)', borderRadius: 8 }} />Día con tropiezo</span>
        </div>
        <p className="how">📈 Importa hacia dónde va la línea verde, no un día.</p>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Calendario de 5 semanas</h3>
          <div className="heat" style={{ marginTop: 10 }}>
            {DS.map((x) => <i key={x}>{x}</i>)}
            {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} style={{ visibility: 'hidden' }} />)}
            {Array.from({ length: 35 }, (_, i) => {
              const d = addDays(start, i);
              const c = count(ix, d);
              const h = c === 0 ? 0 : c < 4 ? 1 : c < 6 ? 2 : c < MARKS ? 3 : 4;
              return (
                <span key={d} className={`h${h}${i === 34 ? ' today' : ''}`} title={`${d}: ${c}/${MARKS}`}>
                  {Number(d.slice(8))}{slipsOn(ix, d).length > 0 && <u />}
                </span>
              );
            })}
          </div>
          <p className="how">Más oscuro = más hábitos · 🔴 tropiezo</p>
        </div>
        <div className="card">
          <h3>{wdv.length >= 3 ? 'Qué día de la semana te cuesta más' : 'Promedio por día de la semana'}</h3>
          <div className="bars" style={{ marginTop: 10 }}>{DS.map((l, i) => {
            const v = wd[i];
            const on = v != null && wdv.length >= 3;
            return (
              <div key={l}>
                <span>{v == null ? '–' : v.toFixed(1)}</span>
                <b className={on && v === hi ? 'best' : on && v === lo && hi !== lo ? 'worst' : ''} style={{ height: `${v == null ? 0 : (v / MARKS) * 100}%` }} />
                <span>{l}</span>
              </div>
            );
          })}</div>
          <p className="how">🟢 mejor día · 🔴 más difícil</p>
        </div>
      </div>

      <div className="card">
        <h3>{af != null ? `Comes en promedio ${Math.round(af)} kcal al día` : 'Calorías: comida y ejercicio'}</h3>
        <CalChart ix={ix} goal={goal} />
        <div className="leg"><span><i style={{ background: 'var(--l3)' }} />Lo que comí</span><span><i style={{ background: 'var(--gold)' }} />Ejercicio</span></div>
        <p className="how">14 días{af == null && ' · registra 3 días para ver el promedio'}</p>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>🎲 Mis retos</h3>
          <div className="pills"><span title="Retos seguidos">🔥 {cr}</span><span title="Retos cumplidos en total">✅ {chTot}</span></div>
          <div className="rdots" style={{ marginTop: 12 }}>{chDays.map((d, i) => {
            const dn = chDone(ix, d);
            return <span key={d} className={`rd${dn ? ' on' : chShown(ix, d) ? ' miss' : ''}${i === 13 ? ' today' : ''}`}>{dn ? '✓' : Number(d.slice(8))}</span>;
          })}</div>
          <p className="how">14 días · ✓ cumplido · punteado = pendiente</p>
        </div>
        <div className="card">
          <h3>Qué retos cumples más</h3>
          {lv.some(([, sh]) => sh > 0)
            ? lv.map(([n, sh, d2]) => (
              <div className="hb" key={n}>
                <span className="rdif">{dots(n)}</span>
                <div className="track"><b style={{ width: `${sh ? (d2 / sh) * 100 : 0}%` }} /></div>
                <span>{sh ? Math.round((d2 / sh) * 100) : 0}%</span>
              </div>
            ))
            : <Empty e="🎲" t="Cumple retos para verlos aquí" />}
          <p className="how">Por dificultad · 60 días</p>
        </div>
      </div>

      <div className="card">
        <h3>Qué hábitos están mejorando</h3>
        <Matrix ix={ix} />
        <p className="how">Más oscuro = más días · ▲ mejora · ▼ baja · – estable</p>
      </div>

      <h2 style={{ marginTop: 22 }}>Tus tropiezos, sin castigo</h2>
      {sl30.length === 0 ? (
        <div className="card"><Empty e="🍪" t="Sin tropiezos registrados" /></div>
      ) : (<>
        <div className="grid two">
          <div className="card"><h3>Qué comes cuando tropiezas</h3><HBars items={foods} max={foods[0][1]} cls="bad" /><p className="how">Últimos 30 días</p></div>
          <div className="card">
            <h3>A qué hora tropiezas</h3>
            <div className="bars" style={{ marginTop: 10 }}>{blocks.map((n, i) => (
              <div key={BLOCKS[i].r} title={BLOCKS[i].n}>
                <span>{n}</span>
                <b className={n === mb && n > 0 ? 'worst' : ''} style={{ height: `${(n / mb) * 100}%`, background: n === mb && n > 0 ? undefined : 'var(--l2)' }} />
                <span>{BLOCKS[i].r}</span>
              </div>
            ))}</div>
            <p className="how">🔴 franja crítica</p>
          </div>
        </div>
        <div className="card">
          <h3>Tropiezos por semana</h3>
          <Pairs ix={ix} />
          <p className="how">8 semanas · 🔴 debería bajar</p>
        </div>
      </>)}

      <div className="card">
        <h3>Nivel: {L.name}</h3>
        <div className="track" style={{ margin: '8px 0' }}><b style={{ width: `${Math.round(L.pct * 100)}%`, background: 'var(--gold)' }} /></div>
        <p className="mut">{L.nx ? `${t} marcas. Faltan ${L.nx[1] - t} para llegar a ${L.nx[0]}.` : `${t} marcas. Llegaste al nivel máximo.`}</p>
        <h3 style={{ margin: '14px 0 10px' }}>Logros</h3>
        <div className="badges">{B.map((x) => (
          <div key={x[0]} className={`badge${x[2] ? ' on' : ''}`}><b>{x[2] ? '★ ' : ''}{x[0]}</b>{x[1]}</div>
        ))}</div>
      </div>
    </section>
  );
}
