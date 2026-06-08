-- Many-to-many person capabilities ("functions").
-- A person performs one or more canonical functions; grid columns are granular slots
-- (Camara 1..5, Comentario 1/2) that collapse onto these functions for picker filtering.
-- function_key is app-canonical text guarded by a CHECK mirroring src/lib/functions.ts PERSON_FUNCTIONS.
-- RLS was dropped in 0011; authorization is enforced in the app layer.

create table if not exists public.person_functions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  function_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles(id) on delete set null,
  constraint person_functions_unique unique (person_id, function_key),
  constraint person_functions_key_check check (function_key in (
    'Responsable','Realizador','Operador de Control','Operador de Grafica',
    'Soporte tecnico','Productor','Relator','Comentario','Campo','Encoder',
    'Ingenieria','Camara'
  ))
);

create index if not exists person_functions_person_idx on public.person_functions (person_id);
create index if not exists person_functions_key_idx on public.person_functions (function_key);

-- Backfill 1: from people.category (multi-skill, '/'-separated raw labels).
insert into public.person_functions (person_id, function_key)
select p.id, fk.key
from public.people p
cross join lateral unnest(string_to_array(coalesce(p.category, ''), '/')) as seg(raw)
cross join lateral (
  select case
    when lower(btrim(seg.raw)) like 'camara%'   then 'Camara'
    when lower(btrim(seg.raw)) like 'cámara%'    then 'Camara'
    when lower(btrim(seg.raw)) like 'comentar%'  then 'Comentario'
    when lower(btrim(seg.raw)) = 'relator'       then 'Relator'
    when lower(btrim(seg.raw)) = 'realizador'    then 'Realizador'
    when lower(btrim(seg.raw)) = 'productor'     then 'Productor'
    when lower(btrim(seg.raw)) = 'responsable'   then 'Responsable'
    when lower(btrim(seg.raw)) like 'control%'   then 'Operador de Control'
    when lower(btrim(seg.raw)) like '%grafica%'  then 'Operador de Grafica'
    when lower(btrim(seg.raw)) like '%gráfica%'  then 'Operador de Grafica'
    when lower(btrim(seg.raw)) like 'soporte%'   then 'Soporte tecnico'
    when lower(btrim(seg.raw)) like 'tecnico%'   then 'Soporte tecnico'
    when lower(btrim(seg.raw)) = 'campo'         then 'Campo'
    when lower(btrim(seg.raw)) = 'encoder'       then 'Encoder'
    when lower(btrim(seg.raw)) = 'ingenieria'    then 'Ingenieria'
    else null
  end as key
) fk
where fk.key is not null
on conflict (person_id, function_key) do nothing;

-- Backfill 2: from existing assignments (strongest signal of what a person actually does).
-- A person assigned to "Camara 3" demonstrably performs "Camara".
insert into public.person_functions (person_id, function_key)
select distinct a.person_id,
  case
    when r.name ~* '^Camara[[:space:]]*[0-9]+$'     then 'Camara'
    when r.name ~* '^Comentario[[:space:]]*[0-9]+$' then 'Comentario'
    else r.name
  end as key
from public.assignments a
join public.roles r on r.id = a.role_id
where a.person_id is not null
  and (
    r.name ~* '^Camara[[:space:]]*[0-9]+$'
    or r.name ~* '^Comentario[[:space:]]*[0-9]+$'
    or r.name in ('Responsable','Realizador','Operador de Control','Operador de Grafica',
                  'Soporte tecnico','Productor','Relator','Campo','Encoder','Ingenieria')
  )
on conflict (person_id, function_key) do nothing;
