# Context Map

The basket-app.com sibling apps, each its own repo and its own context. This file and the system-wide ADRs live here, in the portal, because the portal owns the shared data. Each sibling keeps its own glossary.

## Contexts

- [Portal](./CONTEXT.md) — production (Grilla, assignments, notifications), the shared catalog (clubs, equipos, leagues, matches) and the people who work for us; also the only auth server.
- [Analytics](../data-bp/CONTEXT.md) — mirror of the streaming Platform (subscribers, pagos, contenido) and reports over it.
- Incidencias (`../incidencias-bp`) — broadcast incident reports, one per covered match.
- Ops hub (`../basquetpass-operations`) — club outreach: venues, connectivity, WhatsApp messaging.
- [Facturación](../facturacion-bp/CONTEXT-MAP.md) — monthly invoices from collaborators.
- Generator (`../basquet-image-generator`) — promotional images, no data of its own.
- Cashflow (`../cashflow-bp`) — company cash projection and its scenarios, fed by the finance team's Excel on Drive.

## Relationships

- **Portal → every sibling (identity)**: the portal logs people in and keeps every Acceso and Solicitud de acceso in the Auth DB; siblings are Session readers that decide their own Solicitudes there.
- **Portal → Incidencias, Ops hub, Analytics (catalog)**: the portal is the one owner of clubs, equipos, leagues and matches. Siblings reference them by the portal's ids and never keep their own copy.
- **Platform → Analytics**: the Platform owns subscribers, pagos and contenido; Analytics mirrors them and links them to the catalog through external ids.
- **Portal → Facturación (people)**: a collaborator who invoices us is a person the portal knows; Facturación holds only the billing details.
- **Portal → Cashflow (catalog)**: Cashflow's ingresos by league reference the portal's leagues by `league_id` (published catalog, ADR 0012), mapping the Excel's names through the same aliases as `src/lib/competition-league.ts`.
- **Analytics ↔ Cashflow (gateways)**: Cashflow's gateway ingresos and Analytics' payouts, pagos and exchange rates line up by gateway code, ISO country and, when known, `payout_id`.
- **Facturación ↔ Cashflow (invoices)**: Facturación's envíos and Cashflow's payroll lines line up by period and league.
- Cross-context references are shared keys (`league_id`, ISO country, gateway, `payout_id`), never foreign keys: each app keeps its own database.
