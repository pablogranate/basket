import { describe, expect, it } from "vitest";

import type { SheetEntry, SheetMatch } from "@/lib/grid/sheet-parse";
import { planGridSync } from "@/lib/grid/sync-plan";
import type {
  AssignmentSnapshot,
  MatchSnapshot,
  PlanGridSyncInput,
} from "@/lib/grid/sync-plan";

// Fixed instant: 2026-08-20 12:00 ART (UTC-3, no DST). Window per ADR 0002:
// [2026-08-20T03:00:00Z, 2026-09-19T03:00:00Z).
const NOW = new Date("2026-08-20T15:00:00.000Z");
const WINDOW_START = "2026-08-20T03:00:00.000Z";
const WINDOW_END = "2026-09-19T03:00:00.000Z";
const FUTURE_KICKOFF = "2026-08-25T22:00:00.000Z";

const ROLE_IDS = new Map([
  ["Responsable", "role-responsable"],
  ["Realizador", "role-realizador"],
  ["Relator", "role-relator"],
  ["Camara 1", "role-camara-1"],
  ["Camara 2", "role-camara-2"],
]);

function makeSheetMatch(overrides: Partial<SheetMatch> = {}): SheetMatch {
  return {
    competition: "Liga A",
    production_mode: "Full",
    home_team: "Boca",
    away_team: "River",
    kickoff_at: FUTURE_KICKOFF,
    duration_minutes: 150,
    timezone: "America/Argentina/Buenos_Aires",
    production_code: null,
    commentary_plan: null,
    transport: null,
    notes: null,
    ...overrides,
  };
}

function makeEntry(
  overrides: Partial<SheetMatch> = {},
  extras: Partial<Pick<SheetEntry, "responsable" | "assignments" | "tabName">> = {},
): SheetEntry {
  return {
    tabName: extras.tabName ?? "Agosto 26",
    match: makeSheetMatch(overrides),
    responsable: extras.responsable ?? "",
    assignments: extras.assignments ?? [],
  };
}

function makeMatchSnapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    id: "match-1",
    competition: "Liga A",
    production_mode: "Full",
    status: "Pendiente",
    home_team: "Boca",
    away_team: "River",
    kickoff_at: FUTURE_KICKOFF,
    owner_id: null,
    production_code: null,
    commentary_plan: null,
    transport: null,
    notes: null,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<AssignmentSnapshot> = {}): AssignmentSnapshot {
  return {
    id: "assignment-1",
    match_id: "match-1",
    role_id: "role-realizador",
    person_id: "person-1",
    ...overrides,
  };
}

function makeInput(overrides: Partial<PlanGridSyncInput> = {}): PlanGridSyncInput {
  return {
    entries: [],
    tabsSynced: ["Agosto 26", "Septiembre 26"],
    tabsMissing: [],
    windowMatches: [],
    codedMatches: [],
    assignmentsByMatch: new Map(),
    roleIdByName: new Map(ROLE_IDS),
    people: [],
    personFunctions: [],
    deleteCandidates: [],
    now: NOW,
    ...overrides,
  };
}

describe("planGridSync window filter (ADR 0002)", () => {
  it("includes an entry exactly at the window start (inclusive)", () => {
    const plan = planGridSync(makeInput({ entries: [makeEntry({ kickoff_at: WINDOW_START })] }));
    expect(plan.creates).toHaveLength(1);
  });

  it("excludes an entry exactly at the window end (exclusive)", () => {
    const plan = planGridSync(makeInput({ entries: [makeEntry({ kickoff_at: WINDOW_END })] }));
    expect(plan.creates).toHaveLength(0);
    expect(plan.unchanged).toBe(0);
  });

  it("includes an entry one second before the window end", () => {
    const plan = planGridSync(
      makeInput({ entries: [makeEntry({ kickoff_at: "2026-09-19T02:59:59.000Z" })] }),
    );
    expect(plan.creates).toHaveLength(1);
  });

  it("excludes a past entry (before start of today in ART)", () => {
    const plan = planGridSync(
      makeInput({ entries: [makeEntry({ kickoff_at: "2026-08-20T02:00:00.000Z" })] }),
    );
    expect(plan.creates).toHaveLength(0);
  });
});

describe("planGridSync match identity", () => {
  it("prefers the production-code match over the tripleKey match", () => {
    const codedMatch = makeMatchSnapshot({
      id: "coded-match",
      home_team: "Otro",
      away_team: "Rival",
      kickoff_at: "2026-09-01T22:00:00.000Z",
      production_code: "P1",
    });
    const tripleMatch = makeMatchSnapshot({ id: "triple-match" });
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({ production_code: "P1" })],
        codedMatches: [codedMatch],
        windowMatches: [tripleMatch],
      }),
    );

    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe("coded-match");
    expect(plan.updates[0].patch.homeTeam).toBe("Boca");
    expect(plan.updates[0].patch.awayTeam).toBe("River");
  });

  it("matches by tripleKey across casing and accent drift (ADR 0001)", () => {
    const existing = makeMatchSnapshot({ home_team: "Vélez", away_team: "FERRO" });
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({ home_team: "velez", away_team: "Ferro" })],
        windowMatches: [existing],
      }),
    );

    // Matched, so no duplicate insert; the exact-text compare still patches
    // the drifted names to the sheet spelling.
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].patch.homeTeam).toBe("velez");
  });

  it("does not match a tripleKey with a different kickoff instant", () => {
    const existing = makeMatchSnapshot({ kickoff_at: "2026-08-26T22:00:00.000Z" });
    const plan = planGridSync(
      makeInput({ entries: [makeEntry()], windowMatches: [existing] }),
    );
    expect(plan.creates).toHaveLength(1);
  });

  it("plans two creates for identical id-less duplicate rows (current quirk, pinned)", () => {
    const plan = planGridSync(makeInput({ entries: [makeEntry(), makeEntry()] }));
    expect(plan.creates).toHaveLength(2);
  });
});

describe("planGridSync duplicate production codes", () => {
  it("excludes every duplicated-code row, reports both labels, and cancels the delete pass", () => {
    const candidate = {
      id: "victim",
      home_team: "Lanús",
      away_team: "Banfield",
      kickoff_at: FUTURE_KICKOFF,
    };
    const plan = planGridSync(
      makeInput({
        entries: [
          makeEntry({ production_code: "DUP" }),
          makeEntry({ home_team: "Colón", away_team: "Unión", production_code: "DUP" }),
        ],
        deleteCandidates: [candidate],
      }),
    );

    expect(plan.creates).toHaveLength(0);
    expect(plan.errors).toEqual([
      'El ID "DUP" está repetido en la planilla (Boca vs River / Colón vs Unión). Esas filas no se sincronizaron: corregí el ID en el sheet.',
    ]);
    expect(plan.deletePassSkipped).toBe("plan_errors");
    expect(plan.deletes).toHaveLength(0);
  });
});

describe("planGridSync field patches", () => {
  it("plans no update for an unchanged row", () => {
    const plan = planGridSync(
      makeInput({ entries: [makeEntry()], windowMatches: [makeMatchSnapshot()] }),
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("patches only the fields that changed", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({ transport: "Combi", notes: "Combi" })],
        windowMatches: [makeMatchSnapshot()],
      }),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].patch).toEqual({ transport: "Combi", notes: "Combi" });
    expect(plan.unchanged).toBe(0);
  });

  it("treats whitespace-only text differences as unchanged (nullableText)", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({ competition: "Liga A" })],
        windowMatches: [makeMatchSnapshot({ competition: " Liga A " })],
      }),
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });
});

describe("planGridSync status rules", () => {
  it("moves a past Pendiente match to Realizado", () => {
    const kickoff = "2026-08-20T12:00:00.000Z"; // earlier today, before NOW
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({ kickoff_at: kickoff })],
        windowMatches: [makeMatchSnapshot({ kickoff_at: kickoff, status: "Pendiente" })],
      }),
    );
    expect(plan.updates[0].patch).toEqual({ status: "Realizado" });
  });

  it("moves a future Realizado match back to Pendiente", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry()],
        windowMatches: [makeMatchSnapshot({ status: "Realizado" })],
      }),
    );
    expect(plan.updates[0].patch).toEqual({ status: "Pendiente" });
  });

  it("never overwrites a manual Confirmado", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry()],
        windowMatches: [makeMatchSnapshot({ status: "Confirmado" })],
      }),
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("creates a past match as Realizado and a future match as Pendiente", () => {
    const plan = planGridSync(
      makeInput({
        entries: [
          makeEntry({ kickoff_at: "2026-08-20T12:00:00.000Z" }),
          makeEntry({ home_team: "Colón", away_team: "Unión" }),
        ],
      }),
    );
    expect(plan.creates[0].values.status).toBe("Realizado");
    expect(plan.creates[1].values.status).toBe("Pendiente");
  });
});

describe("planGridSync assignment mirroring", () => {
  it("upserts when the sheet names a different person for a managed role", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({}, { assignments: [{ roleName: "Realizador", personName: "Ana" }] })],
        windowMatches: [makeMatchSnapshot()],
        assignmentsByMatch: new Map([["match-1", [makeAssignment()]]]),
        people: [
          { id: "person-1", full_name: "Pedro", deleted_at: null },
          { id: "person-2", full_name: "Ana", deleted_at: null },
        ],
      }),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].assignmentUpserts).toEqual([
      { roleId: "role-realizador", person: { kind: "id", id: "person-2" } },
    ]);
    expect(plan.updates[0].assignmentDeletes).toEqual([]);
  });

  it("plans no upsert when the sheet person already holds the assignment", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({}, { assignments: [{ roleName: "Realizador", personName: "Pedro" }] })],
        windowMatches: [makeMatchSnapshot()],
        assignmentsByMatch: new Map([["match-1", [makeAssignment()]]]),
        people: [{ id: "person-1", full_name: "Pedro", deleted_at: null }],
      }),
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("deletes a managed assignment whose role vanished from the sheet", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry()],
        windowMatches: [makeMatchSnapshot()],
        assignmentsByMatch: new Map([
          ["match-1", [makeAssignment({ id: "assignment-relator", role_id: "role-relator" })]],
        ]),
      }),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].assignmentDeletes).toEqual(["assignment-relator"]);
  });

  it("never touches portal-only roles", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry()],
        windowMatches: [makeMatchSnapshot()],
        assignmentsByMatch: new Map([
          ["match-1", [makeAssignment({ id: "portal-only", role_id: "role-productor" })]],
        ]),
      }),
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("reports an unknown sheet role as an error and omits the assignment", () => {
    const plan = planGridSync(
      makeInput({
        entries: [
          makeEntry({}, { assignments: [{ roleName: "Rol Fantasma", personName: "Ana" }] }),
        ],
      }),
    );
    expect(plan.errors).toEqual(['Rol "Rol Fantasma" no existe; asignación omitida.']);
    expect(plan.creates[0].assignments).toEqual([]);
    expect(plan.deletePassSkipped).toBe("plan_errors");
  });
});

describe("planGridSync people", () => {
  it("plans a create for an unknown name, keyed by normalized name, keeping the original", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({}, { responsable: "José Pérez" })],
      }),
    );
    expect(plan.peopleToCreate).toEqual([{ key: "jose perez", name: "José Pérez" }]);
    expect(plan.creates[0].owner).toEqual({ kind: "key", key: "jose perez" });
  });

  it("plans a single create when several entries name the same new person", () => {
    const plan = planGridSync(
      makeInput({
        entries: [
          makeEntry({}, { responsable: "Ana Gómez" }),
          makeEntry({ home_team: "Colón", away_team: "Unión" }, { responsable: "ANA GOMEZ" }),
        ],
      }),
    );
    expect(plan.peopleToCreate).toEqual([{ key: "ana gomez", name: "Ana Gómez" }]);
  });

  it("plans a resurrection for a soft-deleted person, even on an otherwise unchanged entry", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({}, { responsable: "Pedro" })],
        windowMatches: [makeMatchSnapshot({ owner_id: "person-1" })],
        people: [{ id: "person-1", full_name: "Pedro", deleted_at: "2026-08-01T00:00:00.000Z" }],
      }),
    );
    expect(plan.peopleToResurrect).toEqual([{ id: "person-1", name: "Pedro" }]);
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("plans one resurrection when the person is referenced twice", () => {
    const plan = planGridSync(
      makeInput({
        entries: [
          makeEntry({}, { responsable: "Pedro" }),
          makeEntry({ home_team: "Colón", away_team: "Unión" }, { responsable: "Pedro" }),
        ],
        people: [{ id: "person-1", full_name: "Pedro", deleted_at: "2026-08-01T00:00:00.000Z" }],
      }),
    );
    expect(plan.peopleToResurrect).toEqual([{ id: "person-1", name: "Pedro" }]);
  });

  it("clears the owner when the sheet responsable is blank", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({}, { responsable: "" })],
        windowMatches: [makeMatchSnapshot({ owner_id: "person-1" })],
        people: [{ id: "person-1", full_name: "Pedro", deleted_at: null }],
      }),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].owner).toBeNull();
  });
});

describe("planGridSync función-mismatch warnings", () => {
  const entryWithRealizador = makeEntry(
    {},
    { assignments: [{ roleName: "Realizador", personName: "Ana" }] },
  );

  it("warns when an existing person lacks the assigned función", () => {
    const plan = planGridSync(
      makeInput({
        entries: [entryWithRealizador],
        people: [{ id: "person-2", full_name: "Ana", deleted_at: null }],
      }),
    );
    expect(plan.warnings).toEqual([
      '"Ana" está asignado como Realizador (Boca vs River) pero no tiene la función "Realizador" cargada en el portal.',
    ]);
    expect(plan.errors).toEqual([]);
  });

  it("does not warn when the person holds the función", () => {
    const plan = planGridSync(
      makeInput({
        entries: [entryWithRealizador],
        people: [{ id: "person-2", full_name: "Ana", deleted_at: null }],
        personFunctions: [{ person_id: "person-2", function_key: "Realizador" }],
      }),
    );
    expect(plan.warnings).toEqual([]);
  });

  it("collapses slot roles: Camara 2 counts as the Camara función", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry({}, { assignments: [{ roleName: "Camara 2", personName: "Ana" }] })],
        people: [{ id: "person-2", full_name: "Ana", deleted_at: null }],
        personFunctions: [{ person_id: "person-2", function_key: "Camara" }],
      }),
    );
    expect(plan.warnings).toEqual([]);
  });

  it("warns for a person the sync is about to create", () => {
    const plan = planGridSync(makeInput({ entries: [entryWithRealizador] }));
    expect(plan.warnings).toHaveLength(1);
  });

  it("dedupes the warning per person and función across entries", () => {
    const plan = planGridSync(
      makeInput({
        entries: [
          entryWithRealizador,
          makeEntry(
            { home_team: "Colón", away_team: "Unión" },
            { assignments: [{ roleName: "Realizador", personName: "Ana" }] },
          ),
        ],
        people: [{ id: "person-2", full_name: "Ana", deleted_at: null }],
      }),
    );
    expect(plan.warnings).toHaveLength(1);
  });

  it("never blocks: warnings leave errors empty and the delete pass alive", () => {
    const plan = planGridSync(
      makeInput({
        entries: [entryWithRealizador],
        deleteCandidates: [
          { id: "victim", home_team: "Lanús", away_team: "Banfield", kickoff_at: FUTURE_KICKOFF },
        ],
      }),
    );
    expect(plan.warnings).toHaveLength(1);
    expect(plan.errors).toEqual([]);
    expect(plan.deletePassSkipped).toBeNull();
    expect(plan.deletes).toHaveLength(1);
  });
});

describe("planGridSync delete pass", () => {
  const victim = {
    id: "victim",
    home_team: "Lanús",
    away_team: "Banfield",
    kickoff_at: FUTURE_KICKOFF,
  };

  it("selects an untouched candidate in a covered month, with its label", () => {
    const plan = planGridSync(makeInput({ deleteCandidates: [victim] }));
    expect(plan.deletes).toEqual([
      { id: "victim", label: `Lanús vs Banfield @ ${FUTURE_KICKOFF}` },
    ]);
    expect(plan.deletePassSkipped).toBeNull();
  });

  it("excludes a candidate the sync touched, even when unchanged", () => {
    const plan = planGridSync(
      makeInput({
        entries: [makeEntry()],
        windowMatches: [makeMatchSnapshot()],
        deleteCandidates: [
          { id: "match-1", home_team: "Boca", away_team: "River", kickoff_at: FUTURE_KICKOFF },
        ],
      }),
    );
    expect(plan.deletes).toHaveLength(0);
  });

  it("excludes a candidate whose month has no synced tab", () => {
    const plan = planGridSync(
      makeInput({
        tabsSynced: ["Agosto 26"],
        deleteCandidates: [
          { ...victim, kickoff_at: "2026-09-05T22:00:00.000Z" }, // September, tab not synced
        ],
      }),
    );
    expect(plan.deletes).toHaveLength(0);
    expect(plan.deletePassSkipped).toBeNull();
  });

  it("skips the pass entirely when a tab is missing", () => {
    const plan = planGridSync(
      makeInput({ tabsMissing: ["Septiembre 26"], deleteCandidates: [victim] }),
    );
    expect(plan.deletes).toHaveLength(0);
    expect(plan.deletePassSkipped).toBe("tabs_missing");
  });

  it("skips the pass when the plan carries errors", () => {
    const plan = planGridSync(
      makeInput({
        entries: [
          makeEntry({}, { assignments: [{ roleName: "Rol Fantasma", personName: "Ana" }] }),
        ],
        deleteCandidates: [victim],
      }),
    );
    expect(plan.deletes).toHaveLength(0);
    expect(plan.deletePassSkipped).toBe("plan_errors");
  });

  it("records the read failure and skips when candidates are unavailable", () => {
    const plan = planGridSync(
      makeInput({ deleteCandidates: null, deleteCandidatesError: "connection refused" }),
    );
    expect(plan.errors).toEqual(["connection refused"]);
    expect(plan.deletePassSkipped).toBe("candidates_unavailable");
  });
});
