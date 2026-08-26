import { afterEach, describe, expect, it, vi } from "vitest";

import { makeUserContext } from "@/test/fixtures/user-context";

// The approval is the one place in this feature where the risk is wiring, not a
// decision: it writes profiles + people + access_requests (and repoints a merged
// duplicate) inside one transaction. These assert the payloads that reach the DB
// with the client stubbed, mirroring set-attendance-confirmation.test.ts.
type Captured = {
  table: string;
  kind: "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
};

const h = vi.hoisted(() => ({
  state: {
    request: null as Record<string, unknown> | null,
    profile: null as Record<string, unknown> | null,
    role: { id: "role-relator" } as Record<string, unknown> | null,
    insertedPersonId: "person-new",
    writes: [] as Captured[],
    transactionCalls: 0,
    inviteShouldThrow: false,
    invites: [] as string[],
    notices: [] as { intent: string; notice: string }[],
    ctxRole: "editor" as string,
  },
}));

class RedirectSignal extends Error {}

function tableName(table: unknown) {
  const key = Object.getOwnPropertySymbols(table as object).find(
    (symbol) => symbol.description === "drizzle:Name",
  );

  return key ? String((table as Record<symbol, unknown>)[key]) : "unknown";
}

function selectResultFor(table: string) {
  if (table === "access_requests") {
    return h.state.request ? [h.state.request] : [];
  }

  if (table === "profiles") {
    return h.state.profile ? [h.state.profile] : [];
  }

  if (table === "roles") {
    return h.state.role ? [h.state.role] : [];
  }

  return [];
}

function makeClient() {
  const client = {
    select() {
      return {
        from(table: unknown) {
          const name = tableName(table);
          const rows = selectResultFor(name);
          const chain = {
            where: () => chain,
            limit: async () => rows,
            then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
          };
          return chain;
        },
      };
    },
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values(payload: Record<string, unknown>) {
          h.state.writes.push({ table: name, kind: "insert", payload });
          const result = {
            returning: async () => [{ id: h.state.insertedPersonId }],
            then: (resolve: (value: unknown) => unknown) => resolve(undefined),
          };
          return result;
        },
      };
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set(payload: Record<string, unknown>) {
          h.state.writes.push({ table: name, kind: "update", payload });
          // Stands in for the compare-and-set: the claim UPDATE on
          // access_requests only returns a row while the request is pendiente.
          const isClaim =
            name === "access_requests" && typeof payload.status === "string";
          const claimWon =
            !isClaim || h.state.request?.status === "pendiente";

          if (isClaim && claimWon && h.state.request) {
            h.state.request.status = payload.status;
          }

          const rows = claimWon
            ? [{ id: "row-1", email: String(h.state.request?.email ?? "") }]
            : [];
          // Awaitable on its own (`await ...set().where()`) and chainable into
          // `.returning()`, which is how the action reads the claim result.
          const chain = {
            returning: async () => rows,
            then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
          };

          return { where: () => chain };
        },
      };
    },
    delete(table: unknown) {
      const name = tableName(table);
      return {
        where: async () => {
          h.state.writes.push({ table: name, kind: "delete" });
        },
      };
    },
    async transaction(callback: (tx: unknown) => Promise<unknown>) {
      h.state.transactionCalls += 1;
      return callback(client);
    },
  };

  return client;
}

vi.mock("@/lib/db/client", () => ({ db: makeClient() }));

vi.mock("@/lib/auth", () => ({
  clearProfileCache: vi.fn(),
  requireUserContext: vi.fn(),
}));

vi.mock("@/lib/auth-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-access")>(
    "@/lib/auth-access",
  );

  return {
    ...actual,
    requireAccessRequestApprover: async () => {
      if (!actual.isAccessRequestApproverRole(h.state.ctxRole as never)) {
        throw new Error("No tenes permisos para aprobar solicitudes de acceso.");
      }

      return makeUserContext({
        role: h.state.ctxRole as never,
        profileId: "profile-approver",
      });
    },
  };
});

vi.mock("@/lib/audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");

  return { ...actual, writeAudit: vi.fn() };
});

vi.mock("@/lib/email/mailer", () => ({
  sendCollaboratorInviteEmail: async ({ to }: { to: string }) => {
    if (h.state.inviteShouldThrow) {
      throw new Error("smtp down");
    }

    h.state.invites.push(to);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: () => "/grid",
  redirectWithNotice: (params: { intent: string; notice: string }) => {
    h.state.notices.push({ intent: params.intent, notice: params.notice });
    throw new RedirectSignal(params.notice);
  },
  rethrowNavigationError: (error: unknown) => {
    if (error instanceof RedirectSignal) {
      throw error;
    }
  },
}));

const { approveAccessRequestAction } = await import(
  "@/app/actions/access-requests"
);

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values: Record<string, string> = {
    requestId: "request-1",
    fullName: "Ana Pérez",
    phone: "+5491122334455",
    roleId: "role-relator",
    accessRole: "collaborator",
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value !== "") {
      data.set(key, value);
    }
  }

  return data;
}

async function run(data: FormData) {
  try {
    await approveAccessRequestAction(data);
  } catch (error) {
    if (!(error instanceof RedirectSignal)) {
      throw error;
    }
  }

  return {
    writes: h.state.writes,
    notice: h.state.notices.at(-1),
  };
}

function writesFor(table: string, kind?: Captured["kind"]) {
  return h.state.writes.filter(
    (write) => write.table === table && (!kind || write.kind === kind),
  );
}

describe("approveAccessRequestAction", () => {
  afterEach(() => {
    h.state.writes = [];
    h.state.notices = [];
    h.state.invites = [];
    h.state.transactionCalls = 0;
    h.state.inviteShouldThrow = false;
    h.state.profile = null;
    h.state.ctxRole = "editor";
    h.state.request = {
      id: "request-1",
      email: "Ana@Basquetpass.TV",
      status: "pendiente",
    };
  });

  it("creates the profile, the person and the link in one transaction", async () => {
    h.state.request = {
      id: "request-1",
      email: "Ana@Basquetpass.TV",
      status: "pendiente",
    };

    const { notice } = await run(form());

    expect(notice?.intent).toBe("success");
    expect(h.state.transactionCalls).toBe(1);

    const profileInsert = writesFor("profiles", "insert")[0];
    expect(profileInsert?.payload?.email).toBe("ana@basquetpass.tv");
    expect(profileInsert?.payload?.role).toBe("collaborator");
    expect(profileInsert?.payload?.authUserId).toBeNull();

    const personInsert = writesFor("people", "insert")[0];
    expect(personInsert?.payload?.fullName).toBe("Ana Pérez");
    expect(personInsert?.payload?.phone).toBe("+5491122334455");
    expect(personInsert?.payload?.roleId).toBe("role-relator");
    expect(personInsert?.payload?.profileId).toBe(profileInsert?.payload?.id);

    // Two writes: the claim that wins the race, then the resolved links.
    const [claim, links] = writesFor("access_requests", "update");
    expect(claim?.payload?.status).toBe("aprobada");
    expect(claim?.payload?.decidedBy).toBe("profile-approver");
    expect(links?.payload?.personId).toBe("person-new");
    expect(links?.payload?.profileId).toBe(profileInsert?.payload?.id);
    expect(h.state.invites).toEqual(["ana@basquetpass.tv"]);
  });

  it("re-tiers and links an existing profile instead of inserting a second one", async () => {
    h.state.profile = { id: "profile-ana", role: "collaborator" };

    await run(form());

    expect(writesFor("profiles", "insert")).toHaveLength(0);
    const profileUpdate = writesFor("profiles", "update")[0];
    expect(profileUpdate?.payload?.fullName).toBe("Ana Pérez");
    expect(writesFor("people", "insert")[0]?.payload?.profileId).toBe(
      "profile-ana",
    );
  });

  it("updates the chosen existing person rather than creating a duplicate", async () => {
    await run(form({ personId: "person-ana" }));

    expect(writesFor("people", "insert")).toHaveLength(0);
    const personUpdate = writesFor("people", "update")[0];
    expect(personUpdate?.payload?.fullName).toBe("Ana Pérez");
    expect(personUpdate?.payload?.deletedAt).toBeNull();
    expect(personUpdate?.payload?.active).toBe(true);
  });

  it("downgrades a tier a productor may not grant", async () => {
    await run(form({ accessRole: "admin" }));

    expect(writesFor("profiles", "insert")[0]?.payload?.role).toBe(
      "collaborator",
    );
  });

  it("lets an admin grant the requested tier", async () => {
    h.state.ctxRole = "admin";

    await run(form({ accessRole: "editor" }));

    expect(writesFor("profiles", "insert")[0]?.payload?.role).toBe("editor");
  });

  it("repoints and soft-deletes the merged duplicate", async () => {
    await run(form({ mergePersonId: "person-dup" }));

    expect(writesFor("assignments", "update")).toHaveLength(1);
    expect(writesFor("matches", "update")).toHaveLength(1);
    expect(writesFor("notification_logs", "update")).toHaveLength(1);

    const peopleUpdates = writesFor("people", "update");
    const softDelete = peopleUpdates.find((write) => write.payload?.deletedAt);
    expect(softDelete?.payload?.active).toBe(false);
    expect(softDelete?.payload?.profileId).toBeNull();
  });

  it("keeps the approval when the invite email fails", async () => {
    h.state.inviteShouldThrow = true;

    const { notice } = await run(form());

    expect(notice?.intent).toBe("success");
    expect(notice?.notice).toContain("No pudimos enviarle el correo");
    expect(writesFor("access_requests", "update")[0]?.payload?.status).toBe(
      "aprobada",
    );
    expect(h.state.request?.status).toBe("aprobada");
  });

  it("refuses to re-decide a request that is already resolved", async () => {
    h.state.request = {
      id: "request-1",
      email: "ana@basquetpass.tv",
      status: "aprobada",
    };

    const { notice } = await run(form());

    expect(notice?.intent).toBe("error");
    // The losing approver may attempt the claim, but nothing else is written:
    // no profile, no person, no invite.
    expect(writesFor("profiles")).toHaveLength(0);
    expect(writesFor("people")).toHaveLength(0);
    expect(h.state.invites).toEqual([]);
  });

  it("writes nothing beyond the failed claim when another approver won the race", async () => {
    // The row flipped between rendering the modal and submitting it.
    h.state.request = {
      id: "request-1",
      email: "ana@basquetpass.tv",
      status: "rechazada",
    };

    const { notice } = await run(form());

    expect(notice?.intent).toBe("error");
    expect(writesFor("people", "insert")).toHaveLength(0);
    expect(h.state.invites).toEqual([]);
  });

  it("rejects a malformed phone before writing anything", async () => {
    const { notice } = await run(form({ phone: "1122334455" }));

    expect(notice?.intent).toBe("error");
    expect(h.state.writes).toHaveLength(0);
  });

  it("rejects an approver whose role may not decide", async () => {
    h.state.ctxRole = "coordinator";

    const { notice } = await run(form());

    expect(notice?.intent).toBe("error");
    expect(h.state.writes).toHaveLength(0);
  });
});
