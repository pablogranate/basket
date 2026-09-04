# Contributing

This project is intended to be maintained as a real production codebase. The default expectation is correctness, traceability, and safe change management over speed.

## Development principles

- Prefer small, reviewable changes over broad rewrites.
- Keep data model changes explicit and versioned through SQL migrations.
- Preserve auditability: if a change affects domain data, verify that permissions, triggers, and history still make sense.
- Do not bypass RLS assumptions in application code.
- Avoid hidden coupling. Put domain logic in `src/lib`, UI in `src/components`, and route/page concerns in `src/app`.

## Definition of done

Before a change is considered ready:

- Update `CHANGELOG.md` for any user-visible, operational, or architectural change.
- Run `npm run check`.
- If the database schema changes, add or update a file in `supabase/migrations`.
- If setup or developer workflow changes, update `README.md` and this document if needed.
- If a change introduces new environment variables, document them in `.env.example`.
- If a change affects authorization, verify both allowed and denied paths.

## Project conventions

### Application structure

- `src/app`: routes, layouts, server actions, and route handlers.
- `src/components`: reusable UI and route-level presentation blocks.
- `src/lib`: auth, data access, utilities, types, and integration helpers.
- `supabase/migrations`: schema changes only, in ordered SQL files.
- `tools`: operational scripts such as imports.

### Data and auth

- Prefer Server Actions for authenticated dashboard mutations.
- Add route handlers only when the feature needs an external HTTP interface such as webhooks, machine clients, or health checks.
- Validate inputs at the boundary. Do not trust form or CSV data.
- When adding new domain tables, define:
  - RLS policies
  - metadata triggers if the table has mutable business records
  - audit behavior if the entity matters operationally

### UI and product behavior

- Preserve the existing visual language unless there is an explicit design change.
- Favor clear operational labels over abstract product language.
- Empty, loading, and error states are part of the feature, not optional polish.

## Pull requests

Each PR should describe:

- What changed
- Why it changed
- Any migration or rollout impact
- Any manual follow-up required in the database or deployment

Use the pull request template in `.github/pull_request_template.md`.

## Local workflow

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Run the full verification suite:

```bash
npm run check
```
