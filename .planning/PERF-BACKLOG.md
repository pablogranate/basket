# Perf backlog — "all pages instant"

Mandate (2026-07-31): every page should feel instant (<~200 ms perceived nav/interaction).
Only high/medium-perceptible work — no edge wins. Server TTFB is 30–50 ms; the work is
payload, hydration, and interaction latency.

## Shipped

- PR #132 — grid slim assignments projection + crest srcset fix. Expanded month doc
  1.81→1.30 MB (table) / 1.65→1.14 MB (cards); default month table 687→579 kB.
- PR #133 — /people instant: client-side search/filters (0 fetches, was a 1.4 MB
  document reload each), streamed shell, table render cost, scoped queries.
- PR #134 — soft-nav notification filters, grid display pref via cookie (kills the
  double month render), MutationObserver→toggle, prefetch warming, redirect hop.

Earlier rounds: #131 (class dedup + MatchCard→client), #130 (past-days on-demand),
#128/#127 (/teams), #60/#58 (nav latency). History + mechanisms live in the session
memory file `grid-payload-next-lever`.

## Open — next moves

- [#135](https://github.com/pablogranate/basket/issues/135) — /reports + /incidents
  block first paint and hydrate 3.3k/2.4k-line client monoliths. Highest-value
  remaining item. Effort M.
- [#136](https://github.com/pablogranate/basket/issues/136) — /grid still serializes
  staff phone+email (GridOwner `people` prop; 264 phones/75 emails measured). Needs
  on-demand contacts fetch in create-match-modal. Effort M.
- [#139](https://github.com/pablogranate/basket/issues/139) — bug: notification log
  rows link to /people/<id>, a route that does not exist (404 prefetch per row).
- [#140](https://github.com/pablogranate/basket/issues/140) — remaining audit quick
  items: grid-table row-link prefetch, person_id 10th cut, /fixtures selectDistinct,
  per-route loading.tsx, content-visibility-on-tables restriction notes.

## Open — decisions needed before building

- [#137](https://github.com/pablogranate/basket/issues/137) — display=table also
  ships the hidden phone card stack (~230 kB). UA hint vs client-render vs accept.
- [#138](https://github.com/pablogranate/basket/issues/138) — dashboard header search
  is inert everywhere. Wire it or remove it.

## Known dead ends (do not rebuild)

- Client-boundary inversion for repeated lists doubles bytes (#126 rule).
- `content-visibility:auto` on `<tr>`/table internals is a no-op (verified in Chrome).
- `unoptimized` on grid crests: serves raw 500×500 PNGs, 5–8 MB regression.
- /teams/[slug] is unreachable from the UI — don't optimize a dead route.
