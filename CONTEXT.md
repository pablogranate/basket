# Basket-App Portal

Glossary for the portal's domain language. Implementation lives in code; this file is vocabulary only.

## Language

### Notifications

**Send time**:
The instant a match's assigned people are notified, computed per match from its kickoff clock time in Argentina time (noon-inclusive): kickoff at or after 12:00 → 11:00 the same day; kickoff before 12:00 → 22:00 the day before. An hourly tick fires every match whose send time has passed; `day_notified_at` marks a match as already notified so it is not sent twice.
_Avoid_: notification time, blast time

**Enviar notificación a todos**:
The manual per-match action (match detail header) that immediately sends WhatsApp + email to every current assignee, behind a confirmation dialog. It always sends regardless of whether the automatic send already fired, and (re)stamps `day_notified_at`.

### Grid sync

**Local**:
The home team of a match. Source of truth is the `Local` column in the "Grilla Producción 25/26" Google Sheet. Maps to `matches.home_team`. A row with a blank `Local` is not a real match (spacer/empty) and is skipped by the sync.
_Avoid_: home (in Spanish-facing copy), equipo local

**Visitante**:
The away team of a match. Source of truth is the `Visitante` column in the sheet. Maps to `matches.away_team`.
_Avoid_: away (in Spanish-facing copy), equipo visitante

**Sync window**:
The rolling 30-day span the grid sync operates on: `[start-of-today, start-of-today + 30 days)`, evaluated in the sheet timezone (`America/Argentina/Buenos_Aires`). The sync fetches whichever month tabs that span touches (1–3 tabs) and only creates/updates matches whose kickoff falls inside it. Matches before today or beyond the horizon are left untouched.
_Avoid_: sync range, sync horizon

**Partido** (retired):
The legacy single sheet column that held both teams as `"Local vs Visitante"`, split apart at parse time. Retired as of the Julio 26 tab — the sheet now ships `Local` and `Visitante` as separate columns. No longer read by the sync, and tabs before Julio 26 are never fetched.
