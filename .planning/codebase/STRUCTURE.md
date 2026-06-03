# Codebase Structure

**Analysis Date:** 2026-06-03

## Directory Layout

```
basketProd/
├── middleware.ts            # Edge auth middleware entry (delegates to lib/supabase/middleware)
├── next.config.ts           # Next.js config
├── eslint.config.mjs        # ESLint flat config
├── postcss.config.mjs       # Tailwind v4 / PostCSS
├── netlify.toml             # Netlify deploy config
├── tsconfig.json            # TS config, @/* → src/* alias
├── src/
│   ├── app/                 # Next.js App Router (routes, pages, actions, api)
│   │   ├── layout.tsx       # Root layout (fonts, global css)
│   │   ├── page.tsx         # Root entry page
│   │   ├── globals.css      # Global styles
│   │   ├── (auth)/          # Public auth route group (login, forgot/reset password)
│   │   ├── (dashboard)/     # Authenticated app route group
│   │   ├── actions/         # "use server" server actions (mutations)
│   │   ├── api/             # Route handlers (ai, intake, health, exports, logos)
│   │   └── auth/confirm/    # Email OTP / reset confirmation route
│   ├── components/          # React components grouped by domain + ui primitives
│   │   ├── ui/              # Reusable primitives (button, card, input, badge…)
│   │   ├── layout/          # Shells, nav, header/footer chrome
│   │   ├── grid/ people/ teams/ match/ incidents/ reports/ collaborators/ ai/ auth/ settings/ shared/
│   └── lib/                 # Domain logic, data loaders, supabase clients, types
│       ├── supabase/        # server / middleware / admin / browser / auth-session clients
│       └── data/            # Read-query loaders (dashboard, collaborators, announcements)
├── supabase/
│   ├── migrations/          # Numbered SQL migrations (0001..0009)
│   └── seed.sql             # Seed data
├── tools/import/            # CSV/contact import scripts (node .mjs)
├── docs/                    # Project docs (roadmap, production-sheet, colaboradores)
└── public/                  # Static assets incl. team/league logo .webp sets
```

## Directory Purposes

**`src/app/`:**
- Purpose: All routing, pages, server actions, and API handlers (App Router).
- Contains: RSC pages (`page.tsx`), layouts (`layout.tsx`), route handlers (`route.ts`), server actions.
- Key files: `layout.tsx`, `(dashboard)/layout.tsx`, `actions/matches.ts`.

**`src/app/actions/`:**
- Purpose: Server-side mutations (`"use server"`).
- Contains: `auth.ts`, `matches.ts`, `people.ts`, `roles.ts`, `settings.ts`, `helpers.ts`.

**`src/app/api/`:**
- Purpose: Programmatic/external endpoints.
- Key files: `ai/section/route.ts`, `ai/people/route.ts`, `ai/metric-capture/route.ts`, `matches/intake/route.ts`, `grid/calendar/route.ts`, `collaborator-reports/route.ts`, `team-logo/route.ts`, `health/route.ts`.

**`src/components/`:**
- Purpose: UI, organized by feature domain plus shared `ui/` primitives and `layout/` chrome.
- Contains: client and server components (`.tsx`).
- Key files: `ui/button.tsx`, `layout/dashboard-shell.tsx`, `grid/match-card.tsx`.

**`src/lib/`:**
- Purpose: Domain logic, typed DB access, helpers, integrations.
- Key files: `auth.ts`, `auth-access.ts`, `constants.ts`, `env.ts`, `database.types.ts`, `types.ts`, `audit.ts`, `integrations.ts`, `date.ts`, `display.ts`, `copy.ts`, `settings.ts`, `search-params.ts`, `utils.ts`.

**`src/lib/supabase/`:**
- Purpose: Context-specific Supabase clients.
- Key files: `server.ts`, `middleware.ts`, `admin.ts`, `browser.ts`, `auth-session.ts`.

**`src/lib/data/`:**
- Purpose: Read-query loaders consumed by pages.
- Key files: `dashboard.ts`, `collaborators.ts`, `announcements.ts`.

**`supabase/migrations/`:**
- Purpose: Versioned schema migrations.
- Generated: No (hand-written). Committed: Yes.

**`tools/import/`:**
- Purpose: One-off data import scripts using the service-role key.
- Key files: `index.mjs`, `contactos.mjs`.

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root HTML shell, fonts.
- `middleware.ts`: Edge auth gate.
- `src/app/(dashboard)/layout.tsx`: Authenticated shell selection.

**Configuration:**
- `tsconfig.json`: `@/*` path alias.
- `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `netlify.toml`.
- `src/lib/env.ts`: Centralized env access (`appEnv`).
- `.env.local`: Local environment values (not committed; secrets — do not read).

**Core Logic:**
- `src/lib/auth.ts`: User context + permission guards.
- `src/lib/constants.ts`: Roles, nav, production modes, access rules.
- `src/app/actions/*.ts`: Mutations.
- `src/lib/data/*.ts`: Read queries.

**Testing:**
- No test files or test runner detected (no `*.test.*`, `*.spec.*`, jest/vitest config). Quality gate is `npm run check` (lint + typecheck + build).

## Naming Conventions

**Files:**
- kebab-case for all `.ts`/`.tsx` files: e.g. `match-card.tsx`, `auth-session.ts`, `create-match-modal.tsx`.
- Route files follow Next.js conventions: `page.tsx`, `layout.tsx`, `route.ts`.
- Migrations: zero-padded numeric prefix + snake_case description, e.g. `0005_add_match_intake_fields.sql`.
- Scripts/tools: `.mjs` ES modules.

**Directories:**
- Lowercase, feature- or domain-named: `grid/`, `people/`, `teams/`, `ai/`.
- Next.js route groups in parentheses: `(auth)/`, `(dashboard)/`.
- Dynamic segments in brackets: `match/[id]/`, `teams/[slug]/`, `mi-jornada/[matchId]/`.

**Code:**
- camelCase functions/variables; PascalCase React components and types; SCREAMING_SNAKE_CASE module constants (`MATCH_STATUS_OPTIONS`, `DASHBOARD_NAV`).

## Where to Add New Code

**New dashboard page/section:**
- Route: `src/app/(dashboard)/<section>/page.tsx`.
- Read query: add a loader to `src/lib/data/` (new file or extend `dashboard.ts`).
- Mutations: add a `"use server"` action in `src/app/actions/`.
- Register nav entry in `DASHBOARD_NAV` and access rules in `src/lib/constants.ts`.

**New component:**
- Domain-specific: `src/components/<domain>/<name>.tsx`.
- Reusable primitive: `src/components/ui/<name>.tsx`.

**New external/programmatic endpoint:**
- `src/app/api/<group>/<name>/route.ts`.

**New domain helper / business rule:**
- `src/lib/<name>.ts` (pure logic) — keep DB access in `src/lib/data/` or actions.

**New DB change:**
- Add next numbered file in `supabase/migrations/` and regenerate `src/lib/database.types.ts`.

**Shared types:**
- View models in `src/lib/types.ts`; generated DB types in `src/lib/database.types.ts`.

## Special Directories

**`public/Logos/`:**
- Purpose: Team and league logo `.webp` assets (EuroLiga, Liga Argentina, etc.).
- Generated: No. Committed: Yes.

**`.next/`:**
- Purpose: Next.js build output. Generated: Yes. Committed: No (gitignored).

**`node_modules/`:**
- Purpose: Dependencies. Generated: Yes. Committed: No.

**`tools/import/contactos.*`:**
- Purpose: Raw + cleaned contact import data (`.raw.md`, `.clean.json`). Committed: Yes (working import set).

---

*Structure analysis: 2026-06-03*
