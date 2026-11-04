import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLeagueAction } from "@/app/actions/leagues";
import { requireEditor } from "@/lib/auth";
import { createLeague } from "@/lib/leagues/leagues";
import { reportServerError } from "@/lib/telemetry";
import { makeUserContext } from "@/test/fixtures/user-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireEditor: vi.fn() }));
vi.mock("@/lib/leagues/leagues", () => ({
  createLeague: vi.fn(),
  renameLeague: vi.fn(),
}));
vi.mock("@/lib/telemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telemetry")>()),
  reportServerError: vi.fn(),
}));

describe("an action whose write fails unexpectedly", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(requireEditor).mockResolvedValue(makeUserContext());
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    errorLog.mockRestore();
  });

  it("answers the generic message, reports once and logs one line without the params", async () => {
    const failure = new DrizzleQueryError(
      'insert into "leagues" ("name") values ($1)',
      ["Liga Secreta"],
      new Error('duplicate key value violates unique constraint "leagues_name_key"'),
    );
    vi.mocked(createLeague).mockRejectedValue(failure);

    const result = await createLeagueAction({ name: "Liga Secreta" });

    expect(result).toEqual({
      ok: false,
      error: "Ocurrió un error inesperado. Probá de nuevo.",
    });
    expect(vi.mocked(reportServerError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportServerError)).toHaveBeenCalledWith(failure, {
      route: "createLeagueAction",
      routeType: "action",
      userId: "user-test-1",
    });
    expect(errorLog).toHaveBeenCalledTimes(1);
    const line = String(errorLog.mock.calls[0]?.[0]);
    expect(errorLog.mock.calls[0]).toHaveLength(1);
    expect(line).toMatch(/^\[leagues\] failed to create league: /);
    expect(line).not.toContain("params");
    expect(line).not.toContain("Liga Secreta");
    expect(line).not.toContain("\n");
  });
});
