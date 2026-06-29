# Basket-App Portal

Glossary for the portal's domain language. Implementation lives in code; this file is vocabulary only.

## Language

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
