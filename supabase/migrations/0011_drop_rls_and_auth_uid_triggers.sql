-- 0010: Drop RLS policies + auth.uid() triggers (Phase 2 / D-01 / D-02 / D-03).
-- Authorization moves fully to the app layer (withAuth guards + app-side stamping/audit).
-- Deliberately NOT dropped: handle_new_user() + on_auth_user_created (Phase 4),
-- created_by/updated_by/changed_by columns, app_role enum.

-- 1) Drop auth.uid()-based triggers (set_row_metadata + log_audit_event) on every domain table.

drop trigger if exists people_metadata on public.people;
drop trigger if exists roles_metadata on public.roles;
drop trigger if exists matches_metadata on public.matches;
drop trigger if exists assignments_metadata on public.assignments;
drop trigger if exists announcements_metadata on public.announcements;
drop trigger if exists collaborator_reports_metadata on public.collaborator_reports;
drop trigger if exists app_settings_metadata on public.app_settings;
drop trigger if exists club_contacts_metadata on public.club_contacts;

drop trigger if exists people_audit on public.people;
drop trigger if exists roles_audit on public.roles;
drop trigger if exists matches_audit on public.matches;
drop trigger if exists assignments_audit on public.assignments;
drop trigger if exists announcements_audit on public.announcements;
drop trigger if exists collaborator_reports_audit on public.collaborator_reports;
drop trigger if exists app_settings_audit on public.app_settings;
drop trigger if exists club_contacts_audit on public.club_contacts;

-- 2) Drop every RLS policy, then disable RLS per table.

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_self_or_admin" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
alter table public.profiles disable row level security;

drop policy if exists "domain_select_authenticated" on public.people;
drop policy if exists "domain_insert_editors_people" on public.people;
drop policy if exists "domain_update_editors_people" on public.people;
drop policy if exists "domain_delete_editors_people" on public.people;
alter table public.people disable row level security;

drop policy if exists "domain_select_authenticated_roles" on public.roles;
drop policy if exists "domain_insert_editors_roles" on public.roles;
drop policy if exists "domain_update_editors_roles" on public.roles;
drop policy if exists "domain_delete_editors_roles" on public.roles;
alter table public.roles disable row level security;

drop policy if exists "domain_select_authenticated_matches" on public.matches;
drop policy if exists "domain_insert_editors_matches" on public.matches;
drop policy if exists "domain_update_editors_matches" on public.matches;
drop policy if exists "domain_delete_editors_matches" on public.matches;
alter table public.matches disable row level security;

drop policy if exists "domain_select_authenticated_assignments" on public.assignments;
drop policy if exists "domain_insert_editors_assignments" on public.assignments;
drop policy if exists "domain_update_editors_assignments" on public.assignments;
drop policy if exists "domain_delete_editors_assignments" on public.assignments;
alter table public.assignments disable row level security;

drop policy if exists "audit_select_authenticated" on public.audit_log;
drop policy if exists "audit_insert_editors" on public.audit_log;
alter table public.audit_log disable row level security;

drop policy if exists announcements_read on public.announcements;
drop policy if exists announcements_insert_admin on public.announcements;
drop policy if exists announcements_update_admin on public.announcements;
drop policy if exists announcements_delete_admin on public.announcements;
alter table public.announcements disable row level security;

drop policy if exists "collaborator_reports_select_authenticated" on public.collaborator_reports;
drop policy if exists "collaborator_reports_insert_editors" on public.collaborator_reports;
drop policy if exists "collaborator_reports_update_editors" on public.collaborator_reports;
drop policy if exists "collaborator_reports_delete_editors" on public.collaborator_reports;
alter table public.collaborator_reports disable row level security;

drop policy if exists app_settings_read on public.app_settings;
drop policy if exists app_settings_insert_admin on public.app_settings;
drop policy if exists app_settings_update_admin on public.app_settings;
drop policy if exists app_settings_delete_admin on public.app_settings;
alter table public.app_settings disable row level security;

drop policy if exists "domain_select_authenticated_club_contacts" on public.club_contacts;
drop policy if exists "domain_insert_editors_club_contacts" on public.club_contacts;
drop policy if exists "domain_update_editors_club_contacts" on public.club_contacts;
drop policy if exists "domain_delete_editors_club_contacts" on public.club_contacts;
alter table public.club_contacts disable row level security;

-- 3) Drop helper functions (last — after the triggers/policies that referenced them are gone).

drop function if exists public.set_row_metadata();
drop function if exists public.log_audit_event();
drop function if exists public.can_edit();
drop function if exists public.can_read();
drop function if exists public.current_app_role();
