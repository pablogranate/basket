-- 0045: link a Partido to its Partido de fixture (the CABB game it covers).
-- Set by the daily fixtures sync (src/lib/fixtures/sync.ts). A fixture row that
-- disappears from CABB is never deleted while a Partido points at it; a manual
-- delete only unlinks. Additive only. Idempotent.

alter table public.matches
  add column if not exists fixture_id text references public.fixtures (id) on delete set null;

create unique index if not exists matches_fixture_id_key
  on public.matches (fixture_id)
  where fixture_id is not null;
