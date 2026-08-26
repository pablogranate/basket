-- Self-signup: applicant-initiated access requests approved by admin/productor.
-- Replaces the manual "productor creates the person and grants access" path.

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id text not null,
  email text not null,
  full_name text not null,
  phone text not null,
  funcion text not null,
  mensaje text,
  status text not null default 'pendiente',
  created_at timestamptz not null default timezone('utc'::text, now()),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  person_id uuid references public.people (id) on delete set null,
  constraint access_requests_status_check
    check (status in ('pendiente', 'aprobada', 'rechazada'))
);

create unique index if not exists access_requests_auth_user_id_key
  on public.access_requests (auth_user_id);

-- One request per email, ever (D-02). Case-insensitive so Ana@ and ana@ collide.
create unique index if not exists access_requests_email_lower_key
  on public.access_requests (lower(email));

create index if not exists access_requests_status_created_idx
  on public.access_requests (status, created_at desc);

-- Explicit account <-> person link (D-07). Nullable both ways: a person may
-- never log in, and a profile may never appear in the grilla.
alter table public.people
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create unique index if not exists people_profile_id_key
  on public.people (profile_id);

-- Backfill by exact (case-insensitive) email only. Name-only matches are left
-- unlinked on purpose and surface in the admin review list (D-09).
with ranked as (
  select
    p.id as person_id,
    pr.id as profile_id,
    row_number() over (
      partition by pr.id
      order by (p.deleted_at is null) desc, p.active desc, p.created_at
    ) as rn
  from public.people p
  join public.profiles pr on lower(pr.email) = lower(p.email)
  where p.email is not null and p.email <> ''
)
update public.people p
set profile_id = ranked.profile_id
from ranked
where ranked.person_id = p.id
  and ranked.rn = 1
  and p.profile_id is null;

-- Manual grant/revoke opt-out dies with the manual grant path (D-18).
alter table public.people
  drop column if exists access_revoked_at;

-- Purge emailless people with no history. person_functions is an import-era tag,
-- not history, so it is deleted with the row; the four real referrers block.
-- The predicate is repeated rather than staged in a temp table so the migration
-- runs statement-by-statement under psql without a wrapping transaction.
-- Snapshot first: the delete below is irreversible and the row counts differ per
-- environment. people_purged_0034 is the only way back if the predicate turns
-- out to be wrong in production.
create table if not exists public.people_purged_0034 as
select p.*
from public.people p
where coalesce(p.email, '') = ''
  and not exists (select 1 from public.assignments a where a.person_id = p.id)
  and not exists (select 1 from public.matches m where m.owner_id = p.id)
  and not exists (select 1 from public.notification_logs n where n.person_id = p.id)
  and not exists (select 1 from public.people_teams t where t.person_id = p.id);

create table if not exists public.person_functions_purged_0034 as
select f.*
from public.person_functions f
where f.person_id in (select id from public.people_purged_0034);

delete from public.person_functions
where person_id in (
  select p.id
  from public.people p
  where coalesce(p.email, '') = ''
    and not exists (select 1 from public.assignments a where a.person_id = p.id)
    and not exists (select 1 from public.matches m where m.owner_id = p.id)
    and not exists (select 1 from public.notification_logs n where n.person_id = p.id)
    and not exists (select 1 from public.people_teams t where t.person_id = p.id)
);

delete from public.people p
where coalesce(p.email, '') = ''
  and not exists (select 1 from public.assignments a where a.person_id = p.id)
  and not exists (select 1 from public.matches m where m.owner_id = p.id)
  and not exists (select 1 from public.notification_logs n where n.person_id = p.id)
  and not exists (select 1 from public.people_teams t where t.person_id = p.id);
