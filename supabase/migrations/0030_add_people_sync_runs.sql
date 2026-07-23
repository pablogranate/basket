-- History of people (contacts) syncs pulled from the "Contactos" tab of the
-- production spreadsheet. One row per manual run (there is no cron for this
-- sync). Mirrors grid_sync_runs but with people-specific counters plus a
-- warnings array for per-row, non-fatal issues (unknown función/club, duplicate
-- name, missing email). Admin-only read, enforced in the app layer (no RLS).

create table if not exists public.people_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  status text not null,
  created_count int not null default 0,
  updated_count int not null default 0,
  deleted_count int not null default 0,
  restored_count int not null default 0,
  skipped_count int not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create index if not exists people_sync_runs_started_idx
  on public.people_sync_runs (started_at desc);
