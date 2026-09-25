CREATE TABLE "auth_app" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_app_role" (
	"app" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"rank" integer NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"legacy_level" "auth_app_access_level",
	CONSTRAINT "auth_app_role_app_key_pk" PRIMARY KEY("app","key")
);
--> statement-breakpoint
ALTER TABLE "auth_app_role" ADD CONSTRAINT "auth_app_role_app_auth_app_key_fk" FOREIGN KEY ("app") REFERENCES "public"."auth_app"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_app_role_one_admin_per_app" ON "auth_app_role" USING btree ("app") WHERE "auth_app_role"."is_admin";--> statement-breakpoint
INSERT INTO "auth_app" ("key", "label", "sort_order") VALUES
	('portal', 'Portal', 10),
	('analytics', 'Analytics', 20),
	('incidencias', 'Incidencias', 30),
	('generator', 'Generador', 40),
	('ops', 'Operaciones', 50),
	('facturacion', 'Facturación', 60);--> statement-breakpoint
INSERT INTO "auth_app_role" ("app", "key", "label", "description", "rank", "is_admin", "legacy_level") VALUES
	('portal', 'collaborator', 'Externo', 'Su jornada, sus partidos y sus reportes.', 10, false, NULL),
	('portal', 'editor', 'Productor', 'Todo el tablero; gestiona accesos de Externos.', 20, false, NULL),
	('portal', 'admin', 'Admin', 'Todo, incluida la configuración y los roles.', 30, true, NULL),
	('analytics', 'read', 'Lectura', 'Todos los tableros.', 10, false, 'read'),
	('analytics', 'write', 'Escritura', 'Todos los tableros.', 20, false, 'write'),
	('analytics', 'admin', 'Admin', 'Todos los tableros.', 30, true, 'admin'),
	('incidencias', 'read', 'Lectura', 'Ver incidencias y reportes.', 10, false, 'read'),
	('incidencias', 'write', 'Escritura', 'Cargar, editar y borrar incidencias.', 20, false, 'write'),
	('incidencias', 'admin', 'Admin', 'Cargar, editar y borrar incidencias.', 30, true, 'admin'),
	('generator', 'read', 'Lectura', 'Habilita la herramienta.', 10, false, 'read'),
	('generator', 'write', 'Escritura', 'Habilita la herramienta.', 20, false, 'write'),
	('generator', 'admin', 'Admin', 'Habilita la herramienta.', 30, true, 'admin'),
	('ops', 'read', 'Lectura', 'Solo el tablero.', 10, false, 'read'),
	('ops', 'write', 'Escritura', 'Clubes, mensajes, importaciones.', 20, false, 'write'),
	('ops', 'admin', 'Admin', 'Clubes, mensajes, importaciones.', 30, true, 'admin'),
	('facturacion', 'periodista', 'Periodista', 'Carga sus propias facturas.', 10, false, 'read'),
	('facturacion', 'coordinador', 'Coordinador', 'Carga y gestiona a sus periodistas.', 20, false, 'write'),
	('facturacion', 'admin', 'Admin', 'Ve y administra todas las facturas.', 30, true, 'admin');--> statement-breakpoint
ALTER TABLE "auth_app_access" ALTER COLUMN "app" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "auth_app_access" ALTER COLUMN "level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_app_access" ADD COLUMN "role" text;--> statement-breakpoint
UPDATE "auth_app_access" AS a
	SET "role" = r."key"
	FROM "auth_app_role" AS r
	WHERE r."app" = a."app" AND r."legacy_level" = a."level";--> statement-breakpoint
ALTER TABLE "auth_app_access" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_app_access" ADD CONSTRAINT "auth_app_access_app_auth_app_key_fk" FOREIGN KEY ("app") REFERENCES "public"."auth_app"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_app_access" ADD CONSTRAINT "auth_app_access_app_role_fk" FOREIGN KEY ("app","role") REFERENCES "public"."auth_app_role"("app","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE VIEW "auth_effective_access" AS
	SELECT a."user_id", a."app", a."role", r."rank", r."is_admin", false AS "via_superadmin"
	FROM "auth_app_access" AS a
	JOIN "auth_app_role" AS r ON r."app" = a."app" AND r."key" = a."role"
	JOIN "auth_user" AS u ON u."id" = a."user_id"
	WHERE NOT (coalesce(u."role", '') = 'superadmin' AND coalesce(u."banned", false) = false)
	UNION ALL
	SELECT u."id", r."app", r."key", r."rank", r."is_admin", true AS "via_superadmin"
	FROM "auth_user" AS u
	JOIN "auth_app_role" AS r ON r."is_admin"
	WHERE coalesce(u."role", '') = 'superadmin' AND coalesce(u."banned", false) = false;
