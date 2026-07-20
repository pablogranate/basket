import { fileURLToPath } from "node:url";

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Data-layer integration tests: exercise the REAL Drizzle client against a
// throwaway Postgres (schema applied from the baseline migration). Kept in a
// separate config + `*.integration.test.ts` suffix so the default `npm run test`
// (and `npm run check`) stay unit-only and DB-free. Run via `npm run
// test:integration`, which spins the ephemeral container and sets DATABASE_URL.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    globalSetup: ["./src/test/integration/global-setup.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // One DB, shared across the suite — run serially so tests don't race on it.
    fileParallelism: false,
    env: {
      AUTH_DATABASE_URL: "postgres://test:test@localhost:5432/test",
      BETTER_AUTH_SECRET: "test-better-auth-secret-value-0000000000",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    },
  },
});
