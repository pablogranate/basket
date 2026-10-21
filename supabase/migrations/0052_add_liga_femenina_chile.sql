-- 0052: Add the external league Liga Femenina Chile. Euroliga already exists
-- (seeded in 0026); both get a /teams tab via EXTERNAL_TEAM_LEAGUES. Idempotent.

insert into public.leagues (name, slug, color, sort_order, is_external)
select 'Liga Femenina Chile', 'liga-femenina-chile', '#e5579b',
  coalesce(max(sort_order), 0) + 1, true
from public.leagues
on conflict (slug) do nothing;
