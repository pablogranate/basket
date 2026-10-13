-- 0048: the /mi-jornada collaborator report flow is gone (basket#230); reports
-- of a broadcast live in incidencias (incidencias.incidencias). Run after #230
-- is deployed: the code before it still reads this table on the match page.
-- The table held 0 rows in prod on 2026-10-13.
-- Non-reversible on purpose.
drop table public.collaborator_reports;
