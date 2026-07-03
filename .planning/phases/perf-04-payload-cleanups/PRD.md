# PRD — Perf Phase 4: Grid payload cut + per-request cleanups

**Created:** 2026-07-03
**Milestone:** Performance optimization
**Status:** Ready for planning
**Commit:** single commit for the whole phase

---

## Goal

Two things: (1) shrink the /grid RSC (React Flight) payload — the dominant remaining grid cost — and (2) sweep the cheap per-request wins that trim a DB round-trip or a serialized-query on every navigation.

## Why

Prior work already brought the grid month view down (cards ~8.7MB, table ~3.7MB via lazy details + className dedup + content-visibility). The next lever is **what gets serialized into the Flight payload for collapsed cards**, plus a handful of small taxes that hit every page.

## Scope

### A. Grid Flight-payload cut (the big grid lever)

`MatchCardDetails` (`match-card-details.tsx`) is `"use client"` and returns `null` until the card is expanded — **but** its `sections` prop (production / cameras / talent / observations rows) is still serialized into the Flight payload for **every** card, opened or not. That's ~30-40% of each card's data, and it largely duplicates assignment data already present on the visible card.

Options (executor picks, justify in plan):
1. **Fetch-on-expand:** don't pass `sections` at all; when the card opens, the client fetches the detail rows (small endpoint or server action keyed by `matchId`). Removes the collapsed-detail payload entirely.
2. **Derive client-side:** if all detail-row inputs are already in the visible card's props, compute `sections` in the client component on open instead of passing them pre-built from the server.
3. **Minimal cut:** if a full refactor is too risky, at least narrow `getGridData`'s `matches.select("*")` (`dashboard.ts:97-98`) to the columns the card actually reads — drops `created_by/updated_by/external_match_id/match_day_notified_at/created_at/updated_at` from every serialized match.

Prefer option 1 or 2 for real impact; option 3 is the safe fallback / can be done in addition.

**Constraint:** the visible (collapsed) card must render with zero extra network — only the expand action may fetch. Do not regress the "expand is instant" feel more than a brief spinner.

### B. Per-request cleanups (cheap, low risk)

1. **`getSettingsSnapshot` uncached** (`settings.ts:88-95`, `50-57`): an `app_settings` query runs on essentially every dashboard page (`reports`, `incidents`, `roles`, `teams`, `people`, `settings`, `mi-jornada`), not wrapped in `React.cache`. Wrap it (and `getPortalGeminiConfig`) in `cache()` → one round-trip per request instead of per-call.
2. **Dashboard layout sequential awaits** (`(dashboard)/layout.tsx:23-27`): `getUserContext()` then `getActiveAnnouncement()` run serially. `getActiveAnnouncement` only gates on `user?.userId`, not the full profile. `Promise.all` them (or fire the announcement query in parallel and gate after).
3. **`fixtures/page.tsx:36-46`** (if not already handled in Phase 2): add a `limit`/pagination to `fixtures.select("*")` and derive categories via a `distinct`/dedicated small query instead of a second full-table scan.

### Out of scope
- react-dom baseline (220KB) — unavoidable.
- Re-doing lazy-details / content-visibility (already done).
- New indexes on `matches.competition/production_mode/status` — track separately; only add if grid filtering is measured slow.

## Success criteria (must be TRUE)

1. The /grid month-view Flight payload is measurably smaller than pre-phase (record before/after transfer size for a representative month).
2. Collapsed cards render with no extra per-card network request; expanding a card still shows the same detail sections (via fetch-on-expand or client-derive).
3. `getSettingsSnapshot` issues at most **one** `app_settings` query per request (verify via query log on a page that calls it multiple times).
4. Dashboard layout's user + announcement queries run concurrently, not serially.
5. `npm run check` passes; grid detail expansion and settings-dependent features (AI assistant gating) behave identically.

## Risks

- **Fetch-on-expand latency:** expanding now waits on a round-trip. Mitigate: small/fast endpoint, optimistic spinner, or prefetch on hover. If UX degrades, fall back to option 2 (client-derive) or option 3 (column narrowing only).
- **`select` narrowing breakage:** narrowing `matches.select` can drop a column some code path reads. Grep every `MatchListItem` field access before removing columns; `MatchListItem = MatchRow & {...}` so TS won't catch a missing runtime column.
- **Cache staleness:** `getSettingsSnapshot` in `React.cache` is request-scoped (fine); do not promote to a cross-request cache — settings (Gemini key) must stay fresh across edits.

## Verification

- Capture /grid month Flight/transfer size before and after (browser network panel, "document" + RSC responses).
- Query-log a settings-heavy page to confirm single `app_settings` read.
- Manual: expand several grid cards, confirm detail parity; toggle a setting and confirm it reflects on next navigation.
