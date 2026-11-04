import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLeagueAction } from "@/app/actions/leagues";
import { requireEditor } from "@/lib/auth";
import { createLeague } from "@/lib/leagues/leagues";
import { telemetry } from "@/lib/telemetry";
import { captureLogLines } from "@/test/fixtures/log-lines";
import { makeUserContext } from "@/test/fixtures/user-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireEditor: vi.fn() }));
vi.mock("@/lib/leagues/leagues", () => ({
  createLeague: vi.fn(),
  renameLeague: vi.fn(),
}));
vi.mock("@/lib/telemetry", () => ({
  telemetry: { reportServerError: vi.fn(), trackServerEvent: vi.fn(), flush: vi.fn() },
}));

describe("an action whose write fails unexpectedly", () => {
  let log: ReturnType<typeof captureLogLines>;

  beforeEach(() => {
    vi.mocked(requireEditor).mockResolvedValue(makeUserContext());
    log = captureLogLines();
  });

  afterEach(() => {
    log.restore();
    vi.clearAllMocks();
  });

  it("answers the generic message, reports once and writes one error line without the params", async () => {
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
    expect(vi.mocked(telemetry.reportServerError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(telemetry.reportServerError)).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ route_type: "action" }),
    );
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({
      level: "error",
      kind: "action",
      route: "createLeagueAction",
      outcome: "error",
      error: { message: expect.stringContaining("Failed query") },
    });
    expect(JSON.stringify(log.lines[0])).not.toContain("Liga Secreta");
  });
});
