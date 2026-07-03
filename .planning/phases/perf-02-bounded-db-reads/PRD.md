# PRD — Perf Phase 2: Bound the unbounded DB reads

**Created:** 2026-07-03
**Milestone:** Performance optimization
**Status:** Ready for planning
**Commit:** single commit for the whole phase

---

## Goal

Stop the data loaders that scan entire tables with no filter/limit. These are O(all history) today and get slower every time a match or assignment is created. Bound them to what the page actually renders.

## Why

Middleware and auth are already clean; the DB tax lives in a few loaders. The worst offender runs on two pages.

### Primary: `getPeopleData` — full `assignments` table scan

`src/lib/data/dashboard.ts:554-664`:
- `people.select("*")` — all people, all columns.
- `assignments.select(...).not("person_id","is",null)` at `:563-567` — **the entire assignments table, no date window, no limit.** Pulls every assignment ever created into Node to compute `primary_role`, `assignment_state`, `current_assignment_count` in JS.
- `person_functions.select(...)` at `:568` — whole table.

Called on:
- `people/page.tsx:181` — needs the per-person summaries. Legitimate consumer.
- `teams/page.tsx:65` — **teams data is a static in-memory directory** (`getTeamDirectoryData` reads `TEAM_DIRECTORY`, no DB). The full assignments scan runs here for no reason.

### Secondary (same class, lower urgency)
- `getCollaboratorMatchData` (`collaborators.ts:619-651`) fetches a person's **entire** assignment history then filters to one match in JS (`:633-636`). Should filter by `match_id` in SQL.
- `getAssignmentConflicts` (`dashboard.ts:468-511`) runs **after** the match load (serialized at `:446`) and internally does two **sequential** queries. Parallelize/combine.
- `fixtures/page.tsx:36-46` — `fixtures.select("*")` no limit, plus a **second** full-table scan just to derive distinct categories. (Note: this overlaps Perf Phase 4; do it wherever it lands, not twice.)

## Scope

### In scope
1. **Bound `getPeopleData` assignments query.** Only load assignments relevant to the computed fields. `current_assignment_count` = assignments whose match end `>= now`; `primary_role` = highest-sort-order role. Options (executor picks, justify in plan):
   - Add a `kickoff_at` window filter via the embedded `match` relation (rolling window, e.g. now − small buffer onward), OR
   - Push the aggregation into a SQL view / RPC returning `(person_id, primary_role, current_assignment_count)` so Node never holds the full table.
   - Preserve exact current semantics of `assignment_state` (`Inactivo`/`En asignacion`/`Disponible`) and `current_assignment_count`.
2. **Remove `getPeopleData` from `teams/page.tsx:65`.** Determine what the teams page actually consumes from it. If it's nothing (static directory), drop the call. If it needs a lightweight count, add a dedicated small query. Verify the teams UI renders identically.

### Consider (fold in if cheap; else defer to Phase 4)
3. `getCollaboratorMatchData` — filter by `match_id` in SQL.
4. `getAssignmentConflicts` — parallelize the two internal queries and/or run alongside the match load.

### Out of scope
- `getMatchDetailData` people/functions reads (bounded by roster size — leave).
- Adding new indexes (separate consideration; the hot columns are already indexed).

## Success criteria (must be TRUE)

1. `getPeopleData` no longer issues an unfiltered full-table `assignments` read; the assignments query is bounded by a date window or replaced by a SQL-side aggregation.
2. `/teams` no longer triggers the assignments/people full scan (verify: no `getPeopleData` call in its render path, or replaced by a bounded query).
3. `/people` renders identical `primary_role`, `assignment_state`, and `current_assignment_count` values as before the change (spot-check several people, including inactive + currently-assigned).
4. `npm run check` passes.

## Risks

- **Correctness of `current_assignment_count`:** the "match end >= now" logic uses `getMatchEndIso(kickoff_at, duration_minutes)`. A date window must not exclude in-progress matches that started before the window. Set the lower bound below `now` by at least the max match duration.
- **Teams page hidden dependency:** confirm `getPeopleData`'s output isn't feeding some team enrichment before removing it. Grep the teams render path.
- **RPC/view adds a migration:** if the SQL-view route is chosen, it needs a `supabase/migrations/NNNN_*.sql` file and manual apply on the VPS (`psql $DATABASE_URL`). Note in the plan.

## Verification

- Before/after: log or EXPLAIN the assignments query row count on `/people`.
- Load `/teams` and confirm (via query log or Supabase dashboard) the assignments table is no longer scanned.
- Diff a snapshot of `/people` person rows (role/state/count) before vs after.
