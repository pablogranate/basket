-- Link people to a default role.
-- people.category stays as the raw label; people.role_id is the enforced FK to roles.
-- Backfill maps the primary category (first segment before '/') to a role by name.

alter table public.people
  add column if not exists role_id uuid references public.roles(id) on delete set null;

create index if not exists people_role_id_idx on public.people (role_id);

update public.people p
set role_id = r.id
from public.roles r
where p.role_id is null
  and p.category is not null
  and r.name = trim(split_part(p.category, '/', 1));
