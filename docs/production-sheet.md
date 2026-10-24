# Production Sheet

## Purpose

This document defines the visual direction of `Basket Production` so new UI work stays aligned across login, grid, match detail, people, and roles.

## Visual Direction

- Tone: editorial, operational, premium, clear
- Product type: internal live production dashboard
- Mood: calm, executive, fast to scan
- Avoid: dark shells, neon glow, heavy glass, generic SaaS gradients, purple defaults
- Primary desktop target: `1366x768`
- Layout density should feel compact and resolved on laptop screens before scaling up to larger monitors

## Typography

- Primary family: `Manrope`
- Runtime source: [src/app/layout.tsx](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/app/layout.tsx)
- Weights in use: `400`, `500`, `700`, `800`

### Type Roles

- Page hero/title: `font-black`, tight tracking
- Section title: `font-extrabold`
- Labels: `font-bold` or `font-semibold`
- Body/support copy: `font-medium`
- Utility/meta copy: uppercase with wide tracking

## Core Color Tokens

Defined in [src/app/globals.css](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/app/globals.css).

- `--background`: `#fafafa`
- `--background-soft`: `#f6f4f4`
- `--surface`: `#ffffff`
- `--surface-muted`: `#fdfcfc`
- `--foreground`: `#1c0d10`
- `--muted`: `#6b5d5f`
- `--border`: `#eeeeee`
- `--accent`: `#e61238`
- `--accent-soft`: `#fff0f3`
- `--accent-strong`: `#c61031`

### Semantic Usage

- Main CTA: accent red
- Active navigation: accent soft background + accent text
- Success/admin accent: soft green, never neon
- Warning/conflict: warm amber on light background
- Neutral surfaces: white or soft warm gray only

## Layout System

### App Shell

- Top bar: white, slim, product-like, subtle bottom border
- Left sidebar: white, persistent on desktop, grouped navigation
- Main area: light background, cards on white surfaces
- Right rail/drawer: white card, same border rhythm as main content

### Card Language

- Radius: `20px` to `24px`
- Border: always visible, very soft
- Shadow: subtle only
- No dark translucent panels in light mode

## Component Rules

### Buttons

- Primary: red fill, white text, soft red shadow
- Secondary: white surface, neutral border
- Danger: light pink background, dark rose text
- Never use dark filled buttons in the light shell except for very specific brand moments

### Inputs

- Height: `52px` on laptop baseline, `56px` on larger desktop
- Background: `--background-soft`
- Border: `--border`
- Focus: accent border + soft accent ring

### Badges

- Default: neutral light badge
- Status:
  - Pending: muted rose-gray
  - Confirmed: soft red
  - Completed: soft green

## Login Page Spec

Source implementation: [src/app/(auth)/login/page.tsx](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/app/(auth)/login/page.tsx)

- Two-column layout on desktop
- Must fit cleanly in `1366x768` without forcing excessive scrolling or oversized hero blocks
- Left side: editorial brand panel with operational product story
- Right side: focused authentication card
- Mobile: collapse to the auth card with compact brand header
- Background: warm light gradient, not pure gray
- Brand icon block: dark square with white icon

## Grid Page Spec

Primary references:

- [src/components/layout/dashboard-shell.tsx](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/components/layout/dashboard-shell.tsx)
- [src/app/(dashboard)/grid/page.tsx](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/app/(dashboard)/grid/page.tsx)
- [src/components/grid/create-match-modal.tsx](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/components/grid/create-match-modal.tsx)

Rules:

- Header must feel like a mature product bar
- Sidebar should remain visually lighter than the content area
- Filters should read as one operational control block
- Quick-create rail should feel stable and production-ready
- Allowed production modes in forms and filters: `Encoder`, `Offtube Remoto`, `Cancha`

## Match Detail Spec

Primary references:

- [src/app/(dashboard)/match/[id]/page.tsx](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/app/(dashboard)/match/[id]/page.tsx)
- [src/components/match/group-actions.tsx](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/components/match/group-actions.tsx)
- [src/components/match/history-timeline.tsx](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/components/match/history-timeline.tsx)

Rules:

- Hero card stays light
- Assignment rows use soft nested surfaces
- Conflict banners use warm amber, not red unless destructive
- Group and history panels must look operational, not chat-like

## Operational Catalogs

- Club and competition source file: [src/lib/club-catalog.ts](/Users/santiagocordoba/GITHUBS/Dashboard produccion/src/lib/club-catalog.ts)
- Current scope:
  - Liga Nacional / Liga Próximo
  - Liga Argentina
  - Liga Federal
  - Liga Metropolitana
  - Liga Femenina
  - Contactos Liga Argentina Offtube
- Forms should prefer suggestions from this catalog for `Liga`, `Local` and `Visitante`.

## Non-Negotiables

- Keep `Manrope` as the primary UI family
- Keep the shell light by default
- Preserve visual consistency between login and dashboard
- Record significant visual changes in [CHANGELOG.md](/Users/santiagocordoba/GITHUBS/Dashboard produccion/CHANGELOG.md)
