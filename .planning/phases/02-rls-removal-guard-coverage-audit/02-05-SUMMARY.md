---
phase: 02-rls-removal-guard-coverage-audit
plan: 05
subsystem: structural-guard-coverage-gate
tags: [authz, structural-test, guard-coverage, d-07, d-02-gate]
requires:
  - "src/lib/api/with-auth.ts withAuth/withApiKey markers (plan 02-02)"
  - "src/lib/data/* ctx-first loaders (plan 02-03)"
  - "collaborator-reports withAuth marker (plan 02-04)"
provides:
  - "src/lib/api/__tests__/guard-coverage.test.ts structural coverage test (D-07)"
  - "CI fails on any future unguarded api/*/route.ts or ctx-free data loader"
  - "D-02 step-3 gate sign-off: guards + stamping verified WHILE RLS still live"
affects:
  - "Wave 4 teardown (02-06) is now UNBLOCKED"
tech-stack:
  added: []
  patterns:
    - "Static source analysis: recursive readdir over src/app/api/**/route.ts + src/lib/data/*.ts, marker assertion, explicit allowlist"
    - "Predicate self-check against inline guarded/unguarded samples so the detector cannot silently match nothing"
key-files:
  created:
    - "src/lib/api/__tests__/guard-coverage.test.ts"
  modified: []
decisions:
  - "Used manual recursive readdir instead of node:fs globSync (unavailable in the project's Node runtime) — de4c4f2."
  - "Route allowlist is ONLY src/app/api/health/route.ts; loader allowlist is ONLY isUuidLike."
requirements: [AUTHZ-01]
metrics:
  duration: "~10 min (test) + close-out 2026-06-04"
  completed: "2026-06-04"
  tasks: 3
  files: 1
---

# Phase 2 Plan 05: Structural Guard-Coverage Gate Summary

Added the D-07 structural guard-coverage test (every `api/*/route.ts` must carry `withAuth(`/`withApiKey(`; every `src/lib/data/*` exported async loader must take a `ctx` arg) and ran the full D-02 step-3 verification gate — suite, `npm run check`, and operator manual end-to-end — all green WHILE RLS + triggers are still live.

## What Was Built

- **Task 1 (D-07)** — `src/lib/api/__tests__/guard-coverage.test.ts` (commits 01e0f05, de4c4f2): recursively enumerates `src/app/api/**/route.ts` and `src/lib/data/*.ts`, asserts the wrapper marker / ctx-first param, with explicit allowlists (`api/health` route; `isUuidLike` loader helper) and a predicate self-check (guarded vs unguarded inline sample). All 9 routes pass (4× ai/*, matches/intake via `withApiKey(`, team-logo, grid/calendar, collaborator-reports); only health allowlisted.
- **Task 2 (gate)** — `npm run test`: 14 files / 52 tests passed. `npm run check`: exit 0 (lint 0 errors / 2 pre-existing warnings, typecheck clean, build green, 26/26 pages).
- **Task 3 (manual gate)** — Operator verified 2026-06-04: pages render + role gating intact; guest mi-jornada AI works; AI routes 401/403; guest 429 rate limit; intake machine-auth; team-logo + grid/calendar 401-then-pass; collaborator-reports 401/403; real write shows non-NULL `audit_log.changed_by` + stamped `created_by`/`updated_by` (app stamping agrees with still-live triggers).

## D-02 Step-3 Gate: SATISFIED

Guards (plans 02-02/03), app-side stamping (plan 02-04), and structural coverage (this plan) are all proven green while RLS and the `auth.uid()` triggers are still live. **The teardown migration (plan 02-06) is cleared to proceed.**

## Threat Model Coverage

- **T-02-12** (EoP, forgotten guard) — mitigated: structural test fails CI on any unguarded route/loader; allowlist only `api/health`/`isUuidLike`.
- **T-02-13** (Repudiation/EoP, unproven guards before teardown) — mitigated: full-suite + manual gate signed off while RLS still live.

## Deviations from Plan

- `node:fs` `globSync` unavailable in runtime → manual recursive readdir (de4c4f2). Behavior identical.
- Per user instruction (2026-06-04), no further per-task commits: close-out artifacts ride the single end-of-phase commit.

## Verification

- `npx vitest run src/lib/api/__tests__/guard-coverage.test.ts` → green.
- `npm run test` → 14 files / 52 tests passed.
- `npm run check` → exit 0.
- Operator manual sign-off → "verified" (2026-06-04).

## Self-Check: PASSED

- FOUND: src/lib/api/__tests__/guard-coverage.test.ts; commits 01e0f05 (test), de4c4f2 (readdir fix).
- Gate evidence: suite + check output green 2026-06-04; operator resume-signal received.
