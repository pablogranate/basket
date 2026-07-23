-- Soft delete for people. A person removed from the "Contactos" sheet tab gets
-- deleted_at stamped (and platform access revoked) by the people sync instead of
-- being hard-deleted, so assignment history and audit trail survive. Every
-- people read path filters deleted_at IS NULL; the admin hard-delete action stays
-- for true cleanup. The existing `active` boolean is a separate concept
-- (assignable toggle) and is untouched. RLS was dropped in 0011.

alter table public.people
  add column if not exists deleted_at timestamptz;
