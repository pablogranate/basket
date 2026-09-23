import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { testSql } from "@/test/integration/db";

// Production's Auth DB already holds users and Accesos when a new sibling app
// lands. Replays the journal up to the last deployed migration, fills it with
// data, then runs `db:auth:migrate`'s job (the rest of the journal) on top.
const UPGRADE_DB = "basket_portal_test_auth_upgrade";
const DEPLOYED_THROUGH = "0001_acceso_app_access";

async function journalThrough(tag: string) {
  const dir = await mkdtemp(join(tmpdir(), "auth-journal-"));
  await cp("drizzle/auth", dir, { recursive: true });
  const journalPath = join(dir, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  const cut = journal.entries.findIndex((entry) => entry.tag === tag);
  if (cut === -1) {
    throw new Error(`No Auth DB migration tagged ${tag}.`);
  }
  journal.entries = journal.entries.slice(0, cut + 1);
  await writeFile(journalPath, JSON.stringify(journal));
  return dir;
}

describe("Auth DB migrations over a database with data", () => {
  const admin = testSql();
  let sql: postgres.Sql;
  let deployedJournal: string;

  beforeAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${UPGRADE_DB}`);
    await admin.unsafe(`CREATE DATABASE ${UPGRADE_DB}`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${UPGRADE_DB}`;
    sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
    deployedJournal = await journalThrough(DEPLOYED_THROUGH);
  });

  afterAll(async () => {
    await sql?.end();
    await rm(deployedJournal, { recursive: true, force: true });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${UPGRADE_DB}`);
    await admin.end();
  });

  it("adds facturacion without touching existing Accesos, and stores write/admin as-is", async () => {
    await migrate(drizzle(sql), { migrationsFolder: deployedJournal });

    for (const id of ["u-ops", "u-coord", "u-admin"]) {
      await sql`
        INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
        VALUES (${id}, ${id}, ${`${id}@basquetpass.tv`}, true, now(), now())
      `;
    }
    await sql`
      INSERT INTO auth_app_access (user_id, app, level)
      VALUES ('u-ops', 'ops', 'write'), ('u-ops', 'analytics', 'read')
    `;

    await migrate(drizzle(sql), { migrationsFolder: "drizzle/auth" });

    expect(
      await sql`SELECT user_id, app::text, level::text FROM auth_app_access ORDER BY app`,
    ).toEqual([
      { user_id: "u-ops", app: "analytics", level: "read" },
      { user_id: "u-ops", app: "ops", level: "write" },
    ]);

    await sql`
      INSERT INTO auth_app_access (user_id, app, level)
      VALUES ('u-coord', 'facturacion', 'write'), ('u-admin', 'facturacion', 'admin')
    `;
    expect(
      await sql`
        SELECT user_id, level::text FROM auth_app_access
        WHERE app = 'facturacion' ORDER BY user_id
      `,
    ).toEqual([
      { user_id: "u-admin", level: "admin" },
      { user_id: "u-coord", level: "write" },
    ]);
  });
});
