-- 0050: "Liga Próximo" is now called "Liga Desarrollo". Only the display name
-- changes; the slug stays `liga-proximo` so memberships, fixtures and the
-- competition resolver keep pointing at the same row. Idempotent.

update public.leagues
  set name = 'Liga Desarrollo'
  where slug = 'liga-proximo'
    and name <> 'Liga Desarrollo';
