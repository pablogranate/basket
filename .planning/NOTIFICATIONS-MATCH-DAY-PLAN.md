---
feature: match-day-auto-notifications
type: execute
autonomous: false
depends_on: []
files_new:
  - supabase/migrations/0018_add_match_day_notified_at.sql
  - src/lib/notifications/send-match-day.ts
  - src/lib/notifications/scheduler.ts
files_modified:
  - src/lib/email/mailer.ts
  - src/instrumentation.ts
  - src/lib/env.ts
  - src/lib/database.types.ts
user_setup:
  - "Provision OpenWA env in prod .env: OPENWA_API_URL, OPENWA_API_KEY (instance already runs on the VPS)"
  - "SMTP already configured (plataforma@basquetpass.tv) — no new mail setup"
  - "Apply migration 0018 to Supabase (manual, per repo convention)"

must_haves:
  truths:
    - "At 12:30 ARG daily, every person assigned to a Pendiente/Confirmado match kicking off that calendar day (America/Argentina/Buenos_Aires) receives a convocatoria via WhatsApp (if valid phone) AND email (if valid email)"
    - "A match is auto-notified at most once: matches.day_notified_at is the per-match one-shot gate"
    - "No double-spam: the marker is set after one full send attempt regardless of per-recipient failures (A1); failures are logged, not retried"
    - "Self-healing: if the process is down at 12:30, a boot + hourly catch-up tick sends today's still-unmarked qualifying matches once now >= 12:30 ARG"
    - "Cron runs out of request context using the service-role admin client, never the cookie-bound server client"
    - "The existing MANUAL send path (src/app/actions/notifications.ts) is UNCHANGED"
  artifacts:
    - path: "src/lib/notifications/send-match-day.ts"
      provides: "runMatchDayNotifications() — idempotent core: select -> send -> mark"
    - path: "src/lib/notifications/scheduler.ts"
      provides: "registerNotificationScheduler() — two node-cron schedules (12:30 + hourly catch-up)"
    - path: "supabase/migrations/0018_add_match_day_notified_at.sql"
      provides: "matches.day_notified_at timestamptz"
---

<objective>
Build PATH 1 of the notification system: an automatic match-day blast at 12:30 hs Argentina time that sends a convocatoria (WhatsApp + email) to every person assigned to a match kicking off that day. Reuses the existing OpenWA sender, the existing nodemailer transport, and the existing message templates. The MANUAL send path (Productor/Admin "send to all" from the match view) already exists and is explicitly out of scope — left untouched.

Runtime is a persistent Node VPS (NOT serverless), so in-process node-cron is valid, mirroring the existing grid-sync scheduler.
</objective>

<scope>
IN: 12:30 ARG auto-send, WhatsApp + email channels, per-match idempotency marker, boot + hourly catch-up, service-role data path, server-side notification email function, two cron schedules, kill-switch + cron env vars, migration.

OUT (explicit): refactoring or changing the manual send action; per-recipient notification log / delivery-status UI; retry of failed sends; per-date (vs per-match) notification tracking; skipping already-attendance-confirmed people; HTML email template.
</scope>

<decisions>
Resolved during grilling (2026-06-12):

- D1  Scope = auto-send only; WhatsApp + email; reuse existing transports + message builders.
- D2  Prod = persistent Node server (VPS). node-cron in-process is valid. CLAUDE.md corrected.
- D3  Idempotency = per-match marker `matches.day_notified_at timestamptz` (Option A). No per-recipient log.
- D3b Missed-send recovery = catch-up on boot + hourly tick (Option A). Marker keeps it safe to re-run.
- D4a Channel routing = send BOTH channels per person, contact-gated (WhatsApp iff valid phone, email iff valid email). Neither -> log skip.
- D4b Recipients = ALL assigned people. Do NOT skip those with attendance_confirmed_at.
- D4c "Today" = matches whose kickoff_at calendar date in America/Argentina/Buenos_Aires == today. Per-match timezone field is display-only; the trigger is fixed ARG 12:30.
- D5  Partial-failure policy = A1: mark day_notified_at after ONE full attempt regardless of failures; log failures; NO retry. Manual send is the recovery valve. Catch-up only picks up never-attempted (null-marker) matches.
- D6  Timing = TWO node-cron schedules, same idempotent handler:
        main = NOTIFICATIONS_CRON (default "30 12 * * *"), timezone "America/Argentina/Buenos_Aires"
        catch-up = "0 * * * *" (hardcoded), no-ops when everything already marked.
      Kill switch NOTIFICATIONS_ENABLED (default true). Channel skips (logged) if its env is missing; the other channel still sends.
- D7  Structure = new src/lib/notifications/* modules; service-role admin client; manual path untouched.
- D8  Match qualification: status IN ('Pendiente','Confirmado') (exclude 'Realizado'); kickoff date == today ARG; day_notified_at IS NULL. Zero-assignee matches -> set marker, send nothing (stops catch-up re-querying). Reschedule-after-send edge = ignored (one-shot flag; Productor re-blasts manually).
- D9a Email = plain text only, body = buildMatchNotificationMessage verbatim, subject = buildMatchNotificationSubject. No HTML.
- D9b Pacing = sequential loop; small (~1-2s) delay between WhatsApp sends to avoid OpenWA throttling/ban. Email sequential (Gmail SMTP fine at this volume).
</decisions>

<tasks>

T1 — Migration: per-match marker
  File: supabase/migrations/0018_add_match_day_notified_at.sql
  - ALTER TABLE public.matches ADD COLUMN day_notified_at timestamptz;
  - Comment the column: "Set once when the 12:30 ARG auto-notification has been attempted for this match. NULL = not yet auto-notified."
  - Regenerate / hand-edit src/lib/database.types.ts to add day_notified_at to matches Row/Insert/Update.
  - Apply manually to Supabase (user_setup).

T2 — Notification email function
  File: src/lib/email/mailer.ts
  - Add sendMatchNotificationEmail({ to, subject, text }): reuse getTransport(), from = appEnv.mailFrom, text only (no html).
  - Mirror existing try/catch + console.error("[mailer] ...") convention; rethrow on failure so the core can count it as a skip.

T3 — Env vars
  File: src/lib/env.ts
  - appEnv.notificationsEnabled (default true; "false" disables, like gridSyncEnabled).
  - appEnv.notificationsCron (default "30 12 * * *").
  - No new assert fn needed; reuse isOpenwaConfigured / assertSmtpEnv at the channel boundary.

T4 — Core send routine (idempotent)
  File: src/lib/notifications/send-match-day.ts  (import "server-only")
  - export async function runMatchDayNotifications(trigger: "cron" | "catchup" | "boot")
  - Use the service-role admin client (src/lib/supabase/admin.ts).
  - Compute "today" boundaries in America/Argentina/Buenos_Aires (date-fns-tz already a dep).
  - Query matches: status in ('Pendiente','Confirmado') AND kickoff_at within today's ARG day AND day_notified_at IS NULL.
  - For catch-up/boot, additionally require now >= 12:30 ARG before sending (the 12:30 cron has no such guard).
  - For each match:
      * Load assignments + person {full_name, phone, email} (reuse the select shape from actions/notifications.ts:61-67, add email).
      * Dedupe recipients per person by full_name + phone + email; merge roleNames (extend the manual path's Map dedupe to also key/carry email).
      * Build message once via buildMatchNotificationMessage / subject via buildMatchNotificationSubject.
      * Per recipient: if valid phone -> sendWhatsAppText() then await ~1-2s; if valid email -> sendMatchNotificationEmail(); neither -> console.warn skip.
      * Count sent/skipped per channel; console.info summary with [notifications] prefix.
      * Set matches.day_notified_at = now() AFTER the attempt (A1), including zero-assignee matches.
  - Wrap each match in try/catch so one bad match doesn't abort the batch.

T5 — Scheduler
  File: src/lib/notifications/scheduler.ts  (import "server-only", clone sync-scheduler.ts shape)
  - export function registerNotificationScheduler()
  - Guard: return if already scheduled; return + log if !appEnv.notificationsEnabled.
  - cron.validate(appEnv.notificationsCron); bail + console.error if invalid.
  - cron.schedule(appEnv.notificationsCron, () => void runMatchDayNotifications("cron"), { timezone: "America/Argentina/Buenos_Aires" }).
  - cron.schedule("0 * * * *", () => void runMatchDayNotifications("catchup"), { timezone: "America/Argentina/Buenos_Aires" }).
  - On register, also fire runMatchDayNotifications("boot") once (catch-up after a restart).
  - console.info("[notifications] scheduler started ...").

T6 — Wire instrumentation
  File: src/instrumentation.ts
  - After registerGridSyncScheduler(), import + call registerNotificationScheduler() (Node-only branch already guards runtime).

</tasks>

<verification>
- npm run check (lint + typecheck + build) passes.
- Migration 0018 applies; database.types.ts has day_notified_at.
- Manual: temporarily set NOTIFICATIONS_CRON to a near-future minute in a staging/dev run with a Pendiente match dated today (ARG) + an assignee with a real test phone/email -> confirm one WhatsApp + one email arrive, day_notified_at gets stamped, and a second fire within the day sends nothing.
- Restart the process after the stamped run -> boot/catch-up sends nothing (marker set).
- Null-out the marker on a past-12:30 today match -> hourly/boot catch-up re-sends exactly once.
- Set NOTIFICATIONS_ENABLED=false -> scheduler logs disabled, no sends.
- Unset OPENWA_API_URL -> email still sends, WhatsApp logs skip; vice versa for SMTP.
- Confirm src/app/actions/notifications.ts is byte-for-byte unchanged.
</verification>

<risks>
- OpenWA ban risk if pacing too aggressive -> the ~1-2s inter-send delay (D9b); match-day volume is low.
- Duplicate fires across an accidental second worker -> per-match marker (D3) makes runMatchDayNotifications idempotent; safe.
- A1 means a transient OpenWA outage at 12:30 silently drops that day's WhatsApp for already-marked matches -> accepted; manual re-blast is the recovery. If this proves painful, the upgrade path is the per-recipient log table (deferred B option from D3).
- DST: node-cron timezone option + date-fns-tz handle America/Argentina/Buenos_Aires correctly; no manual offset math.
</risks>
