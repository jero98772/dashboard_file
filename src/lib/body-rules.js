/**
 * Scoring and chain rules for the Body section. Lives outside the view so the
 * Overview can score the same data/body_entries.csv rows.
 *
 * Points are always derived from the logged sets and steps, never stored, so a
 * row edited by hand in the CSV rescores correctly on the next load.
 */
import { addDays, parseKey, toKey } from './dates.js';

export const POINTS_PER_SWORD_SET = 10; // each set = 10 vertical strikes
export const POINTS_PER_PUSHUP_SET = 8;
export const POINTS_PER_STRETCH_BREAK = 3;

// Points are weighted by how many steps you got that day.
export const STEP_TIERS = [
  { min: 10000, mult: 1.5 },
  { min: 8000, mult: 1.2 },
  { min: 5000, mult: 1.0 },
  { min: 0, mult: 0.7 },
];

export function stepMultiplier(steps) {
  const tier = STEP_TIERS.find((t) => steps >= t.min);
  return tier ? tier.mult : 0.7;
}

export function multiplierColor(mult) {
  if (mult >= 1.5) return "#f59e0b";
  if (mult >= 1.2) return "#fbbf24";
  if (mult >= 1.0) return "#2dd4bf";
  return "#64748b";
}

export function computePoints(entry) {
  const base =
    entry.swordSets * POINTS_PER_SWORD_SET +
    entry.pushupSets * POINTS_PER_PUSHUP_SET +
    entry.stretchBreaks * POINTS_PER_STRETCH_BREAK;
  return Math.round(base * stepMultiplier(entry.steps));
}

/* ---------------------------------------------------------------------- */
/*  Date helpers                                                          */
/* ---------------------------------------------------------------------- */
export function shortLabel(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function calcStreak(sortedEntries) {
  if (!sortedEntries.length) return 0;
  const dateSet = new Set(sortedEntries.map((e) => e.date));
  let cursor = new Date(sortedEntries[sortedEntries.length - 1].date + "T00:00:00");
  let streak = 0;
  while (dateSet.has(toKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// "Don't break the chain": a 28-day map of which days were logged.
export function buildChain(entries, days) {
  const dateSet = new Set(entries.map((e) => e.date));
  const today = new Date();
  const todayKeyStr = toKey(today);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toKey(d);
    out.push({ date: key, logged: dateSet.has(key), isToday: key === todayKeyStr });
  }
  return out;
}

// Messaging grounded in habit-formation ideas: identity, compounding,
// keeping the chain unbroken — rather than generic hype.
export function motivationMessage({ streak, weightLost, todayLogged }) {
  if (!todayLogged) {
    if (streak > 0) {
      return `Day ${streak + 1} is on the line — showing up today is what keeps the chain unbroken.`;
    }
    return "Every chain starts with a single link. Log one set today, however small.";
  }
  if (streak >= 14) {
    return `${streak} days unbroken. This isn't willpower anymore — it's just who you are now.`;
  }
  if (streak >= 7) {
    return `${streak}-day chain. The habit is becoming part of your identity, not just a task on a list.`;
  }
  if (weightLost >= 1) {
    return `${weightLost}kg down. Small, repeated reps compounding into something real.`;
  }
  return "One percent better than yesterday is still better. Keep today's link in the chain.";
}

const NUMERIC = ['steps', 'swordSets', 'pushupSets', 'stretchBreaks', 'weight'];
const COLUMN = {
  steps: 'steps',
  swordSets: 'sword_sets',
  pushupSets: 'pushup_sets',
  stretchBreaks: 'stretch_breaks',
  weight: 'weight',
};

/** body_entries.csv rows (all strings) -> typed entries, oldest first. */
export function rowsToEntries(rows) {
  return rows
    .filter((r) => r.date)
    .map((r) => {
      const entry = { date: r.date, note: r.note || '' };
      for (const key of NUMERIC) entry[key] = Number(r[COLUMN[key]]) || 0;
      return entry;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The inverse, for writing back. */
export function entriesToRows(entries) {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const row = { date: e.date, note: e.note || '' };
      for (const key of NUMERIC) row[COLUMN[key]] = String(e[key] ?? 0);
      return row;
    });
}

/* ---------------------------------------------------------------------- */
/*  Weight trend                                                          */
/* ---------------------------------------------------------------------- */

const DAY_MS = 86400000;
const dayIndex = (from, to) =>
  Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY_MS);

/**
 * Least-squares fit through the logged weights.
 *
 * x is the real calendar day offset, not the row number, so a gap in the log
 * flattens the slope instead of being silently treated as a daily weigh-in.
 * Day-to-day weight is mostly water; the point of the line is that it reads
 * through that noise, which is what makes a 500 g/week target checkable.
 *
 * Returns null until there are two weigh-ins on different days.
 */
export function weightTrend(entries, goalWeight) {
  const points = entries
    .filter((e) => e.weight > 0)
    .map((e) => ({ x: dayIndex(entries[0].date, e.date), y: e.weight }));
  if (points.length < 2) return null;

  const n = points.length;
  const mx = sum(points.map((p) => p.x)) / n;
  const my = sum(points.map((p) => p.y)) / n;
  const varX = sum(points.map((p) => (p.x - mx) ** 2));
  if (varX === 0) return null; // every weigh-in on the same day

  const slope = sum(points.map((p) => (p.x - mx) * (p.y - my))) / varX;
  const intercept = my - slope * mx;
  const at = (x) => intercept + slope * x;

  // R²: how much of the movement the line actually explains. Below ~0.3 the
  // "trend" is mostly noise and the UI says so rather than projecting a date.
  const ssTot = sum(points.map((p) => (p.y - my) ** 2));
  const ssRes = sum(points.map((p) => (p.y - at(p.x)) ** 2));
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  const lastX = points[points.length - 1].x;
  const spanDays = lastX - points[0].x;
  const perWeek = +(slope * 7).toFixed(2);

  // Over a short window the line is fitted to water weight, and extrapolating
  // it produces nonsense ("70 kg in 20 days"). Require a fortnight of history,
  // a fit that explains most of the movement, and a rate that is physically
  // fat loss rather than a swing, before projecting any date.
  const PROJECT_MIN_SPAN = 14;
  const PLAUSIBLE_WEEKLY_LOSS = 1.5; // kg — faster than this is water, not fat
  const projectable =
    spanDays >= PROJECT_MIN_SPAN && r2 >= 0.3 && Math.abs(perWeek) <= PLAUSIBLE_WEEKLY_LOSS;

  let daysToGoal = null;
  if (projectable && goalWeight != null && slope < 0 && at(lastX) > goalWeight) {
    daysToGoal = Math.ceil((goalWeight - intercept) / slope - lastX);
  }

  return {
    slope, intercept, at, r2, perWeek, daysToGoal, projectable, spanDays,
    tooShort: spanDays < PROJECT_MIN_SPAN,
    waterFast: Math.abs(perWeek) > PLAUSIBLE_WEEKLY_LOSS,
    firstDate: entries[0].date,
    lastX,
  };
}

/** Attach the fitted value to each row so recharts can draw it as a second line. */
export function withTrend(rows, trend) {
  if (!trend) return rows;
  return rows.map((r) => ({ ...r, trend: +trend.at(dayIndex(trend.firstDate, r.date)).toFixed(2) }));
}

/** "losing 0.45 kg a week" / "holding steady" / "gaining 0.2 kg a week" */
export function describeTrend(trend) {
  if (!trend) return 'Log a second weigh-in and the trend line appears.';
  const perWeek = Math.abs(trend.perWeek);
  if (perWeek < 0.05) return 'Holding steady — no clear direction yet.';

  const verb = trend.perWeek < 0 ? 'Losing' : 'Gaining';
  const rate = `${verb} ${perWeek.toFixed(2)} kg a week on trend`;

  if (trend.tooShort) {
    return `${rate}, over only ${trend.spanDays} day${trend.spanDays === 1 ? '' : 's'} — too short to mean much yet.`;
  }
  if (trend.waterFast) {
    return `${rate}. That is faster than fat loss goes — most of it is water. A steady 0.5 kg a week is the real target.`;
  }
  return `${rate}.`;
}

/* ---------------------------------------------------------------------- */
/*  Rate of loss, grouped by day, week and month                          */
/* ---------------------------------------------------------------------- */

// An average calendar month, so "per month" is not 30 days in one place and
// 31 in another.
export const DAYS_PER_MONTH = 365.25 / 12;

export const PERIODS = [
  { id: 'day', label: 'Day', days: 1 },
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: DAYS_PER_MONTH },
];

/** The Monday on or before this day, as a key. Weeks run Monday to Sunday. */
function mondayOf(key) {
  const d = parseKey(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toKey(d);
}

/** Which bucket a day falls into: the day itself, its Monday, or its month. */
export function periodKey(date, unit) {
  if (unit === 'month') return date.slice(0, 7);
  if (unit === 'week') return mondayOf(date);
  return date;
}

function periodLabel(bucketKey, unit) {
  if (unit === 'month') {
    return parseKey(`${bucketKey}-01`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  return shortLabel(bucketKey);
}

/**
 * Weigh-ins bucketed by day, week or month.
 *
 * Each bucket's change is measured from the *previous* bucket's last weigh-in,
 * not from its own first one, so the changes add up to the total loss instead
 * of dropping whatever happened in the gap between two buckets. The very first
 * bucket has nothing before it, so it measures within itself.
 *
 * `entries` must be sorted oldest first, which rowsToEntries guarantees.
 */
export function groupWeights(entries, unit) {
  const weighed = entries.filter((e) => e.weight > 0);
  const buckets = [];
  const byKey = new Map();

  for (const e of weighed) {
    const key = periodKey(e.date, unit);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        unit,
        label: periodLabel(key, unit),
        from: e.date,
        to: e.date,
        first: e.weight,
        last: e.weight,
        low: e.weight,
        high: e.weight,
        count: 0,
      };
      byKey.set(key, bucket);
      buckets.push(bucket);
    }
    bucket.to = e.date;
    bucket.last = e.weight;
    bucket.low = Math.min(bucket.low, e.weight);
    bucket.high = Math.max(bucket.high, e.weight);
    bucket.count += 1;
  }

  let anchorWeight = null;
  let anchorDate = null;
  return buckets.map((b) => {
    const baseWeight = anchorWeight ?? b.first;
    const baseDate = anchorDate ?? b.from;
    // A bucket holding a single weigh-in spans no days; count it as one so the
    // per-day rate is a number rather than a division by zero.
    const days = Math.max(1, dayIndex(baseDate, b.to));
    const change = b.last - baseWeight;
    const perDay = change / days;
    anchorWeight = b.last;
    anchorDate = b.to;
    return {
      ...b,
      range: b.from === b.to ? shortLabel(b.from) : `${shortLabel(b.from)} – ${shortLabel(b.to)}`,
      days,
      change: +change.toFixed(2),
      percent: +((change / baseWeight) * 100).toFixed(2),
      perDay: +perDay.toFixed(3),
      perWeek: +(perDay * 7).toFixed(2),
      perMonth: +(perDay * DAYS_PER_MONTH).toFixed(2),
      // The same rates as a share of the weight this bucket started from, so
      // a kilo lost at 84 kg and a kilo lost at 74 kg are comparable.
      percentPerDay: +(((perDay / baseWeight) * 100)).toFixed(3),
      percentPerWeek: +((((perDay * 7) / baseWeight) * 100)).toFixed(2),
      percentPerMonth: +((((perDay * DAYS_PER_MONTH) / baseWeight) * 100)).toFixed(2),
    };
  });
}

/**
 * One rate, expressed per day, per week and per month.
 *
 * The per-period figures come from the fitted trend when there is one: weight
 * swings by a kilo of water overnight, so the slope of the line is a far more
 * honest daily rate than the difference between two weigh-ins. Without enough
 * points to fit a line it falls back to the plain average over the whole log,
 * and says which of the two it used.
 *
 * The percentages are of current body weight, the usual way a rate of loss is
 * read (about 0.5–1% of body weight a week is the sustainable band). The total
 * change is instead a percentage of the starting weight, which is how "I am
 * down 6%" is normally meant.
 */
export function weightRates(entries, trend) {
  const weighed = entries.filter((e) => e.weight > 0);
  if (weighed.length < 2) return null;

  const first = weighed[0];
  const last = weighed[weighed.length - 1];
  const days = Math.max(1, dayIndex(first.date, last.date));
  const change = last.weight - first.weight;
  const perDay = trend ? trend.slope : change / days;

  const rate = (span) => ({
    kg: +(perDay * span).toFixed(2),
    percent: +(((perDay * span) / last.weight) * 100).toFixed(2),
  });

  return {
    source: trend ? 'trend' : 'average',
    from: first.date,
    to: last.date,
    days,
    weighIns: weighed.length,
    start: first.weight,
    current: last.weight,
    change: +change.toFixed(1),
    percent: +((change / first.weight) * 100).toFixed(1),
    day: rate(1),
    week: rate(7),
    month: rate(DAYS_PER_MONTH),
  };
}

/** "0.42 kg" with the sign spelled out as down/up, for a rate label. */
export function signedKg(kg) {
  if (Math.abs(kg) < 0.005) return 'steady';
  return `${kg < 0 ? '−' : '+'}${Math.abs(kg).toFixed(2)} kg`;
}

export function signedPercent(percent) {
  if (Math.abs(percent) < 0.005) return '0%';
  return `${percent < 0 ? '−' : '+'}${Math.abs(percent).toFixed(2)}%`;
}

/**
 * How far along the way from the starting weight to the goal you are.
 *
 * Two different percentages are useful here and they are not the same number,
 * so both are returned: `percentDone` is the share of the distance you set out
 * to cover, and `percentAboveGoal` is how far above the goal you still are as
 * a share of the goal itself. A 88 → 70 kg journey sitting at 83.9 kg is 22.8%
 * done, and still 19.9% above goal.
 *
 * Returns null when there is no weigh-in or no goal to measure against.
 */
export function goalProgress(entries, goalWeight) {
  const weighed = entries.filter((e) => e.weight > 0);
  if (!weighed.length || !goalWeight) return null;

  const start = weighed[0].weight;
  const current = weighed[weighed.length - 1].weight;
  const lost = start - current;
  const distance = start - goalWeight;
  const toGo = current - goalWeight;

  // A goal at or above the starting weight leaves no distance to divide by, so
  // the share-of-the-journey figure is withheld rather than faked.
  const hasDistance = distance > 0;

  return {
    start,
    current,
    goal: goalWeight,
    lost: +lost.toFixed(1),
    distance: +distance.toFixed(1),
    toGo: +toGo.toFixed(1),
    hasDistance,
    reached: toGo <= 0,
    percentDone: hasDistance ? +((lost / distance) * 100).toFixed(1) : null,
    percentRemaining: hasDistance ? +((toGo / distance) * 100).toFixed(1) : null,
    percentAboveGoal: +((toGo / goalWeight) * 100).toFixed(1),
    percentOfStartLost: +((lost / start) * 100).toFixed(1),
    // What is left as a share of the weight you are carrying today. This is
    // the figure that keeps moving as you get lighter: the same 11 kg is a
    // larger slice of an 81 kg body than of an 85 kg one.
    percentOfCurrentToLose: +((toGo / current) * 100).toFixed(1),
    // What the progress bar draws: the real figure can be negative after a
    // gain, or over 100 once you pass the goal, and a bar can be neither.
    barPercent: hasDistance ? Math.max(0, Math.min(100, (lost / distance) * 100)) : 0,
  };
}

/* ---------------------------------------------------------------------- */
/*  Forecast: when the line crosses the goal                              */
/* ---------------------------------------------------------------------- */

// The rate the UI holds you to when the fitted line is steeper than fat loss
// can actually go.
export const SUSTAINABLE_WEEKLY_LOSS = 0.5; // kg a week

/** "Sep 21, 2027" — a date far enough out that the year matters. */
export function dateLabel(key) {
  return parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "under a week" / "1 week" / "2.9 weeks" / "24 weeks" */
export function weeksLabel(weeks) {
  if (!Number.isFinite(weeks) || weeks <= 0) return '—';
  if (weeks < 1) return 'under a week';
  if (Math.round(weeks) === 1 && weeks < 1.5) return '1 week';
  if (weeks < 10) {
    const one = weeks.toFixed(1);
    return `${one.endsWith('.0') ? one.slice(0, -2) : one} weeks`;
  }
  return `${Math.round(weeks)} weeks`;
}

/**
 * Where the least-squares line through your weigh-ins crosses the goal, in
 * weeks and as a date.
 *
 * The projection is always returned when the line points downwards — it is
 * what was asked of it — but never bare: `firm` says whether it clears the
 * checks in weightTrend (a fortnight of history, a fit that explains the
 * movement, a rate that is physically fat loss), and the flags say which check
 * it failed. Early on, a line fitted to the first week of water weight will
 * happily promise the goal in a month, so `steady` carries the same distance
 * at a sustainable half a kilo a week for comparison.
 */
export function goalForecast(entries, goalWeight, trend) {
  const weighed = entries.filter((e) => e.weight > 0);
  if (!weighed.length || !goalWeight) return null;

  const last = weighed[weighed.length - 1];
  const current = last.weight;
  const base = { current, goal: goalWeight, from: last.date, weighIns: weighed.length };

  if (current <= goalWeight) return { ...base, state: 'reached', toGo: 0 };

  const toGo = +(current - goalWeight).toFixed(1);
  const steadyWeeks = toGo / SUSTAINABLE_WEEKLY_LOSS;
  const steady = {
    weeks: steadyWeeks,
    date: addDays(last.date, Math.ceil(steadyWeeks * 7)),
  };

  // A flat or rising line never reaches the goal, so there is no date to give.
  if (!trend || trend.slope >= -0.0005) {
    return { ...base, state: 'flat', toGo, steady, perWeek: trend ? trend.perWeek : 0 };
  }

  const days = (goalWeight - trend.intercept) / trend.slope - trend.lastX;

  return {
    ...base,
    state: 'projected',
    toGo,
    steady,
    days: Math.ceil(days),
    weeks: days / 7,
    date: addDays(last.date, Math.ceil(days)),
    perWeek: trend.perWeek,
    r2: +trend.r2.toFixed(2),
    spanDays: trend.spanDays,
    firm: trend.projectable,
    tooShort: trend.tooShort,
    waterFast: trend.waterFast,
    noisy: trend.r2 < 0.3,
  };
}

/* ---------------------------------------------------------------------- */
/*  Realistic extrapolation                                               */
/*                                                                        */
/*  A least-squares line through every weigh-in is the wrong tool for the */
/*  first weeks of a diet, and no amount of hedging text fixes it. Three   */
/*  things are wrong with it, and this section addresses each:             */
/*                                                                        */
/*  1. The first fortnight is mostly glycogen and the water bound to it    */
/*     (roughly 3 g of water per gram of glycogen). That drop happens      */
/*     once. Fitting through it and extrapolating promises it forever, so  */
/*     the fit here ignores the adaptation window.                        */
/*  2. Fat loss has a physiological ceiling. Above about 1% of body weight */
/*     a week the deficit comes out of muscle and water, so the rate is    */
/*     capped there whatever the data says.                                */
/*  3. A single date implies a precision nobody has. This returns a band   */
/*     between a sustainable pace and the ceiling, carried forward with    */
/*     compounding so the kilos shrink as the body does.                   */
/* ---------------------------------------------------------------------- */

export const KCAL_PER_KG_FAT = 7700;   // energy in a kilo of body fat
export const ADAPTATION_DAYS = 14;     // glycogen and water settle within this
export const MAX_WEEKLY_PCT = 1.0;     // ceiling for fat loss, % of body weight
export const MIN_PLANNING_PCT = 0.5;   // the sustainable end of the band

/** Days to fall from `current` to `goal` losing `pct` % of body weight a week. */
export function daysAtWeeklyPct(current, goal, pct) {
  if (!(pct > 0) || current <= goal) return null;
  // A weekly fraction compounded daily: (1 − r)^7 = 1 − pct/100.
  const daily = 1 - (1 - pct / 100) ** (1 / 7);
  const days = Math.log(goal / current) / Math.log(1 - daily);
  return Number.isFinite(days) && days > 0 ? days : null;
}

/** The weight that pace predicts `days` from now. */
export function weightAtWeeklyPct(current, pct, days) {
  const daily = 1 - (1 - pct / 100) ** (1 / 7);
  return current * (1 - daily) ** days;
}

/** kcal a day the given loss rate implies, for a plausibility check. */
export const impliedDeficit = (kgPerWeek) => Math.round((Math.abs(kgPerWeek) * KCAL_PER_KG_FAT) / 7);

/**
 * The fat-loss rate measured from weigh-ins taken after the adaptation window,
 * or null when there are not yet enough of them to measure anything.
 */
export function fatLossRate(entries) {
  const weighed = entries.filter((e) => e.weight > 0);
  if (weighed.length < 2) return null;

  const start = weighed[0].date;
  const after = weighed.filter((e) => dayIndex(start, e.date) >= ADAPTATION_DAYS);
  // Two weigh-ins a week apart is the least that can show a direction.
  if (after.length < 2) return null;
  const span = dayIndex(after[0].date, after[after.length - 1].date);
  if (span < 7) return null;

  const fit = weightTrend(after, null);
  if (!fit) return null;

  const current = after[after.length - 1].weight;
  const weeklyPct = (-fit.slope * 7 * 100) / current;
  return {
    kgPerWeek: +(fit.slope * 7).toFixed(2),
    weeklyPct: +weeklyPct.toFixed(2),
    r2: +fit.r2.toFixed(2),
    spanDays: span,
    weighIns: after.length,
    from: after[0].date,
  };
}

/**
 * How much of the loss so far is glycogen and water rather than fat.
 *
 * Anything inside the adaptation window that came off faster than fat can
 * physically come off is, by elimination, not fat.
 */
export function waterSplit(entries) {
  const weighed = entries.filter((e) => e.weight > 0);
  if (weighed.length < 2) return null;

  const first = weighed[0];
  const start = first.date;
  const inWindow = weighed.filter((e) => dayIndex(start, e.date) <= ADAPTATION_DAYS);
  const endOfWindow = inWindow[inWindow.length - 1];
  const days = dayIndex(start, endOfWindow.date);
  if (days < 1) return null;

  const dropped = first.weight - endOfWindow.weight;
  if (dropped <= 0) return null;

  // The most fat that could have gone in those days, at the ceiling rate.
  const maxFat = first.weight - weightAtWeeklyPct(first.weight, MAX_WEEKLY_PCT, days);
  const fat = Math.min(dropped, maxFat);
  return {
    days,
    dropped: +dropped.toFixed(1),
    fat: +fat.toFixed(1),
    water: +(dropped - fat).toFixed(1),
    through: endOfWindow.date,
  };
}

/**
 * The forecast the section actually leads with.
 *
 * `basis` says where the rate came from:
 *   'measured'  — fitted to weigh-ins after the adaptation window
 *   'capped'    — measured, but above the physiological ceiling, so capped
 *   'planning'  — not enough post-adaptation data yet; the 0.5–1% band
 *
 * `fast`/`slow` are the ends of the band and `likely` the rate in use. Dates
 * are inclusive of compounding, so they sit later than any straight line.
 */
export function realisticForecast(entries, goalWeight) {
  const weighed = entries.filter((e) => e.weight > 0);
  if (!weighed.length || !goalWeight) return null;

  const last = weighed[weighed.length - 1];
  const current = last.weight;
  const from = last.date;
  if (current <= goalWeight) return { state: 'reached', current, goal: goalWeight, from };

  const measured = fatLossRate(entries);
  const water = waterSplit(entries);

  let basis = 'planning';
  let pct = (MIN_PLANNING_PCT + MAX_WEEKLY_PCT) / 2;

  if (measured && measured.weeklyPct > 0) {
    if (measured.weeklyPct > MAX_WEEKLY_PCT) {
      basis = 'capped';
      pct = MAX_WEEKLY_PCT;
    } else {
      basis = 'measured';
      pct = measured.weeklyPct;
    }
  } else if (measured) {
    // Measured, but flat or upwards: there is no pace to carry forward.
    basis = 'stalled';
  }

  const at = (p) => {
    const days = daysAtWeeklyPct(current, goalWeight, p);
    return days == null ? null : {
      pct: p,
      days: Math.ceil(days),
      weeks: days / 7,
      date: addDays(from, Math.ceil(days)),
      kgPerWeekNow: +((current * p) / 100).toFixed(2),
      kgPerWeekAtGoal: +((goalWeight * p) / 100).toFixed(2),
      deficit: impliedDeficit((current * p) / 100),
    };
  };

  return {
    state: basis === 'stalled' ? 'stalled' : 'projected',
    basis,
    current,
    goal: goalWeight,
    from,
    toGo: +(current - goalWeight).toFixed(1),
    measured,
    water,
    likely: at(pct),
    fast: at(MAX_WEEKLY_PCT),
    slow: at(MIN_PLANNING_PCT),
  };
}

/** Why a straight line through everything is not the answer, in numbers. */
export function naiveCheck(forecast, current) {
  if (!forecast || forecast.state !== 'projected') return null;
  const kgPerWeek = Math.abs(forecast.perWeek);
  if (!(kgPerWeek > 0)) return null;
  const deficit = impliedDeficit(kgPerWeek);
  // Carried from today's weigh-in, not from where the fitted line crosses the
  // goal — that crossing can already be behind you when the last reading sits
  // above the line.
  const weeks = (current - forecast.goal) / kgPerWeek;
  return {
    weeks,
    date: addDays(forecast.from, Math.ceil(weeks * 7)),
    kgPerWeek,
    deficit,
    // A deficit larger than a whole day's energy use cannot be run, so the
    // line is arithmetically impossible rather than merely optimistic.
    impossible: deficit > 2500,
    weeklyPct: +((kgPerWeek / current) * 100).toFixed(2),
  };
}

/** The realistic forecast in prose, including where its rate came from. */
export function describeRealistic(r) {
  if (!r) return 'Log a weigh-in and set a goal to project a date.';
  if (r.state === 'reached') return `You are at or below ${r.goal} kg.`;

  if (r.state === 'stalled') {
    return `Your weigh-ins since day ${ADAPTATION_DAYS} are not trending down, so there is no rate to carry forward. `
      + `At ${MIN_PLANNING_PCT}–${MAX_WEEKLY_PCT}% of body weight a week, the ${r.toGo} kg left would take `
      + `${weeksLabel(r.slow.weeks)} to ${weeksLabel(r.fast.weeks)}.`;
  }

  const band = `${weeksLabel(r.fast.weeks)} to ${weeksLabel(r.slow.weeks)} — between ${dateLabel(r.fast.date)} and ${dateLabel(r.slow.date)}`;

  if (r.basis === 'planning') {
    return `Your log is still inside the first ${ADAPTATION_DAYS} days, where most of the drop is glycogen and `
      + `the water bound to it. There is no fat-loss rate to measure yet, so this is the evidence-based band: `
      + `losing ${MIN_PLANNING_PCT}–${MAX_WEEKLY_PCT}% of body weight a week puts ${r.goal} kg ${band}, `
      + `most likely around ${dateLabel(r.likely.date)} (${weeksLabel(r.likely.weeks)}).`;
  }

  if (r.basis === 'capped') {
    return `Your weigh-ins after day ${ADAPTATION_DAYS} are falling ${Math.abs(r.measured.weeklyPct)}% of body weight a week, `
      + `which is faster than fat comes off — the rest is water and muscle. Capped at the ${MAX_WEEKLY_PCT}% ceiling, `
      + `${r.goal} kg arrives around ${dateLabel(r.fast.date)} (${weeksLabel(r.fast.weeks)}), and ${band} covers the realistic spread.`;
  }

  return `Measured from the ${r.measured.weighIns} weigh-ins since ${shortLabel(r.measured.from)}, past the water-loss window, `
    + `you are losing ${Math.abs(r.measured.kgPerWeek)} kg a week — ${Math.abs(r.measured.weeklyPct)}% of body weight, `
    + `inside the sustainable band. Carried forward with compounding, ${r.goal} kg arrives around `
    + `${dateLabel(r.likely.date)} (${weeksLabel(r.likely.weeks)}); the ${MIN_PLANNING_PCT}–${MAX_WEEKLY_PCT}% band spans ${band}.`;
}

/** "Of the 3.2 kg gone, about 2.5 kg is water" — or null when it does not apply. */
export function describeWaterSplit(water) {
  if (!water || water.water < 0.3) return null;
  return `Of the ${water.dropped} kg gone in the first ${water.days} day${water.days === 1 ? '' : 's'}, only about `
    + `${water.fat} kg can have been fat. The other ${water.water} kg is glycogen and the water bound to it — `
    + `real weight, but it comes off once and does not keep coming.`;
}

/**
 * Points for the realistic projection chart: the weigh-ins, plus a band
 * between the fast and slow paces with the likely pace drawn through it.
 *
 * `band` is a [fast, slow] pair per row, which is how a range area is fed.
 */
export function realisticSeries(entries, r, naive) {
  if (!r || r.state !== 'projected') return null;

  const weighed = entries.filter((e) => e.weight > 0);
  const firstDate = weighed[0].date;
  const lastX = dayIndex(firstDate, weighed[weighed.length - 1].date);
  const current = r.current;

  // Run to the slow end, so the whole band is on screen, but never past two
  // years — beyond that the weigh-ins you have would be a smudge.
  const showNaive = Boolean(naive && naive.weeks > 0);
  // Your own pace can be slower than the band, so stretch to cover it too.
  const slowX = Math.max(lastX + r.slow.days, showNaive ? lastX + Math.ceil(naive.weeks * 7) : 0);
  const maxX = Math.min(slowX, lastX + 730);
  const capped = maxX < slowX;

  const at = (pct, x) => Math.max(r.goal, weightAtWeeklyPct(current, pct, x - lastX));
  const naiveAt = (x) => (showNaive ? Math.max(r.goal, current + (naive.kgPerWeek * -1 * (x - lastX)) / 7) : undefined);

  const rows = weighed.map((e) => {
    const x = dayIndex(firstDate, e.date);
    return {
      x,
      date: e.date,
      weight: e.weight,
      ...(x === lastX
        ? { band: [current, current], likely: current, naive: naiveAt(x) }
        : {}),
    };
  });

  const futureRow = (x) => ({
    x,
    date: addDays(firstDate, x),
    band: [+at(MAX_WEEKLY_PCT, x).toFixed(2), +at(MIN_PLANNING_PCT, x).toFixed(2)],
    likely: x <= lastX + r.likely.days ? +at(r.likely.pct, x).toFixed(2) : undefined,
    naive: showNaive && x <= lastX + Math.ceil(naive.weeks * 7)
      ? +naiveAt(x).toFixed(2)
      : undefined,
  });

  const xs = new Set();
  // Weekly early on, then fortnightly — a smooth curve does not need 100 points.
  const step = maxX - lastX > 180 ? 14 : 7;
  for (let x = lastX + step; x <= maxX; x += step) xs.add(x);
  for (const days of [r.fast.days, r.likely.days, showNaive ? Math.ceil(naive.weeks * 7) : null]) {
    if (days != null && lastX + days <= maxX) xs.add(lastX + days);
  }
  xs.add(maxX);
  for (const x of [...xs].sort((a, b) => a - b)) rows.push(futureRow(x));

  const ticks = [];
  for (let i = 0; i <= 4; i++) ticks.push(Math.round((maxX * i) / 4));

  return {
    rows,
    ticks,
    firstDate,
    maxX,
    capped,
    goal: r.goal,
    fastX: lastX + r.fast.days <= maxX ? lastX + r.fast.days : null,
    likelyX: lastX + r.likely.days <= maxX ? lastX + r.likely.days : null,
    slowX: capped ? null : slowX,
    naiveX: showNaive && lastX + Math.ceil(naive.weeks * 7) <= maxX
      ? lastX + Math.ceil(naive.weeks * 7)
      : null,
    showNaive,
    naiveDate: showNaive ? naive.date : null,
  };
}

/** Why the straight line is impossible, in the only unit that settles it. */
export function describeNaive(naive, weighIns) {
  if (!naive) return null;
  const deficit = naive.deficit.toLocaleString('en-US');
  const line = `A straight line through all ${weighIns} weigh-ins would say ${weeksLabel(naive.weeks)}, `
    + `around ${dateLabel(naive.date)}. That is ${naive.kgPerWeek} kg a week, or ${naive.weeklyPct}% of body weight.`;
  if (!naive.impossible) return line;
  return `${line} Sustaining it would need a deficit of about ${deficit} kcal a day — more than most people burn in total, `
    + `so the line is not optimistic, it is arithmetically impossible. It is fitted to water that has already gone.`;
}
