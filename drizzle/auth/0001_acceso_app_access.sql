CREATE TYPE "public"."auth_app_access_app" AS ENUM('analytics', 'incidencias', 'generator', 'ops');--> statement-breakpoint
CREATE TYPE "public"."auth_app_access_level" AS ENUM('read', 'write', 'admin');--> statement-breakpoint
CREATE TABLE "auth_app_access" (
	"user_id" text NOT NULL,
	"app" "auth_app_access_app" NOT NULL,
	"level" "auth_app_access_level" NOT NULL,
	"granted_by" text,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_app_access_user_id_app_pk" PRIMARY KEY("user_id","app")
);
--> statement-breakpoint
ALTER TABLE "auth_app_access" ADD CONSTRAINT "auth_app_access_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_app_access" ADD CONSTRAINT "auth_app_access_granted_by_auth_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;