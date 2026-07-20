// drizzle.portal.config.ts
// Domain DB (matches, people, teams, grid, reports). Mirrors drizzle.auth.config.ts.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/portal",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
