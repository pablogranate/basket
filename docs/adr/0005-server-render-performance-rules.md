# Server-render performance rules for dashboard routes

Portal runs as a single persistent Node process on the VPS while its data lives in Supabase cloud, so **every DB query in a request costs a full network round-trip (~150–250ms)**. A prod trace (2026-07-03, `/grid` → `/teams` → `/people`) measured 1.4–1.7s of server time per navigation, almost entirely serial round-trips — not CPU, not payload size, not client JS. The perf phases (`.planning/phases/perf-01..05`) fix the existing offenders; this ADR fixes the rules so new features and refactors don't reintroduce them.

## Rules

1. **Round-trip budget: a page render performs at most ~3 sequential DB hops** — auth session → (cached) profile → page data. Anything beyond that must be concurrent or cached. If a feature needs more dependent hops, push the join/aggregation into SQL (view/RPC) instead of chaining queries from Node.
2. **Independent fetches run concurrently.** Two consecutive `await`s where the second doesn't consume the first's result is a defect — use `Promise.all`. Typical trap: `await getSettingsSnapshot()` after `await getPageData()`.
3. **No unbounded table reads.** Every `select` over a growing table (`assignments`, `matches`, `fixtures`, audit tables) carries a date window, filter, or limit matching what the page renders. "Fetch all, filter in JS" is banned for growing tables (see perf-02).
4. **Request-scoped dedupe via `React.cache`; cross-request caching only for near-static, explicitly-invalidated data.** The per-user profile row is TTL-cached in-process with eviction on role/profile mutations (perf-05). `app_settings` is deliberately **not** cross-request cached — the Gemini key must be fresh (decided in perf-04). Never cache the Better Auth session object itself.
5. **Page shells never block on data.** Chrome (header/toolbar/tabs) renders synchronously; data regions are `async` sub-components inside `<Suspense>` with skeleton fallbacks (pattern: `grid/page.tsx`; rollout: perf-03).
6. **Hidden-until-triggered client components are lazy.** Modals, drawers, and tab panels load via `next/dynamic` on open, not in the route's initial chunk (perf-01).
7. **Node never serves static bytes in prod.** nginx serves `/_next/static/` and `/Logos*` directly with immutable/long cache headers; the Node process only renders (perf-05 §C). When adding new static asset directories under `public/`, add a matching nginx location.

## Consequences

- The in-process caches assume **one** Node process (pm2 fork mode, id3). If portal ever moves to pm2 cluster mode or multiple instances, per-process TTL caches diverge — revisit rule 4 (shorten TTL or move invalidation to a shared signal) before scaling out.
- Reviewers should treat a new sequential `await` chain, an unfiltered `select` on a growing table, or an eagerly-imported modal as blocking review findings, same class as a permission-check omission.
- Measuring beats guessing: the reference workflow is a DevTools performance trace of a real prod session (load + two navigations). Compare RSC nav server time against the ~600ms target from perf-05 before and after any change suspected of regressing this.
