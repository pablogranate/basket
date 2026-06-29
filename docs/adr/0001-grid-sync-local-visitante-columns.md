# Grid sync reads Local/Visitante columns; tripleKey is normalized

As of the Julio 25 tab, the "Grilla Producción 25/26" sheet replaced its single `Partido` column (`"Local vs Visitante"`) with two columns, `Local` and `Visitante`. The runtime sync (`src/lib/grid/sync.ts`, used by both the manual sync button and the cron scheduler) now reads those two cells directly and drops the old `parseTeams` "vs" split. Every tab uses the new format — there is no per-tab format detection.

## Consequences

- The row gate moved from "has a `Partido` cell" to "has a `Local` cell". `Local` is the anchor: a blank `Local` means the row is a spacer/empty and is skipped. `home_team = Local`, `away_team = Visitante`.
- The id-less dedup fallback `tripleKey(home, away, kickoff)` now normalizes both team names with `normalizeText`. Most rows dedup on `external_match_id`, but some sheet rows have no `id` and rely solely on the triple. Team-name text now originates from the new columns rather than the old split, so casing/accent/whitespace drift between an already-synced row and its re-typed cell could otherwise spawn a duplicate insert. Normalizing absorbs that drift. The trade-off: two genuinely distinct id-less matches at the same kickoff instant with near-identical names would collapse into one — accepted, since that pair is already indistinguishable to a human.
- `tools/import/grilla.mjs` (dead one-time backfill CLI) was deliberately left on the old `Partido` format and must not be re-run against the new sheet.
