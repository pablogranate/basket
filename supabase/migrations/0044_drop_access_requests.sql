-- 0044: contract step of moving Solicitudes to the Auth DB (basket#204, ADR
-- 0011). Run after #198–#200 are deployed and the status counts of
-- access_requests match auth_access_request WHERE app = 'portal'.
-- Non-reversible on purpose: the Auth DB is the only home of the Solicitud now.
drop table public.access_requests;
