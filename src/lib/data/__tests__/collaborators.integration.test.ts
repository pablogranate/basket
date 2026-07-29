import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { UserContext } from "@/lib/auth";
import { getCollaboratorDayData } from "@/lib/data/collaborators";
import { testSql, truncateAll } from "@/test/integration/db";

// The collaborator read is one statement: a CTE resolves the `people` row behind
// the user, the assignments LEFT JOIN off it, and each match's crew is aggregated
// as JSON in the same query. These exercise it against a live Postgres — the SQL
// is hand-written enough (CTE + correlated JSON aggregate + EXISTS window) that
// unit tests with a stubbed driver would prove nothing.
describe("getCollaboratorDayData (integration)", () => {
  const sql = testSql();
  const ctx = { userId: null, profileId: null } as unknown as UserContext;

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  type Sql = typeof sql;

  async function seedRole(
    db: Sql,
    name: string,
    category: string,
    sortOrder: number,
  ) {
    const [role] = await db`
      INSERT INTO roles ${db({ name, category, sort_order: sortOrder })}
      RETURNING id`;
    return role.id as string;
  }

  async function seedPerson(
    db: Sql,
    overrides: {
      full_name: string;
      email?: string | null;
      phone?: string | null;
      active?: boolean;
      deleted_at?: string | null;
    },
  ) {
    const [person] = await db`
      INSERT INTO people ${db({
        full_name: overrides.full_name,
        email: overrides.email ?? null,
        phone: overrides.phone ?? null,
        active: overrides.active ?? true,
        deleted_at: overrides.deleted_at ?? null,
      })}
      RETURNING id`;
    return person.id as string;
  }

  async function seedMatch(
    db: Sql,
    overrides: { kickoff_at: string; home_team?: string; away_team?: string; owner_id?: string | null },
  ) {
    const [match] = await db`
      INSERT INTO matches ${db({
        home_team: overrides.home_team ?? "Local",
        away_team: overrides.away_team ?? "Visita",
        kickoff_at: overrides.kickoff_at,
        owner_id: overrides.owner_id ?? null,
      })}
      RETURNING id`;
    return match.id as string;
  }

  async function seedAssignment(
    db: Sql,
    values: { match_id: string; role_id: string; person_id: string | null },
  ) {
    await db`INSERT INTO assignments ${db(values)}`;
  }

  // Kickoffs are pinned relative to "now" so the today-onward vs earlier-this-month
  // split is exercised regardless of when the suite runs. Both land inside the
  // current month, which is the window the loader reads.
  function currentMonthKickoff(dayOfMonth: number, hour = 18) {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    return `${month}-${String(dayOfMonth).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+00:00`;
  }

  it("resolves the person by email and returns their assignments with the full crew", async () => {
    const realizador = await seedRole(sql, "Realizador", "Produccion", 20);
    const responsable = await seedRole(sql, "Responsable", "Coordinacion", 10);
    const camara = await seedRole(sql, "Camara 1", "Camaras", 60);

    const me = await seedPerson(sql, {
      full_name: "Santiago Colaborador",
      email: "santiago@basquetpass.tv",
      phone: "573000000000",
    });
    const boss = await seedPerson(sql, {
      full_name: "Jefa Responsable",
      email: "jefa@basquetpass.tv",
    });
    const camOperator = await seedPerson(sql, { full_name: "Operador Camara" });

    const match = await seedMatch(sql, { kickoff_at: currentMonthKickoff(15) });
    await seedAssignment(sql, { match_id: match, role_id: realizador, person_id: me });
    await seedAssignment(sql, { match_id: match, role_id: responsable, person_id: boss });
    await seedAssignment(sql, { match_id: match, role_id: camara, person_id: camOperator });

    const data = await getCollaboratorDayData(ctx, {
      email: "santiago@basquetpass.tv",
      profileName: "Santiago Colaborador",
    });

    expect(data.person?.id).toBe(me);
    expect(data.linkedBy).toBe("email");
    expect(data.allAssignments).toHaveLength(1);

    const [assignment] = data.allAssignments;
    expect(assignment.roleName).toBe("Realizador");
    // Crew arrived from the JSON aggregate in the same statement.
    expect(assignment.responsibleName).toBe("Jefa Responsable");
    expect(assignment.cameraCount).toBe(1);
    // Contacts are ordered by role sort_order.
    expect(assignment.contacts.map((contact) => contact.roleName)).toEqual([
      "Responsable",
      "Realizador",
      "Camara 1",
    ]);
  });

  it("falls back to a normalized full-name match when no people row carries the email", async () => {
    const role = await seedRole(sql, "Realizador", "Produccion", 20);
    const me = await seedPerson(sql, {
      full_name: "Santiago Colaborador",
      email: "otro-correo@basquetpass.tv",
    });
    const match = await seedMatch(sql, { kickoff_at: currentMonthKickoff(15) });
    await seedAssignment(sql, { match_id: match, role_id: role, person_id: me });

    const data = await getCollaboratorDayData(ctx, {
      email: "no-esta-en-people@basquetpass.tv",
      profileName: "Santiago Colaborador",
    });

    expect(data.person?.id).toBe(me);
    expect(data.linkedBy).toBe("name");
    expect(data.allAssignments).toHaveLength(1);
  });

  it("returns a null person when neither the email nor the name matches", async () => {
    await seedPerson(sql, { full_name: "Alguien Mas", email: "otro@basquetpass.tv" });

    const data = await getCollaboratorDayData(ctx, {
      email: "nadie@basquetpass.tv",
      profileName: "Nadie Aqui",
    });

    expect(data.person).toBeNull();
    expect(data.linkedBy).toBeNull();
    expect(data.allAssignments).toEqual([]);
  });

  it("identifies the person even when they have no assignments in the window", async () => {
    const me = await seedPerson(sql, {
      full_name: "Santiago Colaborador",
      email: "santiago@basquetpass.tv",
    });

    const data = await getCollaboratorDayData(ctx, {
      email: "santiago@basquetpass.tv",
      profileName: "Santiago Colaborador",
    });

    // The distinction the page depends on: linked, but nothing scheduled.
    expect(data.person?.id).toBe(me);
    expect(data.linkedBy).toBe("email");
    expect(data.allAssignments).toEqual([]);
  });

  it("synthesizes the Responsable contact from the match owner when the crew has none", async () => {
    const role = await seedRole(sql, "Realizador", "Produccion", 20);
    const owner = await seedPerson(sql, {
      full_name: "Dueña Del Partido",
      email: "duena@basquetpass.tv",
      phone: "573001112233",
    });
    const me = await seedPerson(sql, {
      full_name: "Santiago Colaborador",
      email: "santiago@basquetpass.tv",
    });
    const match = await seedMatch(sql, {
      kickoff_at: currentMonthKickoff(15),
      owner_id: owner,
    });
    await seedAssignment(sql, { match_id: match, role_id: role, person_id: me });

    const data = await getCollaboratorDayData(ctx, {
      email: "santiago@basquetpass.tv",
      profileName: "Santiago Colaborador",
    });

    const [assignment] = data.allAssignments;
    expect(assignment.responsibleName).toBe("Dueña Del Partido");
    expect(assignment.contacts[0]).toMatchObject({
      roleName: "Responsable",
      roleCategory: "Coordinacion",
      personName: "Dueña Del Partido",
      phone: "573001112233",
    });
  });

  it("splits the window into today-onward and earlier-this-month", async () => {
    const role = await seedRole(sql, "Realizador", "Produccion", 20);
    const me = await seedPerson(sql, {
      full_name: "Santiago Colaborador",
      email: "santiago@basquetpass.tv",
    });

    // Midday kickoffs, so converting UTC to the match timezone (west of UTC)
    // cannot shift either row into an adjacent month and out of both buckets.
    // The assertion only relies on the buckets being disjoint and covering the
    // whole window, so it holds whatever day of the month the suite runs on.
    const earlier = await seedMatch(sql, {
      kickoff_at: currentMonthKickoff(2, 12),
      home_team: "Pasado",
    });
    const later = await seedMatch(sql, {
      kickoff_at: currentMonthKickoff(27, 12),
      home_team: "Futuro",
    });
    await seedAssignment(sql, { match_id: earlier, role_id: role, person_id: me });
    await seedAssignment(sql, { match_id: later, role_id: role, person_id: me });

    const data = await getCollaboratorDayData(ctx, {
      email: "santiago@basquetpass.tv",
      profileName: "Santiago Colaborador",
    });

    expect(data.allAssignments).toHaveLength(2);
    expect(
      data.upcomingAssignments.length + data.pastMonthAssignments.length,
    ).toBe(2);
    const upcomingIds = new Set(data.upcomingAssignments.map((item) => item.matchId));
    for (const past of data.pastMonthAssignments) {
      expect(upcomingIds.has(past.matchId)).toBe(false);
    }
    expect(data.summary.totalUpcoming).toBe(data.upcomingAssignments.length);
  });

  it("ignores inactive and soft-deleted people when resolving the user", async () => {
    const role = await seedRole(sql, "Realizador", "Produccion", 20);
    const inactive = await seedPerson(sql, {
      full_name: "Santiago Inactivo",
      email: "inactivo@basquetpass.tv",
      active: false,
    });
    const match = await seedMatch(sql, { kickoff_at: currentMonthKickoff(15) });
    await seedAssignment(sql, { match_id: match, role_id: role, person_id: inactive });

    const inactiveResult = await getCollaboratorDayData(ctx, {
      email: "inactivo@basquetpass.tv",
      profileName: "Santiago Inactivo",
    });
    expect(inactiveResult.person).toBeNull();

    await seedPerson(sql, {
      full_name: "Santiago Borrado",
      email: "borrado@basquetpass.tv",
      deleted_at: "2026-01-01T00:00:00+00:00",
    });

    const deletedResult = await getCollaboratorDayData(ctx, {
      email: "borrado@basquetpass.tv",
      profileName: "Santiago Borrado",
    });
    expect(deletedResult.person).toBeNull();
  });
});
