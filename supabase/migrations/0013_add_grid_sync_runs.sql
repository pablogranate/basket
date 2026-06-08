-- Audit log for grilla (grid) sync runs.
-- Each row is one sync attempt (manual button or 6-hour cron). Powers the
-- "última sync" label in the UI and the cron restart-guard (skip if a success
-- started recently). Written only by the server-only sync engine (service role).
-- RLS was dropped in 0011; authorization is enforced in the app layer.

create table if not exists public.grid_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,                 -- 'cron' | 'manual'
  status text not null,                  -- 'success' | 'error' | 'skipped'
  created_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  assignments_upserted int not null default 0,
  assignments_deleted int not null default 0,
  people_created int not null default 0,
  error text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create index if not exists grid_sync_runs_started_idx
  on public.grid_sync_runs (started_at desc);
