-- 0019: Per-recipient notification delivery log.
-- One row per recipient per channel for every notification send, automatic
-- (match-day 12:30 ARG blast) and manual (per-match WhatsApp button).
--
-- Observability only: writing a row never affects whether a notification is
-- sent. FKs are ON DELETE SET NULL and the display fields are snapshotted as
-- text so the audit record survives deletion of a match or person.
--
-- No RLS (consistent with 0011 dropping RLS; authorization is app-layer — the
-- log is read only through the admin-gated /notifications/logs page).
--
-- Idempotent: create-if-not-exists is safe to re-run.

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  match_id uuid references public.matches (id) on delete set null,
  person_id uuid references public.people (id) on delete set null,
  match_label text not null default '',
  recipient_name text not null default '',
  role_names text[] not null default '{}',
  channel text not null check (channel in ('whatsapp', 'email', 'none')),
  destination text,
  status text not null check (status in ('sent', 'failed', 'skipped', 'no_contact')),
  error text,
  trigger text not null check (trigger in ('cron', 'catchup', 'boot', 'manual'))
);

create index if not exists notification_logs_created_at_idx
  on public.notification_logs (created_at desc);

create index if not exists notification_logs_status_idx
  on public.notification_logs (status);

comment on table public.notification_logs is
  'Per-recipient-per-channel delivery log for match notifications (auto + manual). Snapshots survive match/person deletion.';
