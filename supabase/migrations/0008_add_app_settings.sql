create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  secret_value text,
  public_value text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists app_settings_key_idx
  on public.app_settings (setting_key);

alter table public.app_settings enable row level security;

drop trigger if exists app_settings_metadata on public.app_settings;
create trigger app_settings_metadata
  before insert or update on public.app_settings
  for each row execute procedure public.set_row_metadata();

drop trigger if exists app_settings_audit on public.app_settings;
create trigger app_settings_audit
  after insert or update or delete on public.app_settings
  for each row execute procedure public.log_audit_event();

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select
  using (public.can_read());

drop policy if exists app_settings_insert_admin on public.app_settings;
create policy app_settings_insert_admin on public.app_settings
  for insert
  with check (public.current_app_role() = 'admin');

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin on public.app_settings
  for update
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

drop policy if exists app_settings_delete_admin on public.app_settings;
create policy app_settings_delete_admin on public.app_settings
  for delete
  using (public.current_app_role() = 'admin');
