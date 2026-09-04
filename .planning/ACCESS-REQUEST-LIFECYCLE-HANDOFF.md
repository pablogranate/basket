# Access-request lifecycle + ficha identity — handoff

Date: 2026-09-04 · Branch: `refactor/access-request-lifecycle` · Source: architecture review 2026-09-04, candidates 1 + 2.

## What changed

Two deep modules now own what four files and one 508-line action used to share.

| Module | Owns | Interface |
|---|---|---|
| `src/lib/access-requests/requests.ts` | the `access_requests` table: status vocabulary, one-pending rule, first-decision-wins claim, loaders | `submitAccessRequest`, `claimAccessRequest`, `attachAccessRequestIdentity`, `getOwnAccessRequest`, `listPendingAccessRequests`, `listDecidedAccessRequests` |
| `src/lib/people/identity.ts` | ficha ↔ cuenta writes: profile upsert by email, ficha create/reactivate, fusión de fichas, link | `settleApplicant`, `linkProfileToPerson`, `listApprovalCandidates`, `listProfileLinkReview` |

Both take a `DbExecutor` (new, `src/lib/db/client.ts`) so the approve action runs claim + settle in one transaction it owns. Actions keep: authz, tier downgrade, role-exists check, audit, notify/invite mail, notices.

Shared infra added:
- `DbExecutor` type — replaces the `Parameters<Parameters<typeof db.transaction>[0]>[0]` hack.
- `src/lib/db/errors.ts` `isUniqueViolation` — one home; `matches.ts` and `grid/sync-apply.ts` repointed. **Bug fixed on the way:** drizzle wraps driver errors in `DrizzleQueryError`, so `.code` lives on `.cause`; the two old copies never matched. Now walks the cause chain (unit test added).
- `stampInsert` / `stampUpdate` accept `Pick<UserContext, "profileId">`.

## Decisions (grilling 2026-09-04)

1. Lifecycle module owns the whole table, loaders included — no status literal outside it.
2. Submit's JS pre-check dropped; the partial unique indexes are the rule, 23505 is translated to "Ya tenés una solicitud pendiente."
3. Modules take an executor; actions own `db.transaction`.
4. Identity module lives in the people domain (`src/lib/people/`), not access-requests — merging duplicates is a people concept.
5. Settle takes the approver's resolved choice (`personId` / `mergePersonId`), never re-runs `resolveApprovalTarget` (D-08 — suggestions are confirmed by a human).
6. `purge.ts` deleted, not folded: purge-by-counts contradicts D-14 (never hard delete).
7. Audit stays in actions; modules take `actor: { profileId }`.
8. Tests replaced, not layered: two integration suites at the module interfaces, incl. a real two-transaction claim race. Drizzle-stub action test deleted.
9. Submit validation moved into `parseSubmitAccessRequest` (was in `run`); `void ctx` params gone.
10. One PR, one commit.
11. Claim takes the target status (`"aprobada" | "rechazada"`); the `aprobar`/`rechazar` decision vocabulary is gone.
12. `review.ts` stays as the bell composer, calling both modules.

## Deleted

- `src/lib/access-requests/state.ts` + test
- `src/lib/access-requests/purge.ts` + test
- `src/lib/data/access-requests.ts`
- `src/app/actions/__tests__/approve-access-request.test.ts` (395 lines, 190 of drizzle stub)

## Tests

- `src/lib/access-requests/__tests__/requests.integration.test.ts` — 9 cases: lowercase email, duplicate pending (any casing), resolved-then-new (no lockout), own standing, single claim, **concurrent claim race**, unknown id, pending/decided lists, identity attach.
- `src/lib/people/__tests__/identity.integration.test.ts` — 8 cases: create cuenta+ficha, reuse cuenta by email + role update, reactivate picked ficha, full merge (repoint 3 tables, unique-pair handling, soft-delete), self-merge no-op, link never steals, candidates exclude soft-deleted, link review pairing.
- `src/lib/db/__tests__/errors.test.ts` — cause-chain unwrap.
- `RESET_TABLES` extended: `access_requests`, `notification_logs`, `people_teams`.

Run: `npm run check` · `npm run test:integration`.

## Quirks pinned, not fixed

- `data/access-requests.ts`'s `void ctx` seam is gone; the real gates remain page-level (`requireAdmin` on solicitudes, `isAccessRequestApproverRole` in layout). Nothing new enforces per-loader.
- `review.ts` still imports `db` directly for `getActiveRoleOptions` (roles table, not this module's).
- Recipients chain (`notify` → `config` → `recipients`) untouched — candidate 8, separate.
- `approval.ts` untouched (deep, two callers).
- Access-tier UI option arrays still redeclared in `access-request-decision-form.tsx` — candidate 4 (role catalog).

## CONTEXT.md

Added: Solicitud de acceso, Ficha, Cuenta, Fusión de fichas.
