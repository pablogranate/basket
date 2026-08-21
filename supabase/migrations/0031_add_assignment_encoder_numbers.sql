-- 0031: Encoder number(s) reported by the person on the ground.
-- "Responsable de cancha" (role `Responsable`) and `Soporte tecnico` are the two
-- roles that physically see the encoder rack, so they are the only ones asked
-- for its number. A venue can run two encoders, hence two slots; the second is
-- optional and only meaningful when the first is set.
--
-- Written from /mi-jornada by the assigned person alongside (or after) their
-- attendance confirmation. Like the attendance columns (0017, 0022) these
-- writes deliberately skip writeAudit, so they never appear in the match
-- history timeline.
--
-- Idempotent: add-column-if-not-exists is safe to re-run.

alter table public.assignments
  add column if not exists encoder_number_1 integer
    check (encoder_number_1 between 1 and 9999),
  add column if not exists encoder_number_2 integer
    check (encoder_number_2 between 1 and 9999);
