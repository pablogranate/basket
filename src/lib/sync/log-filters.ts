export type SyncLogFilters = {
  status: string;
  trigger: string;
  dateFrom: string;
  dateTo: string;
};

export const EMPTY_SYNC_LOG_FILTERS: SyncLogFilters = {
  status: "",
  trigger: "",
  dateFrom: "",
  dateTo: "",
};

export const SYNC_STATUS_FILTER_VALUES = [
  "success",
  "error",
  "skipped",
] as const;

export const SYNC_TRIGGER_FILTER_VALUES = ["cron", "manual"] as const;

type RawSearchParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams;

function getParam(params: RawSearchParams, key: string): string {
  const raw =
    params instanceof URLSearchParams
      ? params.get(key) ?? ""
      : Array.isArray(params[key])
        ? params[key]?.[0] ?? ""
        : (params[key] as string | undefined) ?? "";
  return raw.trim();
}

function pickEnum(value: string, allowed: readonly string[]): string {
  return allowed.includes(value) ? value : "";
}

export function parseSyncLogFilters(params: RawSearchParams): SyncLogFilters {
  return {
    status: pickEnum(getParam(params, "status"), SYNC_STATUS_FILTER_VALUES),
    trigger: pickEnum(getParam(params, "trigger"), SYNC_TRIGGER_FILTER_VALUES),
    dateFrom: getParam(params, "dateFrom"),
    dateTo: getParam(params, "dateTo"),
  };
}
