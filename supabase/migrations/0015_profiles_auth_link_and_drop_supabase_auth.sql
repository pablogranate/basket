-- 0015: Link profiles to Better Auth + drop Supabase-Auth coupling (Phase 3 / D-04/D-05/D-06).
-- Better Auth becomes the sole auth provider. profiles is linked by email -> auth_user_id;
-- profiles.id stays unchanged (FK target for audit_log.changed_by, matches.created_by, etc.).
-- Supabase Postgres remains the domain DB; only Supabase *Auth* coupling is removed.
--
-- ORDER MATTERS: the email backfill MUST run while auth.users still holds the emails,
-- before the not-null enforcement and the FK/trigger drops.

-- 1) Add the durable human identifier column.
alter table public.profiles add column if not exists email text;

-- 2) Backfill the existing emails from Supabase Auth (D-05) BEFORE removing the coupling.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

-- 3) Add the Better Auth link column (nullable until first login auto-links — D-06).
alter table public.profiles add column if not exists auth_user_id text;

-- 4) Uniqueness: one profile per email (case-insensitive), one per linked auth user.
create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email));
create unique index if not exists profiles_auth_user_id_key
  on public.profiles (auth_user_id);

-- 5) Enforce email presence now that the backfill has run.
alter table public.profiles alter column email set not null;

-- 6) Drop the Supabase-Auth coupling kept in Phase 2.
alter table public.profiles drop constraint if exists profiles_id_fkey;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
