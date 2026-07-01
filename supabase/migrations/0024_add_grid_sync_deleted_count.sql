-- Track hard-deletes performed by the grid sync (matches removed from the
-- Google Sheet within the rolling 30-day window). Complements the existing
-- created/updated/skipped counters on grid_sync_runs.

alter table public.grid_sync_runs
  add column if not exists deleted_count int not null default 0;
