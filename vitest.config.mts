import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // Integration tests need a live Postgres and run under
    // vitest.integration.config.mts (`npm run test:integration`). Keep the
    // default unit run DB-free so `npm run check` passes anywhere.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    // Route-handler tests dynamically import heavy module graphs (`await
    // import("../route")`); under parallel worker contention that transform can
    // exceed the 5s default and flake. Give them headroom.
    testTimeout: 20000,
    env: {
      AUTH_DATABASE_URL: "postgres://test:test@localhost:5432/test",
      BETTER_AUTH_SECRET: "test-better-auth-secret-value-0000000000",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    },
  },
});
