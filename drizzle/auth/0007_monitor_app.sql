-- Monitor (monitor.basket-app.com) joins the catalog. Its App gate runs in
-- nginx against /api/gates/monitor; the Operador only watches, the Admin also
-- loads and finishes matches. No Accesos or Solicitud recipients are seeded
-- here: both are set from /usuarios.
INSERT INTO "auth_app" ("key", "label", "sort_order") VALUES
	('monitor', 'Monitor', 70);--> statement-breakpoint
INSERT INTO "auth_app_role" ("app", "key", "label", "description", "rank", "is_admin") VALUES
	('monitor', 'operador', 'Operador', 'Ve el monitor, el video en vivo y el historial.', 10, false),
	('monitor', 'admin', 'Admin', 'Además carga y finaliza partidos y ve los links.', 30, true);
