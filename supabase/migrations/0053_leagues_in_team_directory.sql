-- 0053: Which leagues get a tab on /teams now lives in the leagues table, so
-- editors can create leagues there and rename them without a code change.
-- Seeded with the leagues the code used to list (core + external); a league
-- with equipos gets its tab anyway. Idempotent.

alter table public.leagues
  add column if not exists in_team_directory boolean not null default false;

update public.leagues
  set in_team_directory = true
  where not in_team_directory
    and name in (
      'Liga Nacional',
      'Liga Desarrollo',
      'Liga Argentina',
      'Liga Federal',
      'Liga Femenina',
      'Liga Metropolitana',
      'Liga Endesa (ACB)',
      'Liga BasquetPro (Ecuador)',
      'LNB Chile',
      'LUB (Uruguay)',
      'Liga Femenina Chile',
      'Euroliga'
    );
