alter table public.collaborator_reports
  add column if not exists sound_check boolean not null default false,
  add column if not exists internet_check boolean not null default false,
  add column if not exists camera_check boolean not null default false;
