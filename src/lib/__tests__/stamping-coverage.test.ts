import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const actionsDir = join(here, "..", "..", "app", "actions");

// Domain tables whose every insert/update/upsert MUST be actor-stamped and
// accompanied by a writeAudit call (Pitfall 1: a missed write site silently
// yields NULL changed_by once the auth.uid() triggers are dropped in Wave 4).
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
// - "profiles": written ONLY via the service-role admin client during
//   collaborator auth-user provisioning (people.ts). Profiles are the identity
//   table, not a domain entity, and the row is created for a not-yet-actor user
//   — stamping the acting admin as created_by would be misleading.
// - "audit_log": the audit sink itself (the writeAudit insert). Auditing the
//   audit write would recurse.
// - "person_functions": a child relation of people, written with replace-all
//   semantics INSIDE the audited people upsert (people.ts). It has only a
//   created_by column (no updated_by, so stampInsert does not apply); created_by
//   is set explicitly and the selected functions are recorded in the parent
//   people writeAudit payload.
const ALLOWLISTED_TABLES = ["profiles", "audit_log", "person_functions"];

const MUTATION_RE =
  /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)\s*(?:\r?\n\s*)*\.(insert|update|upsert)\s*\(/g;

type Finding = {
  file: string;
  table: string;
  op: string;
  index: number;
};

function findMutations(source: string, file: string): Finding[] {
  const findings: Finding[] = [];
  let match: RegExpExecArray | null;
  MUTATION_RE.lastIndex = 0;

  while ((match = MUTATION_RE.exec(source)) !== null) {
    findings.push({
      file,
      table: match[1],
      op: match[2],
      index: match.index,
    });
  }

  return findings;
}

// Explicit, documented marker for indirection helpers (e.g. the matches
// optional-column fallback) whose payload is stamped by the caller, not at the
// literal .insert/.update site. Reviewed inline so the exception is visible.
const STAMPED_BY_CALLER_MARKER = /stamp(Insert|Update) applied by caller/;

// Inspect a window around the mutation opener to detect the stamp call. The
// stamp wraps the payload immediately after .insert/.update; the by-caller
// marker comment sits on the preceding line.
function isStamped(source: string, finding: Finding): boolean {
  const before = source.slice(Math.max(0, finding.index - 200), finding.index);

  if (STAMPED_BY_CALLER_MARKER.test(before)) {
    return true;
  }

  const window = source.slice(finding.index, finding.index + 600);
  return finding.op === "update"
    ? window.includes("stampUpdate(")
    : window.includes("stampInsert(") || window.includes("stampUpdate(");
}

describe("stamping-coverage predicate self-check", () => {
  // Guard against the test silently passing by matching nothing: prove the
  // regex + isStamped predicate distinguish a stamped from an unstamped write.
  const stampedSample = `await supabase.from("people").insert(stampInsert(ctx, payload));`;
  const unstampedSample = `await supabase.from("people").insert(payload);`;

  it("detects a domain mutation in both samples", () => {
    expect(findMutations(stampedSample, "sample").length).toBe(1);
    expect(findMutations(unstampedSample, "sample").length).toBe(1);
  });

  it("flags the unstamped sample and accepts the stamped one", () => {
    const stamped = findMutations(stampedSample, "sample")[0];
    const unstamped = findMutations(unstampedSample, "sample")[0];

    expect(isStamped(stampedSample, stamped)).toBe(true);
    expect(isStamped(unstampedSample, unstamped)).toBe(false);
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

      for (const mutation of mutations) {
        if (ALLOWLISTED_TABLES.includes(mutation.table)) {
          continue;
        }

        if (!DOMAIN_TABLES.includes(mutation.table)) {
          // Unknown table touched by an action — treat as an offender so a
          // newly introduced domain table cannot slip through unstamped.
          offenders.push(
            `${name}: mutation on unrecognized table "${mutation.table}" (.${mutation.op}) — add to DOMAIN_TABLES or ALLOWLISTED_TABLES`,
          );
          continue;
        }

        if (!isStamped(source, mutation)) {
          offenders.push(
            `${name}: .${mutation.op}("${mutation.table}") is not wrapped in stampInsert/stampUpdate`,
          );
        }

        if (!source.includes("writeAudit")) {
          offenders.push(
            `${name}: mutates "${mutation.table}" but file has no writeAudit call`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
