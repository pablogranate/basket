-- 0054: After 0050 renamed liga-proximo to "Liga Desarrollo", team writes
-- looked leagues up by slugify(name) and minted a second row, liga-desarrollo.
-- They are one league: move everything onto liga-proximo (the row the Grilla,
-- fixtures and team categories already use) and drop the duplicate.
-- Idempotent: does nothing once liga-desarrollo is gone.

do $$
declare
  keep_id uuid;
  dup_id uuid;
  ref record;
begin
  select id into keep_id from public.leagues where slug = 'liga-proximo';
  select id into dup_id from public.leagues where slug = 'liga-desarrollo';

  if keep_id is null or dup_id is null then
    return;
  end if;

  -- (team, league, season) is the key: a team in both rows keeps one membership.
  insert into public.team_league_memberships (team_id, league_id, season, created_at)
    select team_id, keep_id, season, created_at
    from public.team_league_memberships
    where league_id = dup_id
  on conflict do nothing;
  delete from public.team_league_memberships where league_id = dup_id;

  -- Every other column pointing at leagues, in any schema (matches,
  -- incidencias, ...).
  for ref in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.leagues'::regclass
      and c.conrelid <> 'public.team_league_memberships'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', ref.tbl, ref.col, ref.col)
      using keep_id, dup_id;
  end loop;

  update public.leagues
    set in_team_directory = in_team_directory
      or (select in_team_directory from public.leagues where id = dup_id)
    where id = keep_id;

  delete from public.leagues where id = dup_id;
end $$;
