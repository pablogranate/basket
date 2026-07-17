import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { appEnv, assertDatabaseUrl } from "@/lib/env";
import * as schema from "@/lib/db/schema";
import * as relations from "@/lib/db/relations";

const globalForDb = globalThis as unknown as {
  portalConn?: ReturnType<typeof postgres>;
};

function buildConnection() {
  assertDatabaseUrl();
  // Direct connection (no pgbouncer transaction mode) — plain defaults, modest pool.
  return postgres(appEnv.databaseUrl, { max: 10 });
}

export const portalConn = globalForDb.portalConn ?? buildConnection();
if (process.env.NODE_ENV !== "production") {
  globalForDb.portalConn = portalConn;
}

export const db = drizzle(portalConn, { schema: { ...schema, ...relations } });
