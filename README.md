# Dashboard

The habit dashboards — **Food**, **Body**, **Freedom** and the daily **Routine** —
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

`#food`, `#body`, `#freedom`, `#routine` and `#overview` open a section directly,
and the app reopens on whichever one you used last.

```bash
npm run build && npm start   # production build on http://127.0.0.1:5174
npm run seed                 # import ../notes_weight.csv into data/body_entries.csv
npm run lint
```

## Data files

| File | What is in it |
|---|---|
| `data/food_meals.csv` | every moment of wanting food: hungry/anxious, ate or chose an alternative, sat down, waited 30 s, small portion, distractions, note |
| `data/food_settings.csv` | my list of satisfying alternatives (`\|`-separated) |
| `data/body_entries.csv` | date, steps, sword/push-up sets, stretch breaks, weight, note |
| `data/body_settings.csv` | goal weight, daily point goal, identity, habit stack |
| `data/freedom_days.csv` | date → `clean` or `relapse` |
| `data/freedom_logs.csv` | every urge, win and relapse with its location and note |
| `data/freedom_settings.csv` | personal record |
| `data/routine_days.csv` | date → the routine items ticked that day, space-separated |
| `data/routine_settings.csv` | identity sentence, chosen rewards, claimed milestones, where the 9:30 PM hour is spent |

A missing file just means that table is empty, so you can delete one to reset it.

## Where the rules live

Scoring is separate from the views so the Overview can score the same rows:

- `src/lib/food-rules.js` — the mindful-eating rules, review checks, distractions,
  7-day shares (`mealStats`) and the mindful-days streak
- `src/lib/body-rules.js` — points per set, step multiplier, chain, streak, the
  fitted weight trend, the rate of loss per day/week/month in kg and in percent
  with weigh-ins grouped by day, week or month, progress towards the goal weight
  measured against today's weight, and the forecast: a rate fitted only to
  weigh-ins past the 14-day water-loss window, capped at 1% of body weight a
  week, compounded forward as a 0.5–1% band rather than a single date
- `src/lib/freedom-rules.js` — XP per urge/win, levels, streak, trigger tallies
- `src/lib/routine-rules.js` — the day's items and times, the 12-of-16 chain rule
  (one slipped day forgiven, two in a row end it), reward milestones

The server is `server/api.js`, a plain Node handler with no framework, mounted on
the Vite dev server via a plugin and on `server/index.js` for production.

## Privacy

`data/` holds personal health and relapse logs in plain text, and is gitignored.
The server binds to loopback only and has no authentication — keep it local.
