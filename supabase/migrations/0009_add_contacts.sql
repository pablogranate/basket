-- Contacts import support.
-- 1. Add a category/function column to people (Relator, Comentarista, Realizador, Camara, Tecnico, Eventual, ...).
-- 2. New club_contacts table for the "Club | Responsable | Telefono" blocks of the Contactos sheet.

alter table public.people
  add column if not exists category text;

create index if not exists people_category_idx on public.people (category);

create table if not exists public.club_contacts (
  id uuid primary key default gen_random_uuid(),
  club_name text not null,
  league text,
  responsable text,
  phone text,
  source_block text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint club_contacts_unique unique (club_name, responsable, phone)
);

create index if not exists club_contacts_name_idx on public.club_contacts (club_name);

drop trigger if exists club_contacts_metadata on public.club_contacts;
create trigger club_contacts_metadata
  before insert or update on public.club_contacts
  for each row execute procedure public.set_row_metadata();

drop trigger if exists club_contacts_audit on public.club_contacts;
create trigger club_contacts_audit
  after insert or update or delete on public.club_contacts
  for each row execute procedure public.log_audit_event();

alter table public.club_contacts enable row level security;

drop policy if exists "domain_select_authenticated_club_contacts" on public.club_contacts;
create policy "domain_select_authenticated_club_contacts"
  on public.club_contacts for select
  using (public.can_read());

drop policy if exists "domain_insert_editors_club_contacts" on public.club_contacts;
create policy "domain_insert_editors_club_contacts"
  on public.club_contacts for insert
  with check (public.can_edit());

drop policy if exists "domain_update_editors_club_contacts" on public.club_contacts;
create policy "domain_update_editors_club_contacts"
  on public.club_contacts for update
  using (public.can_edit())
  with check (public.can_edit());

drop policy if exists "domain_delete_editors_club_contacts" on public.club_contacts;
create policy "domain_delete_editors_club_contacts"
  on public.club_contacts for delete
  using (public.can_edit());
