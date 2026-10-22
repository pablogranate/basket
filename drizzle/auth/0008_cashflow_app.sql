-- Cashflow (cashflow.basket-app.com) joins the catalog. It reads the session
-- itself, so it needs no nginx App gate. Lectura views, filters, exports and
-- asks the assistant; Admin also edits, loads, syncs Drive and sets the
-- baseline. No Accesos are seeded: they are granted from /usuarios.
INSERT INTO "auth_app" ("key", "label", "sort_order") VALUES
	('cashflow', 'Cashflow', 80);--> statement-breakpoint
INSERT INTO "auth_app_role" ("app", "key", "label", "description", "rank", "is_admin") VALUES
	('cashflow', 'lectura', 'Lectura', 'Ve, filtra, exporta y consulta al asistente.', 10, false),
	('cashflow', 'admin', 'Admin', 'Además edita, carga, sincroniza Drive y fija la línea base.', 30, true);--> statement-breakpoint
INSERT INTO "auth_app_request_recipients" ("app", "email") VALUES
	('cashflow', 'wences.capolo@basquetpass.tv');
