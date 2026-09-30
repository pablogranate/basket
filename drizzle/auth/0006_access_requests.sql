CREATE TABLE "auth_access_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"app" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"funcion" text,
	"ciudad" text,
	"mensaje" text,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"granted_role" text,
	"person_id" uuid,
	CONSTRAINT "auth_access_request_status_check" CHECK (status IN ('pendiente', 'aprobada', 'rechazada'))
);
--> statement-breakpoint
CREATE TABLE "auth_app_request_recipients" (
	"app" text NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "auth_app_request_recipients_app_email_pk" PRIMARY KEY("app","email")
);
--> statement-breakpoint
ALTER TABLE "auth_access_request" ADD CONSTRAINT "auth_access_request_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_request" ADD CONSTRAINT "auth_access_request_app_auth_app_key_fk" FOREIGN KEY ("app") REFERENCES "public"."auth_app"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_request" ADD CONSTRAINT "auth_access_request_decided_by_auth_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_app_request_recipients" ADD CONSTRAINT "auth_app_request_recipients_app_auth_app_key_fk" FOREIGN KEY ("app") REFERENCES "public"."auth_app"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_access_request_pending_user_app_key" ON "auth_access_request" USING btree ("user_id","app") WHERE status = 'pendiente';--> statement-breakpoint
CREATE UNIQUE INDEX "auth_access_request_pending_email_app_key" ON "auth_access_request" USING btree (lower("email"),"app") WHERE status = 'pendiente';--> statement-breakpoint
CREATE INDEX "auth_access_request_user_idx" ON "auth_access_request" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_access_request_app_status_idx" ON "auth_access_request" USING btree ("app","status","created_at");