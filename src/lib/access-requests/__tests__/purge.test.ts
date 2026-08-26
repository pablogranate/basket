import { describe, expect, it } from "vitest";

import { isPersonPurgeable } from "@/lib/access-requests/purge";

const noHistory = {
  assignments: 0,
  ownedMatches: 0,
  notificationLogs: 0,
  teams: 0,
  personFunctions: 0,
};

describe("isPersonPurgeable", () => {
  it("purges a person with no email and no history", () => {
    expect(isPersonPurgeable({ email: null, counts: noHistory })).toBe(true);
    expect(isPersonPurgeable({ email: "   ", counts: noHistory })).toBe(true);
  });

  it("keeps anyone who has an email", () => {
    expect(
      isPersonPurgeable({ email: "alguien@basquetpass.tv", counts: noHistory }),
    ).toBe(false);
  });

  it("keeps a person with grid history", () => {
    expect(
      isPersonPurgeable({ email: null, counts: { ...noHistory, assignments: 1 } }),
    ).toBe(false);
    expect(
      isPersonPurgeable({ email: null, counts: { ...noHistory, ownedMatches: 1 } }),
    ).toBe(false);
    expect(
      isPersonPurgeable({
        email: null,
        counts: { ...noHistory, notificationLogs: 1 },
      }),
    ).toBe(false);
    expect(
      isPersonPurgeable({ email: null, counts: { ...noHistory, teams: 1 } }),
    ).toBe(false);
  });

  it("treats person_functions tags as disposable, not as history", () => {
    expect(
      isPersonPurgeable({
        email: null,
        counts: { ...noHistory, personFunctions: 3 },
      }),
    ).toBe(true);
  });
});
