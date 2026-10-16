import { describe, expect, it } from "vitest";

import { normalizeToWhatsAppChatId } from "@/lib/integrations/whatsapp-chat-id";

describe("normalizeToWhatsAppChatId", () => {
  it("prepends 549 to a 10-digit Argentine number", () => {
    expect(normalizeToWhatsAppChatId("11 2233-4455")).toBe(
      "5491122334455@s.whatsapp.net",
    );
  });

  it("keeps a number that already carries a country code", () => {
    expect(normalizeToWhatsAppChatId("+54 9 11 2233-4455")).toBe(
      "5491122334455@s.whatsapp.net",
    );
  });

  it("returns empty for missing or unusable numbers", () => {
    expect(normalizeToWhatsAppChatId(null)).toBe("");
    expect(normalizeToWhatsAppChatId("   ")).toBe("");
    expect(normalizeToWhatsAppChatId("12345")).toBe("");
    expect(normalizeToWhatsAppChatId("54112233445")).toBe("");
    expect(normalizeToWhatsAppChatId("sin teléfono")).toBe("");
  });
});
