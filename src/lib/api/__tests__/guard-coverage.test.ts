import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// D-07 structural guard-coverage test.
//
// This is the CI safety net the user asked for as a first-class deliverable:
// a static-analysis test that enumerates EVERY api route handler and EVERY
// data loader and fails the build if one ships without a guard. A forgotten
// guard on a future route/loader becomes a red test rather than a silently
// open surface (T-02-12 elevation of privilege).
//
// It is deliberately a static SOURCE read (not a runtime import): async RSC
// pages and route handlers cannot be reliably executed under Vitest, and the
// point is to assert the *marker* is present in the diff-visible source.

const here = dirname(fileURLToPath(import.meta.url));
// src/lib/api/__tests__ -> repo root
const repoRoot = join(here, "..", "..", "..", "..");

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

// Recursive readdir collecting absolute file paths under `dir` whose basename
// matches `predicate`. Used in place of node:fs globSync, which is runtime-only
// on Node 22+ but not declared by the project's @types/node baseline (^20) —
// so a tsc --noEmit gate would reject globSync. A manual walk keeps the test
// typecheck-clean and portable.
function walkFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      out.push(full);
    }
  }

  return out;
}

// Repo-relative POSIX path for stable allowlist comparison + diff-readable
// offender messages.
function repoRel(absPath: string): string {
  return toPosix(relative(repoRoot, absPath));
}

// --- Route coverage ----------------------------------------------------------

// A route is guarded when its source contains either the session/role wrapper
// marker `withAuth(` (the 4 ai/* routes, team-logo, grid/calendar,
// collaborator-reports) OR the machine-auth wrapper marker `withApiKey(`
// (matches/intake — Open Q1, shared-secret header). Both are first-class
// guards; the coverage predicate accepts either.
const ROUTE_GUARD_MARKERS = ["withAuth(", "withApiKey("];

// EXPLICIT allowlist of routes that are intentionally unguarded. This is the
// ONLY exception, kept inline so any future addition is reviewed in the diff.
//
// - "src/app/api/health/route.ts": a liveness/config probe that exposes no
//   user data and must answer before/without a session. Intentionally open.
//
// All three formerly inline-guarded routes (team-logo, grid/calendar,
// collaborator-reports) now carry the `withAuth(` marker and must NOT be
// allowlisted.
const ROUTE_ALLOWLIST = ["src/app/api/health/route.ts"];

function routeIsGuarded(source: string): boolean {
  return ROUTE_GUARD_MARKERS.some((marker) => source.includes(marker));
}

// --- Loader coverage ---------------------------------------------------------

// Every exported async loader in src/lib/data/* must take a ctx/context as its
// first parameter (D-06: authorization is resolved at the boundary and threaded
// in, never read from cookies inside the loader). A missing ctx is a forgotten
// guard.
const EXPORTED_ASYNC_FN_RE =
  /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(\s*([A-Za-z0-9_]*)/g;

// EXPLICIT allowlist of intentionally ctx-free data helpers, kept inline.
//
// - "isUuidLike": a pure synchronous string predicate (not async, no DB read,
//   no authorization surface).
// - "personHasPlatformAccess": the D-09 server-only platform-access helper.
//   It derives access from an email argument (auth.admin.listUsers ->
//   resolveDashboardAccessRole) rather than a boundary-resolved ctx; it is an
//   identity-derivation helper, not a domain-data loader subject to the D-06
//   ctx contract. Confined to a `server-only` module.
const LOADER_ALLOWLIST = ["isUuidLike", "personHasPlatformAccess"];

type LoaderFn = { name: string; firstParam: string };

function findExportedAsyncLoaders(source: string): LoaderFn[] {
  const loaders: LoaderFn[] = [];
  let match: RegExpExecArray | null;
  EXPORTED_ASYNC_FN_RE.lastIndex = 0;

  while ((match = EXPORTED_ASYNC_FN_RE.exec(source)) !== null) {
    loaders.push({ name: match[1], firstParam: match[2] });
  }

  return loaders;
}

function loaderTakesCtx(loader: LoaderFn): boolean {
  return /^(ctx|context)$/.test(loader.firstParam);
}

// --- Predicate self-checks ---------------------------------------------------
// Guard against the suite silently passing by matching nothing: prove the
// detectors actually distinguish a guarded sample from an unguarded one.

describe("guard-coverage predicate self-check", () => {
  it("route predicate accepts a withAuth/withApiKey source and rejects a bare handler", () => {
    expect(
      routeIsGuarded(`export const POST = withAuth({}, async (req, ctx) => res);`),
    ).toBe(true);
    expect(
      routeIsGuarded(`export const POST = withApiKey(async (req) => res);`),
    ).toBe(true);
    expect(
      routeIsGuarded(`export async function POST(req) { return res; }`),
    ).toBe(false);
  });

  it("loader predicate accepts a ctx-first loader and rejects a ctx-free one", () => {
    const guarded = findExportedAsyncLoaders(
      `export async function getThings(ctx: UserContext, filters: F) {}`,
    );
    const unguarded = findExportedAsyncLoaders(
      `export async function getThings(filters: F) {}`,
    );

    expect(guarded).toHaveLength(1);
    expect(unguarded).toHaveLength(1);
    expect(loaderTakesCtx(guarded[0])).toBe(true);
    expect(loaderTakesCtx(unguarded[0])).toBe(false);
  });
});

// --- Route enumeration -------------------------------------------------------

describe("every api/*/route.ts is wrapped in a guard marker (D-07)", () => {
  const routeFiles = walkFiles(
    join(repoRoot, "src", "app", "api"),
    (name) => name === "route.ts",
  )
    .map(repoRel)
    .sort();

  it("found api route files to scan", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(9);
  });

  it("has no unguarded route (offenders empty); only api/health is allowlisted", () => {
    const offenders: string[] = [];

    for (const file of routeFiles) {
      if (ROUTE_ALLOWLIST.includes(file)) {
        continue;
      }

      const source = readFileSync(join(repoRoot, file), "utf8");
      if (!routeIsGuarded(source)) {
        offenders.push(
          `${file}: missing a guard marker (expected one of ${ROUTE_GUARD_MARKERS.join(" / ")})`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("allowlisted routes still exist (stale allowlist guard)", () => {
    for (const allowed of ROUTE_ALLOWLIST) {
      expect(routeFiles).toContain(allowed);
    }
  });
});

// --- Loader enumeration ------------------------------------------------------

describe("every src/lib/data/* exported async loader takes a ctx arg (D-07)", () => {
  const loaderFiles = readdirSync(join(repoRoot, "src", "lib", "data"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `src/lib/data/${name}`)
    .sort();

  it("found data loader files to scan", () => {
    expect(loaderFiles.length).toBeGreaterThan(0);
  });

  it("has no ctx-free loader (offenders empty); only documented helpers allowlisted", () => {
    const offenders: string[] = [];

    for (const file of loaderFiles) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      const loaders = findExportedAsyncLoaders(source);

      for (const loader of loaders) {
        if (LOADER_ALLOWLIST.includes(loader.name)) {
          continue;
        }

        if (!loaderTakesCtx(loader)) {
          offenders.push(
            `${file}: ${loader.name}(...) first param "${loader.firstParam || "<none>"}" is not ctx/context`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
