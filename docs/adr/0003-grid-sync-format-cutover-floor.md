# Grid sync never fetches tabs before the Local/Visitante cutover

The sync skips any month tab before `Julio 26` (`FORMAT_CUTOVER = { year: 2026, month: 7 }` in `src/lib/grid/sync.ts`). Earlier tabs still carry the retired single `Partido` column; the new parser would fetch them, find no `Local` cell, and silently skip every row. That is harmless but wasteful and misleading, and the team asked that those tabs not be fetched at all.

## Context

The change landed on 2026-06-29, when the rolling 30-day window (ADR 0002) spans `Junio 26` + `Julio 26`. `Junio 26` is old-format and must be excluded. After June 2026 passes, the window can no longer reach back to a pre-cutover tab, so the floor becomes inert — but it is kept as a permanent, self-documenting guard of the format boundary rather than removed.

## Consequences

- `resolveSyncTabs` filters out months before the cutover; the entry filter needs no change because excluded tabs produce no entries.
- Matches in the final old-format tab (`Junio 26`) are not synced by this tool. They are expected to already exist in the DB from prior syncs.
- If the season rolls over and a future format change happens, bump `FORMAT_CUTOVER` rather than adding date-based branching.
