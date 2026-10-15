-- 0049: a merged ficha remembers which person absorbed it. The Grilla sync
-- matches people by name and resurrects soft-deleted ones, so without this a
-- merge whose old name is still in the sheet was undone on the next run: the
-- old row came back and took its upcoming assignments with it.
-- Backfill: past merges are recorded in the access-request approval audit.
-- Rows already resurrected by the sync are merged again (their history moved
-- back to the survivor, soft-deleted once more). Idempotent.

alter table public.people
  add column if not exists merged_into_id uuid references public.people(id) on delete set null;

create index if not exists people_merged_into_id_idx
  on public.people (merged_into_id)
  where merged_into_id is not null;

update public.people p
set merged_into_id = (merge.after->>'person_id')::uuid
from (
  select distinct on (after->>'merged_person_id') after
  from public.audit_log
  where table_name = 'access_requests'
    and coalesce(after->>'merged_person_id', '') <> ''
    and coalesce(after->>'person_id', '') <> ''
    and after->>'merged_person_id' <> after->>'person_id'
  order by after->>'merged_person_id', created_at desc
) merge
where p.id = (merge.after->>'merged_person_id')::uuid
  and p.merged_into_id is null
  and exists (select 1 from public.people s where s.id = (merge.after->>'person_id')::uuid);

update public.assignments a
set person_id = p.merged_into_id, updated_at = timezone('utc'::text, now())
from public.people p
where a.person_id = p.id and p.merged_into_id is not null;

update public.matches m
set owner_id = p.merged_into_id
from public.people p
where m.owner_id = p.id and p.merged_into_id is not null;

update public.notification_logs n
set person_id = p.merged_into_id
from public.people p
where n.person_id = p.id and p.merged_into_id is not null;

update public.people
set deleted_at = timezone('utc'::text, now()), active = false, profile_id = null
where merged_into_id is not null and deleted_at is null;
