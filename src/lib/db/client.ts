import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { appEnv, assertDatabaseUrl } from "@/lib/env";
import * as schema from "@/lib/db/schema";
import * as relations from "@/lib/db/relations";

const fullSchema = { ...schema, ...relations };
type Schema = typeof fullSchema;

const globalForDb = globalThis as unknown as {
  portalConn?: ReturnType<typeof postgres>;
  portalDb?: PostgresJsDatabase<Schema>;
};

function buildDb(): PostgresJsDatabase<Schema> {
  if (globalForDb.portalDb) {
    return globalForDb.portalDb;
  }
  assertDatabaseUrl();
  // Direct connection (no pgbouncer transaction mode) — plain defaults, modest pool.
  const conn = globalForDb.portalConn ?? postgres(appEnv.databaseUrl, { max: 10 });
  const instance = drizzle(conn, { schema: fullSchema });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.portalConn = conn;
    globalForDb.portalDb = instance;
  }
  return instance;
}

// Lazy: the connection is built on first query, not at import. Keeps modules
// that merely import a loader (and their tests) from requiring DATABASE_URL.
export const db = new Proxy({} as PostgresJsDatabase<Schema>, {
  get(_target, prop, receiver) {
    const instance = buildDb();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
