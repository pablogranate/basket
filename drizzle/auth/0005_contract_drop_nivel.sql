ALTER TABLE "auth_app_access" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "auth_app_role" DROP COLUMN "legacy_level";--> statement-breakpoint
DROP TYPE "public"."auth_app_access_app";--> statement-breakpoint
DROP TYPE "public"."auth_app_access_level";