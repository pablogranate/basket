"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  GEMINI_API_KEY_COOKIE,
  GEMINI_GLOBAL_SETTING_KEY,
  GEMINI_MODEL_COOKIE,
  GEMINI_MODEL_OPTIONS,
  UI_DENSITY_COOKIE,
  UI_DENSITY_OPTIONS,
  isGeminiModel,
} from "@/lib/settings";

function isAllowedValue<T extends readonly string[]>(value: string, options: T) {
  return options.includes(value as T[number]);
}

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

const isSecureCookie = process.env.NODE_ENV === "production";
const ANNOUNCEMENT_REVALIDATE_PATHS = [
  "/settings",
  "/mi-jornada",
  "/grid",
  "/reports",
  "/incidents",
];

export async function saveGeminiSettingsAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/settings");
  const user = await requireAdmin();

  try {
    const apiKey = String(formData.get("geminiApiKey") ?? "").trim();
    const model = String(formData.get("geminiModel") ?? "gemini-2.5-flash").trim();
    const store = await cookies();
    const resolvedModel = isGeminiModel(model) ? model : "gemini-2.5-flash";

    if (apiKey) {
      store.set(GEMINI_API_KEY_COOKIE, apiKey, {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookie,
        path: "/",
      });
    } else {
      store.delete(GEMINI_API_KEY_COOKIE);
    }

    if (isAllowedValue(model, GEMINI_MODEL_OPTIONS)) {
      store.set(GEMINI_MODEL_COOKIE, model, {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookie,
        path: "/",
      });
    }

    let notice = apiKey
      ? "Configuración de Gemini actualizada."
      : "Clave de Gemini eliminada.";

    if (user.role === "admin") {
      const supabase = await createSupabaseServerClient();

      if (apiKey) {
        const upsertResult = await supabase
          .from("app_settings")
          .upsert(
            stampInsert(user, {
              setting_key: GEMINI_GLOBAL_SETTING_KEY,
              secret_value: apiKey,
              public_value: resolvedModel,
            }),
            { onConflict: "setting_key" },
          )
          .select("id")
          .single();

        if (upsertResult.error) {
          if (isMissingAppSettingsError(upsertResult.error)) {
            notice =
              "Configuración personal guardada. Aplica la migración 0008 para compartir Gemini con todo el portal.";
          } else {
            throw upsertResult.error;
          }
        } else {
          // secret_value is redacted by writeAudit for the app_settings table.
          await writeAudit(supabase, user, {
            table: "app_settings",
            recordId: upsertResult.data.id,
            action: "UPDATE",
            before: null,
            after: {
              setting_key: GEMINI_GLOBAL_SETTING_KEY,
              secret_value: apiKey,
              public_value: resolvedModel,
            },
          });
          notice = "Gemini actualizado para tu sesión y para todo el portal.";
        }
      } else {
        const deleteResult = await supabase
          .from("app_settings")
          .delete()
          .eq("setting_key", GEMINI_GLOBAL_SETTING_KEY)
          .select("id")
          .maybeSingle();

        if (deleteResult.error) {
          if (isMissingAppSettingsError(deleteResult.error)) {
            notice =
              "Clave personal eliminada. Aplica la migración 0008 para administrar la clave global del portal.";
          } else {
            throw deleteResult.error;
          }
        } else {
          if (deleteResult.data) {
            await writeAudit(supabase, user, {
              table: "app_settings",
              recordId: deleteResult.data.id,
              action: "DELETE",
              before: { setting_key: GEMINI_GLOBAL_SETTING_KEY },
              after: null,
            });
          }
          notice = "Clave de Gemini eliminada de tu sesión y del portal.";
        }
      }
    }

    // Scope revalidation to where the Gemini key is actually read. The AI
    // gating on grid/mi-jornada/reports/incidents/people/teams reads the settings
    // snapshot fresh on every real navigation (those routes are dynamic and
    // prefetch only warms their shell, not the data loaders), so re-rendering
    // them here just made an unrelated settings tweak slow. No layout/header
    // surfaces the flag app-wide, so /settings is the only path that needs it.
    revalidatePath("/settings");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice,
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: "No pudimos guardar la configuración de Gemini.",
    });
  }
}

export async function savePreferencesAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/settings");
  await requireAdmin();

  try {
    const density = String(formData.get("uiDensity") ?? "comoda").trim();
    const store = await cookies();

    if (isAllowedValue(density, UI_DENSITY_OPTIONS)) {
      store.set(UI_DENSITY_COOKIE, density, {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookie,
        path: "/",
      });
    }

    revalidatePath("/settings");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Preferencias de interfaz actualizadas.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: "No pudimos guardar tus preferencias.",
    });
  }
}

export async function saveAnnouncementAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/settings");
  const user = await requireAdmin();

  try {
    const supabase = await createSupabaseServerClient();
    const announcementId = String(formData.get("announcementId") ?? "").trim();
    const title = String(formData.get("announcementTitle") ?? "").trim();
    const body = String(formData.get("announcementBody") ?? "").trim();
    const active = formData.get("announcementActive") === "on";

    if (!title || !body) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: "El comunicado necesita título y mensaje.",
      });
    }

    let persistedAnnouncementId = announcementId;

    if (announcementId) {
      const updateResult = await supabase
        .from("announcements")
        .update(stampUpdate(user, { title, body, active }))
        .eq("id", announcementId)
        .select("id")
        .single();

      if (updateResult.error) {
        throw updateResult.error;
      }

      persistedAnnouncementId = updateResult.data.id;

      await writeAudit(supabase, user, {
        table: "announcements",
        recordId: persistedAnnouncementId,
        action: "UPDATE",
        before: null,
        after: { id: persistedAnnouncementId, title, body, active },
      });
    } else {
      const insertResult = await supabase
        .from("announcements")
        .insert(stampInsert(user, { title, body, active }))
        .select("id")
        .single();

      if (insertResult.error) {
        throw insertResult.error;
      }

      persistedAnnouncementId = insertResult.data.id;

      await writeAudit(supabase, user, {
        table: "announcements",
        recordId: persistedAnnouncementId,
        action: "INSERT",
        before: null,
        after: { id: persistedAnnouncementId, title, body, active },
      });
    }

    if (active) {
      const deactivateOthers = await supabase
        .from("announcements")
        .update(stampUpdate(user, { active: false }))
        .eq("active", true)
        .neq("id", persistedAnnouncementId);

      if (deactivateOthers.error) {
        throw deactivateOthers.error;
      }

      await writeAudit(supabase, user, {
        table: "announcements",
        recordId: persistedAnnouncementId,
        action: "UPDATE",
        before: null,
        after: { deactivated_others: true },
      });
    }

    ANNOUNCEMENT_REVALIDATE_PATHS.forEach((path) => {
      revalidatePath(path);
    });

    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: active
        ? "Comunicado general publicado."
        : "Comunicado guardado sin publicar.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: "No pudimos guardar el comunicado general.",
    });
  }
}
