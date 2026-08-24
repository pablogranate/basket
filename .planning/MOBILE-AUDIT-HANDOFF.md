# Mobile audit handoff — portal at 390x844

Written 2026-08-24 on branch `feat/mi-jornada-encoder-number`. No code changed yet.

## What was done

1. Static pass over every route under `src/app` and every portal/modal component.
2. Runtime pass in Chrome DevTools at 390x844 (iPhone-class, mobile + touch emulation)
   against a local dev server on port 3100, logged in as ADMIN (full `DashboardShell`).
   For each screen: overflow probe (`documentElement.scrollWidth` vs `clientWidth`, plus
   per-element right-edge tests with clipped/scrollable ancestor detection), input
   font-size probe, and screenshots.

Status labels below:
- **CONFIRMED** — reproduced at 390x844 in the browser, with numbers.
- **STATIC** — found by reading the code; not reproduced (screen empty locally, or gated above `sm`).
- **NOT CHECKED** — neither.

Nothing is fixed. Owner (Wences) will eyeball these on prod and confirm/reject before work starts.

## Issues to verify on prod

### 1. CONFIRMED — "Registrar equipo" modal is unusable on a phone
`src/components/teams/create-team-modal.tsx:212`
- Route: `/teams` → "Registrar equipo".
- Measured: panel is 1123px tall in an 844px viewport, top at **-139px**, bottom at
  **983px**, and **zero** internal scroll containers. The panel is `position: fixed`, so
  the page cannot scroll to reach it.
- Effect: the close (X), one input, and both **Cancelar / Guardar equipo** buttons are
  off-screen and unreachable. The only escape is tapping the backdrop.
- Cause: `overflow-hidden` with no `max-h` and no scrollable body.
- Fix shape: `flex max-h-[calc(100vh-2rem)] flex-col`, body `min-h-0 flex-1 overflow-y-auto`,
  footer `shrink-0` — the same structure `create-person-modal.tsx:163` already uses.

### 2. CONFIRMED — "Editar personal" modal clips the save button
`src/app/(dashboard)/people/page.tsx:518-530`
- Route: `/people` → tap any row.
- Measured: footer row spans 191px→**448px** inside a modal whose right edge is 374px.
  "Guardar cambios" starts at 321px and ends at 448px, i.e. **74px past** the panel, which
  is `overflow-hidden`.
- Effect: the primary action is visually cut ("Gu… ca…") and partly untappable. Saving an
  edit from a phone is unreliable.
- Cause: footer is a single non-wrapping `flex justify-between` row with `px-8` and three
  buttons (Eliminar usuario / Cancelar / Guardar cambios).
- Fix shape: wrap or stack the footer under `sm`, and drop the header/footer padding to
  `px-5 sm:px-8`.

### 3. CONFIRMED — `/reports` scrolls sideways
`src/components/reports/reports-workspace.tsx:3158-3159` (check `:2727` too)
- Measured: `documentElement.scrollWidth` = **689px** at a 390px viewport. Two root causes,
  both 672px wide inside a 358px parent: the "Reportes por personal" `<article>` and the
  "Insights de IA" panel.
- Cause: they are grid items of `section.grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]`
  and lack `min-w-0`. A grid item defaults to `min-width: auto`, so the wide table inside
  forces the track to its min-content width; the inner `overflow-x-auto` never engages.
- Effect: the whole page drags horizontally; headers and cards sit misaligned.
- Fix shape: `min-w-0` on those grid items (and audit sibling panels in the same file).

### 4. CONFIRMED — `/people` table shows one column on a phone
`src/components/people/people-table.tsx:370-371`, rendered unconditionally by
`src/components/people/people-workspace-client.tsx:125`
- Measured: table 1538px wide in a 356px scroller, 276 rows, row height ~190px. Columns:
  NOMBRE / ROL / RESPONSABLE / CELULAR / CORREO / CIUDAD / ESTADO — only NOMBRE is visible.
  Header scrolls away (not sticky).
- The page itself does not overflow (the scroller contains it), so this is "technically
  works, practically unusable", not a clip.
- Fix shape: `hidden sm:block` on the table plus a phone card list, the same split `/grid`
  already does.

### 5. CONFIRMED — same story on `/incidents` and the notification log tables
- `/incidents` (`src/components/incidents/incidents-workspace.tsx:1602`): table 1620px in a
  356px scroller; only LIGA / ID / FECHA visible. Rows are compact, so this is milder than `/people`.
- `/notifications/logs` (`notification-logs-workspace.tsx:101`): table forced to
  `min-w-[64rem]`, measured 1176px, 50 rows. Same pattern in `sync-logs-workspace.tsx:66`
  and `people-sync-logs-workspace.tsx:56`.
- Fix shape: card list under `md`, table above.

### 6. CONFIRMED — every form field is 14px, so iOS zooms on focus
`src/components/ui/input.tsx:12`, `src/components/ui/select.tsx:13`,
`src/components/ui/textarea.tsx`, plus ~105 raw `<input|select|textarea>` across the app.
- Measured live counts of sub-16px focusable fields: `/roles` 88, `/match/[id]` 74,
  create-person modal 189, `/settings` 6, `/people` 5.
- Effect: iOS Safari auto-zooms on focus and does not zoom back out; the user is left on a
  panned, magnified page. Worst on `/roles` and the people modals.
- Fix shape: `text-base sm:text-sm` on the three primitives, then the raw fields.
- Note: only reproducible on real iOS — Chrome emulation does not zoom. Please confirm on a
  real iPhone.

### 7. CONFIRMED (cosmetic) — truncated labels and tall stat stacks
- `people-sync-modal.tsx:295` header: title renders as "Esto va a cambiar en P…" because
  `px-7` plus a `size-11` close button leaves ~250px of line.
- `/mi-jornada` assignment card: role label renders "PRODU" (clipped "PRODUCCIÓN"), twice.
- `/people` (5 cards), `/incidents` (4 cards), `/reports`: stat cards are full-width and
  stacked below `md`, so there is roughly a screen and a half of scrolling before the
  actual content. A 2-up compact tile row would fix it.

### 8. STATIC — no safe-area insets outside the PWA banner
- Only `src/components/pwa/pwa-install-banner.tsx:122` uses `env(safe-area-inset-*)`.
- `src/components/layout/collaborator-shell.tsx` renders a `fixed inset-x-0 bottom-0
  px-4 py-3` bottom nav with no bottom inset, so the iPhone home indicator overlaps it in
  installed-PWA (standalone) mode. `app/layout.tsx` also has no `viewport` export, so no
  `viewport-fit=cover`.
- Not reproduced: this needs a collaborator-role login in a real installed PWA on a notched
  iPhone. **Please check this one on your phone specifically** — it affects the collaborator
  experience, which is the phone-heavy audience.

### 9. STATIC — `/fixtures` table is hard-clipped
`src/app/(dashboard)/fixtures/page.tsx:145`
- 7-column table inside `rounded-lg border overflow-hidden` with **no** `overflow-x-auto`:
  columns past "Fase / Grupo" should be cut off and unreachable (no scroll to recover them).
- Could not reproduce: the local DB has zero fixtures, so the table never rendered. If prod
  has fixture rows, this is the quickest thing to confirm by eye.
- Side note: this page is also the only screen still using default Tailwind grays
  (`text-gray-500`, `bg-gray-50`) instead of the design tokens.

### 10. STATIC — grid stats modal has a fixed 248px sidebar
`src/components/grid/grid-stats-modal.tsx:208`, `:1138`
- Hard `w-[248px]` filter rail plus 5 tables inside a `max-w-[920px]` shell.
- Not reachable on a phone: the trigger is `hidden sm:block` (`grid-regions.tsx:196`), same
  for the sync button. So this only bites at tablet portrait (640–1024px).
- Lower priority unless you use the portal on an iPad.

### NOT CHECKED
`/teams/[slug]`, `/support`, `/notifications/syncs`, `/notifications/sync-people`,
`/login` and `/no-access` at phone width, the create-match modal and the grid table
(both gated above `sm`, need a 768px pass), the announcement bell modal (needs a
collaborator login), and `assignment-notify-confirm`.
The contacts modal ("Enviar a todos" on match detail) measured clean: panel 32→427px,
one inner scroller, nothing off-screen.

## Screens that measured clean at 390x844

`/grid` (has a dedicated phone toolbar and card list), `/mi-jornada` (verified with a
seeded assignment), `/mi-jornada/[matchId]/reportar` (mobile-first, no overflow),
`/match/[id]`, `/match/[id]/notificar`, `/teams`, `/settings`, `/roles`,
`create-person-modal`, `people-sync-modal` (structure fine; see issue 7 for the title).

## Suggested order once Wences confirms

1. Issues 1 + 2 — functional blockers, small diffs.
2. Issue 3 — one-line `min-w-0` fix, then re-measure `documentElement.scrollWidth`.
3. Issue 6 — global, touches three primitives plus raw fields; verify on real iOS.
4. Issue 9 — confirm on prod first, it may be a 1-line wrap.
5. Issues 4 + 5 — card fallbacks, the largest chunk of work.
6. Issues 7 + 8 + 10 — polish.

## Reproducing the local environment

The runtime pass needs two podman containers and a dev server on a spare port (3000 is
taken by the sibling `data-bp` analytics app):

```bash
podman start basket-auth-db basket-portal-db     # 5433 (auth) and 5434 (domain)
# .env.local has AUTH_DATABASE_URL on `localhost`, which resolves to ::1 and refuses;
# override it with 127.0.0.1 or Better Auth fails with ECONNREFUSED on every request.
AUTH_DATABASE_URL="postgresql://<AUTH_DB_USER>:<AUTH_DB_PASSWORD>@127.0.0.1:5433/basket_auth" \
  BETTER_AUTH_URL=http://localhost:3100 \
  NEXT_PUBLIC_APP_URL=http://localhost:3100 \
  npx next dev -p 3100
```

Then emulate `390x844x3,mobile,touch` in DevTools. Note: run podman **outside** the agent
sandbox — a sandboxed `podman start` publishes ports into an isolated network namespace that
the dev server cannot reach, while `podman ps` still reports them as up.

`/mi-jornada` and `/reportar` render as empty states unless the logged-in user has an
assignment. Two throwaway rows were inserted to make them render and have been deleted again:
`matches` id `1111...1111` and `assignments` id `2222...2222`.

## Method notes / caveats for the next agent

- Everything was measured as an ADMIN (`DashboardShell`). The collaborator path
  (`CollaboratorShell`, bottom nav, announcement bell) was not exercised — issue 8 depends
  on it.
- Chrome emulation does not reproduce iOS focus-zoom (issue 6) or safe-area insets
  (issue 8). Both need a real device.
- The overflow probe returns huge raw offender counts on table pages; only elements whose
  parent is narrower than the viewport are real root causes. Filter accordingly.
- Screenshots from the pass are in the session scratchpad under `shots/` and will not
  survive; retake as needed.

## Fix log — 2026-08-24

Worked in the suggested order on `feat/mi-jornada-encoder-number`. `npm run check` passes.

| # | Status | What changed |
|---|--------|--------------|
| 1 | fixed | `create-team-modal.tsx` — panel `max-h-[calc(100vh-2rem)]`, header `shrink-0`, form split into a `min-h-0 flex-1 overflow-y-auto` body plus a `shrink-0` footer that wraps. Padding `p-5 sm:p-6`. |
| 2 | fixed | `people/page.tsx` — edit modal footer is `flex-col-reverse` under `sm`, header/sections/footer drop to `px-5 sm:px-8`, buttons narrower on phone. |
| 3 | fixed | `reports-workspace.tsx` — `min-w-0` on all four grid items of the two `xl:grid-cols-[1.7fr_1fr]` sections; panel padding `p-5 sm:p-8`. |
| 6 | fixed | `globals.css` — unlayered `@media (max-width: 639px)` rule forcing `font-size: 16px` on every `input`/`select`/`textarea`. Done in CSS rather than the three primitives because ~105 raw fields and many `text-sm` overrides would have beaten a Tailwind class. Still needs a real-iPhone check. |
| 9 | fixed | `fixtures/page.tsx` — `overflow-x-auto` + `min-w-[44rem]` on the table. Still unverified against real rows; the default-gray tokens were left alone. |
| 4 | fixed | New `people-card-list.tsx` rendered `sm:hidden`, table `hidden sm:block`. |
| 5 | fixed | `incidents-workspace.tsx` gets a `md:hidden` card list (tap selects the incident, same as a row). All three log workspaces get a `md:hidden` card list and a wrapping pagination row. |
| 7 | partial | `people-sync-modal` header no longer truncates (`px-5 sm:px-7`, `size-10` close, no `truncate`). Stat tiles are 2-up on phone (`/people`, `/incidents`, `/reports`) and `StatCard`/`MetricCard` shrink their padding and numerals under `sm`. **The `/mi-jornada` "PRODU" finding was a misread**: nothing is clipped — two pills are both literally labelled "Produ" (`BUSINESS_LABELS.productionShort`), one carrying the production mode and one carrying the role. Renaming one is a copy decision, left for Wences. |
| 8 | fixed | `layout.tsx` gains a `viewport` export with `viewportFit: "cover"`; `collaborator-shell.tsx` bottom nav uses `pb-[calc(0.75rem+env(safe-area-inset-bottom))]` and `<main>` pads to match. Needs a real installed PWA to confirm. |
| 10 | fixed | `grid-stats-modal.tsx` — rail stacks above the content under `lg` (`max-h-[35vh] overflow-y-auto`), keeps its 248px only from `lg` up. |

Still open: the NOT CHECKED list above, and re-measuring `documentElement.scrollWidth` on `/reports` at 390px.
