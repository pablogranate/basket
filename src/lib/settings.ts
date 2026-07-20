import { cache } from "react";
import { cookies } from "next/headers";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { appSettings as appSettingsTable } from "@/lib/db/schema";
import { appEnv } from "@/lib/env";

export const GEMINI_API_KEY_COOKIE = "bp_gemini_api_key";
export const GEMINI_MODEL_COOKIE = "bp_gemini_model";
export const UI_DENSITY_COOKIE = "bp_ui_density";
export const GEMINI_GLOBAL_SETTING_KEY = "gemini";

export const GEMINI_MODEL_OPTIONS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
] as const;

export const UI_DENSITY_OPTIONS = ["comoda", "compacta"] as const;

export type UiDensity = (typeof UI_DENSITY_OPTIONS)[number];
export type GeminiModel = (typeof GEMINI_MODEL_OPTIONS)[number];

export function isGeminiModel(value: string): value is GeminiModel {
  return GEMINI_MODEL_OPTIONS.includes(value as GeminiModel);
}

type GeminiConfigSource = "personal" | "portal" | "env" | "none";

type GeminiRuntimeConfig = {
  apiKey: string;
  model: GeminiModel;
  source: GeminiConfigSource;
  hasGeminiKey: boolean;
  hasPersonalGeminiKey: boolean;
  hasPortalGeminiKey: boolean;
  hasEnvGeminiKey: boolean;
};

function isMissingAppSettingsError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeCode =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const maybeMessage =
    "message" in error && typeof error.message === "string" ? error.message : "";

  return maybeCode === "42P01" || maybeMessage.includes("app_settings");
}

type PortalGeminiConfig = {
  apiKey: string;
  model: GeminiModel;
};

// Cross-request memo layered under the per-request react cache: the portal
// Gemini row only changes through saveGeminiSettingsAction (which calls
// clearPortalGeminiConfigCache), so the TTL just bounds staleness from
// out-of-band edits (direct SQL). Assumes a single Node process (pm2 fork
// mode), same as the profile cache in auth.ts; revisit before clustering.
const PORTAL_GEMINI_CACHE_TTL_MS = 60_000;
let portalGeminiCache: {
  value: PortalGeminiConfig;
  expiresAt: number;
} | null = null;

export function clearPortalGeminiConfigCache() {
  portalGeminiCache = null;
}

const getPortalGeminiConfig = cache(async (): Promise<PortalGeminiConfig> => {
  if (portalGeminiCache && portalGeminiCache.expiresAt > Date.now()) {
    return portalGeminiCache.value;
  }

  const value = await loadPortalGeminiConfig();
  portalGeminiCache = {
    value,
    expiresAt: Date.now() + PORTAL_GEMINI_CACHE_TTL_MS,
  };

  return value;
});

async function loadPortalGeminiConfig(): Promise<PortalGeminiConfig> {
  try {
    const rows = await db
      .select({
        secret_value: appSettingsTable.secretValue,
        public_value: appSettingsTable.publicValue,
      })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.settingKey, GEMINI_GLOBAL_SETTING_KEY))
      .limit(1);

    const row = rows[0] ?? null;
    const rawModel = row?.public_value?.trim() ?? "";

    return {
      apiKey: row?.secret_value?.trim() ?? "",
      model: isGeminiModel(rawModel) ? rawModel : "gemini-2.5-flash",
    };
  } catch (error) {
    if (!isMissingAppSettingsError(error)) {
      console.error("[settings] unexpected portal Gemini config error", error);
    }

    return {
      apiKey: "",
      model: "gemini-2.5-flash" as GeminiModel,
    };
  }
}

export async function getGeminiRuntimeConfig(): Promise<GeminiRuntimeConfig> {
  const store = await cookies();
  const personalApiKey = store.get(GEMINI_API_KEY_COOKIE)?.value?.trim() ?? "";
  const storedPersonalModel = store.get(GEMINI_MODEL_COOKIE)?.value ?? "";
  const personalModel = isGeminiModel(storedPersonalModel)
    ? storedPersonalModel
    : "gemini-2.5-flash";
  const portalConfig = await getPortalGeminiConfig();
  const envApiKey = appEnv.portalGeminiApiKey.trim();
  const envModel = isGeminiModel(appEnv.portalGeminiModel)
    ? appEnv.portalGeminiModel
    : "gemini-2.5-flash";

  if (personalApiKey) {
    return {
      apiKey: personalApiKey,
      model: personalModel,
      source: "personal",
      hasGeminiKey: true,
      hasPersonalGeminiKey: true,
      hasPortalGeminiKey: Boolean(portalConfig.apiKey),
      hasEnvGeminiKey: Boolean(envApiKey),
    };
  }

  if (portalConfig.apiKey) {
    return {
      apiKey: portalConfig.apiKey,
      model: portalConfig.model,
      source: "portal",
      hasGeminiKey: true,
      hasPersonalGeminiKey: false,
      hasPortalGeminiKey: true,
      hasEnvGeminiKey: Boolean(envApiKey),
    };
  }

  if (envApiKey) {
    return {
      apiKey: envApiKey,
      model: envModel,
      source: "env",
      hasGeminiKey: true,
      hasPersonalGeminiKey: false,
      hasPortalGeminiKey: false,
      hasEnvGeminiKey: true,
    };
  }

  return {
    apiKey: "",
    model: "gemini-2.5-flash",
    source: "none",
    hasGeminiKey: false,
    hasPersonalGeminiKey: false,
    hasPortalGeminiKey: false,
    hasEnvGeminiKey: false,
  };
}

export async function getSettingsSnapshot() {
  const store = await cookies();
  const gemini = await getGeminiRuntimeConfig();
  const uiDensity =
    (store.get(UI_DENSITY_COOKIE)?.value as UiDensity | undefined) ?? "comoda";

  // user-facing — never return raw secret_value (D-08); presence booleans only.
  // If a raw key ever needs surfacing here, route it through maskApiKey below.
  return {
    hasGeminiKey: gemini.hasGeminiKey,
    geminiModel: gemini.model,
    geminiSource: gemini.source,
    hasPersonalGeminiKey: gemini.hasPersonalGeminiKey,
    hasPortalGeminiKey: gemini.hasPortalGeminiKey,
    hasEnvGeminiKey: gemini.hasEnvGeminiKey,
    uiDensity,
  };
}

export function maskApiKey(value: string) {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
