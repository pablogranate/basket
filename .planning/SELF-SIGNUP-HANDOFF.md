# Self-Signup + Aprobación — Design (grilled 2026-08-26)

Replaces the current "productor crea la persona y le da acceso" flow with
applicant-initiated requests approved in-portal by admin/productor.

## Decisions (locked)

| # | Decision |
|---|---|
| D-01 | **Account-first.** Applicant logs in normally (magic link / Google), Better Auth user is created, `/no-access` becomes the signup form. Email is already verified by the login, so no separate verification path. |
| D-02 | **Open to any email.** Guard = one *pending* request per email (partial unique index, migration `0035`). A resolved request — approved or rejected — never blocks a new one: revoking access would otherwise be a permanent ban, since self-signup is the only door. Revised 2026-08-26 after a revoked account could not re-apply. No blocklist UI, no extra throttle. |
| D-03 | Form asks for **Función** (not "Role"), from a fixed 7-item list. Applicant never picks the access tier. Approved users default to `collaborator` (Externo); admin/productor can change the tier at approval. |
| D-04 | Requests live in a new **`access_requests`** table. Nothing is written to `people`/`profiles` until approval. |
| D-05 | Email routing keyed by función; `produccion@basquetpass.tv` always appended; recipients deduped. One failed recipient must not fail the request. Admins/productores are notified **in-portal only** (popup + badge), never by email. |
| D-06 | Approvers = `admin` + `editor` (productor). `coordinator` sees nothing. First decision wins. |
| D-07 | Hard link via **`people.profile_id uuid unique null`** → FK `profiles.id`. A person may exist with no login; a profile may exist with no person. |
| D-08 | Approval dedupe: **exact email match only** auto-links. Near-normalized-name matches are *surfaced* to the approver, who may fusionar or ignore. Never auto-create when an email matches. |
| D-09 | **No fuzzy fallback.** `findLinkedPerson` is reduced to an FK read. Migration backfills `profile_id` by exact email; name-only leftovers go to a one-time admin review list. |
| D-10 | What the approver submits is what persists — it overwrites the existing `people` row. Request values shown alongside as context. |
| D-11 | Form asks **Nombre completo** (no first/last split). |
| D-12 | **One door for accounts.** Manual access-grant/invite removed entirely. No admin-created accounts. `people` rows are still creatable for grid-assignable non-users. |
| D-13 | Revoke deletes the `profiles` row and nulls `people.profile_id`; the `people` row and all history stay. Rejected requests keep a `rejected` row. |
| D-14 | Duplicate persons are **fusionadas**, not deleted: repoint assignments/teams/attendance to the survivor, then soft-delete the old (`deleted_at`). No hard `DELETE` reachable from the modal. |
| D-15 | Popup auto-opens once per approver per pending-set change (keyed on newest pending id, same trick as `dashboard-announcement-bell`); topbar badge with count always visible. Modal shows the list; click expands the editable form. Dismiss is per-approver and local — it never mutates request state. |
| D-16 | Applicant is emailed **only on approve** (reuse `sendCollaboratorInviteEmail`). Rejection is silent; the applicant keeps seeing "pendiente". |
| D-17 | `/no-access` keys off the newest request: **pendiente** → read-only summary, no edit; anything else (no request, or a resolved one) → the form. A resolved row must never read as "en revisión" — that is what left a revoked user staring at a screen no approver could see. |
| D-18 | **No lockout.** Every existing `profiles` row is grandfathered: no request, no popup. Migration is additive. `people.access_revoked_at` and the grant/invite UI are dropped in the same PR. |
| D-19 | Solicitudes lives in **Registros** (`/notifications`), replacing the Contactos tab. `/notifications` stays denied to productores — a productor's entire surface is the popup + badge; decision history is admin-only. Every decision written to the audit log. |
| D-20 | Hard-delete `people` rows with no email **and** zero history. `person_functions` is excluded from the history guard (it is a tag table, deleted with the row); `assignments`, `matches.owner_id`, `notification_logs`, `people_teams` all count as history. See **Delete scope — measured** below. |
| D-21 | Sheet people-sync deleted **in the same PR**. `people_sync_runs` rows kept; table dropped later. |
| D-22 | Función list is **not** added to `roles` — the grid depends on those exact rows. `access_requests.funcion` is the declared value (routing key); the approver picks the real `people.role_id`, pre-mapped. |
| D-23 | Phone **required**, flags selector via **`react-phone-number-input`**, stored `+<country><number>`. No uniqueness constraint. |
| D-24 | Recipients configurable in **Configuración**: one row per función (comma-separated emails) + a global "siempre notificar a". Admin-only, stored in `app_settings`, seeded with today's addresses, each address validated on save. |
| D-25 | Optional `mensaje` textarea on the form, shown in the approve modal, never copied to `people`. |
| D-26 | Tests: pure logic only (routing resolution, approve resolver, state machine, delete-safety predicate). No UI tests. |

## Delete scope — measured (local DB, 2026-08-26)

`people`: 276 rows total, 201 live with no email, 75 live with email.

FK referrers of `people.id` (full set, verified against `pg_constraint`):
`assignments.person_id`, `matches.owner_id`, `notification_logs.person_id`,
`people_teams.person_id`, `person_functions.person_id`. No other table
references people — there is no `person_notes` or attendance FK.

| Predicate | Deletable | Kept |
|---|---|---|
| Zero rows in *all five* referrers | **0** | 201 |
| Zero rows ignoring `person_functions` | **76** | 125 |

The strict predicate is a no-op: 197 of the 201 emailless rows carry a
`person_functions` tag, which is metadata a CSV import wrote, not history.
So the guard counts `assignments` / `matches.owner_id` / `notification_logs` /
`people_teams` only, and `person_functions` rows are deleted along with the
person. That clears **76** rows and keeps every person who ever appeared in a
grilla, owned a match, or was notified.

Counts are from the local container and will differ in prod — the migration
must re-run the predicate there, not hardcode ids.

## Función list → `roles` mapping

| Función (form) | Routed to | `people.role_id` |
|---|---|---|
| Relator | carlos, produccion | `Relator` |
| Comentarista | carlos, produccion | `Comentario 1` |
| Operador de Control | pablo, produccion | `Operador de Control` |
| Soporte Tecnico | pablo, produccion | `Soporte tecnico` |
| Responsable de Cancha | produccion | `Campo` |
| Realizador | produccion | `Realizador` |
| Camarografo | produccion | `Camara 1` |

`role_id` is a pre-selected default in the approve modal, always overridable.

## Data model

```
access_requests
  id            uuid pk
  auth_user_id  text  not null unique   -- Better Auth user
  email         text  not null unique   -- lower(email) unique index
  full_name     text  not null
  phone         text  not null          -- E.164
  funcion       text  not null          -- one of the 7
  mensaje       text
  status        text  not null          -- pendiente | aprobada | rechazada
  created_at    timestamptz not null
  decided_at    timestamptz
  decided_by    uuid -> profiles.id
  profile_id    uuid -> profiles.id     -- set on approve
  person_id     uuid -> people.id       -- set on approve

people
  + profile_id  uuid unique null -> profiles.id
  - access_revoked_at            (dropped)
```

## Flows

**Signup.** Login → no `profiles` row → `/no-access` → form (nombre completo, email read-only, teléfono, función, mensaje) → `access_requests` row `pendiente` → routed email fires (best-effort per recipient) → applicant sees "pendiente".

**Approval.** Approver loads any dashboard page → badge count; popup auto-opens on a new pending set → picks a request → modal resolves the target person:
- exact email hit → "vincular a <persona>", pre-filled with the *existing* person's values;
- no email hit, normalized-name matches → suggestions, each offering fusionar;
- neither → "crear persona nueva".

Approver edits nombre/teléfono/función/tier, submits → `profiles` row created with the chosen tier, `people` row created-or-updated, `people.profile_id` linked, request `aprobada`, applicant emailed the login link, audit entry written.

**Reject.** Request → `rechazada`, no email, no rows created. Applicant's page keeps saying "pendiente". Only an admin can reopen.

## Removals in the same PR

`src/lib/people/sync.ts`, `sync-preview.ts`, `src/app/actions/people-sync.ts`, the people-sync cron in `instrumentation.ts`, `/notifications/sync-people`, `people-sync-modal.tsx`, `people-sync-button.tsx`, `people-sync-logs-workspace.tsx`, the manual access-grant/invite UI + actions on People, `people.access_revoked_at`, the fuzzy branch of `findLinkedPerson`.

## Open follow-ups (deliberately not in this PR)

- Drop `people_sync_runs` once the logs stop mattering.
- WhatsApp ping to productores when a request lands while nobody is in the portal.

## Revisions after the first click-through (2026-08-26)

- The phone field posted the national-formatted text, not E.164, so every submit
  was rejected. `PhoneInput` forwards `name` to its own visible input; the value
  now travels in a hidden field, and the rule lives in a tested
  `isE164Phone`.
- The Solicitudes modal was clipped to the header strip: the dashboard header
  sets `backdrop-blur`, which makes it a containing block for fixed-position
  descendants. The overlay is portalled to `document.body`. The same latent bug
  exists in `dashboard-announcement-bell.tsx` and is untouched.
- Both decisions were read-then-write; the status predicate now lives on the
  UPDATE, and approve claims the request inside its transaction.
- Migration `0034` snapshots the purged rows into `people_purged_0034` /
  `person_functions_purged_0034` before deleting them.
