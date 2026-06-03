// drizzle.auth.config.ts
// Source: STACK.md §5 + orm.drizzle.team/docs/drizzle-config-file
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/auth/schema.ts",
  out: "./drizzle/auth",
  dbCredentials: { url: process.env.AUTH_DATABASE_URL! },
});
