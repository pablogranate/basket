import { describe, expect, it } from "vitest";

import {
  buildMatchRecipients,
  getChannelEligibility,
} from "@/lib/notifications/recipients";

const person = {
  id: "p1",
  full_name: "Wenceslao Cápolo",
  phone: "+5491122334455",
  email: "wences@example.com",
};

describe("buildMatchRecipients", () => {
  it("collapses one person across multiple roles into a single recipient", () => {
    const recipients = buildMatchRecipients([
      { role: { name: "Rol A" }, person },
      { role: { name: "Rol B" }, person },
    ]);

    expect(recipients).toHaveLength(1);
    expect(recipients[0].personId).toBe("p1");
    expect(recipients[0].roleNames).toEqual(["Rol A", "Rol B"]);
  });

  it("flags missing phone and email as null", () => {
    const recipients = buildMatchRecipients([
      {
        role: { name: "Rol A" },
        person: { id: "p2", full_name: "Sin Contacto", phone: "  ", email: null },
      },
    ]);

    expect(recipients).toHaveLength(1);
    expect(recipients[0].phone).toBeNull();
    expect(recipients[0].email).toBeNull();
  });

  it("drops assignments with no linked person", () => {
    const recipients = buildMatchRecipients([
      { role: { name: "Rol A" }, person: null },
      { role: { name: "Rol B" }, person },
    ]);

    expect(recipients).toHaveLength(1);
    expect(recipients[0].personId).toBe("p1");
  });
});

describe("getChannelEligibility", () => {
  it("marks valid contacts as ok", () => {
    expect(
      getChannelEligibility({ phone: "+5491122334455", email: "a@b.com" }),
    ).toEqual({ whatsapp: "ok", email: "ok" });
  });

  it("marks absent contacts as missing", () => {
    expect(getChannelEligibility({ phone: null, email: null })).toEqual({
      whatsapp: "missing",
      email: "missing",
    });
  });

  it("marks unusable contacts as invalid", () => {
    for (const email of ["sin-arroba", "a@b", "a b@c.com", "@b.com"]) {
      expect(getChannelEligibility({ phone: "12345", email })).toEqual({
        whatsapp: "invalid",
        email: "invalid",
      });
    }
  });
});
