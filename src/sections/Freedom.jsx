import { useCallback, useMemo, useState } from "react";

import { todayKey } from "../lib/dates.js";
import {
  TRIGGER_LABELS,
  RISK_PHASES,
  computeStreak,
  dayCongrats,
  deriveStats,
  formatDate,
  getLevelInfo,
  longestStreak,
  milestonesReached,
  nextPhase,
  offsetKey,
  phaseFor,
  rowsToHeatmap,
  rowsToLogs,
  streakDayMap,
} from "../lib/freedom-rules.js";
import { useSettings, useTable } from "../lib/use-table.js";

// ── Constants ──────────────────────────────────────────────────────────────

const REWARDS = [
  { icon: "☕", name: "Café especial",              desc: "Un café de especialidad merecido",          days: 1 },
  { icon: "🎮", name: "2h videojuego sin culpa",   desc: "Sesión libre de entretenimiento",            days: 3 },
  { icon: "🍕", name: "Tu comida favorita",         desc: "Pide lo que más te gusta",                  days: 5 },
  { icon: "🎬", name: "Noche de película",          desc: "Palomitas y película larga",                days: 7 },
  { icon: "👟", name: "Ropa o accesorio nuevo",     desc: "Algo que llevas tiempo queriendo",          days: 10 },
  { icon: "🏋️", name: "Día de spa o masaje",        desc: "Cuida tu cuerpo que trabaja duro",          days: 14 },
  { icon: "📚", name: "Libro que deseas",           desc: "Invierte en tu mente",                      days: 21 },
  { icon: "🎵", name: "Concierto o evento",         desc: "Una experiencia memorable",                 days: 30 },
  { icon: "✈️", name: "Escapada de fin de semana", desc: "Te lo ganaste completamente",               days: 60 },
  { icon: "👑", name: "Meta LEGENDARIA",            desc: "Cambiaste tu vida",                         days: 90 },
  { icon: "🧘", name: "Retiro de bienestar",        desc: "Nivel maestro — mente y cuerpo",           days: 180 },
  { icon: "🌟", name: "Lo que siempre quisiste",    desc: "Tú defines esta recompensa",               days: 365 },
];

const TABS = [
  { id: "dashboard",  label: "📊 Dashboard" },
  { id: "log",        label: "📝 Registrar" },
  { id: "triggers",   label: "🗺️ Disparadores" },
  { id: "strategies", label: "🧠 Estrategias" },
  { id: "rewards",    label: "🏆 Recompensas" },
  { id: "crisis",     label: "🆘 Emergencia" },
];

// ── Styles (CSS-in-JS object map) ─────────────────────────────────────────

const C = {
  bg:       "#0d1117",
  surface:  "#161b22",
  surface2: "#1c2333",
  border:   "#21262d",
  accent:   "#3fb950",
  blue:     "#58a6ff",
  purple:   "#d2a8ff",
  orange:   "#ffa657",
  red:      "#f85149",
  gold:     "#f1c40f",
  warn:     "#e3b341",
  text:     "#e6edf3",
  muted:    "#8b949e",
  dim:      "#484f58",
};

const base = {
  fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  background: C.bg,
  color: C.text,
  padding: "24px 16px 60px",
  boxSizing: "border-box",
};

// ── Sub-components ─────────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: 18, ...style,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return (
    <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase",
      letterSpacing: "0.07em", marginBottom: 6, fontWeight: 600 }}>
      {children}
    </div>
  );
}

function ProgressBar({ pct, color = C.accent, height = 8 }) {
  return (
    <div style={{ height, background: C.border, borderRadius: 4, overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 4,
        background: `linear-gradient(90deg, ${color}, ${color}cc)`,
        width: `${Math.min(100, pct)}%`, transition: "width .4s ease",
      }} />
    </div>
  );
}

function Badge({ children, color = C.gold }) {
  return (
    <span style={{
      padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, variant = "primary", style }) {
  const variants = {
    primary: { background: C.accent, color: "#000" },
    danger:  { background: C.red, color: "#fff" },
    ghost:   { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
  };
  return (
    <button onClick={onClick} style={{
      padding: "9px 18px", borderRadius: 8, border: "none", cursor: "pointer",
      fontSize: 13, fontWeight: 600, ...variants[variant], ...style,
    }}>
      {children}
    </button>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "10px 20px", fontSize: 13, zIndex: 200, whiteSpace: "nowrap",
      animation: "fadeUp .3s ease",
    }}>
      {message}
      <style>{`@keyframes fadeUp { from { transform: translateX(-50%) translateY(20px); opacity:0; } to { transform: translateX(-50%) translateY(0); opacity:1; }}`}</style>
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.75)",
      zIndex: 100, display: "grid", placeItems: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 24, width: "min(90vw, 400px)", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: "100%", padding: "8px 10px", background: C.bg,
      border: `1px solid ${C.border}`, borderRadius: 8,
      color: C.text, fontSize: 13, marginBottom: 12,
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Textarea({ value, onChange, placeholder }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={3} style={{
        width: "100%", padding: "8px 10px", background: C.bg,
        border: `1px solid ${C.border}`, borderRadius: 8,
        color: C.text, fontSize: 13, resize: "vertical", marginBottom: 12,
        boxSizing: "border-box",
      }} />
  );
}

// ── XP Bar ────────────────────────────────────────────────────────────────

function XPBar({ xp }) {
  const info = getLevelInfo(xp);
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 16, marginBottom: 24, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
        background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`,
        display: "grid", placeItems: "center", fontWeight: 800, fontSize: 17, color: "#000",
      }}>
        {info.level}
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{info.name}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 5 }}>
          {xp} XP · {info.hasNext ? `${info.nextMin} XP para nivel ${info.nextLevel}` : "¡Nivel máximo!"}
        </div>
        <ProgressBar pct={info.pct} color={C.blue} height={6} />
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, color: C.muted }}>XP total</div>
        <div style={{ fontWeight: 700, color: C.blue, fontSize: 18 }}>{xp}</div>
      </div>
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────

// ── Felicitación del día ──────────────────────────────────────────────────

function CongratsCard({ streak }) {
  const phase = phaseFor(streak);
  const upcoming = nextPhase(streak);
  const reached = milestonesReached(streak);

  return (
    <Card style={{
      marginBottom: 16,
      borderLeft: `3px solid ${phase ? C.warn : C.accent}`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden="true">
          {phase ? "⚠️" : streak > 0 ? "🎉" : "🌱"}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.45 }}>
            {dayCongrats(streak)}
          </div>
          {phase ? (
            <div style={{ fontSize: 13, color: C.warn, marginTop: 8, lineHeight: 1.5 }}>
              Estás dentro de <strong>{phase.name}</strong> (días {phase.from}–{phase.to}). {phase.plan}
            </div>
          ) : upcoming ? (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
              Siguiente ventana de riesgo: <strong>{upcoming.name}</strong>, en{" "}
              {upcoming.inDays} día{upcoming.inDays === 1 ? "" : "s"} (día {upcoming.from}). Prepárala hoy, no ese día.
            </div>
          ) : null}
          {reached.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {reached.slice(0, 8).map((d) => (
                <Badge key={d} color={d === streak ? C.gold : C.dim}>
                  día {d}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Fases de riesgo ───────────────────────────────────────────────────────

const PHASE_SCALE = 95; // el eje llega un poco más allá del día 90

function PhasesCard({ streak }) {
  const current = phaseFor(streak);
  const pos = (d) => Math.min(100, (d / PHASE_SCALE) * 100);

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardTitle>Fases de riesgo</CardTitle>
      <div style={{ fontSize: 12, color: C.muted, margin: "6px 0 16px", lineHeight: 1.5 }}>
        Ventanas en las que la recaída es más probable. No predicen nada — avisan cuándo no bajar la guardia.
      </div>

      {/* Línea de tiempo: los días 0–95 con las cuatro ventanas marcadas */}
      <div style={{ position: "relative", height: 34, marginBottom: 6 }}>
        <div style={{
          position: "absolute", top: 12, left: 0, right: 0, height: 10,
          background: C.surface2, borderRadius: 5,
        }} />
        {RISK_PHASES.map((p) => (
          <div
            key={p.id}
            title={`${p.name}: días ${p.from}–${p.to}`}
            style={{
              position: "absolute", top: 12, height: 10, borderRadius: 5,
              left: `${pos(p.from - 1)}%`,
              width: `${Math.max(2, pos(p.to) - pos(p.from - 1))}%`,
              background: current?.id === p.id ? C.warn : "rgba(227,179,65,.32)",
            }}
          />
        ))}
        {/* Dónde estás hoy */}
        <div style={{
          position: "absolute", top: 4, left: `${pos(streak)}%`,
          transform: "translateX(-50%)", textAlign: "center",
        }}>
          <div style={{ width: 2, height: 26, background: C.blue, margin: "0 auto" }} />
        </div>
        <div style={{
          position: "absolute", top: -2, left: `${pos(streak)}%`,
          transform: "translateX(-50%)", fontSize: 10, color: C.blue, whiteSpace: "nowrap",
        }}>
          día {streak}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.dim, marginBottom: 16 }}>
        <span>0</span><span>30</span><span>60</span><span>90+</span>
      </div>

      {RISK_PHASES.map((p) => {
        const isNow = current?.id === p.id;
        const passed = streak > p.to;
        return (
          <div
            key={p.id}
            style={{
              padding: "12px 14px", borderRadius: 10, marginBottom: 8,
              background: isNow ? "rgba(227,179,65,.10)" : C.surface2,
              border: `1px solid ${isNow ? C.warn : C.border}`,
              opacity: passed && !isNow ? 0.55 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>{p.name}</strong>
              <Badge color={isNow ? C.warn : C.dim}>días {p.from}–{p.to}</Badge>
              {isNow && <Badge color={C.red}>estás aquí</Badge>}
              {passed && !isNow && <Badge color={C.accent}>superada</Badge>}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 7, lineHeight: 1.5 }}>{p.why}</div>
            <div style={{ fontSize: 13, color: isNow ? C.text : C.dim, marginTop: 6, lineHeight: 1.5 }}>
              <strong>Plan:</strong> {p.plan}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────

function DashboardTab({ state, onQuickLog, onRelapse }) {
  const streak = computeStreak(state.heatmap);
  const recTarget = state.personalRecord + 1;
  const recPct = Math.min(100, (streak / recTarget) * 100);

  const subLabel =
    streak === 0 ? "Empieza hoy — cada racha comienza en 0" :
    streak < state.personalRecord ? `${state.personalRecord - streak} días para superar tu récord` :
    streak === state.personalRecord ? "¡Igualaste tu récord! Mañana lo superas" :
    `🎉 ¡RÉCORD SUPERADO! +${streak - state.personalRecord} días por encima`;

  const nextReward = REWARDS.find(r => r.days > streak);

  // Heatmap: last 70 days. Each clean cell carries the streak day it was and
  // the congratulation that went with it, so hovering the history replays it.
  const dayNumbers = streakDayMap(state.heatmap);
  const heatDays = Array.from({ length: 70 }, (_, i) => {
    const key = offsetKey(69 - i);
    const val  = state.heatmap[key];
    const isToday = key === todayKey();
    const n = dayNumbers[key];
    const tip = val === "clean" && n
      ? `${key} — ${dayCongrats(n)}`
      : val === "relapse"
        ? `${key} — recaída. Vuelves a empezar, más informado.`
        : `${key} — sin registro`;
    return { key, val, isToday, tip };
  });

  function heatColor(val) {
    if (val === "relapse") return "rgba(248,81,73,.4)";
    if (val === "clean") return "#196432";
    return C.border;
  }

  return (
    <div>
      {/* Streak hero */}
      <div style={{
        background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
        border: "1px solid #2a4a5e", borderRadius: 16, padding: 28,
        textAlign: "center", marginBottom: 24, position: "relative", overflow: "hidden",
      }}>
        <div style={{ fontSize: 48, lineHeight: 1 }}>🔥</div>
        <div style={{
          fontSize: 80, fontWeight: 800, lineHeight: 1.1,
          background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>{streak}</div>
        <div style={{ color: C.muted, marginBottom: 4 }}>días sin recaída</div>
        <div style={{ fontSize: 13, color: C.dim, marginTop: 6 }}>{subLabel}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          <Badge color={C.gold}>🏆 Récord: {state.personalRecord} días</Badge>
          <Badge color={C.blue}>⚡ Racha actual: {streak} días</Badge>
          {nextReward && (
            <Badge color={C.accent}>
              🎯 {nextReward.icon} en {nextReward.days - streak} día{nextReward.days - streak !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Racha actual", val: streak, color: C.accent, sub: "días" },
          { label: "Récord personal", val: state.personalRecord, color: C.gold, sub: "días" },
          { label: "Impulsos resistidos", val: state.urgesResisted, color: C.blue, sub: "este ciclo" },
          { label: "XP acumulado", val: state.xp, color: C.text, sub: "puntos" },
        ].map(s => (
          <Card key={s.label} style={{ padding: 14 }}>
            <CardTitle>{s.label}</CardTitle>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <CongratsCard streak={streak} />

      {/* Progress to record */}
      <Card style={{ marginBottom: 16 }}>
        <CardTitle>Progreso hacia tu récord ({state.personalRecord} días)</CardTitle>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, margin: "8px 0 6px" }}>
          <span>{streak} días actuales</span>
          <span>Meta: {recTarget} días</span>
        </div>
        <ProgressBar pct={recPct} />
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
          {streak >= recTarget ? "🏆 ¡Nuevo récord personal!" :
           streak >= state.personalRecord ? "¡Igualaste tu récord personal!" :
           `Faltan ${recTarget - streak} día${recTarget - streak !== 1 ? "s" : ""} para superar tu récord`}
        </div>
      </Card>

      {/* Heatmap */}
      <Card style={{ marginBottom: 16 }}>
        <CardTitle>Historial — últimos 70 días</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 4, marginTop: 8 }}>
          {heatDays.map(({ key, val, isToday, tip }) => (
            <div key={key} title={tip} style={{
              aspectRatio: "1", borderRadius: 3,
              background: heatColor(val),
              outline: isToday ? `2px solid ${C.blue}` : "none",
              outlineOffset: 1, cursor: "default",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
          {[["Sin dato", C.border], ["Limpio", "#196432"], ["Recaída", "rgba(248,81,73,.4)"]].map(([l, c]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 11, height: 11, borderRadius: 2, background: c, display: "inline-block" }} />
              {l}
            </span>
          ))}
        </div>
      </Card>

      <PhasesCard streak={streak} />

      {/* Quick actions */}
      <Card>
        <CardTitle>Acciones rápidas</CardTitle>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <Btn onClick={() => onQuickLog("urge")}>💪 Resistí un impulso (+20 XP)</Btn>
          <Btn onClick={() => onQuickLog("win")} variant="ghost">✅ Marcar día limpio (+30 XP)</Btn>
          <Btn onClick={onRelapse} variant="danger">⚠️ Reportar recaída</Btn>
        </div>
      </Card>
    </div>
  );
}

// ── Log Tab ───────────────────────────────────────────────────────────────

function LogTab({ state, onSubmit }) {
  const [logType, setLogType] = useState(null);
  const [trigger, setTrigger] = useState(null);
  const [note, setNote] = useState("");

  function handleSubmit() {
    if (!logType) return;
    onSubmit(logType, trigger, note);
    setLogType(null); setTrigger(null); setNote("");
  }

  const logBtnStyle = (t) => ({
    width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.border}`,
    background: logType === t ? `${C.accent}18` : C.surface2,
    color: logType === t ? C.accent : C.text,
    borderColor: logType === t ? C.accent : C.border,
    cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center",
    gap: 8, marginBottom: 8, textAlign: "left",
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 12 }}>REGISTRAR EVENTO</div>
        <Card style={{ marginBottom: 16 }}>
          <CardTitle>Tipo de evento</CardTitle>
          <button style={logBtnStyle("urge")} onClick={() => setLogType("urge")}>
            💛 Resistí un impulso <span style={{ fontSize: 11, color: C.muted }}>(+20 XP)</span>
          </button>
          <button style={logBtnStyle("win")} onClick={() => setLogType("win")}>
            🟢 Día limpio completo <span style={{ fontSize: 11, color: C.muted }}>(+30 XP)</span>
          </button>
          <button style={logBtnStyle("relapse")} onClick={() => setLogType("relapse")}>
            🔴 Recaída — reinicio de racha
          </button>

          <div style={{ marginTop: 14 }}>
            <CardTitle>Dónde ocurrió</CardTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              {Object.entries(TRIGGER_LABELS).map(([key, { emoji, label }]) => (
                <div key={key} onClick={() => setTrigger(trigger === key ? null : key)} style={{
                  background: trigger === key ? `${C.orange}14` : C.surface2,
                  border: `1px solid ${trigger === key ? C.orange : C.border}`,
                  borderRadius: 10, padding: "10px 12px", textAlign: "center",
                  cursor: "pointer",
                }}>
                  <div style={{ fontSize: 22 }}>{emoji}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{label}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                    {state.triggerCounts[key] || 0} veces
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <CardTitle>Nota opcional</CardTitle>
            <Textarea value={note} onChange={setNote} placeholder="¿Cómo te sentías? ¿Qué ayudó?" />
          </div>

          <Btn onClick={handleSubmit} style={{ width: "100%" }}>Guardar registro</Btn>
        </Card>
      </div>

      <div>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 12 }}>HISTORIAL RECIENTE</div>
        {state.logs.length === 0 ? (
          <div style={{ fontSize: 13, color: C.muted }}>No hay registros aún.</div>
        ) : (
          [...state.logs].reverse().slice(0, 30).map((l, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px", background: C.surface2, borderRadius: 8,
              marginBottom: 6, fontSize: 13,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: l.type === "relapse" ? C.red : l.type === "urge" ? C.warn : C.accent,
                }} />
                <div>
                  <div>{l.type === "urge" ? "💪 Resistí el impulso" : l.type === "win" ? "✅ Día limpio" : "⚠️ Recaída"}</div>
                  {l.location && (
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {TRIGGER_LABELS[l.location]?.label || l.location}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{formatDate(l.date)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Triggers Tab ──────────────────────────────────────────────────────────

function TriggersTab({ state }) {
  const counts = state.triggerCounts;
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 12 }}>
        MAPA DE DISPARADORES — DÓNDE MÁS OCURRE
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {Object.entries(TRIGGER_LABELS).map(([key, { emoji, label }]) => {
            const c = counts[key] || 0;
            return (
              <div key={key} style={{
                background: C.surface2, borderRadius: 10, padding: 14,
                textAlign: "center", border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 32 }}>{emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.blue, margin: "4px 0" }}>{c}</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>veces registradas</div>
                <ProgressBar pct={(c / max) * 100} color={C.blue} height={6} />
              </div>
            );
          })}
        </div>
      </Card>

      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 12 }}>
        ESTRATEGIAS PARA TU DISPARADOR PRINCIPAL
      </div>
      <StrategyItem law={1} color={C.blue} title="Rediseña el ambiente del dormitorio"
        desc="Carga el teléfono fuera del cuarto. Deja la puerta abierta. Mantén luz encendida. El cerebro vincula el impulso al lugar físico — cambiar el entorno corta la señal." />
      <StrategyItem law={1} color={C.blue} title="Bloquea el contenido problemático"
        desc="Usa apps de control (Cold Turkey, Freedom) y configura el DNS (Cloudflare Family: 1.1.1.3). 20 segundos de fricción son suficientes para romper el automatismo." />
      <StrategyItem law={2} color={C.purple} title="Reencuadra el anhelo"
        desc="Nombra lo que sientes: 'Siento estrés y quiero escapar.' Nombrar el anhelo lo debilita. No anhelas el acto — anhelas el alivio." />
    </div>
  );
}

function StrategyItem({ law, color, title, desc }) {
  return (
    <div style={{
      background: C.surface2, borderRadius: 10, padding: "14px 16px",
      marginBottom: 10, borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color, marginBottom: 4 }}>
        LEY {law}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.muted }}>{desc}</div>
    </div>
  );
}

// ── Strategies Tab ────────────────────────────────────────────────────────

function StrategiesTab() {
  const groups = [
    {
      label: "LEY 1 — Hacerlo invisible (eliminar la señal)",
      color: C.blue, law: 1,
      items: [
        { title: "🔌 Regla de los 2 minutos de fricción", desc: "Añade 20 segundos de dificultad antes de acceder al contenido problemático. Desinstala apps, pon contraseñas complicadas. Tu cerebro busca el camino de menor esfuerzo." },
        { title: "🛏️ Protocolo de dormitorio", desc: "La cama es solo para dormir. El teléfono se carga en la sala. Si te despiertas de noche, levántate y haz algo: agua, respiraciones, notas en papel." },
        { title: "📵 Modo monje nocturno", desc: "A partir de las 10 PM el teléfono va a modo avión. Establece este hábito de forma rígida por 30 días hasta que sea automático." },
      ],
    },
    {
      label: "LEY 2 — Hacerlo poco atractivo (debilitar el anhelo)",
      color: C.purple, law: 2,
      items: [
        { title: "🧠 Técnica del reencuadre de identidad", desc: "No digas 'Intento dejar este hábito.' Di 'Soy una persona que cuida su energía y domina sus impulsos.' Los hábitos se forman cuando se convierten en identidad, no en meta." },
        { title: "💊 Desmitificar el 'alivio'", desc: "El anhelo real no es el acto, sino el alivio de tensión o aburrimiento. Aprende a nombrarlo: 'Siento estrés y quiero escapar.' Nombrarlo lo debilita." },
        { title: "👥 Exposición a modelos de rol", desc: "Rodéate de personas que valoren la disciplina. Lo que el grupo practica, tú lo encuentras atractivo. Comunidades de deporte, meditación o desarrollo personal." },
      ],
    },
    {
      label: "LEY 3 — Hacerlo difícil (aumentar la resistencia)",
      color: C.accent, law: 3,
      items: [
        { title: "⚡ Sustitución de respuesta inmediata", desc: "Cuando el impulso llegue, tienes 5 segundos para actuar diferente (5-4-3-2-1). Levántate, sal del cuarto, haz 10 lagartijas. El movimiento físico corta el ciclo neurológico." },
        { title: "📋 Diseña el ambiente para el éxito", desc: "Coloca implementos de actividad alternativa donde normalmente caes: una pelota antiestrés en el buró, audífonos cargados con un podcast, zapatos tenis junto a la cama." },
        { title: "⏰ La regla de la espera de 10 minutos", desc: "Di: 'Si en 10 minutos sigo queriendo hacerlo, lo evalúo.' Pon el temporizador. El 90% de los impulsos desaparecen en ese tiempo si te mantienes ocupado." },
      ],
    },
    {
      label: "LEY 4 — Hacerlo insatisfactorio (consecuencias inmediatas)",
      color: C.gold, law: 4,
      items: [
        { title: "📊 Este dashboard = tu consecuencia visual", desc: "Ver el contador en cero duele más que cualquier castigo. El cerebro responde al dolor inmediato. Revisa tu racha antes de ceder." },
        { title: "🤝 Contrato de compromiso público", desc: "Dile a un amigo de confianza tu meta. Cada semana que cumplas, él lo sabe. La vergüenza social es un disuasivo poderoso. No hace falta dar detalles del hábito." },
        { title: "💰 Economía conductual", desc: "Cada recaída: mueve dinero a un tarro físico de 'pérdidas'. No lo gastas en nada placentero. Cada semana limpia: úsalo como recompensa de tu lista." },
      ],
    },
  ];

  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
        Basado en las 4 Leyes del Cambio de Conducta — James Clear, <em>Hábitos Atómicos</em>
      </div>
      {groups.map(g => (
        <div key={g.label}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", margin: "20px 0 10px" }}>
            {g.label}
          </div>
          {g.items.map(item => (
            <StrategyItem key={item.title} law={g.law} color={g.color} title={item.title} desc={item.desc} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Rewards Tab ───────────────────────────────────────────────────────────

function RewardsTab({ state }) {
  const streak = computeStreak(state.heatmap);
  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 16 }}>
        RECOMPENSAS — DESBLOQUEA CON DÍAS LIMPIOS
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {REWARDS.map(r => {
          const unlocked = streak >= r.days;
          return (
            <div key={r.name} style={{
              background: C.surface, border: `1px solid ${unlocked ? C.accent : C.border}`,
              borderRadius: 12, padding: 16, opacity: unlocked ? 1 : 0.45,
              transition: "border-color .2s",
            }}>
              <div style={{ fontSize: 28 }}>{r.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {r.days} día{r.days !== 1 ? "s" : ""} limpio{r.days !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{r.desc}</div>
              <div style={{ fontSize: 11, marginTop: 8, fontWeight: 600, color: unlocked ? C.accent : C.dim }}>
                {unlocked ? "✅ DESBLOQUEADO" : `🔒 ${r.days - streak} días por desbloquear`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Crisis Tab ────────────────────────────────────────────────────────────

function CrisisTab() {
  const steps = [
    { num: "1️⃣", title: "Sal del lugar — ahora mismo", desc: "Levántate. Deja el cuarto, el baño, donde estés. Ve a otro ambiente. El cerebro vincula el impulso al lugar físico. Cambiar el espacio rompe el loop." },
    { num: "2️⃣", title: "Respiración 4-7-8 (2 ciclos)", desc: "Inhala 4 seg → Retén 7 seg → Exhala 8 seg. Activa el nervio vago y baja la activación del sistema de recompensa. Haz 2 ciclos completos antes de cualquier decisión." },
    { num: "3️⃣", title: "Agua fría en cara y muñecas", desc: "Agua fría en la cara durante 30 segundos. Activa el reflejo de inmersión, baja la frecuencia cardíaca y resetea el estado emocional. Efectivo en menos de 60 segundos." },
    { num: "4️⃣", title: "15 lagartijas o sentadillas", desc: "El ejercicio libera dopamina 'limpia' y consume la energía de activación del impulso. No necesitas ir al gym: 15 repeticiones en tu sala son suficientes para romper el ciclo." },
    { num: "5️⃣", title: "Llama o escríbele a alguien", desc: "No tienes que confesar nada. Solo conéctate con otra persona. La conexión social activa el mismo circuito de recompensa, sin la consecuencia." },
    { num: "6️⃣", title: "Mira tu racha actual", desc: "Abre el dashboard. Ve el número. Pregúntate: '¿Vale la pena perder todo esto por 5 minutos?' El dolor de reiniciar debe superar al placer anticipado." },
  ];

  return (
    <div>
      <div style={{
        background: "rgba(248,81,73,.06)", border: "1px solid rgba(248,81,73,.3)",
        borderRadius: 12, padding: 18, marginBottom: 20,
        display: "flex", alignItems: "flex-start", gap: 12,
      }}>
        <span style={{ fontSize: 22 }}>🆘</span>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Modo emergencia — sientes el impulso AHORA</div>
          <div style={{ fontSize: 13, color: C.muted }}>Estos pasos están ordenados. Empieza por el primero y no saltes.</div>
        </div>
      </div>

      {steps.map(s => (
        <div key={s.num} style={{
          background: C.surface2, borderRadius: 10, padding: 14,
          marginBottom: 8, display: "flex", alignItems: "flex-start",
          gap: 12, border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{s.num}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: C.muted }}>{s.desc}</div>
          </div>
        </div>
      ))}

      <Card style={{ marginTop: 20, background: C.surface2 }}>
        <CardTitle>Técnica de los 5 segundos (Mel Robbins)</CardTitle>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
          {["5", "4", "3", "2", "1"].map(n => (
            <div key={n} style={{
              textAlign: "center", padding: "10px 18px", background: C.bg,
              borderRadius: 10, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{n}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{["CINCO","CUATRO","TRES","DOS","UNO"]["54321".indexOf(n)]}</div>
            </div>
          ))}
          <div style={{
            textAlign: "center", padding: "10px 18px", background: C.accent,
            borderRadius: 10, color: "#000", fontWeight: 700,
          }}>
            <div style={{ fontSize: 28 }}>🚀</div>
            <div style={{ fontSize: 10 }}>¡ACTÚA!</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 14, textAlign: "center" }}>
          Cuenta hacia atrás y en el momento en que dices "1", actúa en dirección contraria al hábito. El cerebro no puede razonar durante la cuenta.
        </div>
      </Card>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────

export default function ProyectoLibertad() {
  const [dayRows, setDayRows] = useTable("freedom_days");
  const [logRows, setLogRows] = useTable("freedom_logs");
  const [settings, setSetting] = useSettings("freedom_settings");
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState("");
  const [logModal, setLogModal] = useState(null); // 'urge' | 'win' | null
  const [relapseModal, setRelapseModal] = useState(false);

  // Modal form state
  const [modalLoc, setModalLoc] = useState("");
  const [modalNote, setModalNote] = useState("");
  const [relapseLoc, setRelapseLoc] = useState("");
  const [relapseTrigger, setRelapseTrigger] = useState("");
  const [relapsePlan, setRelapsePlan] = useState("");

  const heatmap = useMemo(() => rowsToHeatmap(dayRows), [dayRows]);
  const logs = useMemo(() => rowsToLogs(logRows), [logRows]);

  // XP, urges and trigger tallies are recounted from the log every render
  // rather than stored, so they can never disagree with the entries.
  const state = useMemo(() => {
    const stored = Number(settings.personalRecord) || 0;
    return {
      ...deriveStats(logs),
      // The record is also recoverable from history, so a missing or stale
      // setting can never make it look smaller than what was actually done.
      personalRecord: Math.max(stored, longestStreak(heatmap)),
      logs,
      heatmap,
    };
  }, [logs, heatmap, settings.personalRecord]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  function addEntry(type, location, note) {
    const day = todayKey();
    const status = type === "relapse" ? "relapse" : "clean";

    if (type === "relapse") {
      const ending = computeStreak(heatmap);
      if (ending > state.personalRecord) setSetting("personalRecord", ending);
    }

    setDayRows((prev) => {
      const i = prev.findIndex((r) => r.date === day);
      const row = { date: day, status };
      const next = i >= 0 ? prev.map((r, j) => (j === i ? row : r)) : [...prev, row];
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });

    setLogRows((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        date: day,
        type,
        location: location || "",
        note: note || "",
      },
    ]);
  }

  function confirmLogModal() {
    addEntry(logModal, modalLoc, modalNote);
    const msg = logModal === "urge" ? "💪 +20 XP — ¡Resististe el impulso!" : "✅ +30 XP — ¡Día limpio!";
    showToast(msg);
    setLogModal(null); setModalLoc(""); setModalNote("");
  }

  function confirmRelapse() {
    addEntry("relapse", relapseLoc, relapseTrigger + "\n" + relapsePlan);
    showToast("⚠️ Recaída registrada. Racha reiniciada. Puedes hacerlo. 💪");
    setRelapseModal(false); setRelapseLoc(""); setRelapseTrigger(""); setRelapsePlan("");
  }

  function handleLogSubmit(type, location, note) {
    addEntry(type, location, note);
    const msg = type === "relapse" ? "⚠️ Recaída registrada. ¡Vuelves a empezar más fuerte!" :
      type === "urge" ? "💪 +20 XP — ¡Resististe el impulso!" : "✅ +30 XP — ¡Día limpio!";
    showToast(msg);
  }

  const locOptions = [
    { value: "", label: "— Elige —" },
    { value: "bedroom", label: "Dormitorio" },
    { value: "bathroom", label: "Baño" },
    { value: "phone", label: "Con el teléfono" },
    { value: "night", label: "De noche" },
    { value: "stressed", label: "Bajo estrés" },
    { value: "alone", label: "Solo en casa" },
    { value: "other", label: "Otro" },
  ];

  return (
    <div style={base}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 38, height: 38, background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`,
              borderRadius: 10, display: "grid", placeItems: "center", fontSize: 20,
            }}>🔓</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4 }}>Proyecto Libertad</div>
              <div style={{ fontSize: 11, color: C.muted }}>Control de hábito · Basado en Hábitos Atómicos</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>

        {/* XP Bar */}
        <XPBar xp={state.xp} />

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: tab === t.id ? C.surface2 : "transparent",
              color: tab === t.id ? C.text : C.muted,
              fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Pages */}
        {tab === "dashboard" && (
          <DashboardTab state={state}
            onQuickLog={(type) => { setLogModal(type); }}
            onRelapse={() => setRelapseModal(true)} />
        )}
        {tab === "log"        && <LogTab state={state} onSubmit={handleLogSubmit} />}
        {tab === "triggers"   && <TriggersTab state={state} />}
        {tab === "strategies" && <StrategiesTab />}
        {tab === "rewards"    && <RewardsTab state={state} />}
        {tab === "crisis"     && <CrisisTab />}

      </div>

      {/* Quick log modal */}
      <Modal open={!!logModal} onClose={() => setLogModal(null)}
        title={logModal === "urge" ? "💪 Resistí el impulso" : "✅ Día limpio"}>
        <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Contexto</label>
        <Select value={modalLoc} onChange={setModalLoc} options={locOptions} />
        <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Nota (opcional)</label>
        <Textarea value={modalNote} onChange={setModalNote} placeholder="¿Cómo te sentías?" />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setLogModal(null)}>Cancelar</Btn>
          <Btn onClick={confirmLogModal}>Guardar</Btn>
        </div>
      </Modal>

      {/* Relapse modal */}
      <Modal open={relapseModal} onClose={() => setRelapseModal(false)} title="⚠️ Reportar recaída">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
          Recaer no es fracasar — es información. Registro honesto = recuperación más rápida.
        </p>
        <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>¿Dónde ocurrió?</label>
        <Select value={relapseLoc} onChange={setRelapseLoc} options={locOptions} />
        <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>¿Qué desencadenó el impulso?</label>
        <Textarea value={relapseTrigger} onChange={setRelapseTrigger} placeholder="¿Estrés, aburrimiento, redes sociales?" />
        <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>¿Qué harás diferente la próxima vez?</label>
        <Textarea value={relapsePlan} onChange={setRelapsePlan} placeholder="Mi plan de acción..." />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setRelapseModal(false)}>Cancelar</Btn>
          <Btn variant="danger" onClick={confirmRelapse}>Registrar y reiniciar</Btn>
        </div>
      </Modal>

      <Toast message={toast} />
    </div>
  );
}