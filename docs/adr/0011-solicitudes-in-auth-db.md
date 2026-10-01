---
status: accepted
---
# Solicitudes de acceso move to the Auth DB, one row per app

A Solicitud de acceso used to live in the portal's Domain DB (`access_requests`) and always meant "give me the portal": the only deciders were portal Admins and Productores, and approving always created a Cuenta, a ficha and a portal Acceso. With per-app roles (ADR 0010) each app now has its own admins, and a person who opens facturación without an Acceso should be asking facturación's admins for facturación. We decided that a Solicitud records the app it asks for and lives in the shared Auth DB next to the Accesos: `auth_access_request (id, user_id → auth_user, app → auth_app, email, full_name, phone, funcion, ciudad, mensaje, status, created_at, decided_at, decided_by → auth_user, granted_role, person_id)`, with partial unique indexes on `(user_id, app)` and `(lower(email), app)` where pending. Recipients for every app but the portal live next to it in `auth_app_request_recipients (app, email)`. The portal still hosts the one form (`/no-access?app=<key>`), because it is the only auth server (ADR 0009).

## Considered Options

- **Keep Solicitudes in the Domain DB, add an `app` column**: the smallest change, but sibling admins decide inside their own app, and ADR 0009 rejects siblings calling a portal API or reading the portal's database. Every sibling already reads the Auth DB for its gate.
- **One Solicitudes table per app, in each app's own database**: every app would re-implement the form, the one-pending rule and the email, and super admins couldn't decide every app's requests from one place.
- **A portal HTTP API the siblings call to list and decide**: a new cross-app contract, a second auth path between servers, and the portal on the critical path of every sibling's approvals.

## Consequences

- The Auth DB, already the single point of failure for login, also holds onboarding. Its backups cover Solicitudes from now on.
- `decided_by` is an identity, not a Cuenta, so a super admin without a Cuenta is auditable. Old rows map through `profiles.auth_user_id`; a decider Cuenta that was never linked becomes null.
- The ficha a portal approval lands on (`person_id`) is a cross-database reference with no FK.
- A portal approval writes both databases. The claim opens an Auth DB transaction; the ficha and Cuenta are settled in a Domain DB transaction nested inside it; the portal Acceso joins while the Domain one is still open. Either side failing rolls both back. The one window left, an Auth DB commit failing after the Domain one, leaves the request pending and the ficha in place, and a retry links to it by email.
- A sibling approval is one Auth DB transaction: the claim and `grantRole(user, app, role)`. No Cuenta, no ficha.
- First decision wins across every place that can decide (the apex directory, the portal, the app itself), because each one claims the same row with the same compare-and-set on `status`.
- The `app` in `/no-access?app=` is user input. It is checked against `auth_app` and falls back to `portal`, and it only picks which Solicitud to show or file: every Solicitud still needs an approval.
- The Domain DB `access_requests` is copied once (`pnpm db:auth:copy-access-requests`, rows become `app = 'portal'`, ids kept) and dropped in a later contract step (#204).
