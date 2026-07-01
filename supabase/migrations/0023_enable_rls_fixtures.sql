-- 0023: Close RLS gap on public.fixtures (rls_disabled_in_public).
--
-- The fixtures table (0018) was never added to 0020's deny-by-default backstop,
-- so with RLS disabled the NEXT_PUBLIC anon key could read/write it directly via
-- the Supabase REST API, bypassing every app-layer guard.
--
-- Same Option B pattern as 0020: enable RLS, create NO permissive policies. The
-- anon/authenticated Postgres roles are denied all access; service_role (server)
-- bypasses RLS. Authorization stays in the app layer. Idempotent.

alter table public.fixtures enable row level security;
