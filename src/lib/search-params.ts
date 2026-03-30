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
  return {
    intent: getParam(searchParams, "intent"),
    notice: getParam(searchParams, "notice"),
  };
}

export function parseGridSearchParams(searchParams: RawSearchParams) {
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

  return {
    view,
    date: getParam(searchParams, "date") ?? defaultDate,
    dateOrder,
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
  params: { intent: "success" | "error"; notice: string },
) {
  const url = new URL(redirectTo, "http://localhost");
  url.searchParams.set("intent", params.intent);
  url.searchParams.set("notice", params.notice);

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
