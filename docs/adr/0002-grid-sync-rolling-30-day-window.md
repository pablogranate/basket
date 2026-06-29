# Grid sync uses a rolling 30-day window, not month tabs

The runtime sync (`src/lib/grid/sync.ts`) now scopes itself to a rolling 30-day window `[start-of-today, start-of-today + 30 days)` in the sheet timezone, instead of "current month + 2 months ahead minus past days". It derives which month tabs that window touches (1–3 tabs, including Dec→Jan rollover) from the same tz boundaries used to filter entries, so the tab list and the entry filter can never disagree.

## Considered options

- **Month-tab offset (previous):** `SYNC_MONTHS_AHEAD = 2` synced whole months. Simple, but the horizon swung between ~28 and ~90 days depending on the day of the month, and it kept syncing matches up to two months out.
- **Rolling 30-day window (chosen):** predictable, constant horizon regardless of date; matches the operational need to only manage the near term.

## Consequences

- The entry filter is now two-sided (`>= windowStart && < windowEnd`); previously only the lower bound (drop past) existed.
- `SYNC_WINDOW_DAYS = 30` replaces `SYNC_MONTHS_AHEAD`. The horizon is computed with fixed `30 * 24h` millisecond math, which is exact because Argentina has observed no DST since 2009. If Argentina reintroduces DST, recompute the horizon via zoned date arithmetic instead.
- Tabs are still fetched best-effort: a touched tab that doesn't exist yet falls through to `tabsMissing` and is non-fatal.
- This is deliberate and reversible — do not "restore" month-based syncing without revisiting this trade-off.
