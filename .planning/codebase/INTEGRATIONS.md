# External Integrations

**Analysis Date:** 2026-06-03

## APIs & External Services

**AI / LLM (Google Gemini):**
- Google Generative Language API - Reads screenshots/metrics and answers contextual prompts
  - SDK/Client: None — raw `fetch` to `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  - Auth: API key passed as query string. Key resolution is layered (`src/lib/settings.ts` `getGeminiRuntimeConfig`):
    1. Personal key from cookies (`bp_gemini_api_key`, `bp_gemini_model`)
    2. Portal-wide key from `app_settings` table (key `gemini`, migration 0008)
    3. Env fallback `PORTAL_GEMINI_API_KEY` / `PORTAL_GEMINI_MODEL`
  - Models: `gemini-2.5-flash` (default), `gemini-2.5-pro` (`GEMINI_MODEL_OPTIONS` in `src/lib/settings.ts`)
  - Call sites (route handlers):
    - `src/app/api/ai/metric-capture/route.ts` - OCR/metric extraction from images
    - `src/app/api/ai/people/route.ts` - People/contacts assistant
    - `src/app/api/ai/section/route.ts` - Section assistant
    - `src/app/api/ai/speedtest/route.ts` - Speedtest capture reading

**Calendar (Google Calendar):**
- Google Calendar "render" deep link - Generates an "add to calendar" URL (no API, no auth)
  - Implementation: `buildGoogleCalendarLink()` in `src/lib/integrations.ts` builds `https://calendar.google.com/calendar/render?action=TEMPLATE...`

**Messaging (WhatsApp):**
- WhatsApp click-to-chat deep link - Pre-fills match convocatoria messages (no API, no auth)
  - Implementation: `buildWhatsAppUrl()` in `src/lib/utils.ts` → `https://wa.me/<phone>`; message builders in `src/lib/integrations.ts` (`buildMatchNotificationWhatsAppHref`, `getWhatsAppRoster`)

**Email (mailto):**
- No email provider/SDK. Notifications use `mailto:` links generated client-side
  - Implementation: `buildMatchNotificationMailtoHref`, `buildBulkMatchNotificationMailtoHref` in `src/lib/integrations.ts`

**External reference links (static, no integration):**
- La Liga Nacional and club websites/Instagram are stored as static reference URLs in `src/lib/team-directory.ts` and `src/components/teams/create-team-modal.tsx`. Not called programmatically.

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client/SSR), `SUPABASE_SERVICE_ROLE_KEY` (admin)
  - Clients:
    - SSR/server: `createSupabaseServerClient()` (`src/lib/supabase/server.ts`) via `@supabase/ssr`
    - Browser: `src/lib/supabase/browser.ts`
    - Admin (service role, bypasses RLS): `createSupabaseAdminClient()` (`src/lib/supabase/admin.ts`), `server-only`
  - Typed schema: `src/lib/database.types.ts`
  - Schema/migrations: `supabase/migrations/0001_initial.sql` … `0009_add_contacts.sql`, plus `supabase/seed.sql`
  - Tables (from migrations): `profiles`, `people`, `roles`, `matches`, `assignments`, `audit_log`, `announcements`, collaborator reports, `app_settings`, contacts
  - Enums: `app_role` (`admin`, `editor`, `viewer`), `match_status` (`Pendiente`, `Confirmado`, `Realizado`)
  - Row Level Security: policies defined in migration 0001 (e.g. `profiles_select_authenticated`, `domain_insert_editors_*`); audit + metadata triggers on domain tables

**File Storage:**
- No Supabase Storage / S3 detected. User avatars are stored client-side in browser `localStorage` (key prefix `basket-production-avatar:`, see `src/lib/profile-avatar.ts`, `src/lib/teams-local-storage.ts`)
- Team logos resolved to local/static paths via `getTeamLogoPath()` (`src/lib/team-logos.ts`), exposed by `src/app/api/team-logo/route.ts`

**Caching:**
- None (no Redis/external cache). Relies on Next.js caching primitives and `revalidatePath`/server-action revalidation.

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (email/password)
  - Implementation: server actions in `src/app/actions/auth.ts`
    - `signInWithPassword` (login), `resetPasswordForEmail` (forgot password), `updateUser` (reset password), `signOut`
  - Session handling: cookie-based via `@supabase/ssr`; refreshed in middleware (`src/lib/supabase/middleware.ts`, root `middleware.ts`)
  - Stale-session safety: `getSupabaseUserSafely` (`src/lib/supabase/auth-session.ts`)
  - Authorization: role-based via `profiles.role` + `app_metadata`, resolved in `src/lib/constants.ts` (`resolveDashboardAccessRole`, `isDashboardPathAllowedForRole`) and `src/lib/auth-access.ts` / `src/lib/auth.ts`
  - Guest access: optional `mi-jornada` guest mode gated by `ALLOW_GUEST_MI_JORNADA`
  - User provisioning: `on_auth_user_created` trigger on `auth.users` creates a `profiles` row (migration 0001)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/Datadog). Errors logged via `console.error` (e.g. AI route handlers, `src/lib/settings.ts`)

**Logs:**
- `console.error` / `console.warn` only. Tagged prefixes like `[ai][people]`, `[settings]`.
- Health endpoint: `src/app/api/health/route.ts` returns `{ ok, configured, timestamp }`

## CI/CD & Deployment

**Hosting:**
- Netlify (`netlify.toml`): build command `npm run build`, publish `.next`, functions `netlify/functions`

**CI Pipeline:**
- `.github/` directory present — review workflows there. No test stage exists (no tests). Local gate: `npm run check` (lint + typecheck + build).

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (admin client + CSV importer)

**Optional env vars:**
- `NEXT_PUBLIC_APP_TIMEZONE` (default `America/Bogota`)
- `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`)
- `ALLOW_GUEST_MI_JORNADA`
- `PORTAL_GEMINI_API_KEY`, `PORTAL_GEMINI_MODEL`

**Secrets location:**
- Local: `.env.local` (loaded by Next.js automatically; loaded explicitly by `tools/import/index.mjs` via `dotenv`)
- Production: Netlify environment variables
- Per-user Gemini keys: browser cookies (`bp_gemini_api_key`)
- Portal-wide Gemini key: `app_settings` table in Supabase

## Webhooks & Callbacks

**Incoming:**
- `POST /api/matches/intake` (`src/app/api/matches/intake/route.ts`) - External match intake endpoint
- `POST /api/collaborator-reports` (`src/app/api/collaborator-reports/route.ts`) - Collaborator report submission
- `GET /api/grid/calendar` (`src/app/api/grid/calendar/route.ts`) - Calendar data feed
- `GET /api/team-logo` (`src/app/api/team-logo/route.ts`) - Team logo path lookup (auth-gated)
- `GET /api/health` - Health/status check
- AI endpoints under `/api/ai/*` (see APIs section)

**Outgoing:**
- Google Gemini `generateContent` (server-to-server `fetch`)
- No registered outgoing webhooks to third parties. Password-reset emails are sent by Supabase Auth (redirect to app URL).

---

*Integration audit: 2026-06-03*
