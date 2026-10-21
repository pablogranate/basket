import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createLeague,
  ensureLeague,
  findLeagueByName,
  listLeagues,
  renameLeague,
  setLeagueOrder,
} from "@/lib/leagues/leagues";
import { testSql, truncateAll } from "@/test/integration/db";

describe("leagues (integration)", () => {
  const sql = testSql();
  // Migrations seed some leagues that other suites rely on: put them back.
  let seeded: Record<string, unknown>[] = [];

  beforeAll(async () => {
    seeded = await sql`SELECT * FROM leagues`;
  });

  afterAll(async () => {
    await sql`DELETE FROM leagues`;
    if (seeded.length) {
      await sql`INSERT INTO leagues ${sql(seeded)}`;
    }
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
    await sql`DELETE FROM leagues`;
    await sql`
      INSERT INTO leagues ${sql([
        { name: "Liga Argentina", slug: "liga-argentina", sort_order: 1, in_team_directory: true },
        { name: "Amistosos", slug: "amistosos", sort_order: 2, in_team_directory: false },
      ])}`;
  });

  it("renames without touching the slug, and old names still resolve", async () => {
    const result = await renameLeague({
      currentName: "Liga Argentina",
      name: "La Liga Argentina",
    });

    expect(result).toMatchObject({
      ok: true,
      league: { name: "La Liga Argentina", slug: "liga-argentina" },
    });
    expect((await findLeagueByName("Liga Argentina"))?.name).toBe(
      "La Liga Argentina",
    );
    // A team write naming the league afterwards must not mint a duplicate.
    await ensureLeague("La Liga Argentina");
    await ensureLeague("Liga Argentina");
    expect(await listLeagues()).toHaveLength(2);
  });

  it("refuses a rename onto another league's name", async () => {
    expect(
      await renameLeague({ currentName: "Liga Argentina", name: "amistosos" }),
    ).toEqual({ ok: false, error: "Ya existe la liga Amistosos." });
  });

  it("creates a league with a tab at the end of the order", async () => {
    const result = await createLeague("  Liga   Femenina Chile ");

    expect(result).toMatchObject({
      ok: true,
      league: {
        name: "Liga Femenina Chile",
        slug: "liga-femenina-chile",
        sortOrder: 3,
        inTeamDirectory: true,
      },
    });
  });

  it("gives an existing league without a tab its tab instead of a duplicate", async () => {
    const result = await createLeague("AMISTOSOS");

    expect(result).toMatchObject({ ok: true, league: { slug: "amistosos" } });
    const leagues = await listLeagues();
    expect(leagues).toHaveLength(2);
    expect(leagues.find((league) => league.slug === "amistosos")?.inTeamDirectory).toBe(true);
  });

  it("refuses a league that already has a tab", async () => {
    expect(await createLeague("liga argentina")).toEqual({
      ok: false,
      error: "Ya existe la liga Liga Argentina.",
    });
  });

  it("picks a free slug when a renamed league still holds the natural one", async () => {
    await renameLeague({ currentName: "Liga Argentina", name: "Primera Argentina" });
    const result = await createLeague("Liga Argentina");

    expect(result).toMatchObject({
      ok: true,
      league: { name: "Liga Argentina", slug: "liga-argentina-2" },
    });
    expect((await findLeagueByName("Liga Argentina"))?.slug).toBe("liga-argentina-2");
  });

  it("orders leagues by name, renamed ones included", async () => {
    await renameLeague({ currentName: "Liga Argentina", name: "Primera Argentina" });
    await setLeagueOrder(["Amistosos", "Primera Argentina"]);

    const order = (await listLeagues())
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
      .map((league) => league.slug);
    expect(order).toEqual(["amistosos", "liga-argentina"]);
  });
});
