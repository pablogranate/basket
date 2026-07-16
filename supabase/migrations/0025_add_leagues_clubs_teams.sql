-- 0025: Normalize leagues / clubs / teams (first step away from free-text competition).
--
-- Model: a club is the institution (Obras Basket); a team is one squad of that
-- club (mayores / próximo / femenino). League membership is per team and per
-- season, so a team can move leagues year over year without losing history.
-- matches.competition (free text) stays untouched; matches.league_id is the new
-- normalized reference and is backfilled in 0026.

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text,
  sort_order integer,
  is_external boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  stadium text,
  website text,
  instagram text,
  logo_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  slug text not null unique,
  category text not null default 'mayores'
    check (category in ('mayores', 'proximo', 'femenino')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint teams_club_category_unique unique (club_id, category)
);

-- Sheet/grid team labels ("INSTITUTO", "REGATAS (C)") mapped to a club; the
-- concrete team is resolved as club + the match's league membership.
create table if not exists public.club_aliases (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  alias text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.team_league_memberships (
  team_id uuid not null references public.teams(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  season text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (team_id, league_id, season)
);

alter table public.matches
  add column if not exists league_id uuid references public.leagues(id) on delete set null;

create index if not exists matches_league_id_idx on public.matches (league_id);
create index if not exists teams_club_id_idx on public.teams (club_id);
create index if not exists club_aliases_club_id_idx on public.club_aliases (club_id);
create index if not exists team_league_memberships_league_season_idx
  on public.team_league_memberships (league_id, season);

-- Same Option B backstop as 0020/0023: RLS on, zero policies. anon/authenticated
-- are denied everything; the server's service_role bypasses RLS.
alter table public.leagues enable row level security;
alter table public.clubs enable row level security;
alter table public.teams enable row level security;
alter table public.club_aliases enable row level security;
alter table public.team_league_memberships enable row level security;
