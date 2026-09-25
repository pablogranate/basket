import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { testSql } from "@/test/integration/db";

// Production's Auth DB already holds users and Accesos when a migration lands.
// Each case replays the journal up to what was deployed, fills it with data,
// then runs the next migration(s) on top — `db:auth:migrate`'s job.
const UPGRADE_DB = "basket_portal_test_auth_upgrade";

const tempDirs: string[] = [];

async function journalThrough(tag: string) {
  const dir = await mkdtemp(join(tmpdir(), "auth-journal-"));
  tempDirs.push(dir);
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

  async function migrateThrough(tag: string) {
    await migrate(drizzle(sql), { migrationsFolder: await journalThrough(tag) });
  }

  async function seedUsers(...ids: string[]) {
    for (const id of ids) {
      await sql`
        INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
        VALUES (${id}, ${id}, ${`${id}@basquetpass.tv`}, true, now(), now())
      `;
    }
  }

  beforeEach(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${UPGRADE_DB}`);
    await admin.unsafe(`CREATE DATABASE ${UPGRADE_DB}`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${UPGRADE_DB}`;
    sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  });

  afterEach(async () => {
    await sql?.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${UPGRADE_DB}`);
  });

  afterAll(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    await admin.end();
  });

  it("adds facturacion without touching existing Accesos, and stores write/admin as-is", async () => {
    await migrateThrough("0001_acceso_app_access");
    await seedUsers("u-ops", "u-coord", "u-admin");
    await sql`
      INSERT INTO auth_app_access (user_id, app, level)
      VALUES ('u-ops', 'ops', 'write'), ('u-ops', 'analytics', 'read')
    `;

    await migrateThrough("0002_acceso_facturacion");

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

  it("backfills every existing Acceso's role from its Nivel and keeps the Nivel", async () => {
    await migrateThrough("0002_acceso_facturacion");
    await seedUsers("u-a", "u-b");
    // Every Nivel in every app the matrix offered, so no row can miss a role.
    const apps = ["analytics", "incidencias", "generator", "facturacion", "ops"];
    const levels = ["read", "write", "admin"];
    for (const [index, app] of apps.entries()) {
      for (const [offset, user] of ["u-a", "u-b"].entries()) {
        const level = levels[(index + offset) % levels.length];
        await sql`
          INSERT INTO auth_app_access (user_id, app, level)
          VALUES (${user}, ${app}, ${level})
        `;
      }
    }
    const before = await sql`
      SELECT user_id, app::text, level::text FROM auth_app_access ORDER BY user_id, app
    `;

    await migrate(drizzle(sql), { migrationsFolder: "drizzle/auth" });

    const after = await sql`
      SELECT user_id, app, level::text, role FROM auth_app_access ORDER BY user_id, app
    `;
    expect(after.map(({ user_id, app, level }) => ({ user_id, app, level }))).toEqual(
      [...before],
    );
    expect(after.every((row) => row.role !== null)).toBe(true);

    const facturacion = await sql`
      SELECT level::text, role FROM auth_app_access
      WHERE app = 'facturacion' ORDER BY level
    `;
    expect([...facturacion]).toEqual([
      { level: "read", role: "periodista" },
      { level: "write", role: "coordinador" },
    ]);
    expect(
      await sql`
        SELECT count(*)::int AS n FROM auth_app_access
        WHERE app <> 'facturacion' AND role <> level::text
      `,
    ).toEqual([{ n: 0 }]);
  });
});
