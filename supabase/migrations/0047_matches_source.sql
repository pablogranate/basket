-- 0047: where a Partido came from (ADR 0013). `grilla` rows are owned by the
-- Grilla sync; `manual` ones are made by hand in the portal or in incidencias,
-- and the sync never patches or deletes them. New rows default to `manual`:
-- only the sync writes `grilla`, so any other insert path is safe by default.
-- Existing rows: the sync never stamps created_by, so a row with a creator was
-- made by hand. Idempotent.

alter table public.matches add column if not exists source text;

update public.matches
set source = case when created_by is null then 'grilla' else 'manual' end
where source is null;

alter table public.matches alter column source set default 'manual';
alter table public.matches alter column source set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_source_check') then
    alter table public.matches
      add constraint matches_source_check check (source = any (array['grilla'::text, 'manual'::text]));
  end if;
end $$;
