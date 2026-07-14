-- Consolidate the two match identifier columns into a single production_code.
-- See ADR 0007. external_match_id (sheet sync + its unique dedup guard) and
-- production_code (manual modal + all UI reads) were two columns for one
-- concept; the sheet's col C is the production id. This migration keeps
-- production_code, backfills it from external_match_id, moves the uniqueness
-- guard onto it, and drops external_match_id.
--
-- ORDERING: run this AFTER the code that stops referencing external_match_id
-- is deployed, so the live app never inserts into a dropped column.

-- 1. Backfill the canonical column from the retired one (only where empty).
update public.matches
set production_code = external_match_id
where production_code is null
  and external_match_id is not null;

-- 2. Resolve duplicate production_code values before enforcing uniqueness.
--    Keep the earliest-created row per code; null the rest (data errors /
--    test placeholders). The grid sync re-populates in-window matches on its
--    next run from the sheet.
with ranked as (
  select id,
         row_number() over (
           partition by production_code
           order by created_at, id
         ) as rn
  from public.matches
  where production_code is not null
)
update public.matches m
set production_code = null
from ranked
where m.id = ranked.id
  and ranked.rn > 1;

-- 3. Swap the uniqueness guard from external_match_id to production_code.
drop index if exists matches_external_match_id_key;
drop index if exists matches_production_code_idx;
create unique index if not exists matches_production_code_key
  on public.matches (production_code)
  where production_code is not null;

-- 4. Drop the retired column.
alter table public.matches
  drop column if exists external_match_id;
