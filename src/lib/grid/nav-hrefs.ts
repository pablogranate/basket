import { addDays, addMonths } from "date-fns";

import { getDateInputValue, getMonthInputValue } from "@/lib/date";

// URL building for the /grid toolbar. Lives here rather than in the page so the
// server-rendered links and the client-side search submission construct targets
// through the same code — otherwise the two drift and a filter silently drops.
export type GridSearchParams = Record<string, string | string[] | undefined>;

export type GridView = "day" | "month";

// Params that carry a one-shot message from a server action. They must never
// ride along into a toolbar target, or an old banner reappears on a date step.
const TRANSIENT_PARAM_KEYS = ["intent", "notice"] as const;

function collectStringParams(params: GridSearchParams) {
  const search = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (typeof rawValue === "string" && rawValue) {
      search.set(key, rawValue);
    }
  }

  return search;
}

function toGridHref(search: URLSearchParams) {
  const query = search.toString();
  return query ? `/grid?${query}` : "/grid";
}

// The current URL, rebuilt. Used as the post-action redirect target, so it keeps
// the transient params a toolbar target drops.
export function serializeGridSearchParams(params: GridSearchParams) {
  return toGridHref(collectStringParams(params));
}

export function toStringGridSearchParams(params: GridSearchParams) {
  const result: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(params)) {
    if (typeof rawValue === "string" && rawValue) {
      result[key] = rawValue;
    }
  }

  return result;
}

export function buildGridHref(
  params: GridSearchParams,
  updates: Record<string, string | undefined>,
) {
  const search = collectStringParams(params);

  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      search.delete(key);
      continue;
    }

    search.set(key, value);
  }

  for (const key of TRANSIENT_PARAM_KEYS) {
    search.delete(key);
  }

  return toGridHref(search);
}

// Midday anchors the arithmetic away from DST edges: a date-only string parsed
// at midnight can land on the previous day once shifted.
export function buildGridDateShift(params: {
  date: string;
  view: GridView;
  amount: number;
}) {
  const baseDate =
    params.view === "month"
      ? new Date(`${params.date}-01T12:00:00`)
      : new Date(`${params.date}T12:00:00`);
  const shiftedDate =
    params.view === "month"
      ? addMonths(baseDate, params.amount)
      : addDays(baseDate, params.amount);

  return params.view === "month"
    ? getMonthInputValue(shiftedDate)
    : getDateInputValue(shiftedDate);
}

export function buildGridDateStepHrefs(
  params: GridSearchParams,
  filters: { date: string; view: GridView },
) {
  // Landing on a different date always starts collapsed: `past` never rides a
  // date step, so the heavy past-day cards stay out of the next payload.
  return {
    previousDateHref: buildGridHref(params, {
      date: buildGridDateShift({
        date: filters.date,
        view: filters.view,
        amount: -1,
      }),
      past: undefined,
    }),
    nextDateHref: buildGridHref(params, {
      date: buildGridDateShift({
        date: filters.date,
        view: filters.view,
        amount: 1,
      }),
      past: undefined,
    }),
  };
}

export function buildGridViewHrefs(params: GridSearchParams) {
  return {
    todayHref: buildGridHref(params, {
      view: "day",
      date: getDateInputValue(),
      past: undefined,
    }),
    monthHref: buildGridHref(params, {
      view: "month",
      date: getMonthInputValue(),
      past: undefined,
    }),
  };
}

// Toggle target for "Ver días anteriores". Expanding sets `past=1` so the
// server renders (and serializes) the past-day cards only on request.
export function buildGridPastDaysHref(
  params: GridSearchParams,
  pastDays: boolean,
) {
  return buildGridHref(params, { past: pastDays ? undefined : "1" });
}

export function buildGridDateOrderHref(
  params: GridSearchParams,
  dateOrder: "asc" | "desc",
) {
  return buildGridHref(params, {
    dateOrder: dateOrder === "asc" ? "desc" : "asc",
  });
}

// Search submission. A native form GET replaces the whole query string with just
// the form's fields, so this reproduces the hidden-input set exactly — parsed
// `filters` (defaulted view/date/dateOrder/timezone, normalized mode), in DOM
// order, with `q` last. `display` only rides along when it was explicit; the
// localStorage preference in GridDisplayToggle depends on its absence.
export type GridSearchHrefFilters = {
  view: GridView;
  date: string;
  dateOrder: "asc" | "desc";
  display: "cards" | "table";
  league: string;
  mode: string;
  status: string;
  owner: string;
  timezone: string;
};

export function buildGridSearchHref(input: {
  filters: GridSearchHrefFilters;
  hasExplicitDisplay: boolean;
  query: string;
}) {
  const { filters, hasExplicitDisplay, query } = input;
  const search = new URLSearchParams();

  search.set("view", filters.view);
  search.set("date", filters.date);
  search.set("dateOrder", filters.dateOrder);

  if (hasExplicitDisplay) {
    search.set("display", filters.display);
  }

  for (const [key, value] of [
    ["league", filters.league],
    ["mode", filters.mode],
    ["status", filters.status],
    ["owner", filters.owner],
    ["timezone", filters.timezone],
  ] as const) {
    if (value) {
      search.set(key, value);
    }
  }

  const term = query.trim();
  if (term) {
    search.set("q", term);
  }

  return toGridHref(search);
}
