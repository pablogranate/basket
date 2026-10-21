---
status: accepted
---
# A league's slug is its identity; its name can be renamed from /teams

Editors can now create leagues and rename them from `/teams`. Until now the code treated the league's name as its key: `/teams` tabs came from two hardcoded name lists plus the leagues seen in memberships, team writes found a league by slugifying the name they were given, and tab and card colours were picked by matching fragments of the name. Renaming a row would have created a duplicate league on the next drag, left a ghost tab under the old name and dropped the tab's colour. Migration 0050 (Liga Próximo → Liga Desarrollo) already showed the cost: every name-keyed lookup had to be patched by hand.

## Decisions

- **The slug never changes.** A rename updates `leagues.name` only. Memberships, matches, fixtures and the Catálogo publicado keep pointing at the same row.
- **One module owns leagues.** `src/lib/leagues/leagues.ts` (server-only) finds leagues by name (ignoring case, accents and spacing), falls back to the slug of that name so texts saved before a rename still resolve, and creates, renames and reorders them. `src/lib/leagues/league-name.ts` holds the name rules, shared by the dialog and the server. Team actions no longer query `leagues` themselves.
- **Which leagues get a tab lives in the table.** `leagues.in_team_directory` (migration 0053) replaces the hardcoded lists. A league also gets a tab while it has equipos. Creating a league that exists without a tab (one only the Grilla uses) turns its tab on instead of duplicating it.
- **Colours on /teams follow the slug.** Tabs carry their league's slug, and the existing name palette is read with the slug (`liga-nacional` → "liga nacional"), so every league keeps today's colour and a rename does not change it. Places that only have free text (the grid, incidencias) keep matching by name.
- **The Grilla sync falls back to the slug.** A sheet that still says "Liga Argentina" keeps resolving after the league is renamed.

## Considered Options

- **Make the slug the tab's value and the `?league=` parameter**: cleaner URLs that survive renames, but every consumer of `team.competition` (a " / "-joined list of names) would have to change. Deferred.
- **Store a colour per league and let editors pick it**: prototyped and dropped. Renaming should not touch colours, and `leagues.color` holds the Grilla's palette, which differs from the one `/teams` shows.
