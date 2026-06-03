import { cookies } from "next/headers";

import { appEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

async function getPortalGeminiConfig() {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .from("app_settings")
      .select("secret_value, public_value")
      .eq("setting_key", GEMINI_GLOBAL_SETTING_KEY)
      .maybeSingle();

    if (result.error) {
      if (!isMissingAppSettingsError(result.error)) {
        console.error("[settings] failed to load portal Gemini config", result.error);
      }

      return {
        apiKey: "",
        model: "gemini-2.5-flash" as GeminiModel,
      };
    }

    const rawModel = result.data?.public_value?.trim() ?? "";

    return {
      apiKey: result.data?.secret_value?.trim() ?? "",
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
