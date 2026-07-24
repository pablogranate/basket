# PWA install without a service worker

The portal ships as an installable PWA (web app manifest + icons, offered via an "Agregá a tu inicio" mobile banner) but deliberately registers **no service worker**. Installability relies on the manifest, icons, and HTTPS alone — which modern Chromium treats as sufficient to fire `beforeinstallprompt`.

## Context

A service worker is the usual companion to a PWA, and a reader seeing an installable app with none will wonder if it was forgotten. It wasn't. The portal is a live production tool backed by Supabase: match grids, assignments, and notifications are only meaningful online, and there is no useful offline experience to cache toward. A SW's core job here would be caching — and that caching is exactly what we want to avoid.

## Decision

No service worker. The manifest (`start_url: "/"`, `standalone`, brand icons) plus the middleware exclusion for `/manifest.webmanifest` are the entire install surface.

## Considered options

- **SW with a caching strategy** — rejected. Cache-first risks serving stale grids/assignments; even stale-while-revalidate delays deploys reaching users (the classic "stuck on the old build until a second visit"). For a live-data tool that is a correctness hazard, not a perf win.
- **No-op / network-only SW** — rejected as unnecessary. It adds an update-lifecycle to reason about and buys nothing, since Chromium no longer requires a SW for installability.
- **No SW (chosen)** — simplest surface, no stale-data or deploy-lag failure modes, users always hit the latest deploy.

## Consequences

- No offline support and no precaching — acceptable, the app is useless offline anyway.
- If some older Android build ever refuses to prompt without a SW, the remedy is a minimal network-only SW added then — a small, contained follow-up, not a reason to add caching now.
- Reintroducing a SW later means taking on cache-invalidation and update-lifecycle concerns deliberately; it should clear that bar before being added.
