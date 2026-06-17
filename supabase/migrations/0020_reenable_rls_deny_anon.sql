-- 0020: Re-enable RLS as a deny-by-default backstop for the anon role (Option B).
--
-- Context: since 0011/0015, Better Auth is the sole auth provider and Supabase
-- issues no session JWT, so auth.uid()/auth.jwt() are always NULL and the old
-- identity-based policies were dropped. The NEXT_PUBLIC anon key still ships in
-- the browser bundle, so with RLS disabled anyone could hit the Supabase REST
-- API directly and bypass every app-layer guard.
--
-- This migration closes that hole: enable RLS on every domain table and create
-- NO permissive policies. Effect: the anon (and authenticated) Postgres roles
-- are denied all access; the service_role used by the server bypasses RLS.
-- Authorization stays fully in the app layer (withAuth / requireEditor /
-- requireUserContext) — RLS is a network-edge backstop, not the authz mechanism.
--
-- Prerequisite: all server-side domain access must go through the service-role
-- client (see src/lib/supabase/server.ts). Idempotent: enabling RLS twice is safe.

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.roles enable row level security;
alter table public.person_functions enable row level security;
alter table public.matches enable row level security;
alter table public.assignments enable row level security;
alter table public.audit_log enable row level security;
alter table public.announcements enable row level security;
alter table public.collaborator_reports enable row level security;
alter table public.app_settings enable row level security;
alter table public.club_contacts enable row level security;
alter table public.grid_sync_runs enable row level security;
alter table public.notification_logs enable row level security;
