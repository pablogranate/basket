-- 0018: Per-match auto-notification marker (match-day 12:30 ARG blast).
-- Set once when the 12:30 ARG auto-notification has been attempted for this
-- match. NULL = not yet auto-notified.
--
-- One-shot idempotency gate for runMatchDayNotifications(): the select filters
-- on day_notified_at IS NULL, and the marker is stamped after a single full send
-- attempt (regardless of per-recipient failures) so the catch-up tick never
-- re-blasts an already-attempted match.
--
-- Independent of the MANUAL send path (src/app/actions/notifications.ts), which
-- does not touch this column.
--
-- Idempotent: add-column-if-not-exists is safe to re-run.

alter table public.matches
  add column if not exists day_notified_at timestamptz;

comment on column public.matches.day_notified_at is
  'Set once when the 12:30 ARG auto-notification has been attempted for this match. NULL = not yet auto-notified.';
