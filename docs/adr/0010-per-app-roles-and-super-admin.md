---
status: proposed
---
# Per-app roles replace the shared Nivel; super admins and the portal join the central Acceso table

ADR 0009 gave every sibling one shared Nivel scale (`read | write | admin`), so each app translated it to its own vocabulary (facturación maps `write → coordinador`, `admin → admin`, and ignores `read`), and the portal stayed outside the table on `profiles.role`. We decided that each app declares its own roles in a catalog in the Auth DB, `auth_app (key, label, sort_order)` + `auth_app_role (app, key, label, description, rank, is_admin)`, and that an Acceso stores the app's own role key (`auth_app_access (user_id, app, role)` with a composite FK to the catalog). The portal becomes one more app (`admin | editor | collaborator`, labelled Admin / Productor / Externo) and `profiles.role` is retired. A super admin is an identity with `auth_user.role = 'superadmin'` (the Better Auth admin plugin column); the view `auth_effective_access` returns every explicit Acceso plus, for each super admin, the `is_admin` role of every app (their explicit rows are kept, so demotion restores them; a banned super admin gets only explicit rows), and every gate reads the view instead of the table. Users are managed at `basket-app.com/usuarios`, a portal route that answers only on the apex host and only to super admins; apps keep scoped in-app management that writes the same table, limited to their own app and to roles ranked below the actor.

## Considered Options

- **Keep the shared Nivel and translate per app** (ADR 0009): no migration, but every app keeps a translation table and the manager page can't show the words people actually use ("Periodista", "Productor").
- **Per-app Postgres enums**: one column can't hold several enums; a text column checked against a catalog table does the same job and adding a role is an insert, not a migration.
- **Portal keeps `profiles.role`, apex page writes through**: less migration, but two sources of truth for one app and the apex page would need Domain DB write access; rejected.
- **Super admin materialized as admin rows in every app**: readers need no change, but rows drift when an app is added or a super admin is demoted; rejected for the view.
- **Apex-only management**: breaks the portal's self-signup approval (productores grant Externo) and makes super admins a bottleneck.
- **Standalone apex app**: would need its own Better Auth server for the admin APIs, which ADR 0009 forbids; the portal already serves the apex host.

## Consequences

- The Nivel scale disappears. "Lectura / Escritura / Admin" survives only as the role keys of apps that don't define better ones. Each catalog role carries `legacy_level`, the Nivel it equals, which drives the backfill and the dual-write of `level`; facturación maps `read → periodista`, `write → coordinador`.
- Super admin is also the only admin-plugin role (`roles: { user, superadmin }`, `adminRoles: ["superadmin"]`), so no identity role called `admin` can reach the plugin's endpoints.
- Expand/contract rollout: `role` column and view added next to `level`; readers move to the view one by one; `level` and its enum dropped last. A reader still on `level` keeps working until the contract step.
- `auth_app_access.app` moves from a Postgres enum to an FK on `auth_app`; adding a sibling becomes a seed insert. `level` becomes nullable (portal rows have none).
- The "super admin = admin everywhere" rule lives only in the view. No app codes it; a new app is covered the moment it has an `is_admin` role.
- The portal's `getUserContext` resolves role from the Auth DB (view, app `portal`) instead of `profiles`; a Cuenta keeps its identity link and ficha link but no longer carries access. `hasAccess` = an effective portal Acceso exists.
- Unlinked Cuentas (`profiles.auth_user_id` null) can't hold an Acceso row; they keep `profiles.role` as a one-shot seed consumed at first-login auto-link, then the column is dropped once none remain.
- In-app grants (portal access requests, `canGrantTier`, facturación) write the Auth DB. The rank rule, "you may grant only roles ranked below yours in your app; super admins grant anything", replaces `canGrantTier`.
- Super admin can be granted and revoked only from `/usuarios`, and the last super admin can't be demoted.
- `auth_app` holds no URLs: hosts differ per environment and stay in portal config.
- `/access` is replaced by `/usuarios` on the apex; the old path redirects.
