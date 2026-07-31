import {
  getDateInputValue,
  getMonthInputValue,
} from "@/lib/date";
import { DEFAULT_TIMEZONE, getProductionModeLabel, normalizeProductionMode } from "@/lib/constants";

type RawSearchParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams;

function getParam(
  searchParams: RawSearchParams,
  key: string,
): string | undefined {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }

  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseNotice(searchParams: RawSearchParams) {
  const rawNotify = getParam(searchParams, "notify");

  return {
    intent: getParam(searchParams, "intent"),
    notice: getParam(searchParams, "notice"),
    notify: rawNotify
      ? rawNotify.split(",").map((id) => id.trim()).filter(Boolean)
      : [],
  };
}

export const GRID_DISPLAY_COOKIE = "grid-display";

export type GridDisplay = "cards" | "table";

export function normalizeGridDisplay(
  value: string | null | undefined,
): GridDisplay | undefined {
  return value === "cards" || value === "table" ? value : undefined;
}

// `displayFallback` carries the persisted preference (the `grid-display` cookie
// read by /grid) so the first render already honours it. It used to be applied
// client-side after mount with a router.replace, which cost a second full grid
// render for anyone whose stored view was the table.
export function parseGridSearchParams(
  searchParams: RawSearchParams,
  options: { displayFallback?: GridDisplay } = {},
) {
  const view = (
    getParam(searchParams, "view") === "day" ? "day" : "month"
  ) as "day" | "month";
  const defaultDate =
    view === "month" ? getMonthInputValue() : getDateInputValue();
  const dateOrder = (
    getParam(searchParams, "dateOrder") === "desc" ? "desc" : "asc"
  ) as "asc" | "desc";
  const rawMode = getParam(searchParams, "mode") ?? "";
  const mode = getProductionModeLabel(normalizeProductionMode(rawMode));
  const display: GridDisplay =
    normalizeGridDisplay(getParam(searchParams, "display")) ??
    options.displayFallback ??
    (view === "month" ? "table" : "cards");

  return {
    view,
    display,
    date: getParam(searchParams, "date") ?? defaultDate,
    dateOrder,
    // Past-day cards only travel in the payload when explicitly requested via
    // `past=1` — the month view otherwise ships today-onward cards only.
    pastDays: getParam(searchParams, "past") === "1",
    q: getParam(searchParams, "q") ?? "",
    league: getParam(searchParams, "league") ?? "",
    mode,
    status: getParam(searchParams, "status") ?? "",
    owner: getParam(searchParams, "owner") ?? "",
    timezone: getParam(searchParams, "timezone") ?? DEFAULT_TIMEZONE,
  };
}

export function getRedirectWithMessage(
  redirectTo: string,
  params: { intent: "success" | "error"; notice: string; notify?: string[] },
) {
  const url = new URL(redirectTo, "http://localhost");
  url.searchParams.set("intent", params.intent);
  url.searchParams.set("notice", params.notice);

  if (params.notify?.length) {
    url.searchParams.set("notify", params.notify.join(","));
  }

  return `${url.pathname}${url.search}`;
}

export function sanitizeRedirectTo(
  redirectTo: string | null | undefined,
  fallback = "/grid",
) {
  if (!redirectTo || !redirectTo.startsWith("/")) {
    return fallback;
  }

  return redirectTo;
}
