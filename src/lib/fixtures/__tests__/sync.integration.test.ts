import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseCabbCsv } from "@/lib/fixtures/parse";
import type { FixtureSource } from "@/lib/fixtures/sources";
import { runFixturesSync } from "@/lib/fixtures/sync";
import { testSql, truncateAll } from "@/test/integration/db";

const HEADER =
  "ID;COMPETICIÓN;CATEGORÍA;FASE;GRUPO;CLUB LOCAL;EQUIPO LOCAL;CLUB VISITANTE;EQUIPO VISITANTE;SUSPENDIDO;PUNTOS LOCAL;PUNTOS VISITANTE;FECHA;HORA;CAMPO DE JUEGO;PISTA;POBLACIÓN CAMPO;PROVINCIA CAMPO;CONTABILIZADO;DESIGNABLE;FACTURAR_CLUB;TRATADO;INFORME;";
const BOCA_OBERA =
  "696086;LIGA NACIONAL 2026/2027;LA LIGA NACIONAL;SERIE REGULAR;SERIE REGULAR;CLUB ATLETICO BOCA JUNIORS;BOCA;OBERA TENIS CLUB;OBERÁ;0;96;73;07/10/2026;21:05;LUIS CONDE;;C.A.B.A.;CIUDAD AUTONOMA DE BUENOS AIRES;0;1;1;0;;";
const FORMATIVAS =
  "697166;FORMATIVAS;LA LIGA FEDERAL MINI FEMENINA;QUINTA FASE;FINAL FOUR;LIBRE;- EQUIPO POR DETERMINAR -;LIBRE;- EQUIPO POR DETERMINAR -;0;0;0;11/10/2026;17:00;TEMPLO DEL ROCK;;C.A.B.A.;CIUDAD AUTONOMA DE BUENOS AIRES;0;1;1;0;;";

const WINDOW = { from: "2026-10-01", to: "2026-10-31" };
const OLD_SYNC = "2026-09-01T09:00:00.000Z";

function csvSource(key: string, row: string): FixtureSource {
  return { key, load: async () => parseCabbCsv([HEADER, row].join("\r\n")) };
}

const SOURCES = [csvSource("cabb-adc", BOCA_OBERA), csvSource("cabb-cab", FORMATIVAS)];

describe("runFixturesSync (integration)", () => {
  const sql = testSql();

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  beforeEach(async () => {
    await truncateAll(sql);
    await sql`TRUNCATE fixtures CASCADE`;
  });

  afterAll(async () => {
    await sql.end();
  });

  async function seedFixture(id: string, matchDate: string, source = "cabb-adc") {
    await sql`
      INSERT INTO fixtures (id, competition, home_team, away_team, match_date, match_time, source, synced_at)
      VALUES (${id}, 'LIGA NACIONAL 2026/2027', 'A', 'B', ${matchDate}, '20:00', ${source}, ${OLD_SYNC})`;
  }

  async function seedMatch(values: { code: string; home: string; away: string; kickoffAt: string; fixtureId?: string }) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO matches (production_code, competition, home_team, away_team, kickoff_at, fixture_id)
      VALUES (${values.code}, 'Liga Nacional', ${values.home}, ${values.away}, ${values.kickoffAt}, ${values.fixtureId ?? null})
      RETURNING id`;
    return row!.id;
  }

  it("upserts, deletes games gone from CABB, keeps linked ones and links Partidos", async () => {
    await seedFixture("gone", "2026-10-05");
    await seedFixture("gone-but-linked", "2026-10-06");
    await seedFixture("outside-window", "2026-11-20");
    const keptPartido = await seedMatch({ code: "1", home: "A", away: "B", kickoffAt: "2026-10-06T23:00:00Z", fixtureId: "gone-but-linked" });
    const bocaPartido = await seedMatch({ code: "31049", home: "BOCA", away: "OBERA", kickoffAt: "2026-10-08T00:05:00Z" });

    const result = await runFixturesSync({ ...WINDOW, sources: SOURCES });

    expect(result).toMatchObject({ skipped: false, upserted: 2, deleted: 1, linked: 1, errors: [] });
    const ids = (await sql<{ id: string }[]>`SELECT id FROM fixtures ORDER BY id`).map((row) => row.id);
    expect(ids).toEqual(["696086", "697166", "gone-but-linked", "outside-window"]);

    const links = await sql<{ id: string; fixture_id: string | null }[]>`SELECT id, fixture_id FROM matches`;
    expect(Object.fromEntries(links.map((row) => [row.id, row.fixture_id]))).toEqual({
      [keptPartido]: "gone-but-linked",
      [bocaPartido]: "696086",
    });

    const [boca] = await sql`SELECT home_points, away_points FROM fixtures WHERE id = '696086'`;
    expect(boca).toEqual({ home_points: 96, away_points: 73 });
  });

  it("only deletes the rows of feeds that were fetched", async () => {
    await seedFixture("gone-from-adc", "2026-10-05", "cabb-adc");
    await seedFixture("kept-cab", "2026-10-05", "cabb-cab");
    const failing: FixtureSource = {
      key: "cabb-cab",
      load: async () => {
        throw new Error("timeout");
      },
    };

    const result = await runFixturesSync({ ...WINDOW, sources: [SOURCES[0]!, failing] });

    expect(result).toMatchObject({ upserted: 1, deleted: 1, errors: ["cabb-cab: timeout"] });
    const ids = (await sql<{ id: string }[]>`SELECT id FROM fixtures ORDER BY id`).map((row) => row.id);
    expect(ids).toEqual(["696086", "kept-cab"]);
  });

  it("keeps only the fetched window and tags each row with its feed", async () => {
    const wide: FixtureSource = {
      key: "acb-liga-endesa",
      load: async () => ({
        fixtures: [
          { ...parseCabbCsv([HEADER, BOCA_OBERA].join("\r\n")).fixtures[0]!, id: "acb-1" },
          { ...parseCabbCsv([HEADER, BOCA_OBERA].join("\r\n")).fixtures[0]!, id: "acb-2", matchDate: "2027-05-01" },
        ],
        errors: [],
      }),
    };

    const result = await runFixturesSync({ ...WINDOW, sources: [wide] });

    expect(result.fetched).toEqual({ "acb-liga-endesa": 1 });
    const rows = await sql`SELECT id, source FROM fixtures`;
    expect(rows).toEqual([{ id: "acb-1", source: "acb-liga-endesa" }]);
  });

  it("never overwrites an existing link", async () => {
    await seedFixture("manual", "2026-10-07");
    const partido = await seedMatch({ code: "31049", home: "BOCA", away: "OBERA", kickoffAt: "2026-10-08T00:05:00Z", fixtureId: "manual" });

    const result = await runFixturesSync({ ...WINDOW, sources: SOURCES });

    expect(result.linked).toBe(0);
    const [row] = await sql`SELECT fixture_id FROM matches WHERE id = ${partido}`;
    expect(row).toEqual({ fixture_id: "manual" });
  });

  it("waits out the cooldown unless forced", async () => {
    await runFixturesSync({ ...WINDOW, sources: SOURCES });

    const again = await runFixturesSync({ ...WINDOW, sources: SOURCES });
    const forced = await runFixturesSync({ ...WINDOW, sources: SOURCES, force: true });

    expect(again).toMatchObject({ skipped: true, reason: "cooldown" });
    expect(forced.skipped).toBe(false);
  });
});
