-- 0017: Per-assignment attendance confirmation (PRD #7).
-- Adds a nullable timestamp recording when the assigned person confirmed they
-- will attend the match. NULL = pending, a timestamp = confirmed.
--
-- Independent of assignments.confirmed (which means "reported" — auto-set true
-- when a collaborator submits a post-match report). Attendance is a pre-match
-- intent signal and must not collide with the report flow.
--
-- No trigger work needed: the auth.uid() metadata/audit triggers were dropped in
-- 0011 and audit is now written app-side via writeAudit(). Attendance toggles
-- deliberately skip writeAudit, so they never appear in the history timeline.
--
-- Idempotent: add-column-if-not-exists is safe to re-run.

alter table public.assignments
  add column if not exists attendance_confirmed_at timestamptz;
