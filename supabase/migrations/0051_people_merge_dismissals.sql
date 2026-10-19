-- 0051: pairs of fichas an admin confirmed are different people. The
-- "Posibles fichas duplicadas" review pairs fichas by name, so "Juan Pérez" and
-- "Juan Pablo Pérez" would stay listed forever without this. One row per
-- unordered pair (person_id < other_person_id); a deleted ficha takes its rows.

create table if not exists public.people_merge_dismissals (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  other_person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  created_by uuid references public.profiles(id) on delete set null,
  constraint people_merge_dismissals_ordered check (person_id < other_person_id),
  constraint people_merge_dismissals_unique unique (person_id, other_person_id)
);
