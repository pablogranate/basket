---
phase: 2
slug: rls-removal-guard-coverage-audit
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-03
updated: 2026-06-03
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.8 (+ `@vitejs/plugin-react`, `vite-tsconfig-paths`) — installed in plan 01 (Wave 0) |
| **Config file** | `vitest.config.mts` — created plan 01 Task 2 (none exists today) |
| **Quick run command** | `npx vitest run <path>` |
| **Full suite command** | `npm run test` (= `vitest run`); folded into `npm run check` |
| **Estimated runtime** | ~5-15 seconds (unit + static-analysis; no DB in unit tests) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run <touched test file(s)>`
- **After every plan wave:** `npm run test` (full suite)
- **Before `/gsd-verify-work`:** Full suite + `npm run check` green; coverage test (D-07) must pass
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUTHZ-01 | T-02-SC | rate-limiter-flexible legitimacy verified before install (or descope) | manual checkpoint | (human-verify, npmjs.com) | — | ⬜ pending |
| 02-01-02 | 01 | 1 | AUTHZ-01 | — | vitest installed + wired into check/CI | CLI | `npx vitest --version` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | AUTHZ-01 | T-02-02 / T-02-03 | withAuth returns 401/403, passes ctx; rate limiter blocks after N | unit | `npx vitest run src/lib/api/__tests__/with-auth.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | AUTHZ-01 | T-02-01 | user-facing settings snapshot exposes NO raw secret_value (any role); runtime read STILL returns a working key for non-admin/guest (D-08 w/o regressing D-05) | unit | `npx vitest run src/lib/__tests__/settings-secret.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | AUTHZ-01 | T-02-02 / T-02-03 | each api/ai/* route 401/403; guest routes rate-limited (429) | unit | `npx vitest run src/app/api/ai` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | AUTHZ-01 | T-02-04 | machine-auth model decided for intake | decision checkpoint | (human-verify) | — | ⬜ pending |
| 02-02-03 | 02 | 2 | AUTHZ-01 | T-02-04 | intake fails closed on wrong/missing API key | unit | `npx vitest run src/app/api/matches/intake` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 2 | AUTHZ-01 | T-02-16 | team-logo + grid/calendar converted to withAuth (D-07 marker); 401 no-session, authenticated pass; no role regression | unit | `npx vitest run src/app/api/team-logo src/app/api/grid/calendar` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | AUTHZ-01 | T-02-06 | every loader takes ctx; all callers guard at boundary | type | `npm run typecheck` | n/a | ⬜ pending |
| 02-03-02 | 03 | 2 | AUTHZ-02 | T-02-07 | people page drops admin client; service-role confined | source + type | `! grep createSupabaseAdminClient page.tsx && npm run typecheck` | n/a | ⬜ pending |
| 02-03-03 | 03 | 2 | AUTHZ-01 | T-02-06 | loader runs with fake ctx; platform-access logic | unit | `npx vitest run src/lib/__tests__/loaders-ctx.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | AUTHZ-03 | T-02-09 / T-02-10 | stamp helpers set actor; changed_by never NULL; secret redacted | unit | `npx vitest run src/lib/__tests__/audit.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 2 | AUTHZ-03 | T-02-11 | every action write site stamps + audits — STRUCTURAL completeness test (no unstamped action mutation; offenders empty) | unit (static) | `npx vitest run src/lib/__tests__/stamping-coverage.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 02-04-03 | 04 | 2 | AUTHZ-01 / AUTHZ-03 | T-02-09 / T-02-17 | collaborator-reports converted to withAuth (D-07 marker); per-route 401 no-session / 403 under-priv; write produces non-NULL changed_by | unit | `npx vitest run src/lib/__tests__/audit.test.ts src/app/api/collaborator-reports` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 3 | AUTHZ-01 | T-02-12 | every route guarded + every loader ctx'd (structural); all 9 routes wrapped, only api/health allowlisted | unit (static) | `npx vitest run src/lib/api/__tests__/guard-coverage.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-02 | 05 | 3 | AUTHZ-01 | T-02-13 | full suite + check green WHILE RLS live (D-02 gate) | CLI | `npm run check` | n/a | ⬜ pending |
| 02-05-03 | 05 | 3 | AUTHZ-01 | T-02-13 | manual RSC + route + stamping verification | manual checkpoint | (human-verify) | — | ⬜ pending |
| 02-06-01 | 06 | 4 | AUTHZ-02 | — | teardown clearance (D-02 gate satisfied) | decision checkpoint | (human-verify) | — | ⬜ pending |
| 02-06-02 | 06 | 4 | AUTHZ-02 | T-02-15 | 0010 drops correct inventory; protects handle_new_user + columns | source | `test -f 0010 && grep disable-rls && ! grep handle_new_user-drop` | n/a | ⬜ pending |
| 02-06-03 | 06 | 4 | AUTHZ-02 | T-02-09 / T-02-14 | [BLOCKING] supabase db push; post-push write non-NULL changed_by | manual checkpoint | (human-action, supabase db push) | — | ⬜ pending |
| 02-06-04 | 06 | 4 | AUTHZ-02 | T-02-14 | check green post-migration; PostgREST window documented | CLI | `npm run check` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (all in plan 01)

- [ ] vitest install (`vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`) + `vitest.config.mts` (node env, tsconfigPaths + react plugins)
- [ ] `npm run test` (`vitest run`) wired into `package.json` `check` + CI (`.github/workflows/ci.yml` Test step between Typecheck and Build)
- [ ] shared auth-context mock fixture: `src/test/fixtures/user-context.ts` (`makeUserContext(overrides)` + `vi.mock("@/lib/auth")` helper) — used by all 401/403 route, loader, and audit tests
- [ ] rate-limiter-flexible install gated behind plan 01 Task 1 blocking checkpoint ([ASSUMED])

**Per-requirement Wave 0 test stubs:**
- AUTHZ-01: `with-auth.test.ts`, `guard-coverage.test.ts`, per-route `__tests__/auth.test.ts` (ai/*, intake, team-logo, grid/calendar, collaborator-reports), `loaders-ctx.test.ts`
- AUTHZ-02: `guard-coverage.test.ts` (service-role confinement is source+type asserted, not a runtime test); teardown verified by post-push manual check
- AUTHZ-03: `audit.test.ts` (changed_by never NULL, secret redaction, match_id rule), `stamping-coverage.test.ts` (structural: every action mutation paired with stamping + writeAudit; Pitfall 1)
- D-08: `settings-secret.test.ts` (user-facing snapshot redaction + runtime read stays functional for non-admin/guest)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Async RSC page render + role gating (`/people` etc.) | AUTHZ-01 | Vitest cannot test async Server Components (RESEARCH Pitfall 5) | Plan 05 Task 3: `npm run dev`, log in admin/non-admin, confirm pages render + gating + platform-access toggle; confirm guest mi-jornada AI still works (D-05 not regressed) |
| Live route 401/403/429 + intake machine-auth + team-logo/grid-calendar/collaborator-reports session gating | AUTHZ-01 | End-to-end HTTP against running app | Plan 05 Task 3: curl guarded/guest/intake/session routes |
| RLS disabled + triggers dropped on live DB | AUTHZ-02 | Live DB schema state, applied by hand (CLAUDE.md) | Plan 06 Task 3: `supabase db push`, inspect pg_class.relrowsecurity + pg_trigger/pg_proc |
| Post-teardown write records non-NULL changed_by | AUTHZ-03 | Confirms app stamping holds without triggers on live DB | Plan 06 Task 3: create a match, inspect audit_log.changed_by |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a documented manual/Wave-0 dependency
- [x] Sampling continuity: no 3 consecutive code tasks without automated verify
- [x] Wave 0 covers all MISSING references (all in plan 01)
- [x] No watch-mode flags (all `vitest run`, never `vitest` watch)
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved 2026-06-03 (revised — added 02-02-04 team-logo/grid-calendar, 02-04-02 structural stamping-coverage, 02-04-03 collaborator-reports withAuth+auth test; corrected 02-01-04 D-08 to user-facing-only)
</content>
</invoke>
