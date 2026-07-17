"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { and, eq, ne } from "drizzle-orm";

import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-access";
import { clearAnnouncementCache } from "@/lib/data/announcements";
import { db } from "@/lib/db/client";
import {
  announcements as announcementsTable,
  appSettings as appSettingsTable,
} from "@/lib/db/schema";
import {
  GEMINI_API_KEY_COOKIE,
  GEMINI_GLOBAL_SETTING_KEY,
  GEMINI_MODEL_COOKIE,
  GEMINI_MODEL_OPTIONS,
  UI_DENSITY_COOKIE,
  UI_DENSITY_OPTIONS,
  clearPortalGeminiConfigCache,
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
      if (apiKey) {
        const stamped = stampInsert(user, {
          setting_key: GEMINI_GLOBAL_SETTING_KEY,
          secret_value: apiKey,
          public_value: resolvedModel,
        });

        try {
          // Mirror PostgREST upsert: ON CONFLICT (setting_key) updates every
          // provided column from EXCLUDED.
          const rows = await db
            .insert(appSettingsTable)
            .values({
              settingKey: stamped.setting_key,
              secretValue: stamped.secret_value,
              publicValue: stamped.public_value,
              createdBy: stamped.created_by,
              updatedBy: stamped.updated_by,
              createdAt: stamped.created_at,
              updatedAt: stamped.updated_at,
            })
            .onConflictDoUpdate({
              target: appSettingsTable.settingKey,
              set: {
                secretValue: stamped.secret_value,
                publicValue: stamped.public_value,
                createdBy: stamped.created_by,
                updatedBy: stamped.updated_by,
                createdAt: stamped.created_at,
                updatedAt: stamped.updated_at,
              },
            })
            .returning({ id: appSettingsTable.id });

          const upsertId = rows[0]?.id;
          if (upsertId) {
            // secret_value is redacted by writeAudit for the app_settings table.
            await writeAudit(user, {
              table: "app_settings",
              recordId: upsertId,
              action: "UPDATE",
              before: null,
              after: {
                setting_key: GEMINI_GLOBAL_SETTING_KEY,
                secret_value: apiKey,
                public_value: resolvedModel,
              },
            });
          }
          notice = "Gemini actualizado para tu sesión y para todo el portal.";
        } catch (error) {
          if (isMissingAppSettingsError(error)) {
            notice =
              "Configuración personal guardada. Aplica la migración 0008 para compartir Gemini con todo el portal.";
          } else {
            throw error;
          }
        }
      } else {
        try {
          const rows = await db
            .delete(appSettingsTable)
            .where(eq(appSettingsTable.settingKey, GEMINI_GLOBAL_SETTING_KEY))
            .returning({ id: appSettingsTable.id });

          const deletedId = rows[0]?.id;
          if (deletedId) {
            await writeAudit(user, {
              table: "app_settings",
              recordId: deletedId,
              action: "DELETE",
              before: { setting_key: GEMINI_GLOBAL_SETTING_KEY },
              after: null,
            });
          }
          notice = "Clave de Gemini eliminada de tu sesión y del portal.";
        } catch (error) {
          if (isMissingAppSettingsError(error)) {
            notice =
              "Clave personal eliminada. Aplica la migración 0008 para administrar la clave global del portal.";
          } else {
            throw error;
          }
        }
      }
    }

    clearPortalGeminiConfigCache();
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
      const stamped = stampUpdate(user, { title, body, active });
      const rows = await db
        .update(announcementsTable)
        .set({
          title: stamped.title,
          body: stamped.body,
          active: stamped.active,
          updatedBy: stamped.updated_by,
          updatedAt: stamped.updated_at,
        })
        .where(eq(announcementsTable.id, announcementId))
        .returning({ id: announcementsTable.id });

      const row = rows[0];
      if (!row) {
        throw new Error("No se encontró el comunicado.");
      }
      persistedAnnouncementId = row.id;

      await writeAudit(user, {
        table: "announcements",
        recordId: persistedAnnouncementId,
        action: "UPDATE",
        before: null,
        after: { id: persistedAnnouncementId, title, body, active },
      });
    } else {
      const stamped = stampInsert(user, { title, body, active });
      const rows = await db
        .insert(announcementsTable)
        .values({
          title: stamped.title,
          body: stamped.body,
          active: stamped.active,
          createdBy: stamped.created_by,
          updatedBy: stamped.updated_by,
          createdAt: stamped.created_at,
          updatedAt: stamped.updated_at,
        })
        .returning({ id: announcementsTable.id });

      const row = rows[0];
      if (!row) {
        throw new Error("No pudimos crear el comunicado.");
      }
      persistedAnnouncementId = row.id;

      await writeAudit(user, {
        table: "announcements",
        recordId: persistedAnnouncementId,
        action: "INSERT",
        before: null,
        after: { id: persistedAnnouncementId, title, body, active },
      });
    }

    if (active) {
      const stamped = stampUpdate(user, { active: false });
      await db
        .update(announcementsTable)
        .set({
          active: stamped.active,
          updatedBy: stamped.updated_by,
          updatedAt: stamped.updated_at,
        })
        .where(
          and(
            eq(announcementsTable.active, true),
            ne(announcementsTable.id, persistedAnnouncementId),
          ),
        );

      await writeAudit(user, {
        table: "announcements",
        recordId: persistedAnnouncementId,
        action: "UPDATE",
        before: null,
        after: { deactivated_others: true },
      });
    }

    clearAnnouncementCache();
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
