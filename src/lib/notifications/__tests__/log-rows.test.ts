import { describe, expect, it } from "vitest";

import { buildRecipientLogRows } from "@/lib/notifications/log-rows";

const BASE = {
  match: { id: "11111111-1111-4111-8111-111111111111", label: "Boca vs River" },
  trigger: "cron" as const,
  recipient: {
    personId: "22222222-2222-4222-8222-222222222222",
    personName: "Wenceslao Cápolo",
    phone: "+5491122334455",
    email: "wences@example.com",
    roleNames: ["Cámara"],
  },
};

describe("buildRecipientLogRows", () => {
  it("records a sent WhatsApp delivery as one whatsapp/sent row", () => {
    const rows = buildRecipientLogRows({
      ...BASE,
      outcomes: [{ channel: "whatsapp", attempted: true, ok: true }],
    });

    expect(rows).toEqual([
      {
        match_id: BASE.match.id,
        person_id: BASE.recipient.personId,
        match_label: "Boca vs River",
        recipient_name: "Wenceslao Cápolo",
        role_names: ["Cámara"],
        channel: "whatsapp",
        destination: "+5491122334455",
        status: "sent",
        error: null,
        trigger: "cron",
      },
    ]);
  });

  it("records a failed WhatsApp attempt as failed and carries the error", () => {
    const rows = buildRecipientLogRows({
      ...BASE,
      outcomes: [
        {
          channel: "whatsapp",
          attempted: true,
          ok: false,
          error: "OpenWA respondió 500.",
        },
      ],
    });

    expect(rows[0].status).toBe("failed");
    expect(rows[0].error).toBe("OpenWA respondió 500.");
  });

  it("records a not-attempted channel as skipped, distinct from failed", () => {
    const rows = buildRecipientLogRows({
      ...BASE,
      outcomes: [
        {
          channel: "whatsapp",
          attempted: false,
          ok: false,
          error: "OpenWA no está configurado.",
        },
      ],
    });

    expect(rows[0].status).toBe("skipped");
    expect(rows[0].error).toBe("OpenWA no está configurado.");
  });

  it("uses the email address as destination and maps email outcomes", () => {
    const sent = buildRecipientLogRows({
      ...BASE,
      outcomes: [{ channel: "email", attempted: true, ok: true }],
    });
    expect(sent[0]).toMatchObject({
      channel: "email",
      destination: "wences@example.com",
      status: "sent",
    });

    const failed = buildRecipientLogRows({
      ...BASE,
      outcomes: [
        { channel: "email", attempted: true, ok: false, error: "SMTP timeout" },
      ],
    });
    expect(failed[0]).toMatchObject({
      channel: "email",
      status: "failed",
      error: "SMTP timeout",
    });
  });

  it("emits a single no_contact row when the recipient has no channels", () => {
    const rows = buildRecipientLogRows({
      ...BASE,
      recipient: { ...BASE.recipient, phone: null, email: null },
      outcomes: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: "none",
      destination: null,
      status: "no_contact",
      error: null,
      recipient_name: "Wenceslao Cápolo",
      match_label: "Boca vs River",
    });
  });

  it("emits one row per attempted channel", () => {
    const rows = buildRecipientLogRows({
      ...BASE,
      outcomes: [
        { channel: "whatsapp", attempted: true, ok: true },
        { channel: "email", attempted: true, ok: true },
      ],
    });

    expect(rows.map((r) => r.channel)).toEqual(["whatsapp", "email"]);
  });

  it("keeps the snapshot labels when the match is gone (match_id null)", () => {
    const rows = buildRecipientLogRows({
      ...BASE,
      match: { id: null, label: "Boca vs River" },
      outcomes: [{ channel: "whatsapp", attempted: true, ok: true }],
    });

    expect(rows[0].match_id).toBeNull();
    expect(rows[0].match_label).toBe("Boca vs River");
    expect(rows[0].role_names).toEqual(["Cámara"]);
  });
});
