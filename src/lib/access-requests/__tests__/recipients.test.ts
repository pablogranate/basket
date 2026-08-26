import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACCESS_REQUEST_RECIPIENTS,
  isValidRecipientAddress,
  parseRecipientList,
  resolveAccessRequestRecipients,
} from "@/lib/access-requests/recipients";

describe("resolveAccessRequestRecipients", () => {
  it("routes talento funciones to Carlos plus the always list", () => {
    const recipients = resolveAccessRequestRecipients({
      funcion: "Relator",
      config: DEFAULT_ACCESS_REQUEST_RECIPIENTS,
    });

    expect(recipients).toEqual([
      "carlos.altamirano@basquetpass.tv",
      "produccion@basquetpass.tv",
    ]);
  });

  it("routes tecnica funciones to Pablo plus the always list", () => {
    expect(
      resolveAccessRequestRecipients({
        funcion: "Soporte Tecnico",
        config: DEFAULT_ACCESS_REQUEST_RECIPIENTS,
      }),
    ).toEqual(["pablo.granate@basquetpass.tv", "produccion@basquetpass.tv"]);
  });

  it("falls back to the always list for a funcion with no mapping", () => {
    expect(
      resolveAccessRequestRecipients({
        funcion: "Camarografo",
        config: DEFAULT_ACCESS_REQUEST_RECIPIENTS,
      }),
    ).toEqual(["produccion@basquetpass.tv"]);
  });

  it("dedupes an address that appears in both lists, case-insensitively", () => {
    const recipients = resolveAccessRequestRecipients({
      funcion: "Relator",
      config: {
        byFuncion: { Relator: ["Carlos@Basquetpass.TV", "carlos@basquetpass.tv"] },
        always: ["CARLOS@basquetpass.tv", "produccion@basquetpass.tv"],
      },
    });

    expect(recipients).toEqual([
      "carlos@basquetpass.tv",
      "produccion@basquetpass.tv",
    ]);
  });

  it("drops blank and malformed addresses instead of emailing them", () => {
    expect(
      resolveAccessRequestRecipients({
        funcion: "Relator",
        config: {
          byFuncion: { Relator: ["  ", "no-arroba", "ok@basquetpass.tv"] },
          always: [],
        },
      }),
    ).toEqual(["ok@basquetpass.tv"]);
  });

  it("returns an empty list when nothing is configured, without throwing", () => {
    expect(
      resolveAccessRequestRecipients({
        funcion: "Relator",
        config: { byFuncion: {}, always: [] },
      }),
    ).toEqual([]);
  });
});

describe("parseRecipientList", () => {
  it("splits on commas, trims, lowercases and dedupes", () => {
    expect(parseRecipientList(" A@x.com , b@x.com,a@X.com ,, ")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("also splits on semicolons and newlines", () => {
    expect(parseRecipientList("a@x.com; b@x.com\nc@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });
});

describe("isValidRecipientAddress", () => {
  it("accepts a plain address and rejects the usual typos", () => {
    expect(isValidRecipientAddress("wences@basquetpass.tv")).toBe(true);
    expect(isValidRecipientAddress("wences@basquetpass")).toBe(false);
    expect(isValidRecipientAddress("wences.basquetpass.tv")).toBe(false);
    expect(isValidRecipientAddress("wences @basquetpass.tv")).toBe(false);
    expect(isValidRecipientAddress("")).toBe(false);
  });
});
