# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, adapted to the current workflow of this repository.

## [Unreleased]

### Changed

- Redesigned the dashboard shell to a light editorial system with Manrope typography, refined header/sidebar navigation, quick-create drawer, and a consistent surface/token palette across grid, login, people, roles, match detail, group actions, and history panels.
- Reworked the login page into a two-column editorial access screen and added a production sheet documenting typography, colors, surfaces, and component rules.
- Added a structured basketball club catalog and wired suggestions for competition, local team, and away team in match creation and editing flows.
- Rebuilt the match detail view around a hero summary, operational two-column layout, conflict-aware assignment cards, camera/transmission sections, and a cleaner activity timeline inspired by the new product direction.
- Reworked the grid match cards into wide work-order summaries with production metadata, role-grouped assignment blocks, and direct edit access aligned with the new operational visual language.
- Renamed the product shell to `Basket Production`, constrained production modes to `Encoder`, `Offtube Remoto`, and `Cancha`, and redesigned the quick-create rail into a denser light card aligned with the new basketball operations brand.
- Reframed `/people` as `Personal`, added a richer staffing table with real assignment-derived status and role context, and rebuilt the CRUD screen around a cleaner quick-create plus focused edit workflow.
- Added a server-side team logo resolver that matches club names against the files in `public/Logos`, including tolerant aliases for uneven filenames, and wired it into the grid cards and match detail hero.
- Refined the grid match card into a compact summary row with a chevron-based dropdown, keeping the full technical assignment breakdown available on demand instead of always expanded.
- Tuned the grid summary card with league-colored round tags, red kickoff time, production ID/date in the left rail, left-aligned two-line team names, and a more rigid broadcast-style composition for consistent club name alignment.
- Audited the product copy so the visible UI stays in Spanish with corrected accents, plus display helpers for role/category names that preserve internal database values while rendering labels such as `Producción`, `Cámaras`, and `Soporte técnico`.
- Tightened the grid card typography and added word-aware team-name wrapping to two left-aligned lines of roughly 12 characters, while enlarging the summary tags to give the broadcast row more balance.
- Added quick in-card editing on the grid summary row so clicking club logos or summary tags can update local, visitante, liga, modo, and estado directly from popover forms without leaving the schedule view.
- Fixed the desktop team matchup block to a stable-width composition, reduced the team-name typography slightly, and kept the `vs` marker centered in a non-fluid layout for more consistent schedule rows.
- Expanded the competition catalog with additional basketball properties such as `ABB`, `BCLA`, `Liga Desarrollo`, `Super 20`, several `3x3` labels, and other tournament names so they are available across create/edit flows even before club rosters are loaded.
- Reshaped the main shell around a fixed left sidebar and editorial top header inspired by the latest reference, including new navigation icons, stronger brand treatment, a refined user block, and a client-side avatar picker with per-user browser persistence.
- Added a global dashboard footer meta bar that summarizes current operational integrations and local resources such as Supabase, auth, logos, Google Calendar, and WhatsApp in a compact status strip.
- Added a new `Equipos` section with a local team-directory data layer, operational club cards, navigation integration, league tabs, search/filter flow, and a basic team detail route ready to be replaced later by persisted data.
- Updated the team-logo resolver to prioritize the new `public/LogosPNG` library while keeping the original logo set as fallback, plus improved folder hints and tolerant aliases so the current basketball club catalog resolves cleanly against uneven filenames.
- Added a first `Incidencias` module with its own dashboard route, navigation entry, operational incident table, right-side technical drawer, and a column model centered on `Problema principal`, `Operador control`, and `Streamer` instead of low-level metrics in the main list.
- Extended `Personal` with `Rol principal` and `Responsable de equipos` in both quick-create and edit flows, storing that operational context in a structured way inside notes until the people model gets dedicated columns.
- Added a first `Configuración` area with avatar management, Gemini API setup, and basic interface preferences, plus a `Pregúntale a la IA` assistant in `Personal` that can answer questions from the visible staffing context through an internal Gemini-powered endpoint.
- Expanded the Gemini assistant into a reusable per-module tool so `Producción`, `Personal`, `Roles`, `Equipos`, `Incidencias`, and `Reportes` can answer questions from the records currently visible in each section.
- Added a first `Reportes` module with its own dashboard route, navigation entry, KPI strip, executive report table, and right-side analytics for league distribution, operational risk, and recent report activity.
- Aligned the `Reportes` view with the final report domain by replacing the visible `Estado` column with `Gravedad` and adding `Sin incidencia` as a first-class severity value across the table and KPI logic.
- Updated the `Incidencias` workspace so the technical side drawer stays closed by default and only opens after selecting a row, with an explicit close action in the panel header.
- Refined the `Incidencias` workspace layout so the main table fills the available vertical space by default and shrinks into a split view only after opening the side drawer.
- Added a first KPI strip to `Incidencias`, with visible counts for total incidents, critical open cases, items in management, and resolved cases based on the incidents currently in view.
- Changed the `Incidencias` detail panel into a viewport-anchored drawer so it opens from the top of the visible area and avoids forcing the user to scroll to find the selected record.
- Unified the primary schedule module naming as `Producción` across dashboard navigation and the match-detail breadcrumb, removing lingering `Partidos` and `Grilla` labels.
- Added mini circular operator and streamer avatars to the `Incidencias` table and detail drawer, using initials until the module is connected to real profile photos.
- Unified the main visible surfaces of the app around a shared panel system with `10px` radius and a single shadow token, applying it across cards, tables, drawers, report/incident KPI blocks, team cards, the production shell, and the match-detail panels.
- Added a production calendar picker to the `Producción` header, with month navigation, per-day schedule dots based on real matches, and direct jump-to-day navigation from the grid toolbar.
- Updated `Reportes` so the left match cell now shows both team shields plus the feed ID inside a tag-style pill, and matched the same pill treatment for the production ID inside `Producción` cards.
- Unified the main tabular modules around the same report-style table shell, so `Reportes`, `Incidencias`, and `Personal` now share the same card header, column header treatment, paddings, and footer bar language.
- Added sortable headers to the main `Reportes` table so the visible columns can now toggle ordering directly from the title row, including match, responsible, operativa, and severity.
- Reshaped the first column of `Incidencias` to mirror `Reportes`, combining shields, record ID, full match label, and competition into the same unified match-summary block.
- Reworked the shared match-summary block in `Reportes` and `Incidencias` so both now stack local team, a red `vs`, and away team vertically next to the shields, improving readability and space usage in the first column.
- Removed the `Estado` concept from the `Incidencias` module, simplifying the local data model, KPIs, table, drawer, AI guidance, and CTA flow so incidents are tracked only by severity and technical context.
- Added a new `Pruebas de salida` block to the `Incidencias` drawer, grouping `Prueba`, `Inicio`, and `Gráfica` as explicit operational checks instead of burying them inside free-form observations.
- Added a first speedtest-proof workflow to `Incidencias`: technicians can now attach a screenshot as operational evidence, and if Gemini is configured the drawer attempts to extract upload/ping values automatically while still keeping the attachment visible as fallback proof.
- Added delayed hover previews for compact visual identities: team shields now enlarge on hover, and the mini avatars in `Incidencias` and `Reportes` expose a delayed role tooltip to make people easier to identify without opening a record.
- Unified severity pills in `Reportes` and `Incidencias` with explicit icons per level, making `Crítica`, `Alta`, `Media`, `Baja`, and `Sin incidencia` easier to distinguish at a glance.
- Continued refining the `Producción` work-order card so the match block, metadata columns, expand/collapse control, venue link, typography, and category labels align more closely with the latest broadcast-style references.
- Added `docs/colaboradores.md` to define the future mobile collaborator portal, including roles, permissions, assignment-based access, suggested submission tables, and the recommended rollout phases.
- Implemented Phase A of the collaborator model by extending the role system with `coordinator` and `collaborator`, updating the SQL helper permissions, the generated Supabase types, and the visible role labels in the app.
- Added `Mi jornada` as the first collaborator-facing mobile screen, driven by real assignments linked to the logged-in user through `Personal`, with quick access to the assigned match, production board, and WhatsApp contact.
- Added a temporary SQL/application permission bridge so `collaborator` can edit while the mobile workflow is being built out, and exposed `Mi jornada` in the main dashboard navigation.
- Rebuilt `Mi jornada` into a real mobile-first collaborator console, centered on today's assignments with stronger operational cards, responsible/realizer/talent context, quick WhatsApp access, and a direct `Reportar` flow for field updates from the phone.
- Refined `Mi jornada` into a tighter assignment board for collaborators, with logo-led match cards, abbreviated crew names, event IDs, venue context, and faster mobile actions for WhatsApp/reporting.
- Replaced the old `Alta rápida` rail in `Producción` with a right-side daily insights panel, and moved match creation into a full `Nuevo partido` modal that supports external ID lookup, local-team defaults for league/venue, and missing-field highlighting for incomplete API fills.

### Fixed

- Fixed the audit trigger function so `roles` and `people` inserts no longer fail by incorrectly referencing `match_id` on unrelated tables.

### Added

- Added an automatic match-day notification blast (PATH 1): at 12:30 ARG (`America/Argentina/Buenos_Aires`) every person assigned to a `Pendiente`/`Confirmado` match kicking off that day receives a convocatoria over WhatsApp (valid phone) and email (valid email), reusing the existing OpenWA sender, nodemailer transport, and message builders. Backed by a per-match one-shot marker (`matches.day_notified_at`, migration `0018`), two in-process `node-cron` schedules (main `NOTIFICATIONS_CRON` + hourly catch-up) plus a boot tick for missed sends, a `NOTIFICATIONS_ENABLED` kill switch, and the service-role admin client. The existing manual "send to all" path is untouched.
- Added a contributor workflow with `CONTRIBUTING.md`, `.editorconfig`, CI, and PR checklist to enforce a more production-ready development process.
- Added explicit quality scripts: `npm run typecheck` and `npm run check`.
- Added a shared dashboard header pattern and normalized visible control radii to the `10px` panel token across the main Basket Production modules.
- Added `docs/roadmap.md` as the implementation roadmap for the next product phases around `Producción`, `Reportes`, `Incidencias`, `Equipos`, persisted attachments, auditability, and contextual AI.

## [0.1.0] - 2026-03-05

### Added

- Created the initial Next.js 16 dashboard scaffold with Tailwind CSS 4 and App Router.
- Integrated Supabase SSR foundations for auth, server-side sessions, and protected dashboard navigation.
- Added the operational screens: `/login`, `/grid`, `/match/[id]`, `/people`, `/roles`, and `/api/health`.
- Implemented CRUD flows with Server Actions for matches, assignments, people, and roles.
- Added SQL migration and seed files for `profiles`, `matches`, `people`, `roles`, `assignments`, and `audit_log`.
- Implemented row-level security policies for `admin`, `editor`, and `viewer`.
- Added audit triggers and automatic row metadata management in Postgres.
- Implemented Google Calendar link generation, WhatsApp roster utilities, and assignment overlap warnings.
- Added a CSV importer for loading matches and role assignments from spreadsheet exports.
