# PRD — Perf Phase 5: Cut server round-trips per navigation + static asset serving

**Created:** 2026-07-03
**Milestone:** Performance optimization
**Status:** Ready for planning
**Commit:** single commit for the whole phase
**Evidence:** DevTools trace `Trace-20260703T165032.json` (prod session: load `/grid?display=cards` → nav `/teams` → nav `/people`)

---

## Goal

Make route navigation *server time* fast. Today every click costs 1.4–1.7s waiting on the RSC response because each page render is a chain of serial DB round-trips (VPS ↔ Supabase cloud ≈ 150–250ms each). Collapse the chain: cache the per-user profile across requests, parallelize independent fetches inside pages, and stop Node from serving static assets while it renders.

## Why (measured, prod trace 2026-07-03)

| Request | Total | Breakdown |
|---------|-------|-----------|
| `/grid?display=cards` (document) | **1236ms** | 437ms TTFB + ~800ms streamed render |
| `/teams` RSC nav | **1704ms** | 196ms headers, 1508ms streaming while server awaits queries |
| `/people` RSC nav | **1393ms** | same shape |
| `/_next/static/chunks/3e0ba4272af3de47.js` | **1228ms wait** | requested while Node was rendering the teams RSC — process contention |

Client is healthy (FCP/LCP 729ms, CLS 0.06, worst input handler 19ms, 0.29MB total network). The wait is nearly all serial server round-trips:

```
getSession (auth DB)                      — every request
→ profiles by auth_user_id (Supabase)     — every request, auth.ts:33
→ getSettingsSnapshot (Supabase)          — every page that calls it
→ page data (getPeopleData, …)            — 1..n more hops
→ getPlatformAccessRole (people only)     — people/page.tsx:210
```

Phases 2 (bounded reads) and 3 (Suspense streaming) shrink individual queries and paint the shell early — but the *chain length* stays. This phase shortens the chain itself.

## Relationship to other perf phases

- **perf-02** bounds `getPeopleData`; **perf-03** streams shells; **perf-04 §B** already owns: `getSettingsSnapshot` → `React.cache`, dashboard-layout `Promise.all`, fixtures cleanup. **Do not duplicate those here.** If perf-04 hasn't landed yet, land it first or fold §B into this phase's commit — not twice.
- perf-04 decided settings stays **request-scoped** (Gemini key freshness). This phase respects that; settings is *parallelized*, not cross-request cached.

## Scope

### A. Cross-request profile cache (biggest single lever)

`getUserContext` (`src/lib/auth.ts:12`) pays a Supabase `profiles` round-trip on **every request** for every page, layout, and action. Profiles change rarely (role edits by an admin).

- Add a small in-memory TTL cache keyed by `authUserId` → `ProfileRow | null` (persistent Node server — a module-level `Map` is fine; no Redis).
- TTL 30–60s **plus explicit invalidation**: `upsertRoleAction` / `deleteRoleAction` / any profile mutation (`src/app/actions/roles.ts`, people access actions) must evict the affected entry (or clear the map — it's tiny).
- Cache the **negative** result too (session but no profile) so unprovisioned users don't trigger the unlinked-profiles scan (`auth.ts:50`) on every request — but keep the first-login auto-link path working: only cache `null` *after* the auto-link attempt found nothing.
- Keep `React.cache` wrapper for intra-request dedupe; the TTL cache sits inside it.
- Result: steady-state chain becomes `getSession → [page data ∥ settings]`.

### B. Parallelize independent awaits inside pages

- `people/page.tsx:180-185`: `getPeopleData(user)` and `getSettingsSnapshot()` are independent → `Promise.all` after `requireUserContext()`. `getPlatformAccessRole` (`:210`) depends on `selectedPerson` — it only matters when an edit modal is open; keep it after, or fire it concurrently keyed by `editPersonId`'s email lookup if cheap.
- `teams/page.tsx:65-200`: `getSettingsSnapshot()` and `getPeopleContactList(user)` → `Promise.all`. (perf-02 may remove/replace the people call on teams — coordinate; whatever remains gets parallelized.)
- Sweep the other dashboard pages (`reports`, `incidents`, `mi-jornada`, `fixtures`, `match/[id]`, `settings`) for the same shape: consecutive `await`s where the later one doesn't consume the earlier one's result → `Promise.all`.

### C. nginx serves static assets directly (VPS config, not repo)

Evidence: a 12KB immutable chunk waited 1228ms because Node was busy rendering. Add to the portal server block (see memory: nginx-routing; deploy per deploy-portal skill):

- `location /_next/static/ { alias /opt/basket-app/.next/static/; expires 1y; add_header Cache-Control "public, immutable"; }`
- `location ~ ^/(Logos|LogosPNG)/ { root /opt/basket-app/public; expires 30d; add_header Cache-Control "public, max-age=2592000"; }`
- Verify after deploy: response header for a chunk no longer shows `x-powered-by`/Next server headers; latency flat while navigating.
- Document the block in the repo (`docs/` or deploy skill) since nginx config isn't version-controlled here.

### D. Prefetch hygiene (small, optional)

Trace shows ~39 `_rsc` prefetch requests in 9s, almost all 0–1KB (loading shell only), re-fired in duplicate waves after each nav (`dashboard-nav.tsx` links). They buy nothing (dynamic routes never prefetch data) and add server load.

- Option: `prefetch={false}` on low-traffic sidebar links (`/support`, `/settings`, `/notifications/logs`, `/reports`).
- Skip entirely if A–C land the target; don't fight the framework for 0KB requests.

### Out of scope

- Cross-request caching of `app_settings` (decided against in perf-04 — freshness).
- Next.js Cache Components / PPR migration — bigger architectural move; revisit only if A–C miss the target.
- Supabase region move / infra changes.
- Anything perf-01..04 already owns.

## Success criteria (must be TRUE)

1. Steady-state authenticated navigation issues **at most one** `profiles` query per TTL window (verify via query log / temporary counter), not one per request.
2. A role change via the roles UI is reflected in the changed user's session within one TTL window or immediately after action-driven invalidation — no stale-role edit access beyond that.
3. `/teams` and `/people` RSC navigation server time (click → stream end) drops below **600ms** in a fresh prod trace (from 1704ms / 1393ms). Combined with perf-02/03, felt content-ready under ~800ms.
4. `/_next/static/*` served by nginx: chunk requests no longer queue behind RSC renders (verify headers + a trace during navigation).
5. `npm run check` passes; login, first-login auto-link (D-06), no-access routing, and guest `mi-jornada` behave identically.

## Risks

- **Stale role/permissions:** TTL cache means a revoked user keeps `canEdit` up to TTL. Mitigate: short TTL (30s), action-driven eviction, and server actions re-check via the same path (eviction covers them). Do NOT cache the Better Auth session itself — only the profile row.
- **Multi-process drift:** if pm2 ever runs portal in cluster mode, per-process maps diverge. Today it's a single process (pm2 id3, fork mode) — note the assumption in code; if clustering happens, move eviction to a DB-timestamp check or drop TTL to ~10s.
- **First-login auto-link regression:** caching `null` too early would break D-06 auto-link. Only cache the post-link-attempt result; add a test-plan step covering a fresh external user.
- **nginx alias mistakes:** wrong alias path serves 404s for hashed chunks and breaks the app hard. Test on a staging port or with `curl` against a specific live chunk URL before reload; keep rollback (`nginx -t`, previous conf) per deploy-portal discipline.

## Verification

- Before/after DevTools trace of the same session shape (grid → teams → people), compare RSC nav durations.
- Query-count log: instrument `createSupabaseAdminClient` temporarily or check Supabase dashboard query stats for `profiles` reads per minute before/after.
- Role-change propagation test: change a test user's role, confirm effect within TTL.
- `curl -sI https://portal.basket-app.com/_next/static/chunks/<hash>.js` → served by nginx with immutable cache headers.
