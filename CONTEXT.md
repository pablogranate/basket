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

**Partido** (retired):
The legacy single sheet column that held both teams as `"Local vs Visitante"`, split apart at parse time. Retired as of the Julio 25 tab — the sheet now ships `Local` and `Visitante` as separate columns. No longer read by the sync.
