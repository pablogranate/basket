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
