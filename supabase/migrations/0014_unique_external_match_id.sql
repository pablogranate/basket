-- Enforce that external_match_id is unique across matches.
-- The grid sync and manual match entry both write this id; the same source
-- match must never be stored twice. NULLs stay allowed (matches without an id).
--
-- NOTE: if duplicate external_match_id values already exist, this index
-- creation will fail. Clean up the duplicates first, then re-run.

drop index if exists matches_external_match_id_idx;

create unique index if not exists matches_external_match_id_key
  on public.matches (external_match_id)
  where external_match_id is not null;
