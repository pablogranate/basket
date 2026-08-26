import { eq } from "drizzle-orm";

import {
  DEFAULT_ACCESS_REQUEST_RECIPIENTS,
  parseRecipientList,
  type AccessRequestRecipientConfig,
} from "@/lib/access-requests/recipients";
import { db } from "@/lib/db/client";
import { appSettings as appSettingsTable } from "@/lib/db/schema";

export const ACCESS_REQUEST_RECIPIENTS_SETTING_KEY = "access_request_recipients";

// Stored as JSON in app_settings.public_value: no secret involved, and the shape
// is a routing table rather than a single scalar.
export function parseRecipientConfig(
  raw: string | null | undefined,
): AccessRequestRecipientConfig {
  if (!raw?.trim()) {
    return DEFAULT_ACCESS_REQUEST_RECIPIENTS;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_ACCESS_REQUEST_RECIPIENTS;
    }

    const source = parsed as {
      byFuncion?: Record<string, unknown>;
      always?: unknown;
    };
    const byFuncion: Record<string, string[]> = {};

    for (const [funcion, value] of Object.entries(source.byFuncion ?? {})) {
      byFuncion[funcion] = parseRecipientList(
        Array.isArray(value) ? value.join(",") : String(value ?? ""),
      );
    }

    return {
      byFuncion,
      always: parseRecipientList(
        Array.isArray(source.always)
          ? source.always.join(",")
          : String(source.always ?? ""),
      ),
    };
  } catch (error) {
    console.warn("[access-requests] unreadable recipient config", error);
    return DEFAULT_ACCESS_REQUEST_RECIPIENTS;
  }
}

export function serializeRecipientConfig(config: AccessRequestRecipientConfig) {
  return JSON.stringify(config);
}

export async function getAccessRequestRecipientConfig(): Promise<AccessRequestRecipientConfig> {
  try {
    const rows = await db
      .select({ publicValue: appSettingsTable.publicValue })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.settingKey, ACCESS_REQUEST_RECIPIENTS_SETTING_KEY))
      .limit(1);

    return parseRecipientConfig(rows[0]?.publicValue);
  } catch (error) {
    // A missing app_settings row (or table) must never stop a signup: fall back
    // to the seeded routing so the notification still reaches producción.
    console.error("[access-requests] failed to load recipient config", error);
    return DEFAULT_ACCESS_REQUEST_RECIPIENTS;
  }
}
