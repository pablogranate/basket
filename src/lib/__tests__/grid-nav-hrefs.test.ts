import { describe, expect, it } from "vitest";

import {
  buildGridDateOrderHref,
  buildGridDateShift,
  buildGridDateStepHrefs,
  buildGridHref,
  buildGridSearchHref,
  serializeGridSearchParams,
  toStringGridSearchParams,
  type GridSearchHrefFilters,
} from "@/lib/grid/nav-hrefs";

function paramsOf(href: string) {
  const [pathname, query = ""] = href.split("?");
  return { pathname, search: new URLSearchParams(query) };
}

const BASE_FILTERS: GridSearchHrefFilters = {
  view: "month",
  date: "2026-07",
  dateOrder: "asc",
  display: "table",
  league: "",
  mode: "",
  status: "",
  owner: "",
  timezone: "America/Bogota",
};

describe("buildGridDateShift", () => {
  it("steps a day forward and back in day view", () => {
    expect(
      buildGridDateShift({ date: "2026-07-15", view: "day", amount: 1 }),
    ).toBe("2026-07-16");
    expect(
      buildGridDateShift({ date: "2026-07-15", view: "day", amount: -1 }),
    ).toBe("2026-07-14");
  });

  it("crosses month boundaries in day view", () => {
    expect(
      buildGridDateShift({ date: "2026-07-31", view: "day", amount: 1 }),
    ).toBe("2026-08-01");
    expect(
      buildGridDateShift({ date: "2026-08-01", view: "day", amount: -1 }),
    ).toBe("2026-07-31");
  });

  it("crosses year boundaries in day view", () => {
    expect(
      buildGridDateShift({ date: "2026-12-31", view: "day", amount: 1 }),
    ).toBe("2027-01-01");
    expect(
      buildGridDateShift({ date: "2026-01-01", view: "day", amount: -1 }),
    ).toBe("2025-12-31");
  });

  it("steps a month in month view", () => {
    expect(
      buildGridDateShift({ date: "2026-07", view: "month", amount: 1 }),
    ).toBe("2026-08");
    expect(
      buildGridDateShift({ date: "2026-07", view: "month", amount: -1 }),
    ).toBe("2026-06");
  });

  it("crosses year boundaries in month view", () => {
    expect(
      buildGridDateShift({ date: "2026-12", view: "month", amount: 1 }),
    ).toBe("2027-01");
    expect(
      buildGridDateShift({ date: "2026-01", view: "month", amount: -1 }),
    ).toBe("2025-12");
  });

  it("clamps to the last day of a shorter target month", () => {
    expect(
      buildGridDateShift({ date: "2026-01-31", view: "day", amount: 28 }),
    ).toBe("2026-02-28");
  });

  it("handles a leap-day step", () => {
    expect(
      buildGridDateShift({ date: "2028-02-28", view: "day", amount: 1 }),
    ).toBe("2028-02-29");
  });
});

describe("buildGridHref", () => {
  it("returns the bare path when nothing is set", () => {
    expect(buildGridHref({}, {})).toBe("/grid");
  });

  it("applies updates over the current params", () => {
    const { pathname, search } = paramsOf(
      buildGridHref({ view: "day", date: "2026-07-15" }, { date: "2026-07-16" }),
    );

    expect(pathname).toBe("/grid");
    expect(search.get("view")).toBe("day");
    expect(search.get("date")).toBe("2026-07-16");
  });

  it("preserves every active filter across a date step", () => {
    const { search } = paramsOf(
      buildGridHref(
        {
          view: "month",
          date: "2026-07",
          dateOrder: "desc",
          display: "cards",
          league: "Liga A",
          mode: "Remoto",
          status: "confirmed",
          owner: "owner-1",
          timezone: "America/Bogota",
          q: "granate",
        },
        { date: "2026-08" },
      ),
    );

    expect(search.get("date")).toBe("2026-08");
    expect(search.get("view")).toBe("month");
    expect(search.get("dateOrder")).toBe("desc");
    expect(search.get("display")).toBe("cards");
    expect(search.get("league")).toBe("Liga A");
    expect(search.get("mode")).toBe("Remoto");
    expect(search.get("status")).toBe("confirmed");
    expect(search.get("owner")).toBe("owner-1");
    expect(search.get("timezone")).toBe("America/Bogota");
    expect(search.get("q")).toBe("granate");
  });

  it("drops transient notice params", () => {
    const { search } = paramsOf(
      buildGridHref(
        { view: "day", intent: "success", notice: "Partido creado" },
        { date: "2026-07-16" },
      ),
    );

    expect(search.has("intent")).toBe(false);
    expect(search.has("notice")).toBe(false);
  });

  it("removes a param when the update value is empty or undefined", () => {
    const { search } = paramsOf(
      buildGridHref({ view: "day", league: "Liga A", q: "x" }, { league: "", q: undefined }),
    );

    expect(search.has("league")).toBe(false);
    expect(search.has("q")).toBe(false);
    expect(search.get("view")).toBe("day");
  });

  it("ignores array-valued and empty-string params", () => {
    const { search } = paramsOf(
      buildGridHref({ view: ["day", "month"], league: "", date: "2026-07-15" }, {}),
    );

    expect(search.has("view")).toBe(false);
    expect(search.has("league")).toBe(false);
    expect(search.get("date")).toBe("2026-07-15");
  });
});

describe("buildGridDateStepHrefs", () => {
  it("builds both directions in one pass, filters intact", () => {
    const hrefs = buildGridDateStepHrefs(
      { view: "day", date: "2026-07-15", league: "Liga A" },
      { date: "2026-07-15", view: "day" },
    );

    expect(paramsOf(hrefs.previousDateHref).search.get("date")).toBe("2026-07-14");
    expect(paramsOf(hrefs.nextDateHref).search.get("date")).toBe("2026-07-16");
    expect(paramsOf(hrefs.nextDateHref).search.get("league")).toBe("Liga A");
  });
});

describe("buildGridDateOrderHref", () => {
  it("flips asc to desc and desc to asc", () => {
    expect(
      paramsOf(buildGridDateOrderHref({ dateOrder: "asc" }, "asc")).search.get(
        "dateOrder",
      ),
    ).toBe("desc");
    expect(
      paramsOf(buildGridDateOrderHref({ dateOrder: "desc" }, "desc")).search.get(
        "dateOrder",
      ),
    ).toBe("asc");
  });

  it("keeps the current date and view when flipping", () => {
    const { search } = paramsOf(
      buildGridDateOrderHref({ view: "month", date: "2026-07", dateOrder: "asc" }, "asc"),
    );

    expect(search.get("view")).toBe("month");
    expect(search.get("date")).toBe("2026-07");
  });
});

describe("serializeGridSearchParams", () => {
  it("keeps transient params, unlike a toolbar target", () => {
    const { search } = paramsOf(
      serializeGridSearchParams({ view: "day", intent: "success", notice: "Listo" }),
    );

    expect(search.get("intent")).toBe("success");
    expect(search.get("notice")).toBe("Listo");
  });

  it("returns the bare path when empty", () => {
    expect(serializeGridSearchParams({})).toBe("/grid");
  });
});

describe("toStringGridSearchParams", () => {
  it("keeps only non-empty string values", () => {
    expect(
      toStringGridSearchParams({
        view: "day",
        league: "",
        status: ["a", "b"],
        owner: undefined,
        date: "2026-07-15",
      }),
    ).toEqual({ view: "day", date: "2026-07-15" });
  });
});

describe("buildGridSearchHref", () => {
  it("reproduces the hidden-input field set in DOM order, q last", () => {
    expect(
      buildGridSearchHref({
        filters: BASE_FILTERS,
        hasExplicitDisplay: false,
        query: "granate",
      }),
    ).toBe(
      "/grid?view=month&date=2026-07&dateOrder=asc&timezone=America%2FBogota&q=granate",
    );
  });

  it("includes display only when it was explicit", () => {
    expect(
      paramsOf(
        buildGridSearchHref({
          filters: BASE_FILTERS,
          hasExplicitDisplay: false,
          query: "x",
        }),
      ).search.has("display"),
    ).toBe(false);

    expect(
      paramsOf(
        buildGridSearchHref({
          filters: { ...BASE_FILTERS, display: "cards" },
          hasExplicitDisplay: true,
          query: "x",
        }),
      ).search.get("display"),
    ).toBe("cards");
  });

  it("carries every active filter", () => {
    const { search } = paramsOf(
      buildGridSearchHref({
        filters: {
          ...BASE_FILTERS,
          league: "Liga A",
          mode: "Remoto",
          status: "confirmed",
          owner: "owner-1",
        },
        hasExplicitDisplay: false,
        query: "granate",
      }),
    );

    expect(search.get("league")).toBe("Liga A");
    expect(search.get("mode")).toBe("Remoto");
    expect(search.get("status")).toBe("confirmed");
    expect(search.get("owner")).toBe("owner-1");
    expect(search.get("q")).toBe("granate");
  });

  it("omits blank filters rather than sending empty values", () => {
    const { search } = paramsOf(
      buildGridSearchHref({
        filters: BASE_FILTERS,
        hasExplicitDisplay: false,
        query: "x",
      }),
    );

    expect(search.has("league")).toBe(false);
    expect(search.has("mode")).toBe(false);
    expect(search.has("status")).toBe(false);
    expect(search.has("owner")).toBe(false);
  });

  it("clears the term when the query is empty or whitespace", () => {
    for (const query of ["", "   "]) {
      expect(
        paramsOf(
          buildGridSearchHref({
            filters: BASE_FILTERS,
            hasExplicitDisplay: false,
            query,
          }),
        ).search.has("q"),
      ).toBe(false);
    }
  });

  it("trims the submitted term", () => {
    expect(
      paramsOf(
        buildGridSearchHref({
          filters: BASE_FILTERS,
          hasExplicitDisplay: false,
          query: "  granate  ",
        }),
      ).search.get("q"),
    ).toBe("granate");
  });

  it("never carries transient params, since the form never had them", () => {
    const { search } = paramsOf(
      buildGridSearchHref({
        filters: BASE_FILTERS,
        hasExplicitDisplay: false,
        query: "x",
      }),
    );

    expect(search.has("intent")).toBe(false);
    expect(search.has("notice")).toBe(false);
  });
});
