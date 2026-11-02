# Dashboard

The habit dashboards — **Food**, **Body**, **Freedom**, the daily **Routine** and **Learning** —
combined into one app with a pinned section nav, plus an **Overview** that reads
them all.

Every change is saved to a real CSV file in `data/`. Those files are the source of
truth: open them, edit them, grep them, chart them elsewhere. Nothing derived
(points, streaks, multipliers, levels, XP) is ever stored — it is all recomputed
from the raw entries on load, so hand-editing a past row always rescores
correctly.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173 — app and CSV API in one process
```

`#food`, `#body`, `#freedom`, `#routine`, `#learning` and `#overview` open a section directly,
and the app reopens on whichever one you used last.

```bash
npm run build && npm start   # production build on http://127.0.0.1:5174
npm run seed                 # import ../notes_weight.csv into data/body_entries.csv
npm run lint
```

## Food: comer con calma

The Food section is a mindful-eating tracker, in Spanish, on one page (the sticky
bar shows today's score and jumps to each part):

- **Mi día**: a ring with the day's score out of 7 (one per habit), the streak of
  days with 4+ marks, the **reto del día** (one challenge per day from a pool of
  28, swappable, mark it done), the habit of the week (the weakest of the last 14
  days, changeable), meals logged with "Comí bien" / "A revisar" and per-meal
  chips, the other habits, notes and "subí de peso". You can browse back 60 days.
- **Tropiezo**: log something you wanted to avoid (pizza, galletas, dulces…),
  no punishment; a sweet one cancels «Sin azúcar» for that day.
- **Calorías**: food and exercise entries (exercise kcal estimated from minutes,
  activity and your weight), net vs. your daily goal and vs. yesterday, one-tap
  chips for the foods you log most.
- **Progreso**: plain-language insights from your data, 30-day trend with a
  7-day average, 5-week heatmap, best/worst weekday, kcal chart, challenge
  history, per-habit 4-week matrix, slips by food / time of day / week, level
  (Semilla → Árbol) and badges.

The per-meal habits (sentado, esperé 30 s, sin pantallas, porción pequeña, sin
azúcar) count for the day only when every meal had them; on a day without meals
they are ticked directly.

## Learning: Learning Quest

Ported from `../dashboard_learning`. Log what you learn on a topic × format grid
(11 topics × 7 formats): pick a cell, set the minutes and a title, save.

- XP = minutes × format weight (Conference, Course, Script 1.5 · Book 1.2 ·
  Project 2 · Video, Article 1). Level n starts at 150·(n−1)² XP.
- Tiles: level, total XP, streak (consecutive days with an entry), days learned,
  share of grid cells explored.
- Skill matrix, timeline (day × time of day, dot size = minutes), cumulative XP,
  best weekdays, XP by topic, and the latest entries (remove, download/copy CSV).
- With an empty log you can load ~90 days of sample entries (`sample=true`) and
  remove them again with one click.

## Data files

| File | What is in it |
|---|---|
| `data/food_meals.csv` | one row per meal: time, `type` (`c` comida / `s` snack), sat down, waited 30 s, distracted, small portion, sugar (older rows also carry distractions, lowered calories, feeling, who, note) |
| `data/food_slips.csv` | one row per tropiezo (ate something I wanted to avoid): time, `food` (`pizza`, `galletas`, `dulces`…), `why`, `amount`. A sweet one cancels «Sin azúcar» that day |
| `data/food_log.csv` | calorie counter: one row per entry, `kind` = `food` (eaten) or `ex` (exercise), name, minutes, `kcal` |
| `data/food_days.csv` | date → day-level habits (`habits`, space-separated: `cal comp`, plus the meal habits on days without meals), who I ate with, note, `up` (weight went up), the day's `challenge` id and `challenge_done`; older `water`/`weight`/`weight_note` kept but unused |
| `data/food_settings.csv` | habit of the week (`focusHabit`, `focusWeek`), body weight `kg` (for exercise kcal estimates), daily kcal `goal`; older keys are kept but unused |
| `data/food_cravings.csv` | legacy «Tengo hambre» pauses; kept, no longer written |
| `data/body_entries.csv` | date, steps, sword/push-up sets, stretch breaks, weight, note |
| `data/body_settings.csv` | goal weight, daily point goal, identity, habit stack |
| `data/freedom_days.csv` | date → `clean` or `relapse` |
| `data/freedom_logs.csv` | every urge, win and relapse with its location and note |
| `data/freedom_settings.csv` | personal record |
| `data/routine_days.csv` | date → the routine items ticked that day, space-separated |
| `data/learning_log.csv` | one row per learning entry: id, date, time, topic, format, minutes, title, `sample` (true for demo rows), created (ms) |
| `data/routine_settings.csv` | identity sentence, chosen rewards, claimed milestones, where the 9:30 PM hour is spent |

A missing file just means that table is empty, so you can delete one to reset it.

## Where the rules live

Scoring is separate from the views so the Overview can score the same rows:

- `src/lib/food-rules.js` — the 7 habits, how meal rows map to them, the daily
  score out of 7, streak / best streak, levels, weakest habit (habit of the week),
  slip and calorie stats, the daily challenge (a seeded shuffle, no repeats per
  cycle), the plain-language insights, and `mealStats` for the Overview tile
- `src/lib/body-rules.js` — points per set, step multiplier, chain, streak, the
  fitted weight trend, the rate of loss per day/week/month in kg and in percent
  with weigh-ins grouped by day, week or month, progress towards the goal weight
  measured against today's weight, and the forecast: a rate fitted only to
  weigh-ins past the 14-day water-loss window, capped at 1% of body weight a
  week, compounded forward as a 0.5–1% band rather than a single date
- `src/lib/freedom-rules.js` — XP per urge/win, levels, streak, trigger tallies
- `src/lib/routine-rules.js` — the day's items and times, the 12-of-16 chain rule
  (one slipped day forgiven, two in a row end it), reward milestones
- `src/lib/learning-rules.js` — topics, formats and their XP weights, level
  curve, streak, sample data, and `learningStats` for the Overview tile

The server is `server/api.js`, a plain Node handler with no framework, mounted on
the Vite dev server via a plugin and on `server/index.js` for production.

## Privacy

`data/` holds personal health and relapse logs in plain text, and is gitignored.
The server binds to loopback only and has no authentication — keep it local.
