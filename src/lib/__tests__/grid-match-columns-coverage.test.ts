import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { gridMatchColumns, matchColumns } from "@/lib/db/rows";
import type { GridMatchFields } from "@/lib/types";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "..");

// EXPLICIT allowlist of the match columns the /grid read path may select. Kept
// inline so any future addition is visible in the diff and reviewed
// deliberately: a month view multiplies every column by every match in the
// window, and the failure mode this guards is someone reaching for the full-row
// matchColumns map again and silently re-inflating the payload.
//
// Each entry is rendered by the table view, the card view, the export path, or
// the edit prefill. Nothing here is speculative.
const ALLOWED_GRID_COLUMNS = [
  "id",
  "competition",
  "production_mode",
  "status",
  "home_team",
  "away_team",
  "venue",
  "kickoff_at",
  "duration_minutes",
  "timezone",
  "notes",
  "production_code",
  "commentary_plan",
  "transport",
] as const;

// Compile-time half of the contract: this list must name exactly the keys of
// GridMatchFields. Adding a column to the type without adding it here (or vice
// versa) is a type error before it is ever a test failure.
const TYPE_KEYS: ReadonlyArray<keyof GridMatchFields> = ALLOWED_GRID_COLUMNS;

// Columns deliberately dropped from the grid path. Referencing one of these on a
// grid match means the projection and the render disagree.
const DROPPED_COLUMNS = [
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "owner_id",
  "day_notified_at",
  "league_id",
] as const;

// The files that render or reshape a grid match. Deliberately a hand-maintained
// list rather than a glob: a new grid file that reads a dropped column should
// force a look at this test.
const GRID_RENDER_FILES = [
  "components/grid/grid-table.tsx",
  "components/grid/match-card.tsx",
  "components/grid/match-card-details.tsx",
  "components/grid/match-card-actions.tsx",
  "components/grid/grid-regions.tsx",
  "components/grid/production-insights-panel.tsx",
  "lib/grid-table.ts",
  "lib/grid/insights.ts",
  "lib/grid/match-prefill.ts",
  "lib/grid/match-card-sections.ts",
  "lib/ai/section-context.ts",
];

function sorted(values: Iterable<string>) {
  return [...values].sort();
}

describe("grid match column projection", () => {
  it("selects exactly the allowlisted columns", () => {
    expect(sorted(Object.keys(gridMatchColumns))).toEqual(
      sorted(ALLOWED_GRID_COLUMNS),
    );
  });

  it("stays in step with the GridMatchFields type", () => {
    expect(sorted(Object.keys(gridMatchColumns))).toEqual(sorted(TYPE_KEYS));
  });

  it("only names columns that exist on the full match row", () => {
    const fullRowColumns = new Set(Object.keys(matchColumns));
    const unknown = Object.keys(gridMatchColumns).filter(
      (column) => !fullRowColumns.has(column),
    );

    expect(unknown).toEqual([]);
  });

  it("is a strict subset of the full match row projection", () => {
    expect(Object.keys(gridMatchColumns).length).toBeLessThan(
      Object.keys(matchColumns).length,
    );
  });

  it("leaves the full match row projection intact for detail, export and audit", () => {
    for (const column of DROPPED_COLUMNS) {
      expect(Object.keys(matchColumns)).toContain(column);
    }
  });

  it("has no grid render site reading a dropped column off a match", () => {
    const offenders: string[] = [];

    for (const file of GRID_RENDER_FILES) {
      const source = readFileSync(join(srcDir, file), "utf8");

      for (const column of DROPPED_COLUMNS) {
        // `match.created_at`, `item.match.created_at`, `m.created_at` — any
        // property read of a dropped column on something match-shaped.
        const readRe = new RegExp(`\\bmatch(?:[A-Za-z0-9_]*)?\\.${column}\\b`);

        if (readRe.test(source)) {
          offenders.push(
            `${file}: reads dropped column "${column}" — add it to gridMatchColumns and the allowlist, or stop reading it`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
