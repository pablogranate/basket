-- 0016: Fold legacy role values into the three-role model (relabel-only milestone).
-- coordinator -> editor (Productor); viewer -> collaborator (Externo).
-- Touches stored profiles.role values ONLY. The public.app_role enum is left
-- intact on purpose: legacy labels stay valid types but hold zero rows after this.
-- 'viewer' also remains the in-code sentinel returned by getUserContext for
-- authenticated-but-unprovisioned users (hasAccess:false) — that is a runtime
-- return value, never a stored row, so this migration does not affect it.
-- Idempotent: plain conditional UPDATEs are safe to run more than once.
-- Non-reversible: the fold is lossy (coordinator/viewer cannot be re-split), so
-- there is no down migration.

update public.profiles
set role = 'editor'
where role = 'coordinator';

update public.profiles
set role = 'collaborator'
where role = 'viewer';
