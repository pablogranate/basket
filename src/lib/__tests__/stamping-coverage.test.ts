import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const actionsDir = join(here, "..", "..", "app", "actions");

// Domain tables whose every insert/update MUST be actor-stamped and accompanied
// by a writeAudit call (Pitfall 1: a missed write site silently yields NULL
// changed_by now that the auth.uid() triggers are gone from the self-hosted DB).
const DOMAIN_TABLES = [
  "matches",
  "assignments",
  "people",
  "roles",
  "app_settings",
  "announcements",
  "collaborator_reports",
];

// EXPLICIT allowlist of legitimate mutations that must NOT be treated as
// app-stamped domain writes. Kept inline so any future exception is visible in
// the diff and reviewed deliberately.
//
// - "profiles": written ONLY via the admin path during collaborator auth-user
//   provisioning (people.ts). Profiles are the identity table, not a domain
//   entity, and the row is created for a not-yet-actor user — stamping the
//   acting admin as created_by would be misleading.
// - "audit_log": the audit sink itself (the writeAudit insert). Auditing the
//   audit write would recurse.
// - "person_functions": a child relation of people, written with replace-all
//   semantics INSIDE the audited people upsert (people.ts). It has only a
//   created_by column (no updated_by, so stampInsert does not apply); created_by
//   is set explicitly and the selected functions are recorded in the parent
//   people writeAudit payload.
// - "leagues" / "clubs" / "teams" / "team_league_memberships" / "club_aliases":
//   the normalized team-catalog tables (0025). They carry no
//   created_by/updated_by columns — stampInsert/stampUpdate would be rejected by
//   the generated types — and are reference data mutated only through the
//   requireEditor-gated upsertTeamAction.
const ALLOWLISTED_TABLES = [
  "profiles",
  "audit_log",
  "person_functions",
  "leagues",
  "clubs",
  "teams",
  "team_league_memberships",
  "club_aliases",
];

// Drizzle mutation opener: db.insert(table) / db.update(table). The captured
// identifier is the local alias for a schema table (e.g. matchesTable); it is
// resolved to a snake_case table name via the file's schema import.
const MUTATION_RE =
  /\bdb\s*\.\s*(insert|update)\s*\(\s*([A-Za-z0-9_]+)\s*\)/g;

// camelCase Drizzle export name -> snake_case Postgres table name.
function camelToSnake(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Parse `import { a as aTable, b } from "@/lib/db/schema"` (single or multiline)
// into a map of local alias -> snake_case table name.
function schemaAliasMap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const importRe =
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@\/lib\/db\/schema["']/g;
  let importMatch: RegExpExecArray | null;

  while ((importMatch = importRe.exec(source)) !== null) {
    for (const rawEntry of importMatch[1].split(",")) {
      const entry = rawEntry.trim();
      if (!entry) {
        continue;
      }
      const asMatch = entry.match(/^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/);
      const exportName = asMatch ? asMatch[1] : entry;
      const alias = asMatch ? asMatch[2] : entry;
      map.set(alias, camelToSnake(exportName));
    }
  }

  return map;
}

type Finding = {
  file: string;
  table: string;
  op: string;
  index: number;
};

function findMutations(source: string, file: string): Finding[] {
  const aliases = schemaAliasMap(source);
  const findings: Finding[] = [];
  let match: RegExpExecArray | null;
  MUTATION_RE.lastIndex = 0;

  while ((match = MUTATION_RE.exec(source)) !== null) {
    const alias = match[2];
    const table = aliases.get(alias) ?? alias;
    findings.push({ file, table, op: match[1], index: match.index });
  }

  return findings;
}

describe("stamping-coverage predicate self-check", () => {
  // Guard against the test silently passing by matching nothing: prove the
  // regex + alias resolution distinguish a domain mutation from a non-mutation.
  const sample = [
    'import { people as peopleTable } from "@/lib/db/schema";',
    "await db.insert(peopleTable).values(x);",
    "await db.update(peopleTable).set(y);",
  ].join("\n");

  it("detects and resolves domain mutations", () => {
    const found = findMutations(sample, "sample");
    expect(found.length).toBe(2);
    expect(found.every((finding) => finding.table === "people")).toBe(true);
  });

  it("resolves multi-word table aliases to snake_case", () => {
    const src =
      'import { collaboratorReports as t } from "@/lib/db/schema";\nawait db.insert(t).values(x);';
    expect(findMutations(src, "sample")[0].table).toBe("collaborator_reports");
  });
});

describe("every action-file domain mutation is stamped + audited", () => {
  const actionFiles = readdirSync(actionsDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, source: readFileSync(join(actionsDir, name), "utf8") }));

  it("found action files to scan", () => {
    expect(actionFiles.length).toBeGreaterThan(0);
  });

  it("has no unstamped or unaudited domain write site (offenders empty)", () => {
    const offenders: string[] = [];

    for (const { name, source } of actionFiles) {
      const mutations = findMutations(source, name);
      // Stamping now flows through mappers (stampInsert -> toXColumns -> .values),
      // so stamp presence is verified at file scope, matching the file-scope
      // writeAudit check. Per-write assertions move to the Phase 6 integration
      // suite that exercises the real DB.
      const stamps = source.includes("stampInsert(") || source.includes("stampUpdate(");
      const audits = source.includes("writeAudit");

      for (const mutation of mutations) {
        if (ALLOWLISTED_TABLES.includes(mutation.table)) {
          continue;
        }

        if (!DOMAIN_TABLES.includes(mutation.table)) {
          // Unknown table touched by an action — treat as an offender so a
          // newly introduced domain table cannot slip through unstamped.
          offenders.push(
            `${name}: mutation on unrecognized table "${mutation.table}" (db.${mutation.op}) — add to DOMAIN_TABLES or ALLOWLISTED_TABLES`,
          );
          continue;
        }

        if (!stamps) {
          offenders.push(
            `${name}: db.${mutation.op}(${mutation.table}) but file has no stampInsert/stampUpdate call`,
          );
        }

        if (!audits) {
          offenders.push(
            `${name}: mutates "${mutation.table}" but file has no writeAudit call`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
