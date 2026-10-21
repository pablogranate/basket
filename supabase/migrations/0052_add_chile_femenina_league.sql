-- 0052: Add the external league Chile Femenina so /teams gets its tab.
-- Euroliga already exists since 0026. Idempotent.

insert into public.leagues (name, slug, color, sort_order, is_external) values
  ('Chile Femenina', 'chile-femenina', '#e0679b', 36, true)
on conflict (slug) do nothing;
