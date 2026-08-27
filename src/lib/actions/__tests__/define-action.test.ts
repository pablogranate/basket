import { afterEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";
import { redirectWithNotice } from "@/app/actions/helpers";
import {
  defineAction,
  parsed,
  parseFailure,
} from "@/lib/actions/define-action";

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {}
  class NavigationSignal extends Error {}

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

const mockedRevalidatePath = vi.mocked(revalidatePath);
const mockedRedirectWithNotice = vi.mocked(redirectWithNotice);

function lastRedirect() {
  return mockedRedirectWithNotice.mock.calls.at(-1)?.[0];
}

async function invoke(action: (formData: FormData) => Promise<void>, formData = new FormData()) {
  await expect(action(formData)).rejects.toThrow("REDIRECT");
}

describe("defineAction", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs authz → parse → run and redirects with the success notice", async () => {
    const order: string[] = [];
    const action = defineAction({
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

  it("turns a thrown run error into an ensureErrorMessage notice", async () => {
    const action = defineAction({
      fallbackRedirect: "/roles",
      authz: async () => ({}),
      parse: () => parsed({}),
      revalidate: ["/roles"],
      run: async () => {
        throw new Error("No se encontró el rol.");
      },
    });

    await invoke(action);

    expect(mockedRevalidatePath).not.toHaveBeenCalled();
    expect(lastRedirect()).toEqual({
      redirectTo: "/roles",
      intent: "error",
      notice: "No se encontró el rol.",
    });
  });

  it("prefers the fixed errorNotice over the thrown message", async () => {
    const action = defineAction({
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

  it("calls onError for real failures only", async () => {
    const onError = vi.fn();
    const failing = defineAction({
      fallbackRedirect: "/people",
      authz: async () => ({}),
      parse: () => parsed({}),
      onError,
      run: async () => {
        throw new Error("boom");
      },
    });

    await invoke(failing);
    expect(onError).toHaveBeenCalledTimes(1);

    onError.mockClear();

    const succeeding = defineAction({
      fallbackRedirect: "/people",
      authz: async () => ({}),
      parse: () => parsed({}),
      onError,
      run: async () => ({ notice: "Listo." }),
    });

    await invoke(succeeding);
    expect(onError).not.toHaveBeenCalled();
  });

  it("never calls run when parse fails and surfaces the parse error", async () => {
    const run = vi.fn(async () => ({ notice: "no debería llegar acá" }));
    const action = defineAction({
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
});
