# Basket-App Portal

Glossary for the portal's domain language. Implementation lives in code; this file is vocabulary only.

## Language

### Unified auth

**Sibling app**:
Any app living on a `basket-app.com` subdomain (portal, analytics, incidencias, generator) plus the apex directory. Siblings share one identity — a user logs in once and is recognized everywhere — but each app decides on its own who may enter.
_Avoid_: sub-app, satellite app

**App gate**:
The per-app authorization decision, answering "may this identity use this app?". Identity being valid says nothing about access; every sibling app applies its own gate. The generator's gate admits full-access roles only.
_Avoid_: access check, permission check (too generic)

**Full-access role**:
The portal roles admin, editor and coordinator — people who see the whole dashboard. Collaborators and viewers are not full-access. The generator gate reuses this exact set.
_Avoid_: staff role, elevated role

**Generator**:
The promotional-image generator at `generator.basket-app.com` — a static browser tool with no backend of its own. It carries no auth code; its gate is enforced in front of it, not inside it.
_Avoid_: image generator app (when the sibling is meant)

### Data ownership

**Domain DB**:
The database holding portal's own data — matches, people, teams, grid, reports. Portal is its only reader and writer; no sibling app, bot, or workflow touches it. Distinct from the Auth DB.
_Avoid_: "the database" (ambiguous), portal DB (when the Auth DB might be meant)

**Auth DB**:
The shared identity store consulted by every sibling app's gate — sessions and users live here, domain data never does. Its availability gates login for all siblings, so it changes rarely and deliberately, unlike the weekly-churning Domain DB.
_Avoid_: user DB, sessions DB

### Notifications

**Send time**:
The instant a match's assigned people are notified, computed per match from its kickoff clock time in Argentina time (noon-inclusive): kickoff at or after 12:00 → 11:00 the same day; kickoff before 12:00 → 22:00 the day before. An hourly tick fires every match whose send time has passed; `day_notified_at` marks a match as already notified so it is not sent twice.
_Avoid_: notification time, blast time

**Enviar notificación a todos**:
The manual per-match action (match detail header) that immediately sends WhatsApp + email to every current assignee, behind a confirmation dialog. It always sends regardless of whether the automatic send already fired, and (re)stamps `day_notified_at`.

### Reports (grid statistics)

**Asignación contada**:
For statistics, an assignment counts only when a person fills the slot — a slot row with no person is not an assignment. All statuses of match count equally (Pendiente, Confirmado, Realizado) and the `confirmed` flag is ignored: confirmation is attendance workflow, not assignment fact.
_Avoid_: slot (when the filled sense is meant)

**Veces asignada**:
How many distinct matches a person appears in within a period — not how many slot rows. A person holding two roles in one match was assigned once.

### Grid sync

**Local**:
The home team of a match. Source of truth is the `Local` column in the "Grilla Producción 25/26" Google Sheet. Maps to `matches.home_team`. A row with a blank `Local` is not a real match (spacer/empty) and is skipped by the sync.
_Avoid_: home (in Spanish-facing copy), equipo local

**Visitante**:
The away team of a match. Source of truth is the `Visitante` column in the sheet. Maps to `matches.away_team`.
_Avoid_: away (in Spanish-facing copy), equipo visitante

**Sync window**:
The rolling 30-day span the grid sync operates on: `[start-of-today, start-of-today + 30 days)`, evaluated in the sheet timezone (`America/Argentina/Buenos_Aires`). The sync fetches whichever month tabs that span touches (1–3 tabs) and only creates/updates matches whose kickoff falls inside it. Matches before today or beyond the horizon are left untouched.
_Avoid_: sync range, sync horizon

**Plan de sync**:
The pure, computed outcome of a grid sync before anything is written: matches to create/update/delete, assignment changes, people to create or resurrect, plus errors and warnings. What the manual sync previews and what the apply step executes. A warning (e.g. a person assigned a función they don't hold in the portal) never blocks; an error (duplicate production code) excludes its rows and cancels the delete pass.
_Avoid_: dry-run (the plan is also the real input to apply), diff (too generic)

**Partido** (retired):
The legacy single sheet column that held both teams as `"Local vs Visitante"`, split apart at parse time. Retired as of the Julio 26 tab — the sheet now ships `Local` and `Visitante` as separate columns. No longer read by the sync, and tabs before Julio 26 are never fetched.

### Clubs and teams

**Club**:
The institution — its name, crest, stadium, manager and social links. Identity lives here and is shared across every category it fields. One club per name (`clubs.name` is unique).
_Avoid_: equipo (when the institution is meant), team (in Spanish-facing copy)

**Equipo**:
A club in one category (`mayores`, `proximo`, `femenino`) — a club fielding both a first and a women's squad is two equipos, one club. This, not the club, is what a person is linked to and what `/teams` lists. A bare club name means its `mayores` equipo.
_Avoid_: club (when the category-level entity is meant)

**Alias de club**:
An alternative spelling that resolves to a club already loaded — `Atlético Pilar` for `Club Atlético Pilar`. Recorded when an operator confirms two names are the same club during a contacts sync, and honoured everywhere a club name is read afterwards. An alias belongs to exactly one club.
_Avoid_: sinónimo, nombre alternativo

**Listas**:
The tab of the production spreadsheet holding the two controlled vocabularies the contacts sheet validates against: `Funciones` in column A and `Clubes` in column B. Column B is the source of truth for which clubs exist — a name there that the portal does not know is a team to create, not an error.
_Avoid_: ClubesValidos (that is the named range inside the tab, not the tab)

**Equipo incompleto**:
An equipo created from `Listas` with nothing but its name: no league membership, no crest, no stadium. It is a real equipo people can be linked to, but it shows in `/teams` only with no league filter applied, until an editor fills it in.
_Avoid_: equipo provisorio, borrador
