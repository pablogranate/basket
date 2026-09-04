# Basket Production

Dashboard operativo para programación deportiva con Next.js, Tailwind y Postgres (Drizzle) con Better Auth.

## Incluye

- Login unificado con Better Auth (Google / magic link) compartido en `*.basket-app.com`
- Grilla por día o mes con buscador y filtros por liga, modo, estado y responsable
- Detalle del partido con edición de datos base, asignaciones por rol, historial y conflictos por solape
- ABM de personas y roles
- Auditoría automática en `audit_log`
- Autorización en capa de aplicación por capacidades (`src/lib/roles.ts`): `admin`, `editor`, `collaborator`
- Link dinámico a Google Calendar y panel `GRUPO` con copiar / abrir WhatsApp
- Importador CSV en `tools/import`
- Primera pantalla móvil `Mi jornada` para colaboradores vinculados por correo o nombre a `Personal`

## Stack

- Next.js 16 App Router
- Tailwind CSS 4
- Postgres autoalojado (`basket-portal-db`) vía Drizzle + Better Auth (`basket-auth-db`)

## Calidad y proceso

- `CHANGELOG.md`: historial de cambios relevantes
- `CONTRIBUTING.md`: normas de desarrollo y definición de done
- `docs/production-sheet.md`: hoja de produccion visual con tipografia, colores y reglas del sistema
- `docs/roadmap.md`: hoja de ruta funcional y técnica para `Producción`, `Reportes`, `Incidencias`, `Equipos`, `Personal` e IA
- `docs/colaboradores.md`: propuesta de portal móvil para colaboradores, permisos, flujos y modelo de datos sugerido
- `.github/workflows/ci.yml`: verificación automática en push y PR
- `.github/pull_request_template.md`: checklist mínima para cambios reales

Comandos de verificación:

```bash
npm run lint
npm run typecheck
npm run check
```

## Setup

1. Instala dependencias:

```bash
npm install
```

2. Crea tu entorno local:

```bash
cp .env.example .env.local
```

3. Completa estas variables:

```bash
DATABASE_URL=postgresql://basket_portal:...@127.0.0.1:5434/basket_portal
AUTH_DATABASE_URL=postgresql://basket_auth:...@127.0.0.1:5433/basket_auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_APP_TIMEZONE=America/Bogota
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Levanta los contenedores locales y aplica las migraciones:

```bash
podman start basket-portal-db basket-auth-db
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

(`supabase/migrations/` conserva el nombre por historia; el proyecto ya no usa Supabase. Ver `docs/adr/0002-self-hosted-portal-domain-db.md`.)

5. Iniciá sesión una vez y promové tu perfil a admin:

```sql
update public.profiles set role = 'admin' where email = '<TU_EMAIL>';
```

Roles disponibles:

- `admin`: acceso total (ajustes, logs, gestión de niveles de acceso)
- `editor` (Productor): grilla completa, personas, equipos, aprobación de solicitudes; otorga solo accesos Externo
- `collaborator` (Externo): `Mi jornada` y sus reportes

6. Levanta el proyecto:

```bash
npm run dev
```

## Importar CSV

El importador mapea columnas típicas como `Día`, `Hora`, `Liga`, `Producción`, `Partido`, `Local`, `Visitante`, `Responsable`, `Observaciones` y trata el resto de columnas como roles.

```bash
npm run import:csv -- ./archivo.csv
```

También acepta una zona horaria por argumento:

```bash
npm run import:csv -- ./archivo.csv America/Bogota
```

## Rutas

- `/login`
- `/grid`
- `/match/[id]`
- `/mi-jornada`
- `/people`
- `/roles`
- `/api/health`

## Notas

- Si falta `DATABASE_URL` o `AUTH_DATABASE_URL`, el primer acceso a la base falla con un error explícito desde `src/lib/env.ts`.
- La auditoría se genera desde triggers SQL sobre `matches`, `people`, `roles` y `assignments`.
- Los conflictos por solape se calculan en el detalle del partido usando la ventana `kickoff_at + duration_minutes`.
