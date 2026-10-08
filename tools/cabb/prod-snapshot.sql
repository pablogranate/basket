-- Read-only snapshot for the fixtures <-> Partidos link analysis.
-- Run with PGOPTIONS default_transaction_read_only=on so any write fails.
\pset footer off
\echo '## totals'
select 'matches', count(*), min(kickoff_at)::date, max(kickoff_at)::date from matches
union all select 'fixtures', count(*), min(match_date), max(match_date) from fixtures;
select 'fixtures last sync', max(synced_at) from fixtures;

\echo '## leagues (Partidos from 2026-09-01)'
select l.slug, l.name, l.is_external, count(m.id)
from leagues l
left join matches m on m.league_id = l.id and m.kickoff_at >= '2026-09-01'
group by 1, 2, 3 order by 4 desc;

\echo '## partidos 2026-10-01..2026-11-30 in CABB leagues'
select m.production_code, l.slug,
  to_char(m.kickoff_at at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI'),
  m.home_team, m.away_team, m.competition
from matches m
left join leagues l on l.id = m.league_id
where m.kickoff_at >= '2026-10-01' and m.kickoff_at < '2026-12-01'
  and (l.slug in ('liga-nacional', 'liga-argentina', 'liga-femenina', 'liga-proximo', 'liga-federal', '3x3') or l.slug is null)
order by m.kickoff_at;

\echo '## clubs, short names, aliases, equipos'
select c.name, coalesce(c.short_name, ''), coalesce(c.city, ''), coalesce(c.province, ''),
  coalesce((select string_agg(a.alias, ' ; ') from club_aliases a where a.club_id = c.id), ''),
  coalesce((select string_agg(t.name || ' [' || t.category || ']', ' ; ') from teams t where t.club_id = c.id), '')
from clubs c order by c.name;

\echo '## memberships'
select l.slug, tlm.season, count(*)
from team_league_memberships tlm join leagues l on l.id = tlm.league_id
group by 1, 2 order by 1, 2;

\echo '## old fixtures sample'
select competition, category, count(*), min(match_date), max(match_date) from fixtures group by 1, 2 order by 3 desc;
