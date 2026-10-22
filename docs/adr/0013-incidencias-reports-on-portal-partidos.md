---
status: accepted
---
# Incidencias moves into the Domain DB and reports on the portal's Partidos

Incidencias leaves Supabase for its own `incidencias` schema inside the Domain DB (`basket_portal` on `basket-portal-db`). An incidencia keeps only the report: every fact about the game comes from `public.matches`, its assignments and `public.profiles`. The portal's own report, `collaborator_reports` and its form in `/mi-jornada`, is dropped — it had no rows in prod, and an incidencia is the same report. This narrows ADR 0012: incidencias stops being a reader of the Catálogo publicado and becomes a writer of the Partidos it creates by hand.

An audit of prod on 2026-10-13 drove the decision. Of 3,979 incidencias, 1,191 already pointed at a portal Partido through the production code; on those, liga, fecha, local and visitante were the portal's facts retyped (same date in 1,161), the streamer was the match's Realizador (452 of 459 rows where the name matched exactly), and `operador_nombre` was a hardcoded list standing for the Operador de Control. Keeping those columns would have kept a second, drifting copy of the game.

## Decisions

- **Every Partido lives in `public.matches`**, tagged by a new `source`: `grilla` (the portal sync), `manual` (created by hand in either app). Argentine games come from the Grilla; manual creation stays allowed; international games are always manual.
- **The Grilla adopts a manual Partido whose production code it lists on the same day** (amended 2026-10-22). The sync sets it to `grilla` and from then on owns its fields and assignments, as with any Grilla row. An operator often reports in incidencias before the game reaches the sheet; without adoption that Partido stayed manual for good and the sheet's crew never reached it (31673, Argentina vs Neuquén). A manual Partido matched only by teams and kickoff, or by its code on another day, is left alone with a warning.
- **The Grilla sync deletes only `source = 'grilla'` rows.** Today its delete pass removes every match in the 30-day window that the sheet does not list, which would erase manual Partidos (and already does to the portal's own hand-made ones).
- **Incidencias writes Partidos.** Its database role may insert into `matches` and `assignments`, and update only `source = 'manual'` rows; Grilla rows stay read-only to it. Anyone whose Acceso lets them write in incidencias may create and edit a manual Partido. "Nuevo partido" becomes "pick a Partido"; when none exists the operator creates one (liga, kickoff, teams, production mode, Realizador, Operador de Control) and then reports on it.
- **Incidencias keeps its own schema and role.** `incidencias.incidencias` holds `match_id`, the report fields, `envios_senal`, `estado` and the audit columns. `incidencias.profiles` is dropped in favour of `public.profiles`. Each repo's drizzle-kit manages only its own schema (`schemaFilter`).
- **History is imported, not archived.** The 2,788 incidencias without a portal Partido (2,136 before May 2026, when the portal's matches start; 618 international since; 34 Argentine since) become `manual` Partidos at migration, so every incidencia has one shape. Their dates are in the past, so no sync can delete them.
- **Manual Partidos keep incidencias' time:** fecha and hora are entered and read in `America/Argentina/Buenos_Aires`, the zone the Grilla sync already uses, and stored as `kickoff_at` with that `timezone`.
- **Region is the league's.** `region` is derived from `leagues.is_external`; the leagues incidencias uses that the portal lacks are added, and spelling variants are merged into existing ones.
- **Speedtest photos move to the server's disk**, served next to the app; stored URLs are rewritten at migration.

## Considered Options

- **Own container for incidencias, catalog through a second connection** (ADR 0012 as written): isolation, but the game would still be typed by hand in incidencias, and joins with the catalog happen in code.
- **Keep the game fields in incidencias as a fallback for games not in the portal**: least disruptive, but a third of the games keep an uncontrolled copy of their facts.
- **Archive pre-portal history in a read-only table**: keeps the portal's grid free of January–April 2026, at the cost of a second shape for 2,788 rows. Rejected for the single model; the portal loads that history on demand instead.

## Consequences

- The portal's grid, reports and analytics will see Partidos before May 2026 and international ones they never showed. Imported history loads on demand: default views and aggregates leave it out, and it is fetched only when someone asks for that period.
- `matches` now has two writers. The portal stays the owner of its schema; a change to the columns incidencias writes is a change incidencias must absorb.
- Restoring `basket_portal` restores incidencias too; use `pg_dump -n` per schema when one app must be restored alone.
- Login stays on the Auth DB (ADR 0002, ADR 0009).
