-- Many-to-many person <-> team link ("Club").
-- A person can be responsible for / belong to one or more teams. Replaces the
-- legacy free-text "Equipos que cubre:" coverage stored in people.notes with a
-- proper FK relationship. Old free-text coverage remains readable as a fallback
-- (see src/lib/team-responsibles.ts) until a person is re-saved through the new
-- multi-select form, so no data is lost and no fragile text backfill is needed.
-- RLS was dropped in 0011; authorization is enforced in the app layer.

create table if not exists public.people_teams (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles(id) on delete set null,
  constraint people_teams_unique unique (person_id, team_id)
);

create index if not exists people_teams_person_idx on public.people_teams (person_id);
create index if not exists people_teams_team_idx on public.people_teams (team_id);
