# PRD — Perf Phase 1: Lazy-load heavy client components

**Created:** 2026-07-03
**Milestone:** Performance optimization
**Status:** Ready for planning
**Commit:** single commit for the whole phase

---

## Goal

Cut initial JavaScript on every route by code-splitting large `"use client"` components that are **hidden until triggered** (modals, forms, tab panels), so the browser downloads/parses/hydrates them only when actually opened.

## Why

The codebase uses **zero `next/dynamic`**. Every heavy interactive component ships in the page's initial chunk even when it never renders on screen. Measured (build, gzip-approx source sizes):

| Component | Size | Ships eagerly on | Actually needed when |
|-----------|------|------------------|----------------------|
| `create-match-modal.tsx` | 70KB | /grid | user clicks new/edit match |
| `incidents-workspace.tsx` | 82KB | /reports (nested) + /incidents | incidents tab opened |
| `collaborator-report-form.tsx` | 49KB | /mi-jornada | user clicks "report" |
| `create-person-modal.tsx` | 24KB | /people | user clicks "add person" |
| `create-team-modal.tsx` | 16KB | /teams | user clicks "add team" |
| `match-contacts-modal.tsx` | 12KB | grid card details | card expanded → contacts |

`jspdf` (412KB) is already lazy via inline `import()` — do **not** touch it.

## Scope

### In scope — the two safe patterns

**Pattern A — trigger-mounted components inside a CLIENT parent → `dynamic(..., { ssr: false })`.**
These render conditionally on state, so `ssr:false` is legal and correct (no server render, no bundle cost until mount):
- `CreateMatchModal` — imported at `grid-table.tsx:13` and `match-card-actions.tsx:7` (both client). Replace both static imports with a shared `dynamic()` wrapper.
- `MatchContactsModal` — imported at `match-card-details.tsx:12` (client). `MatchCardDetails` already returns `null` until the card is open, so this compounds the win.
- `CollaboratorReportForm` — imported at `my-day-assignments-panel.tsx:31` (client). Lazy here.
- `CreateTeamModal` — imported at `team-card.tsx:15` (client). Lazy here.

**Pattern B — heavy child gated behind a tab inside a CLIENT parent → `dynamic()` (ssr optional).**
- `IncidentsWorkspace` at `reports-workspace.tsx:31` — only rendered on a tab (`:3281`). `reports-workspace` is a client component, so `dynamic()` the nested import. Removes ~82KB from the /reports initial chunk.

### In scope — the server-component page cases (needs a client boundary)

`reports/page.tsx:1`, `incidents/page.tsx:1`, `people/page.tsx:23`, `teams/page.tsx:4`, `mi-jornada/[matchId]/reportar/page.tsx:4` are **server components**. `dynamic(ssr:false)` is illegal in a server component. Handle as:
- `CreatePersonModal` (people/page), `CreateTeamModal` (teams/page): these are open-on-demand modals rendered directly in a server page. Wrap each in a tiny `"use client"` shim (e.g. `create-person-modal-lazy.tsx`) that does `dynamic(() => import(...), { ssr: false })` and re-exports, then import the shim from the page. The trigger button lives in the modal component itself, so keep the button eager if it's cheap; only the modal body needs deferring. Executor decides shim granularity.
- `IncidentsWorkspace` on `incidents/page.tsx` and `ReportsWorkspace` on `reports/page.tsx` are the page's **primary content**, not hidden UI — deferring them shows a spinner for the main view, which is worse UX. **Do NOT lazy the top-level workspace on its own page.** The /reports win comes only from the nested `IncidentsWorkspace` (Pattern B). Leave `incidents/page.tsx` top-level import as-is.

### Out of scope
- `jspdf` (already lazy).
- `grid-table.tsx` (29KB) itself — it's the primary /grid table content; covered by Perf Phase 4 payload work, not here.
- Any behavior/logic change. Same props, same components.

## Approach notes for the executor

- Prefer a single shared lazy wrapper per component over duplicating `dynamic()` at each call site (`CreateMatchModal` has 2 sites).
- Provide a `loading` fallback only where a visible layout gap would occur; modals need none (they mount on click).
- Named exports: `dynamic(() => import("...").then(m => m.CreateMatchModal))`.
- `ssr: false` is only valid inside a `"use client"` module. Verify each target site is a client component before using it; use the shim pattern for server-page sites.
- Confirm no target modal receives a value that must be present at SSR time (none expected — all are click-triggered).

## Success criteria (must be TRUE)

1. Initial client JS for `/grid`, `/reports`, `/people`, `/teams`, `/mi-jornada` drops measurably vs the pre-phase build (record before/after chunk sizes).
2. `create-match-modal`, `match-contacts-modal`, `collaborator-report-form`, `create-team-modal`, `create-person-modal`, and the nested `incidents-workspace` each resolve to their **own** async chunk (verify in `.next` build output / network tab: chunk loads on first trigger, not on page load).
3. All triggers still open the correct component with identical behavior (manual smoke: open each modal/form/tab).
4. `npm run check` passes (lint + typecheck + test + build).
5. No `ssr:false` used inside any server component.

## Risks

- **Hydration/flash:** a modal that was previously SSR'd might flash on first open. Mitigate with a minimal fallback; acceptable since these are click-triggered.
- **Server-action props:** if a lazy modal is passed a server action, `ssr:false` is still fine (action is a reference, resolved client-side). Verify no modal depends on server-only render.
- **Shim proliferation:** keep shims minimal; don't over-abstract.

## Verification

- `npm run build`, diff route/chunk sizes against baseline captured before the phase.
- Manual: load each page with network throttling, confirm the heavy chunk is absent from initial load and appears on trigger.
