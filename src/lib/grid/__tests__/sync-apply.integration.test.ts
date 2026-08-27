import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyGridSync } from "@/lib/grid/sync-apply";
import type { SyncPlan, SyncPlanCreate, SyncPlanUpdate } from "@/lib/grid/sync-plan";
import { testSql, truncateAll } from "@/test/integration/db";

const NOW = new Date("2026-08-20T15:00:00.000Z");
const KICKOFF = "2026-08-25T22:00:00.000Z";

function makePlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
    creates: [],
    updates: [],
    deletes: [],
    peopleToCreate: [],
    peopleToResurrect: [],
    errors: [],
    warnings: [],
    tabsSynced: ["Agosto 26"],
    tabsMissing: [],
    unchanged: 0,
    deletePassSkipped: null,
    ...overrides,
  };
}

function makeCreate(overrides: Partial<SyncPlanCreate> = {}): SyncPlanCreate {
  return {
    label: "Boca vs River",
    values: {
      competition: "Liga A",
      productionMode: "Full",
      homeTeam: "Boca",
      awayTeam: "River",
      kickoffAt: KICKOFF,
      durationMinutes: 150,
      timezone: "America/Argentina/Buenos_Aires",
      productionCode: null,
      commentaryPlan: null,
      transport: null,
      notes: null,
      status: "Pendiente",
    },
    owner: null,
    assignments: [],
    ...overrides,
  };
}

// Exercises the write-only apply step against a live Postgres: person
// creation/resurrection with key resolution, match inserts and patches, the
// assignment upsert (confirmed reset) and delete, the delete pass, the
// unique-violation backstop, and the apply-failure-aborts-deletes gate.
describe("applyGridSync (integration)", () => {
  const sql = testSql();

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  it("creates planned people first and resolves key refs on insert", async () => {
    const [role] = await sql`INSERT INTO roles ${sql({ name: "Realizador" })} RETURNING id`;

    const result = await applyGridSync(
      makePlan({
        peopleToCreate: [{ key: "jose perez", name: "José Pérez" }],
        creates: [
          makeCreate({
            owner: { kind: "key", key: "jose perez" },
            assignments: [{ roleId: role.id, person: { kind: "key", key: "jose perez" } }],
          }),
        ],
      }),
      NOW,
    );

    expect(result.errors).toEqual([]);
    expect(result.created).toBe(1);
    expect(result.peopleCreated).toBe(1);
    expect(result.assignmentsUpserted).toBe(1);

    const [person] = await sql`SELECT id, full_name FROM people`;
    expect(person.full_name).toBe("José Pérez");

    const [match] = await sql`SELECT owner_id, status, home_team FROM matches`;
    expect(match.owner_id).toBe(person.id);
    expect(match.status).toBe("Pendiente");

    const [assignment] = await sql`SELECT person_id, confirmed FROM assignments`;
    expect(assignment.person_id).toBe(person.id);
    expect(assignment.confirmed).toBe(false);
  });

  it("resurrects a soft-deleted person", async () => {
    const [person] = await sql`
      INSERT INTO people ${sql({ full_name: "Pedro", deleted_at: "2026-08-01T00:00:00+00:00" })}
      RETURNING id`;

    const result = await applyGridSync(
      makePlan({ peopleToResurrect: [{ id: person.id, name: "Pedro" }] }),
      NOW,
    );

    expect(result.errors).toEqual([]);
    const [row] = await sql`SELECT deleted_at FROM people WHERE id = ${person.id}`;
    expect(row.deleted_at).toBeNull();
  });

  it("patches an existing match, reassigns with confirmed reset, and deletes vanished roles", async () => {
    const [role] = await sql`INSERT INTO roles ${sql({ name: "Realizador" })} RETURNING id`;
    const [relator] = await sql`INSERT INTO roles ${sql({ name: "Relator" })} RETURNING id`;
    const [ana] = await sql`INSERT INTO people ${sql({ full_name: "Ana" })} RETURNING id`;
    const [pedro] = await sql`INSERT INTO people ${sql({ full_name: "Pedro" })} RETURNING id`;
    const [match] = await sql`
      INSERT INTO matches ${sql({ home_team: "Boca", away_team: "River", kickoff_at: KICKOFF, status: "Pendiente" })}
      RETURNING id`;
    await sql`
      INSERT INTO assignments ${sql({ match_id: match.id, role_id: role.id, person_id: pedro.id, confirmed: true })}`;
    const [vanished] = await sql`
      INSERT INTO assignments ${sql({ match_id: match.id, role_id: relator.id, person_id: pedro.id })}
      RETURNING id`;

    const update: SyncPlanUpdate = {
      id: match.id,
      label: "Boca vs River",
      patch: { transport: "Combi", status: "Confirmado" },
      assignmentUpserts: [{ roleId: role.id, person: { kind: "id", id: ana.id } }],
      assignmentDeletes: [vanished.id],
    };

    const result = await applyGridSync(makePlan({ updates: [update] }), NOW);

    expect(result.errors).toEqual([]);
    expect(result.updated).toBe(1);
    expect(result.assignmentsUpserted).toBe(1);
    expect(result.assignmentsDeleted).toBe(1);

    const [row] = await sql`SELECT transport, status, updated_at FROM matches WHERE id = ${match.id}`;
    expect(row.transport).toBe("Combi");
    expect(row.status).toBe("Confirmado");
    expect(new Date(row.updated_at).toISOString()).toBe(NOW.toISOString());

    const assignments = await sql`SELECT role_id, person_id, confirmed FROM assignments`;
    expect(assignments).toHaveLength(1);
    expect(assignments[0].role_id).toBe(role.id);
    expect(assignments[0].person_id).toBe(ana.id);
    expect(assignments[0].confirmed).toBe(false);
  });

  it("executes the delete pass on a clean run", async () => {
    const [victim] = await sql`
      INSERT INTO matches ${sql({ home_team: "Lanús", away_team: "Banfield", kickoff_at: KICKOFF })}
      RETURNING id`;

    const result = await applyGridSync(
      makePlan({ deletes: [{ id: victim.id, label: `Lanús vs Banfield @ ${KICKOFF}` }] }),
      NOW,
    );

    expect(result.deleted).toBe(1);
    const rows = await sql`SELECT id FROM matches`;
    expect(rows).toHaveLength(0);
  });

  it("skips the delete pass when the plan already gated it", async () => {
    const [victim] = await sql`
      INSERT INTO matches ${sql({ home_team: "Lanús", away_team: "Banfield", kickoff_at: KICKOFF })}
      RETURNING id`;

    const result = await applyGridSync(
      makePlan({
        deletes: [{ id: victim.id, label: "Lanús vs Banfield" }],
        deletePassSkipped: "tabs_missing",
      }),
      NOW,
    );

    expect(result.deleted).toBe(0);
    expect(await sql`SELECT id FROM matches`).toHaveLength(1);
  });

  it("reports the unique-violation backstop per entry and aborts the delete pass", async () => {
    await sql`
      INSERT INTO matches ${sql({ home_team: "Otro", away_team: "Rival", kickoff_at: KICKOFF, production_code: "P1" })}`;
    const [victim] = await sql`
      INSERT INTO matches ${sql({ home_team: "Lanús", away_team: "Banfield", kickoff_at: KICKOFF })}
      RETURNING id`;

    const create = makeCreate();
    create.values.productionCode = "P1";

    const result = await applyGridSync(
      makePlan({
        creates: [create, makeCreate({ label: "Colón vs Unión" })],
        deletes: [{ id: victim.id, label: `Lanús vs Banfield @ ${KICKOFF}` }],
      }),
      NOW,
    );

    // The insert fails and is reported per-entry. Known quirk (pinned, not
    // fixed): drizzle wraps the postgres error, so `code` is no longer on the
    // top-level error and the friendly "El ID ya existe" translation never
    // fires — the raw driver message surfaces instead, here and in today's
    // pre-refactor sync alike.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^Boca vs River: /);
    // Per-entry tolerance: the other create still saved.
    expect(result.created).toBe(1);
    // Apply-time failure aborts the delete pass: the victim survives.
    expect(result.deleted).toBe(0);
    const [row] = await sql`SELECT id FROM matches WHERE id = ${victim.id}`;
    expect(row).toBeDefined();
  });
});
