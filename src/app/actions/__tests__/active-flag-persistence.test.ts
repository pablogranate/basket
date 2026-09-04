import { afterEach, describe, expect, it, vi } from "vitest";

import { upsertPersonAction } from "@/app/actions/people";
import { upsertRoleAction } from "@/app/actions/roles";

// The edit forms declare a hidden `active="off"` companion before the checkbox
// (an unchecked checkbox posts nothing). Both entries share the field name, so
// reading only the first one silently deactivated the record on every save.
const h = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: () => "/people",
  redirectWithNotice: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  rethrowNavigationError: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/lib/auth", () => ({
  requireEditor: vi.fn(async () => ({ profileId: "profile-1", role: "editor" })),
  clearProfileCache: vi.fn(),
}));

vi.mock(import("@/lib/auth-access"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    requireAdmin: vi.fn(async () => ({ profileId: "profile-1", role: "admin" })) as never,
    requireAccessManager: vi.fn(),
  };
});

vi.mock("@/lib/audit", () => ({
  stampInsert: (_ctx: unknown, payload: Record<string, unknown>) => payload,
  stampUpdate: (_ctx: unknown, payload: Record<string, unknown>) => payload,
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/email/mailer", () => ({
  sendCollaboratorInviteEmail: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    // from() resolves for the whole-table profile scan; where().limit() serves
    // the access_revoked_at lookup upsertPersonAction now does first.
    select: () => ({
      from: () => {
        const rows: unknown[] = [];
        return Object.assign(Promise.resolve(rows), {
          where: () => ({ limit: async () => rows }),
        });
      },
    }),
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        h.updates.push(payload);
        return {
          where: () => ({ returning: async () => [{ id: "record-1" }] }),
        };
      },
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: "record-1" }],
        then: (resolve: (value: unknown) => unknown) => resolve(undefined),
      }),
    }),
    delete: () => ({ where: async () => undefined }),
  },
}));

// Mirrors the markup order in the edit modals: hidden companion, then checkbox.
function editFormData(
  idField: string,
  extra: Record<string, string>,
  { checked }: { checked: boolean },
) {
  const formData = new FormData();
  formData.set(idField, "record-1");
  formData.append("active", "off");
  if (checked) {
    formData.append("active", "on");
  }
  for (const [key, value] of Object.entries(extra)) {
    formData.set(key, value);
  }
  return formData;
}

function lastUpdate() {
  return h.updates.at(-1) ?? {};
}

describe("active flag persistence", () => {
  afterEach(() => {
    h.updates.length = 0;
    vi.clearAllMocks();
  });

  it("keeps a person active when the checkbox is checked", async () => {
    const formData = editFormData(
      "personId",
      { fullName: "Ana Ruiz" },
      { checked: true },
    );

    await expect(upsertPersonAction(formData)).rejects.toThrow("REDIRECT");

    expect(lastUpdate().active).toBe(true);
  });

  it("deactivates a person only when the checkbox is unchecked", async () => {
    const formData = editFormData(
      "personId",
      { fullName: "Ana Ruiz" },
      { checked: false },
    );

    await expect(upsertPersonAction(formData)).rejects.toThrow("REDIRECT");

    expect(lastUpdate().active).toBe(false);
  });

  it("keeps a role active when the checkbox is checked", async () => {
    const formData = editFormData(
      "roleId",
      { name: "Camara 6", category: "Camaras", sortOrder: "170" },
      { checked: true },
    );

    await expect(upsertRoleAction(formData)).rejects.toThrow("REDIRECT");

    expect(lastUpdate().active).toBe(true);
  });

  it("deactivates a role when the checkbox is unchecked", async () => {
    const formData = editFormData(
      "roleId",
      { name: "Camara 6", category: "Camaras", sortOrder: "170" },
      { checked: false },
    );

    await expect(upsertRoleAction(formData)).rejects.toThrow("REDIRECT");

    expect(lastUpdate().active).toBe(false);
  });
});
