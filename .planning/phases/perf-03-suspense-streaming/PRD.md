# PRD — Perf Phase 3: Suspense streaming on dashboard pages

**Created:** 2026-07-03
**Milestone:** Performance optimization
**Status:** Ready for planning
**Commit:** single commit for the whole phase

---

## Goal

Make every data-heavy dashboard page paint its shell (header, toolbar, chrome) **instantly** and stream the data region in, instead of blocking the whole page on the slowest query. Improves perceived speed (TTFB → first paint) with no data-layer change.

## Why

Only `/grid` streams. It wraps its data regions in `<Suspense>` (`grid/page.tsx`) and has a `grid/loading.tsx`. Every other page — `/people`, `/teams`, `/reports`, `/incidents`, `/mi-jornada`, `/match/[id]`, `/fixtures` — `await`s all data at the top of the RSC before returning any JSX. The user stares at a blank route (or the shared `(dashboard)/loading.tsx`) until the heaviest query resolves.

`/people` and `/teams` are the worst felt, because they block on `getPeopleData` (see Perf Phase 2). Even after Phase 2 bounds that query, streaming makes the shell appear immediately regardless.

Existing pattern to copy: `grid/page.tsx` — static chrome rendered synchronously, each data region is an `async` sub-component wrapped in `<Suspense fallback={<Skeleton/>}>`, with a shared request-scoped `cache()` so parallel regions share one round-trip.

## Scope

### In scope
For each target page, split the async data fetch into a sub-component and wrap it in `<Suspense>` with a skeleton fallback, so the page shell (title/header/toolbar) renders without awaiting data:
- `/people` — stream the people table; header + "add person" button paint first.
- `/teams` — stream the directory grid; header paints first.
- `/reports` — stream the workspace data region.
- `/incidents` — stream the workspace data region.
- `/mi-jornada` — stream the assignments panel.
- `/fixtures` — stream the fixtures list.

Add per-route `loading.tsx` where a route-level fallback is cleaner than inline Suspense (executor's call per page).

### Approach notes
- Reuse the grid pattern: hoist the loader into a `cache()`-wrapped fn if multiple streamed regions on one page need the same data.
- Skeletons should match the real content's rough dimensions to avoid layout shift (grid already does this — mirror its skeleton style).
- Keep the static shell (headers, filter toolbars, segmented controls) **outside** Suspense so it's immediate.
- `/match/[id]` — evaluate; its detail load includes conflicts. Streaming the history/conflicts region separately from the core match is a nice-to-have, not required. Include only if low-effort.

### Out of scope
- Changing what the queries fetch (that's Phase 2 / Phase 4).
- Grid (already done).
- Adding new loading states to modals/forms (Phase 1 handles lazy fallbacks).

## Success criteria (must be TRUE)

1. `/people`, `/teams`, `/reports`, `/incidents`, `/mi-jornada`, `/fixtures` each render their static shell before their data resolves (verify: throttle network, shell + skeleton appear, data streams in after).
2. No page regresses: final rendered content is identical to pre-phase.
3. Skeletons approximate final layout — no large cumulative layout shift when data arrives.
4. `npm run check` passes.

## Risks

- **Double fetch:** if a loader is called both in the shell and the streamed region without `cache()`, it runs twice. Wrap shared loaders in `React.cache`.
- **`searchParams`/`params` awaiting:** in Next 16 these are Promises; ensure the shell doesn't accidentally block on awaiting data just to read a param.
- **Layout shift:** poorly sized skeletons hurt perceived quality more than they help. Size them to real content.

## Verification

- Network-throttled load of each page: confirm shell-first paint, then streamed data.
- Lighthouse/manual TTFB-to-first-contentful comparison on `/people` before vs after.
