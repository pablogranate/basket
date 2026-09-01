-- 0038: Club directory fields — siglas, city/province and per-contact
-- phone/email for Responsable de Cancha and Jefe de Prensa. Idempotent.

alter table public.clubs
  add column if not exists short_name text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists manager_phone text,
  add column if not exists manager_email text,
  add column if not exists press_manager text,
  add column if not exists press_phone text,
  add column if not exists press_email text;
