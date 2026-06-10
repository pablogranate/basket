# Phase 03: Portal Better Auth Wiring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 03-portal-better-auth-wiring
**Areas discussed:** Session ownership, Identity↔profile linking, Login methods + provisioning, Denied-access UX, Email delivery, Cutover scope
**Mode:** grill (one question at a time, recommendation-led, codebase-grounded via /grill-with-docs)

---

## Session ownership now vs Cutover

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-run bridge | Better Auth + Supabase both valid until Phase 5 | |
| Better Auth sole auth now | Drop Supabase Auth in Phase 3; no parallel window | ✓ |

**User's choice:** "no needed, we will use better auth for everything since now"
**Notes:** Only 2 real users (both admins) make a bridge pointless. Led to collapsing Phases 4 & 5 (see Cutover scope).

## Identity ↔ profile linking

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-link by email | Add email+auth_user_id to profiles, backfill, match on first login | ✓ |
| Manual pre-seed auth_user_id | Admin sets the link per user | |
| Admin re-invite | Recreate auth_user + profile together | |

**User's choice:** Yes to email as link key.
**Notes:** profiles.id must stay stable (FK target). profiles has no email column today → add + backfill the 2 emails from auth.users before cutover.

## Login methods + provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Staff Google (domain-restricted) | basquetpass.tv Workspace, server-verified | ✓ |
| External email/password | Passwords for collaborators | |
| External magic link only | No passwords anywhere | ✓ |
| Magic link + long sessions | ~60-day session, link once per device | ✓ |
| Admin pre-provisions (no self-signup) | Profile created with email+role on People page | ✓ |

**User's choice:** Google for staff (basquetpass.tv confirmed Workspace); magic link only, drop email/password; magic link + long sessions; admin pre-provisions.
**Notes:** User initially thought magic links required the admin to issue them each login. Clarified: the *system* sends links automatically (like a password-reset email), sessions persist ~60 days, so it is not per-visit and never involves the admin. Surfaced that the app has no email sender today (borrows Supabase Auth) → triggered the email-provider decision.

## Denied-access UX (no auto-provisioning)

| Option | Description | Selected |
|--------|-------------|----------|
| Dead-end "no access" page | Authenticated-but-no-profile → contact-admin page + logout | ✓ |
| Auto-provision basquetpass.tv Google | Any Workspace Google login gets a default viewer profile | |

**User's choice:** No auto-provisioning; dead-end page.
**Notes:** Auto-provisioning by domain would violate roadmap criterion 3 ("gated by profiles, not a domain allowlist"). New staff are added by an admin like collaborators.

## Email delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Resend | Hosted transactional email, simple API | |
| Google Workspace SMTP | Send via owned basquetpass.tv, no new vendor | ✓ |

**User's choice:** Google Workspace SMTP (revised 2026-06-10, initially Resend).
**Notes:** Use nodemailer over smtp.gmail.com:587 with an app password on a dedicated sender mailbox (no new vendor). App-password auth (not SMTP-relay) chosen because Netlify egress IPs are dynamic. App has no sender today (Supabase Auth handled it). Needed for both magic links and collaborator invites.

## Cutover scope (roadmap restructure)

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 3 fully owns cutover | Supabase Auth gone by end of Phase 3; collapse Phases 4 & 5 | ✓ |
| Keep Supabase Auth dormant until Phase 5 | Remove later per current roadmap | |

**User's choice:** "Phase 3 fully owns the cutover, collapse 4 & 5"
**Notes:** With 2 users and no dual-run, splitting across 3 phases is ceremony. ROADMAP.md edit needed to fold Phases 4 & 5 and add cutover criteria to Phase 3.

## Claude's Discretion

- Cross-subdomain SSO groundwork (cookie domain, shared secret, trustedOrigins) — Phase 6; minimal env-based prep allowed.
- Better Auth config layout, route-handler path, middleware rewrite shape, getUserContext internals.
- Refreshing profiles.full_name from Google profile on first login.
- Revoke-access flow shape under Better Auth.

## Deferred Ideas

- ROADMAP.md edit to collapse Phases 4 & 5 into Phase 3.
- Cross-subdomain SSO + analytics repoint → Phase 6.
- Guest mi-jornada preservation → a constraint the planner must verify, not a new decision.
