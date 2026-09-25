CREATE TABLE "auth_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"target_user_id" text,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_target_user_id_auth_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_audit_log_target_idx" ON "auth_audit_log" USING btree ("target_user_id","created_at");