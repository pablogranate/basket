-- Platform access is granted by default (on create, on edit, and on every
-- people sync). This column is the only thing that keeps a person out: it is
-- stamped when a manager explicitly revokes access from the people modal, and
-- cleared when a manager grants it again.
alter table public.people
  add column if not exists access_revoked_at timestamptz;

comment on column public.people.access_revoked_at is
  'Set when a manager explicitly revokes platform access from the people modal. While set, no create/edit/sync path re-grants access.';
