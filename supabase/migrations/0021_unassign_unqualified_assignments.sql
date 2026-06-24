-- One-time cleanup: unassign any assignment whose person does not hold the
-- function required by the role. This mirrors the strict capability filter now
-- enforced in the assignment dropdowns and the server actions
-- (src/app/actions/matches.ts), so the "assigned => qualified" invariant holds
-- for existing data too. Applies to all matches, past and future.
--
-- Role -> function mapping matches roleNameToFunctionKey in src/lib/functions.ts:
-- "Camara 1".."Camara 5" collapse to "Camara"; "Comentario 1"/"Comentario 2"
-- collapse to "Comentario"; every other role maps by exact name.
--
-- "Unassign" = null out person_id (the row remains; the grid renders it as an
-- empty "Sin asignar" slot). notes/confirmed history on the row is left intact.

update assignments as a
set
  person_id = null,
  updated_at = now()
from roles as r
where a.role_id = r.id
  and a.person_id is not null
  and not exists (
    select 1
    from person_functions as pf
    where pf.person_id = a.person_id
      and pf.function_key = case
        when r.name ~* '^Camara\s*\d+$' then 'Camara'
        when r.name ~* '^Comentario\s*\d+$' then 'Comentario'
        else r.name
      end
  );
