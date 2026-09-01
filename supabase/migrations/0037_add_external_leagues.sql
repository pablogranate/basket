-- 0037: Add external leagues Liga BasquetPro (Ecuador), LNB Chile and
-- LUB (Uruguay). Liga Endesa already exists as 'Liga Endesa (ACB)'. Idempotent.

insert into public.leagues (name, slug, color, sort_order, is_external) values
  ('Liga BasquetPro (Ecuador)', 'liga-basquetpro-ecuador', '#f2c53d', 33, true),
  ('LNB Chile', 'lnb-chile', '#d03a2f', 34, true),
  ('LUB (Uruguay)', 'lub-uruguay', '#75aadb', 35, true)
on conflict (slug) do nothing;
