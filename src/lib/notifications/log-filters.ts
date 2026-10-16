export type NotificationLogFilters = {
  status: string;
  channel: string;
  trigger: string;
  dateFrom: string;
  dateTo: string;
  recipient: string;
  match: string;
};

export const EMPTY_NOTIFICATION_LOG_FILTERS: NotificationLogFilters = {
  status: "",
  channel: "",
  trigger: "",
  dateFrom: "",
  dateTo: "",
  recipient: "",
  match: "",
};

export const STATUS_FILTER_VALUES = [
  "sent",
  "failed",
  "skipped",
  "no_contact",
] as const;

export const CHANNEL_FILTER_VALUES = ["whatsapp", "email", "none"] as const;

// "automatic" is a UI grouping that expands to the three machine triggers.
export const TRIGGER_FILTER_VALUES = [
  "manual",
  "automatic",
  "cron",
  "catchup",
  "boot",
] as const;

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

// A date bound must be a real calendar day as `yyyy-MM-dd`; anything else
// (`foo`, `2026-02-31`) is dropped so the query never builds an Invalid Date.
function pickDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return "";
  }

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDay =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isRealDay ? value : "";
}

export function parseNotificationLogFilters(
  params: RawSearchParams,
): NotificationLogFilters {
  return {
    status: pickEnum(getParam(params, "status"), STATUS_FILTER_VALUES),
    channel: pickEnum(getParam(params, "channel"), CHANNEL_FILTER_VALUES),
    trigger: pickEnum(getParam(params, "trigger"), TRIGGER_FILTER_VALUES),
    dateFrom: pickDate(getParam(params, "dateFrom")),
    dateTo: pickDate(getParam(params, "dateTo")),
    recipient: getParam(params, "recipient"),
    match: getParam(params, "match"),
  };
}

// Expands the trigger filter into the concrete column values to match, or null
// when no trigger constraint should be applied.
export function resolveTriggerValues(trigger: string): string[] | null {
  if (!trigger) {
    return null;
  }

  if (trigger === "automatic") {
    return ["cron", "catchup", "boot"];
  }

  return [trigger];
}
