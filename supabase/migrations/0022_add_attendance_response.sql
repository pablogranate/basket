-- 0022: Tri-state attendance response with optional decline reason (extends PRD #7).
-- 0017 added attendance_confirmed_at as a binary signal (NULL = pending, a
-- timestamp = will attend). That can't represent an explicit "No asistiré".
--
-- This adds:
--   attendance_response  'attending' | 'declined' | NULL (pending)  -- source of truth
--   attendance_note      free-text cause supplied when declining (optional)
--
-- attendance_confirmed_at is retained as the decision timestamp and stays in sync:
-- set to now() when the person confirms attendance, NULL otherwise. Existing
-- "confirmed attendance" counters (summarizeAttendance) keep working unchanged.
--
-- Like 0017, attendance toggles are written app-side and deliberately skip
-- writeAudit, so they never appear in the match history timeline.
--
-- Idempotent: add-column-if-not-exists is safe to re-run.

alter table public.assignments
  add column if not exists attendance_response text
    check (attendance_response in ('attending', 'declined')),
  add column if not exists attendance_note text;
