import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";
import { redirectWithNotice } from "@/app/actions/helpers";
import { DomainError } from "@/lib/errors";
import { telemetry } from "@/lib/telemetry";
import { captureLogLines } from "@/test/fixtures/log-lines";
import {
  defineAction,
  parsed,
  parseFailure,
} from "@/lib/actions/define-action";

const h = vi.hoisted(() => {
  // Shaped like Next's redirect error, so the action's line treats it as
  // control flow, as it does a real redirect.
  class RedirectSignal extends Error {
    digest = "NEXT_REDIRECT;replace;/grid;307;";
  }
  class NavigationSignal extends Error {
    digest = "NEXT_REDIRECT;replace;/login;307;";
  }

  return { RedirectSignal, NavigationSignal };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// redirectWithNotice throws (a real next redirect never returns) and
// rethrowNavigationError re-throws both signals, mirroring unstable_rethrow.
vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: (formData: FormData, fallback: string) => {
    const redirectTo = formData.get("redirectTo");
    return typeof redirectTo === "string" && redirectTo.startsWith("/")
      ? redirectTo
      : fallback;
  },
  redirectWithNotice: vi.fn(() => {
    throw new h.RedirectSignal("REDIRECT");
  }),
  rethrowNavigationError: (error: unknown) => {
    if (
      error instanceof h.RedirectSignal ||
      error instanceof h.NavigationSignal
    ) {
      throw error;
    }
  },
}));

vi.mock("@/lib/telemetry", () => ({
  telemetry: { reportServerError: vi.fn(), trackServerEvent: vi.fn(), flush: vi.fn() },
}));

const mockedRevalidatePath = vi.mocked(revalidatePath);
const mockedReportServerError = vi.mocked(telemetry.reportServerError);
const mockedRedirectWithNotice = vi.mocked(redirectWithNotice);

function lastRedirect() {
  return mockedRedirectWithNotice.mock.calls.at(-1)?.[0];
}

async function invoke(action: (formData: FormData) => Promise<void>, formData = new FormData()) {
  await expect(action(formData)).rejects.toThrow("REDIRECT");
}

describe("defineAction", () => {
  let log: ReturnType<typeof captureLogLines>;

  beforeEach(() => {
    log = captureLogLines();
  });

  afterEach(() => {
    log.restore();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("runs authz → parse → run and redirects with the success notice", async () => {
    const order: string[] = [];
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/people",
      authz: async () => {
        order.push("authz");
        return { role: "editor" };
      },
      parse: (formData) => {
        order.push("parse");
        return parsed({ name: String(formData.get("name") ?? "") });
      },
      revalidate: ["/people"],
      async run(ctx, input) {
        order.push("run");
        expect(ctx.role).toBe("editor");
        expect(input.name).toBe("Ana");
        return { notice: "Listo.", notify: ["a-1"], revalidate: ["/grid"] };
      },
    });

    const formData = new FormData();
    formData.set("name", "Ana");

    await invoke(action, formData);

    expect(order).toEqual(["authz", "parse", "run"]);
    expect(mockedRevalidatePath.mock.calls.map((call) => call[0])).toEqual([
      "/people",
      "/grid",
    ]);
    expect(lastRedirect()).toEqual({
      redirectTo: "/people",
      intent: "success",
      notice: "Listo.",
      notify: ["a-1"],
    });
  });

  it("honours the form's redirectTo over the fallback", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async () => ({ notice: "Listo." }),
    });

    const formData = new FormData();
    formData.set("redirectTo", "/people?tab=externos");

    await invoke(action, formData);

    expect(lastRedirect()?.redirectTo).toBe("/people?tab=externos");
  });

  it("lets run override the success redirect target", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async () => ({ notice: "Partido creado.", redirectTo: "/match/m-1" }),
    });

    await invoke(action);

    expect(lastRedirect()).toEqual(
      expect.objectContaining({ redirectTo: "/match/m-1", intent: "success" }),
    );
  });

  it("passes the resolved redirect target to run", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/mi-jornada",
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async (_ctx, _input, meta) => ({
        notice: "Listo.",
        revalidate: [meta.redirectTo],
      }),
    });

    await invoke(action);

    expect(mockedRevalidatePath).toHaveBeenCalledWith("/mi-jornada");
  });

  it("uses resolveRedirect instead of getRedirectTarget when provided", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      resolveRedirect: (formData) => `/match/${String(formData.get("matchId") ?? "")}`,
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async () => ({ notice: "Listo." }),
    });

    const formData = new FormData();
    formData.set("matchId", "m-9");

    await invoke(action, formData);

    expect(lastRedirect()?.redirectTo).toBe("/match/m-9");
  });

  it("turns a run {error} into an error notice without revalidating", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/people",
      authz: async () => ({}),
      parse: () => parsed({}),
      revalidate: ["/people"],
      run: async () => ({ error: "No se encontró el usuario." }),
    });

    await invoke(action);

    expect(mockedRevalidatePath).not.toHaveBeenCalled();
    expect(lastRedirect()).toEqual({
      redirectTo: "/people",
      intent: "error",
      notice: "No se encontró el usuario.",
    });
  });

  it("lets a run {error} redirect somewhere else", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      resolveRedirect: () => "/match/",
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async () => ({
        error: "No se indicó el partido a notificar.",
        redirectTo: "/grid",
      }),
    });

    await invoke(action);

    expect(lastRedirect()).toEqual(
      expect.objectContaining({ redirectTo: "/grid", intent: "error" }),
    );
  });

  it("keeps a non-success intent returned by run and still revalidates", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async () => ({
        notice: "No hay personas asignadas para notificar.",
        intent: "error" as const,
        revalidate: ["/match/m-1"],
      }),
    });

    await invoke(action);

    expect(mockedRevalidatePath).toHaveBeenCalledWith("/match/m-1");
    expect(lastRedirect()).toEqual(
      expect.objectContaining({
        intent: "error",
        notice: "No hay personas asignadas para notificar.",
      }),
    );
  });

  it("shows a DomainError's message as the notice and does not report it", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/roles",
      authz: async () => ({}),
      parse: () => parsed({}),
      revalidate: ["/roles"],
      run: async () => {
        throw new DomainError("No se encontró el rol.");
      },
    });

    await invoke(action);

    expect(mockedRevalidatePath).not.toHaveBeenCalled();
    expect(lastRedirect()).toEqual({
      redirectTo: "/roles",
      intent: "error",
      notice: "No se encontró el rol.",
    });
    expect(mockedReportServerError).not.toHaveBeenCalled();
    expect(log.lines).toEqual([
      expect.objectContaining({ level: "info", outcome: "rejected", reason: "domain_rule" }),
    ]);
  });

  it("shows the generic notice for an unexpected error and writes it once on the action's line", async () => {
    const action = defineAction({
      name: "upsertRoleAction",
      fallbackRedirect: "/roles",
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async () => {
        throw new TypeError("db exploded");
      },
    });

    await invoke(action);

    expect(lastRedirect()?.notice).toBe(
      "Ocurrió un error inesperado. Probá de nuevo.",
    );
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({
      level: "error",
      kind: "action",
      route: "upsertRoleAction",
      outcome: "error",
      error: { type: "TypeError", message: "db exploded" },
    });
  });

  it("prefers the fixed errorNotice over the generic one", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/settings",
      authz: async () => ({}),
      parse: () => parsed({}),
      errorNotice: "No pudimos guardar la configuración de Gemini.",
      run: async () => {
        throw new Error("db exploded");
      },
    });

    await invoke(action);

    expect(lastRedirect()?.notice).toBe(
      "No pudimos guardar la configuración de Gemini.",
    );
  });

  it("never calls run when parse fails and surfaces the parse error", async () => {
    const run = vi.fn(async () => ({ notice: "no debería llegar acá" }));
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/settings",
      authz: async () => ({}),
      parse: () => parseFailure<never>("El comunicado necesita título y mensaje."),
      run,
    });

    await invoke(action);

    expect(run).not.toHaveBeenCalled();
    expect(lastRedirect()).toEqual({
      redirectTo: "/settings",
      intent: "error",
      notice: "El comunicado necesita título y mensaje.",
    });
  });

  it("rethrows navigation errors thrown inside run instead of swallowing them", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async () => {
        throw new h.NavigationSignal("NEXT_REDIRECT");
      },
    });

    await expect(action(new FormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(mockedRedirectWithNotice).not.toHaveBeenCalled();
  });

  it("propagates an authz failure unhandled by default", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => {
        throw new Error("No tenes permisos para editar.");
      },
      parse: () => parsed({}),
      run: async () => ({ notice: "Listo." }),
    });

    await expect(action(new FormData())).rejects.toThrow(
      "No tenes permisos para editar.",
    );
    expect(mockedRedirectWithNotice).not.toHaveBeenCalled();
  });

  it("surfaces an authz failure as an error notice when authzFailureNotice is set", async () => {
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => {
        throw new Error("No tenes permisos para aprobar solicitudes de acceso.");
      },
      authzFailureNotice: true,
      parse: () => parsed({}),
      run: async () => ({ notice: "Listo." }),
    });

    await invoke(action);

    expect(lastRedirect()).toEqual({
      redirectTo: "/grid",
      intent: "error",
      notice: "No tenes permisos para aprobar solicitudes de acceso.",
    });
  });

  it("reports an error thrown by run once, from inside the action's line", async () => {
    const error = new Error("db exploded");
    const action = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => ({ userId: "user-test-1", role: "editor" }),
      parse: () => parsed({}),
      run: async () => {
        throw error;
      },
    });

    await invoke(action);

    expect(mockedReportServerError).toHaveBeenCalledTimes(1);
    expect(mockedReportServerError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ route_type: "action" }),
    );
    expect(log.lines[0]).toMatchObject({ user_id: "user-test-1", role: "editor" });
  });

  it.each([
    ["a success", { notice: "Listo." }, parsed({}), { level: "info", outcome: "ok" }],
    [
      "a run {error}",
      { error: "Ya existe." },
      parsed({}),
      { level: "info", outcome: "rejected", reason: "domain_rule" },
    ],
    [
      "a parse failure",
      { notice: "Listo." },
      parseFailure<never>("Falta el partido."),
      { level: "info", outcome: "rejected", reason: "invalid_input" },
    ],
  ] as const)("writes exactly one line for %s, with its outcome", async (_name, outcome, parse, line) => {
    const action = defineAction({
      name: "createMatchAction",
      fallbackRedirect: "/grid",
      authz: async () => ({ userId: "user-test-1", role: "editor" }),
      parse: () => parse,
      run: async () => outcome,
    });

    await invoke(action);

    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({
      kind: "action",
      route: "createMatchAction",
      user_id: "user-test-1",
      role: "editor",
      ...line,
    });
    expect(log.lines[0].duration_ms).toEqual(expect.any(Number));
  });

  it("does not report domain outcomes: a parse failure, a run {error} or a success", async () => {
    const outcomes = [
      defineAction({
        name: "testAction",
        fallbackRedirect: "/grid",
        authz: async () => ({ userId: "user-test-1" }),
        parse: () => parseFailure<never>("Falta el partido."),
        run: async () => ({ notice: "Listo." }),
      }),
      defineAction({
        name: "testAction",
        fallbackRedirect: "/grid",
        authz: async () => ({ userId: "user-test-1" }),
        parse: () => parsed({}),
        run: async () => ({ error: "Ya existe." }),
      }),
      defineAction({
        name: "testAction",
        fallbackRedirect: "/grid",
        authz: async () => ({ userId: "user-test-1" }),
        parse: () => parsed({}),
        run: async () => ({ notice: "Listo." }),
      }),
    ];

    for (const action of outcomes) {
      await invoke(action);
    }

    expect(mockedReportServerError).not.toHaveBeenCalled();
  });

  it("does not report navigation errors or an authz failure shown as a notice", async () => {
    const navigating = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => ({}),
      parse: () => parsed({}),
      run: async () => {
        throw new h.NavigationSignal("NEXT_REDIRECT");
      },
    });
    const denied = defineAction({
      name: "testAction",
      fallbackRedirect: "/grid",
      authz: async () => {
        throw new Error("No tenes permisos para editar.");
      },
      authzFailureNotice: true,
      parse: () => parsed({}),
      run: async () => ({ notice: "Listo." }),
    });

    await expect(navigating(new FormData())).rejects.toThrow("NEXT_REDIRECT");
    await invoke(denied);

    expect(mockedReportServerError).not.toHaveBeenCalled();
  });
});
