-- 0027: Club fields needed by the teams directory UI (responsable + enlace oficial),
-- previously stored only in browser localStorage.

alter table public.clubs
  add column if not exists manager text,
  add column if not exists official_url text;
