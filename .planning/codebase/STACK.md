# Technology Stack

**Analysis Date:** 2026-06-03

## Languages

**Primary:**
- TypeScript ^5 - All application code in `src/` (`.ts`, `.tsx`), strict mode enabled (`tsconfig.json`)

**Secondary:**
- JavaScript (ESM `.mjs`) - CLI import tooling in `tools/import/index.mjs` and `tools/import/contactos.mjs`
- SQL (PostgreSQL dialect) - Database schema and migrations in `supabase/migrations/*.sql`, `supabase/seed.sql`
- CSS - Global styles in `src/app/globals.css` (Tailwind CSS v4 via PostCSS)

## Runtime

**Environment:**
- Node.js (no version pinned; `@types/node` ^20 suggests Node 20.x as baseline; no `.nvmrc` present)
- Next.js 16.1.6 runtime — App Router, React Server Components, server actions, route handlers

**Package Manager:**
- pnpm (primary) - `pnpm-lock.yaml` present (145 KB)
- npm also has a lockfile - `package-lock.json` present (246 KB); both lockfiles committed (see CONCERNS)
- Lockfile: present

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack React framework (App Router). Entry: `src/app/layout.tsx`, `src/app/page.tsx`; route groups `(auth)`, `(dashboard)`; API route handlers under `src/app/api/`
- React 19.2.3 / React DOM 19.2.3 - UI library
- Tailwind CSS v4 (`^4`) - Styling, configured via `@tailwindcss/postcss` in `postcss.config.mjs`

**Testing:**
- Not detected - No test runner (Jest/Vitest), no test files, no test scripts in `package.json`

**Build/Dev:**
- Next.js CLI - `next dev`, `next build`, `next start` (`package.json` scripts)
- TypeScript compiler - `tsc --noEmit` (`typecheck` script)
- ESLint ^9 - Flat config `eslint.config.mjs` using `eslint-config-next` 16.1.6 (core-web-vitals + typescript presets)

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.98.0 - Supabase client (auth, Postgres, admin). Used in `src/lib/supabase/admin.ts`, `tools/import/index.mjs`
- `@supabase/ssr` ^0.9.0 - Cookie-based SSR auth for Next.js. Used in `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/middleware.ts`
- `zod` ^4.3.6 - Runtime schema validation for forms/actions and API payloads
- `next` 16.1.6 / `react` 19.2.3 - Framework and UI runtime

**Infrastructure:**
- `date-fns` ^4.1.0 + `date-fns-tz` ^3.2.0 - Date formatting and timezone conversion (default tz `America/Bogota`). Used in `src/lib/date.ts`, `tools/import/index.mjs`
- `jspdf` ^4.2.0 + `jspdf-autotable` ^5.0.7 - Client-side PDF generation/export. Used in `src/components/grid/grid-export-button.tsx`, `src/components/incidents/incidents-workspace.tsx`, `src/components/reports/reports-workspace.tsx`
- `csv-parse` ^6.1.0 - CSV parsing for the import CLI (`tools/import/index.mjs`)
- `dotenv` ^17.3.1 - Loads `.env.local`/`.env` for the import CLI
- `lucide-react` ^0.577.0 - Icon set
- `clsx` ^2.1.1 + `tailwind-merge` ^3.5.0 - Conditional class composition (`src/lib/utils.ts`)

## Configuration

**Environment:**
- Centralized accessor: `src/lib/env.ts` (`appEnv` object) reads all env vars with defaults
- Local env file present: `.env.local` (contents not read — may contain secrets)
- Required/consumed env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required for Supabase)
  - `SUPABASE_SERVICE_ROLE_KEY` (required for admin client and CSV importer)
  - `NEXT_PUBLIC_APP_TIMEZONE` (default `America/Bogota`)
  - `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`)
  - `ALLOW_GUEST_MI_JORNADA` (`"true"` to enable guest access)
  - `PORTAL_GEMINI_API_KEY`, `PORTAL_GEMINI_MODEL` (default model `gemini-2.5-flash`)
- Validation guards: `assertSupabaseEnv()`, `assertServiceRoleKey()` in `src/lib/env.ts`

**Build:**
- `next.config.ts` - Next.js config (currently empty/default)
- `tsconfig.json` - `strict: true`, `moduleResolution: bundler`, path alias `@/* → ./src/*`
- `postcss.config.mjs` - Tailwind v4 PostCSS plugin
- `eslint.config.mjs` - ESLint flat config
- `.editorconfig` - Editor formatting rules
- `middleware.ts` - Root middleware delegating to `src/lib/supabase/middleware.ts` for session refresh

## Platform Requirements

**Development:**
- Node.js 20.x (inferred), pnpm
- Local Supabase project or hosted Supabase instance (env vars must be set)
- Run: `pnpm dev` (or `npm run dev`); quality gate: `npm run check` (lint + typecheck + build)

**Production:**
- Netlify (`netlify.toml`: build `npm run build`, publish `.next`, functions dir `netlify/functions`)
- Requires Supabase env vars provisioned in the host
- Database hosted on Supabase (PostgreSQL); migrations in `supabase/migrations/` applied manually

---

*Stack analysis: 2026-06-03*
