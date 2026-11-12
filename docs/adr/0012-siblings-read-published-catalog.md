---
status: accepted
---
# Siblings read the portal's published catalog instead of keeping their own copies

Clubs, equipos, leagues and games were being copied into every sibling: ops hub imports its own clubs and fixture from spreadsheets (creating clubs by name), incidencias types the match id by hand with nothing checking it, and analytics syncs the same Grilla the portal already syncs. Each copy drifts and none shares an id. We decided that the portal is the only owner of the catalog — Partidos (keyed by the Grilla's ID column, ADR 0007), Partidos de fixture, Clubs, Equipos, Ligas and Ediciones — and publishes it as read-only views in the Domain DB. Siblings connect with a read-only role that can see those views and nothing else, store the portal's ids, and stop keeping their own copies. This replaces the "no sibling reads the portal's database" rule stated in ADR 0011.

## Considered Options

- **One database for every app, a schema per context**: removes copies and gives real foreign keys, but means leaving Supabase for two apps, merging four databases and reconciling every duplicate at once — months of work for internal apps that work today. Deferred until a cross-app report, a real duplication mistake, or growth calls for it.
- **A portal HTTP API**: a new contract to version, a second server-to-server auth path, and the portal on the critical path of every sibling page — the same reasons ADR 0009 rejected one for Accesos.
- **Keep copies, sync them from the portal**: still two copies of each fact, plus a sync job per sibling to keep them honest.

## Consequences

- The views are the contract. The portal may reshape its tables freely, but a change to what the views show is a change every reader must absorb.
- References from siblings to the catalog are ids with no foreign key, since each app keeps its own database. A sibling validates an id against the views when it is entered (incidencias picks a Partido instead of typing a number).
- Every sibling server runs on the same VPS, so the read-only connection stays on loopback; incidencias and ops hub keep their own data on Supabase and add only this second connection.
- Login (Auth DB) stays on its own instance, as in ADR 0002.
