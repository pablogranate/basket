-- 0046: fixtures come from several feeds (two CABB accounts, acb.com,
-- Flashscore). `source` names the feed a row came from so a sync only deletes
-- the rows of the feeds it fetched completely. Existing rows are CABB; the
-- split between the two accounts follows the competitions each one holds, and
-- the next sync rewrites it anyway. Idempotent.

alter table public.fixtures add column if not exists source text;

update public.fixtures
set source = case
  when competition ~* '^(LIGA NACIONAL|LIGA ARGENTINA|LIGA FEMENINA|LIGA DE DESARROLLO)' then 'cabb-adc'
  else 'cabb-cab'
end
where source is null;

alter table public.fixtures alter column source set not null;

create index if not exists fixtures_source_match_date_idx on public.fixtures (source, match_date);
