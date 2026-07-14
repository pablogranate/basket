# A match has one production id: `production_code`

The `matches` table carries a single id-de-producción column, `production_code`. The retired `external_match_id` column no longer exists. Anything that reads, writes, dedupes, or displays "the match id" must use `production_code`.

## Context

Migration `0005_add_match_intake_fields.sql` added `external_match_id` and `production_code` in the same change, built for an external match-lookup API (`/api/matches/intake`): the plan was to query a provider by `external_match_id` and store the provider's own `production_code` from the response. That API was never configured (`MATCH_LOOKUP_API_URL` is unset; the route returns "todavía no está configurada"), so the two-identifier distinction never materialized — there is only ever one id.

Meanwhile two write paths diverged onto different columns:

- The grid sheet sync (`src/lib/grid/sync.ts`) wrote **only** `external_match_id`, from the sheet's col C ("id"), and used it as its dedup key. Migration `0014` put a unique index on it as the re-sync backstop.
- The manual create/edit modal and **every** UI read path (card id chip, grid "ID" column, CSV/PDF export, insights) used **only** `production_code`.

The visible symptom: a sheet-synced match (e.g. Caza y Pesca vs Sionista (P), 2026-07-04, sheet id `28319`) had its id in `external_match_id` but showed blank everywhere, because the card and grid read `production_code`.

## Decision

Keep `production_code` — it is what all UI and the manual modal already use, it is the label the user sees ("Producción"), and it matches the domain term. Drop `external_match_id`.

Migration `0015_consolidate_match_production_id.sql` backfills `production_code` from `external_match_id` where empty, deduplicates `production_code` (keep earliest `created_at`, null the rest) so uniqueness can be enforced, moves the unique index onto `production_code` (partial, `where production_code is not null`), and drops `external_match_id`.

## Consequences

- The sheet sync writes and dedupes on `production_code`. Its in-memory guard plus the `matches_production_code_key` unique index prevent duplicate matches on re-sync — the same role `external_match_id`'s unique index used to play.
- `production_code` is now unique across matches. Two matches can no longer share a code, including manual entries; a colliding manual code is rejected the same way a colliding sheet id is.
- Migration `0015` must be applied **after** the code that stops referencing `external_match_id` is deployed, so the live app never inserts into a dropped column. Backfill (step 1) is additive and safe to run early; the column drop (step 4) is the point of no return.
- The never-used external-lookup distinction is gone. If a real external-provider id is ever needed as a *separate* concept, add a new, clearly-named column — do not resurrect `external_match_id` as an alias of the production id.
- `database.types.ts` is hand-maintained here (no `supabase gen` step in the workflow); it was edited to drop `external_match_id`. Regenerating types against a pre-`0015` database would reintroduce the column.
