import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { appEnv, assertAuthDatabaseUrl } from "@/lib/env";
import * as authSchema from "@/lib/auth/schema";

const globalForAuthDb = globalThis as unknown as {
  authConn?: ReturnType<typeof postgres>;
};

function buildConnection() {
  assertAuthDatabaseUrl();
  return postgres(appEnv.authDatabaseUrl, { prepare: false });
}

export const authConn = globalForAuthDb.authConn ?? buildConnection();
if (process.env.NODE_ENV !== "production") {
  globalForAuthDb.authConn = authConn;
}

export const authDb = drizzle(authConn, { schema: authSchema });

// The query surface shared by `authDb` and an `authDb.transaction` callback's
// `tx`. Modules that must run inside a caller's Auth DB transaction take this.
export type AuthDbExecutor = Pick<
  typeof authDb,
  "select" | "insert" | "update" | "delete"
>;
