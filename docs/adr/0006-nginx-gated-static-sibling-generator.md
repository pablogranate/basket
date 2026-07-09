# Generator is an nginx-gated static sibling, not a Better Auth instance

Every sibling app under `*.basket-app.com` runs its own Better Auth instance against the shared `basket_auth` DB — except the generator. It is a fully static browser tool (one `index.html`, no backend, no `package.json`), so instead of bolting a Node server onto it just to validate sessions, its app gate is enforced in front of it: nginx serves the files directly (`root`, no node process) and `auth_request` calls the portal's `GET /api/gates/generator`, which checks the shared session plus the full-access role set (admin/editor/coordinator). 401 redirects to portal login, 403 to portal `/no-access`.

## Considered Options

- **Own Better Auth instance** (the sibling pattern): would keep the pattern uniform but forces a `package.json`, node_modules, an auth-DB connection and a pm2 process onto a repo whose whole value is being dependency-free static files.
- **Hand-rolled cookie verification** in the existing 28-line static server: reimplements Better Auth internals, breaks silently on upgrades.
- **nginx `auth_request` → portal gate** (chosen): generator stays zero-code; costs a coupling — if portal is down, generator is down.

## Consequences

- The generator repo contains no auth code at all; do not "fix" this by adding some. The gate lives in portal (`/api/gates/[app]`) and the nginx server block.
- Every request path is protected, including images; nginx caches the auth subrequest (key: cookie, TTL 60s, mirroring portal's `cookieCache`) so asset storms don't hammer portal.
- The `/api/gates/[app]` endpoint is generic — a future sibling that also can't run Better Auth (e.g. another static tool) is one allowlist entry away.
- Gate endpoint must never live under `/api/auth/*`: the Better Auth catch-all route owns that prefix.
