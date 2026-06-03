import { describe, expect, it, vi } from "vitest";

import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { makeUserContext } from "@/test/fixtures/user-context";

type CapturedInsert = Record<string, unknown> | null;

function makeSupabaseMock() {
  let captured: CapturedInsert = null;
  let lastTable: string | null = null;

  const client = {
    from(table: string) {
      lastTable = table;
      return {
        insert(payload: Record<string, unknown>) {
          captured = payload;
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return {
    client,
    getCaptured: () => captured,
    getLastTable: () => lastTable,
  };
}

describe("stampInsert", () => {
  it("sets created_by/updated_by to ctx.userId and created_at/updated_at timestamps", () => {
    const ctx = makeUserContext({ userId: "actor-1" });
    const stamped = stampInsert(ctx, { home_team: "A" });

    expect(stamped.home_team).toBe("A");
    expect(stamped.created_by).toBe("actor-1");
    expect(stamped.updated_by).toBe("actor-1");
    expect(typeof stamped.created_at).toBe("string");
    expect(typeof stamped.updated_at).toBe("string");
  });

  it("coalesces an existing created_at (mirrors set_row_metadata)", () => {
    const ctx = makeUserContext({ userId: "actor-1" });
    const existing = "2020-01-01T00:00:00.000Z";
    const stamped = stampInsert(ctx, { created_at: existing });

    expect(stamped.created_at).toBe(existing);
  });
});

describe("stampUpdate", () => {
  it("sets updated_by to ctx.userId and a fresh updated_at, never created_by", () => {
    const ctx = makeUserContext({ userId: "actor-2" });
    const stamped = stampUpdate(ctx, { active: false });

    expect(stamped.active).toBe(false);
    expect(stamped.updated_by).toBe("actor-2");
    expect(typeof stamped.updated_at).toBe("string");
    expect("created_by" in stamped).toBe(false);
  });
});

describe("writeAudit", () => {
  it("inserts an audit_log row with non-NULL changed_by = ctx.userId", async () => {
    const ctx = makeUserContext({ userId: "actor-3" });
    const mock = makeSupabaseMock();

    await writeAudit(mock.client as never, ctx, {
      table: "people",
      recordId: "rec-1",
      action: "INSERT",
      before: null,
      after: { full_name: "X" },
    });

    const captured = mock.getCaptured();
    expect(mock.getLastTable()).toBe("audit_log");
    expect(captured).not.toBeNull();
    expect(captured?.changed_by).toBe("actor-3");
    expect(captured?.changed_by).not.toBeNull();
    expect(captured?.table_name).toBe("people");
    expect(captured?.record_id).toBe("rec-1");
    expect(captured?.action).toBe("INSERT");
  });

  it("derives match_id: matches -> record id, assignments -> row match_id, else null", async () => {
    const ctx = makeUserContext({ userId: "actor-4" });

    const m1 = makeSupabaseMock();
    await writeAudit(m1.client as never, ctx, {
      table: "matches",
      recordId: "match-1",
      action: "UPDATE",
      before: {},
      after: {},
    });
    expect(m1.getCaptured()?.match_id).toBe("match-1");

    const m2 = makeSupabaseMock();
    await writeAudit(m2.client as never, ctx, {
      table: "assignments",
      recordId: "asg-1",
      matchId: "match-99",
      action: "INSERT",
      before: null,
      after: { match_id: "match-99" },
    });
    expect(m2.getCaptured()?.match_id).toBe("match-99");

    const m3 = makeSupabaseMock();
    await writeAudit(m3.client as never, ctx, {
      table: "people",
      recordId: "p-1",
      action: "INSERT",
      before: null,
      after: {},
    });
    expect(m3.getCaptured()?.match_id).toBeNull();
  });

  it("redacts secret_value from app_settings audit before/after payloads", async () => {
    const ctx = makeUserContext({ userId: "actor-5" });
    const mock = makeSupabaseMock();

    await writeAudit(mock.client as never, ctx, {
      table: "app_settings",
      recordId: "set-1",
      action: "UPDATE",
      before: { setting_key: "gemini", secret_value: "OLD-SECRET", public_value: "m" },
      after: { setting_key: "gemini", secret_value: "NEW-SECRET", public_value: "m2" },
    });

    const captured = mock.getCaptured();
    const before = captured?.before as Record<string, unknown> | null;
    const after = captured?.after as Record<string, unknown> | null;

    expect(JSON.stringify(captured)).not.toContain("OLD-SECRET");
    expect(JSON.stringify(captured)).not.toContain("NEW-SECRET");
    expect(before?.public_value).toBe("m");
    expect(after?.public_value).toBe("m2");
    // Secret column still acknowledged but masked, not absent-silently.
    expect(before?.secret_value).not.toBe("OLD-SECRET");
    expect(after?.secret_value).not.toBe("NEW-SECRET");
  });

  it("rethrows on audit insert error (audit failure must not be silent)", async () => {
    const ctx = makeUserContext({ userId: "actor-6" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from() {
        return {
          insert() {
            return Promise.resolve({ error: { message: "boom" } });
          },
        };
      },
    };

    await expect(
      writeAudit(client as never, ctx, {
        table: "people",
        recordId: "p-2",
        action: "INSERT",
        before: null,
        after: {},
      }),
    ).rejects.toBeTruthy();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
