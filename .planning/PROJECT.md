# Basket-App Portal — Unified Auth

## What This Is

`portal.basket-app.com` (this repo, "portal") is a basketball broadcast/production management app — matches, people/contacts, teams, scheduling grid, incident reports, AI (Gemini) intake, and WhatsApp/Calendar integrations. Built on Next.js 16 (App Router, RSC, server actions) with Supabase as backend.

It is one of three sibling apps under `basket-app.com`: `portal.` (this), `analytics.` (a Next.js + Drizzle/Postgres data dashboard), and `incidencias.` (incidents — out of scope for now). This milestone makes the three apps **share one identity** via Better Auth so a user logs in once and is recognized across subdomains.

## Core Value

A single sign-on across `*.basket-app.com` where identity is shared but each app authorizes its own users independently — without breaking portal's existing role-based access.

## Requirements

### Validated

<!-- Inferred from existing code (brownfield). These already work. -->

- ✓ Portal: match/people/teams/grid/reports management on Next.js 16 + Supabase — existing
- ✓ Portal: layered role-based access (admin/editor/viewer/collaborator + per-section access) via `requireEditor`/`requireAdmin*` guards — existing
- ✓ Portal: Supabase Auth (email/password login, password reset, email OTP confirm) — existing (to be replaced)
- ✓ Analytics: Better Auth with Google OAuth, `@basquetpass.tv` domain allowlist (`auth_allowed_emails`), admin/viewer roles, Drizzle + Postgres — existing

### Active

<!-- This milestone: shared auth across portal + analytics. -->

- [ ] Stand up a central identity store (shared Better Auth user/session/account/verification tables) on the company-server Postgres
- [ ] Configure cross-subdomain SSO: shared `BETTER_AUTH_SECRET`, cookie domain `.basket-app.com`, `trustedOrigins` for all three subdomains
- [ ] Each app runs its own Better Auth config against the shared DB; identity is global, authorization is per-app
- [ ] Portal: replace Supabase Auth with Better Auth; keep Google for staff AND add a non-Google path (email/password or magic link) for external collaborators
- [ ] Portal: gate access via its own access table (rekeyed `profiles`), not a domain allowlist; preserve admin/editor/viewer/collaborator roles + section access
- [ ] Portal: drop reliance on Supabase RLS (`auth.uid()`); keep Supabase as plain Postgres, enforce access in the app layer (existing guards)
- [ ] Portal: migrate existing Supabase Auth users into the new system (approach decided in research — assess user count + hash format)
- [ ] Analytics: repoint from its current auth tables to the shared identity DB so SSO works end-to-end across portal + analytics

### Out of Scope

- `incidencias.basket-app.com` integration — deferred to a later milestone (auth design will accommodate it, but no work this round)
- Merging the three apps' **domain** databases — each app keeps its own data store (portal → Supabase cloud, analytics → company-server Postgres); only identity is shared
- Migrating portal's domain data off Supabase — Supabase stays as portal's Postgres
- Unifying the role model across apps — analytics keeps admin/viewer, portal keeps its richer set; only identity is shared

## Context

- **Three subdomains, one parent:** `portal.`, `analytics.`, `incidencias.` under `basket-app.com`. Cookie domain `.basket-app.com` enables cross-subdomain sessions.
- **Two backends:** portal uses **Supabase (cloud-hosted)** for its domain data; analytics uses its **own Postgres instance on the company server**. The shared auth DB lives on the company-server Postgres (dedicated database/schema — separate from analytics' domain tables; exact placement decided in planning).
- **Analytics already has Better Auth** (v1.6.11): Google-only, `@basquetpass.tv` allowlist, Drizzle adapter, tables `auth_user/session/account/verification/allowed_emails`, RBAC helpers (`requireSession`/`requireRole`/`requireDashboard`). This is the reference implementation.
- **Portal authz today** is layered: edge middleware + per-action `require*` guards + Postgres RLS. The guards survive the migration; RLS does not (it depends on Supabase `auth.uid()`).
- **User overlap is low** between apps — reinforces per-app authorization over a unified role model.
- **External users exist** on portal (collaborators, guest `mi-jornada` mode) who lack `@basquetpass.tv` Google accounts — portal's login cannot be Google-only or domain-locked.

## Constraints

- **Tech stack**: Better Auth (^1.6.11) is the chosen auth across all apps; reuse analytics' Drizzle + Postgres approach for the auth layer in portal.
- **Tech stack**: Portal stays on Next.js 16 App Router + Supabase (cloud) for domain data; auth adds a Drizzle/Postgres connection to the company-server auth DB.
- **Compatibility**: SSO requires identical `BETTER_AUTH_SECRET`, shared session table, and `.basket-app.com` cookie domain across all participating apps.
- **Security**: Service-role/admin DB access stays server-only; per-app access gates enforced in `databaseHooks`; portal authorization moves fully to the app layer once RLS is dropped.
- **Migration**: Existing portal users must retain access — no lockout; external-user path must work without Google.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Centralize identity only; keep domain DBs separate | 3 distinct domains, low user overlap; avoids coupling migrations/deploys and a Supabase rip-out | — Pending |
| Shared auth DB on company-server Postgres (not Supabase) | Right owner for a shared service; analytics' Better Auth tables already live there; avoids making identity depend on portal's managed Supabase | — Pending |
| Identity global, authorization per-app | Each app gates + assigns roles in its own table keyed by Better Auth user id; preserves portal's rich roles and analytics' simple ones | — Pending |
| Each app runs its own Better Auth config against one shared DB | Lets methods/gates differ per app (analytics Google-only; portal Google + external) while sharing sessions via common DB + cookie + secret | — Pending |
| Portal: drop Supabase RLS, use app-layer guards | `auth.uid()` disappears with Supabase Auth; portal already has `requireEditor`/`requireAdmin*`; matches how analytics already works | — Pending |
| Portal adds a non-Google login path | External collaborators/guests lack `@basquetpass.tv` Google accounts | — Pending |
| Milestone scope: shared auth + portal migration + analytics repoint | Deliver working SSO across both live apps now; incidencias later | — Pending |
| User migration approach deferred to research | Depends on user count + Supabase password hash format | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-03 after initialization*
