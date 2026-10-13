-- 0048: the collaborator's report on /mi-jornada is gone (ADR 0013). The
-- incidencia, filed in incidencias against the portal's Partido, is the one
-- incident report. The table had 0 rows in prod on 2026-10-13, so nothing is
-- lost. Apply after the code that read it is deployed. Idempotent.

drop table if exists public.collaborator_reports;
