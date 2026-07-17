CREATE TYPE "public"."app_role" AS ENUM('admin', 'editor', 'viewer', 'coordinator', 'collaborator');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('Pendiente', 'Confirmado', 'Realizado');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"setting_key" text NOT NULL,
	"secret_value" text,
	"public_value" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "app_settings_setting_key_key" UNIQUE("setting_key")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"person_id" uuid,
	"confirmed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"attendance_confirmed_at" timestamp with time zone,
	"attendance_response" text,
	"attendance_note" text,
	CONSTRAINT "assignments_match_role_unique" UNIQUE("match_id","role_id"),
	CONSTRAINT "assignments_attendance_response_check" CHECK (attendance_response = ANY (ARRAY['attending'::text, 'declined'::text]))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"match_id" uuid,
	"action" text NOT NULL,
	"changed_by" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "audit_log_action_check" CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))
);
--> statement-breakpoint
CREATE TABLE "club_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "club_aliases_alias_key" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "club_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_name" text NOT NULL,
	"league" text,
	"responsable" text,
	"phone" text,
	"source_block" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "club_contacts_unique" UNIQUE("club_name","responsable","phone")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"stadium" text,
	"website" text,
	"instagram" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"manager" text,
	"official_url" text,
	CONSTRAINT "clubs_name_key" UNIQUE("name"),
	CONSTRAINT "clubs_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "collaborator_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"reporter_profile_id" uuid,
	"incident_level" text NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"feed_detected" boolean DEFAULT false NOT NULL,
	"signal_label" text NOT NULL,
	"apto_lineal" boolean DEFAULT false NOT NULL,
	"test_time" text,
	"test_check" boolean DEFAULT false NOT NULL,
	"start_check" boolean DEFAULT false NOT NULL,
	"graphics_check" boolean DEFAULT false NOT NULL,
	"speedtest_value" text,
	"ping_value" text,
	"gpu_value" text,
	"technical_observations" text,
	"building_observations" text,
	"general_observations" text,
	"other_flag" boolean DEFAULT false NOT NULL,
	"st_flag" boolean DEFAULT false NOT NULL,
	"club_flag" boolean DEFAULT false NOT NULL,
	"other_observation" text,
	"st_observation" text,
	"club_observation" text,
	"problems" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "collaborator_reports_assignment_unique" UNIQUE("assignment_id"),
	CONSTRAINT "collaborator_reports_incident_level_check" CHECK (incident_level = ANY (ARRAY['sin'::text, 'baja'::text, 'alta'::text, 'critica'::text]))
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" text PRIMARY KEY NOT NULL,
	"competition" text,
	"category" text,
	"phase" text,
	"group" text,
	"home_club" text,
	"home_team" text,
	"away_club" text,
	"away_team" text,
	"suspended" boolean DEFAULT false NOT NULL,
	"home_points" integer,
	"away_points" integer,
	"match_date" date,
	"match_time" text,
	"venue" text,
	"court" text,
	"city" text,
	"province" text,
	"synced_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grid_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"assignments_upserted" integer DEFAULT 0 NOT NULL,
	"assignments_deleted" integer DEFAULT 0 NOT NULL,
	"people_created" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"finished_at" timestamp with time zone,
	"deleted_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text,
	"sort_order" integer,
	"is_external" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "leagues_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition" text,
	"production_mode" text,
	"status" "match_status" DEFAULT 'Pendiente' NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"venue" text,
	"kickoff_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 150 NOT NULL,
	"timezone" text DEFAULT 'America/Bogota' NOT NULL,
	"owner_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"production_code" text,
	"commentary_plan" text,
	"transport" text,
	"day_notified_at" timestamp with time zone,
	"league_id" uuid,
	CONSTRAINT "matches_duration_minutes_check" CHECK (duration_minutes > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"match_id" uuid,
	"person_id" uuid,
	"match_label" text DEFAULT '' NOT NULL,
	"recipient_name" text DEFAULT '' NOT NULL,
	"role_names" text[] DEFAULT '{}' NOT NULL,
	"channel" text NOT NULL,
	"destination" text,
	"status" text NOT NULL,
	"error" text,
	"trigger" text NOT NULL,
	CONSTRAINT "notification_logs_channel_check" CHECK (channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'none'::text])),
	CONSTRAINT "notification_logs_status_check" CHECK (status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped'::text, 'no_contact'::text])),
	CONSTRAINT "notification_logs_trigger_check" CHECK (trigger = ANY (ARRAY['cron'::text, 'catchup'::text, 'boot'::text, 'manual'::text]))
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"category" text,
	"role_id" uuid
);
--> statement-breakpoint
CREATE TABLE "person_functions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"function_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	CONSTRAINT "person_functions_unique" UNIQUE("person_id","function_key"),
	CONSTRAINT "person_functions_key_check" CHECK (function_key = ANY (ARRAY['Responsable'::text, 'Realizador'::text, 'Operador de Control'::text, 'Operador de Grafica'::text, 'Soporte tecnico'::text, 'Productor'::text, 'Relator'::text, 'Comentario'::text, 'Campo'::text, 'Encoder'::text, 'Ingenieria'::text, 'Camara'::text]))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"role" "app_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"email" text NOT NULL,
	"auth_user_id" text
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'Produccion' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "roles_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "team_league_memberships" (
	"team_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"season" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "team_league_memberships_pkey" PRIMARY KEY("team_id","league_id","season")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'mayores' NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "teams_club_category_unique" UNIQUE("club_id","category"),
	CONSTRAINT "teams_slug_key" UNIQUE("slug"),
	CONSTRAINT "teams_category_check" CHECK (category = ANY (ARRAY['mayores'::text, 'proximo'::text, 'femenino'::text]))
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_aliases" ADD CONSTRAINT "club_aliases_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_contacts" ADD CONSTRAINT "club_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_contacts" ADD CONSTRAINT "club_contacts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_reports" ADD CONSTRAINT "collaborator_reports_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_reports" ADD CONSTRAINT "collaborator_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_reports" ADD CONSTRAINT "collaborator_reports_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_reports" ADD CONSTRAINT "collaborator_reports_reporter_profile_id_fkey" FOREIGN KEY ("reporter_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_reports" ADD CONSTRAINT "collaborator_reports_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_functions" ADD CONSTRAINT "person_functions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_functions" ADD CONSTRAINT "person_functions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_memberships" ADD CONSTRAINT "team_league_memberships_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_memberships" ADD CONSTRAINT "team_league_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_active_updated_idx" ON "announcements" USING btree ("active","updated_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "app_settings_key_idx" ON "app_settings" USING btree ("setting_key");--> statement-breakpoint
CREATE INDEX "assignments_match_idx" ON "assignments" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "assignments_person_idx" ON "assignments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_match_id" ON "assignments" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_person_id" ON "assignments" USING btree ("person_id") WHERE (person_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "audit_log_match_idx" ON "audit_log" USING btree ("match_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_audit_log_match_id" ON "audit_log" USING btree ("match_id") WHERE (match_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "club_aliases_club_id_idx" ON "club_aliases" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "club_contacts_name_idx" ON "club_contacts" USING btree ("club_name");--> statement-breakpoint
CREATE INDEX "collaborator_reports_match_idx" ON "collaborator_reports" USING btree ("match_id","submitted_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "collaborator_reports_reporter_idx" ON "collaborator_reports" USING btree ("reporter_profile_id","submitted_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "fixtures_category_idx" ON "fixtures" USING btree ("category");--> statement-breakpoint
CREATE INDEX "fixtures_match_date_idx" ON "fixtures" USING btree ("match_date");--> statement-breakpoint
CREATE INDEX "grid_sync_runs_started_idx" ON "grid_sync_runs" USING btree ("started_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_matches_away_team_trgm" ON "matches" USING gin ("away_team" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_matches_competition" ON "matches" USING btree ("competition") WHERE (competition IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_matches_competition_trgm" ON "matches" USING gin ("competition" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_matches_home_team_trgm" ON "matches" USING gin ("home_team" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_matches_kickoff_at" ON "matches" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "idx_matches_owner_id" ON "matches" USING btree ("owner_id") WHERE (owner_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "matches_kickoff_idx" ON "matches" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "matches_league_id_idx" ON "matches" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "matches_owner_idx" ON "matches" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_production_code_key" ON "matches" USING btree ("production_code") WHERE (production_code IS NOT NULL);--> statement-breakpoint
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "notification_logs_status_idx" ON "notification_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "people_category_idx" ON "people" USING btree ("category");--> statement-breakpoint
CREATE INDEX "people_role_id_idx" ON "people" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "person_functions_key_idx" ON "person_functions" USING btree ("function_key");--> statement-breakpoint
CREATE INDEX "person_functions_person_idx" ON "person_functions" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_auth_user_id_key" ON "profiles" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_lower_key" ON "profiles" USING btree (lower(email));--> statement-breakpoint
CREATE INDEX "team_league_memberships_league_season_idx" ON "team_league_memberships" USING btree ("league_id","season");--> statement-breakpoint
CREATE INDEX "teams_club_id_idx" ON "teams" USING btree ("club_id");