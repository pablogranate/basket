create table if not exists public.fixtures (
  id text primary key,
  competition text,
  category text,
  phase text,
  "group" text,
  home_club text,
  home_team text,
  away_club text,
  away_team text,
  suspended boolean not null default false,
  home_points integer,
  away_points integer,
  match_date date,
  match_time text,
  venue text,
  court text,
  city text,
  province text,
  synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists fixtures_match_date_idx on public.fixtures (match_date);
create index if not exists fixtures_category_idx on public.fixtures (category);
