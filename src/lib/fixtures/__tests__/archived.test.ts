import { describe, expect, it } from "vitest";

import { parseArchivedCompetitions, serializeArchivedCompetitions } from "@/lib/fixtures/archived";

describe("archived competitions cookie", () => {
  it("round-trips labels", () => {
    const labels = ["Copa del Rey", "LUB"];
    expect(parseArchivedCompetitions(serializeArchivedCompetitions(labels))).toEqual(labels);
  });

  it("accepts an already-decoded value", () => {
    expect(parseArchivedCompetitions('["Endesa"]')).toEqual(["Endesa"]);
  });

  it("falls back to nothing on a missing or bad value", () => {
    expect(parseArchivedCompetitions(undefined)).toEqual([]);
    expect(parseArchivedCompetitions("not json")).toEqual([]);
    expect(parseArchivedCompetitions(encodeURIComponent('{"a":1}'))).toEqual([]);
    expect(parseArchivedCompetitions(encodeURIComponent('["LBA",3]'))).toEqual(["LBA"]);
  });
});
