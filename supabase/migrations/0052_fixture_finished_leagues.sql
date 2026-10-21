-- 0052: Ligas terminadas on /fixtures. Dragging a league chip into the
-- "Terminadas" folder used to live in each browser's cookie; it is now one list
-- every viewer shares. Keyed by the chip label (the fixture competition label,
-- e.g. "Nacional"), one row per label; who and when lives here and in audit_log.

create table if not exists public.fixture_finished_leagues (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  created_by uuid references public.profiles(id) on delete set null,
  constraint fixture_finished_leagues_label_key unique (label)
);
