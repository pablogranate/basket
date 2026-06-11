"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { requireAdminAccessManager } from "@/lib/auth-access";
import { hasFullDashboardAccessRole } from "@/lib/constants";
import type { ProfileRow } from "@/lib/database.types";
import { sendCollaboratorInviteEmail } from "@/lib/email/mailer";
import { isPersonFunctionKey, resolveFunctionKey } from "@/lib/functions";
import { appEnv } from "@/lib/env";
import { buildPersonNotesMeta } from "@/lib/people-notes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureErrorMessage, maybeNull } from "@/lib/utils";

// profiles is the single authorization table now (no Supabase Auth users).
// Match email case-insensitively in JS over the small profiles set to avoid
// SQL LIKE-wildcard false positives on emails containing `_` (mirrors auth.ts).
async function findProfileByEmail(email: string): Promise<ProfileRow | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const supabaseAdmin = createSupabaseAdminClient();
  const result = await supabaseAdmin.from("profiles").select("*");

  if (result.error) {
    throw result.error;
  }

  return (
    ((result.data as ProfileRow[] | null) ?? []).find(
      (row) => row.email?.toLowerCase() === normalizedEmail,
    ) ?? null
  );
}

async function revokeCollaboratorAccessByEmail(email: string) {
  const profile = await findProfileByEmail(email);

  if (!profile || profile.role !== "collaborator") {
    return false;
  }

  // Deleting the profiles row removes authorization: getUserContext now returns
  // hasAccess:false and any live Better Auth session lands on /no-access.
  const supabaseAdmin = createSupabaseAdminClient();
  const deleteProfile = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", profile.id);

  if (deleteProfile.error) {
    throw deleteProfile.error;
  }

  return true;
}

export async function upsertPersonAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");
  const ctx = await requireEditor();
  const hasActiveField = formData.has("active");
  const createPlatformAccess =
    String(formData.get("createPlatformAccess") ?? "off") === "on";
  const accessRole = String(formData.get("accessRole") ?? "collaborator").trim();

  const roleNameInput = maybeNull(String(formData.get("roleName") ?? ""));

  const payload = {
    full_name: String(formData.get("fullName") ?? "").trim(),
    phone: maybeNull(String(formData.get("phone") ?? "")),
    email: maybeNull(String(formData.get("email") ?? "")),
    notes: buildPersonNotesMeta({
      role: roleNameInput,
      city: maybeNull(String(formData.get("city") ?? "")),
      coverage: maybeNull(String(formData.get("coverageTeams") ?? "")),
      notes: maybeNull(String(formData.get("notes") ?? "")),
    }),
    active: hasActiveField
      ? String(formData.get("active") ?? "") !== "off"
      : true,
  };

  // Canonical capabilities: validate at the boundary, dedupe, and fall back to
  // the legacy free-text role only when no functions were submitted.
  let selectedFunctions = Array.from(
    new Set(
      formData
        .getAll("functions")
        .map((value) => String(value))
        .filter(isPersonFunctionKey),
    ),
  );

  if (selectedFunctions.length === 0) {
    const legacy = resolveFunctionKey(roleNameInput);
    if (legacy) {
      selectedFunctions = [legacy];
    }
  }

  try {
    if (createPlatformAccess) {
      await requireAdminAccessManager();

      if (!payload.email) {
        throw new Error("Ingresa un correo electrónico antes de crear acceso.");
      }

      if (accessRole !== "collaborator") {
        throw new Error("Solo se permite crear acceso de colaborador.");
      }
    }

    const supabase = await createSupabaseServerClient();
    const personId = String(formData.get("personId") ?? "");
    const result = personId
      ? await supabase
          .from("people")
          .update(stampUpdate(ctx, payload))
          .eq("id", personId)
          .select("id")
          .single()
      : await supabase
          .from("people")
          .insert(stampInsert(ctx, payload))
          .select("id")
          .single();

    if (result.error) {
      throw result.error;
    }

    // Replace-all the person's functions (matches the stateless form-submit pattern).
    const deleteFunctions = await supabase
      .from("person_functions")
      .delete()
      .eq("person_id", result.data.id);

    if (deleteFunctions.error) {
      throw deleteFunctions.error;
    }

    if (selectedFunctions.length) {
      const insertFunctions = await supabase.from("person_functions").insert(
        selectedFunctions.map((functionKey) => ({
          person_id: result.data.id,
          function_key: functionKey,
          created_by: ctx.profileId,
        })),
      );

      if (insertFunctions.error) {
        throw insertFunctions.error;
      }
    }

    await writeAudit(supabase, ctx, {
      table: "people",
      recordId: result.data.id,
      action: personId ? "UPDATE" : "INSERT",
      before: null,
      after: { id: result.data.id, ...payload, functions: selectedFunctions },
    });

    let accessNotice: string | null = null;
    let accessEmailSent = false;

    if (createPlatformAccess && payload.email) {
      try {
        const supabaseAdmin = createSupabaseAdminClient();
        const existingProfile = await findProfileByEmail(payload.email);

        if (existingProfile && hasFullDashboardAccessRole(existingProfile.role)) {
          throw new Error(
            "Ese correo ya pertenece a un usuario interno con acceso de administración.",
          );
        }

        if (existingProfile) {
          // Re-grant on an existing (e.g. unlinked) profile: set the role,
          // keep id/auth_user_id so a later first login still auto-links.
          const updateProfile = await supabaseAdmin
            .from("profiles")
            .update({ role: "collaborator", full_name: payload.full_name })
            .eq("id", existingProfile.id);

          if (updateProfile.error) {
            throw updateProfile.error;
          }
        } else {
          // No auth user created: a fresh profiles row keyed by a new uuid with
          // auth_user_id NULL. First login (Google/magic link) auto-links by
          // email and stamps auth_user_id (see getUserContext).
          const profileInsert = await supabaseAdmin.from("profiles").insert({
            id: globalThis.crypto.randomUUID(),
            email: payload.email,
            full_name: payload.full_name,
            role: "collaborator",
            auth_user_id: null,
          });

          if (profileInsert.error) {
            throw profileInsert.error;
          }
        }

        await sendCollaboratorInviteEmail({
          to: payload.email,
          loginUrl: `${appEnv.appUrl}/login`,
        });
        accessEmailSent = true;
      } catch (error) {
        console.error("[people] failed to create platform access", error);
        accessNotice = ensureErrorMessage(error);
      }
    }

    revalidatePath("/people");
    redirectWithNotice({
      redirectTo,
      intent: accessNotice ? "error" : "success",
      notice: accessNotice
        ? personId
          ? `Registro actualizado, pero no se pudo habilitar el acceso: ${accessNotice}`
          : `Registro creado, pero no se pudo habilitar el acceso: ${accessNotice}`
        : createPlatformAccess
          ? personId
            ? accessEmailSent
              ? "Registro actualizado, acceso de colaborador habilitado y correo enviado."
              : "Registro actualizado y acceso de colaborador creado."
            : accessEmailSent
              ? "Registro creado, acceso de colaborador habilitado y correo enviado."
              : "Registro creado y acceso de colaborador habilitado."
          : personId
            ? "Registro de personal actualizado."
            : "Registro de personal creado.",
    });
  } catch (error) {
    console.error("[people] upsert failed", error);
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function deletePersonAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");
  const context = await requireEditor();
  const personId = String(formData.get("personId") ?? "").trim();

  try {
    const supabase = await createSupabaseServerClient();
    const personQuery = await supabase
      .from("people")
      .select("id, email, full_name")
      .eq("id", personId)
      .maybeSingle();

    if (personQuery.error) {
      throw personQuery.error;
    }

    const person = personQuery.data;

    if (!person) {
      throw new Error("No se encontró el usuario a eliminar.");
    }

    if (context.role === "admin" && person.email) {
      await revokeCollaboratorAccessByEmail(person.email);
    }

    const result = await supabase
      .from("people")
      .delete()
      .eq("id", personId);

    if (result.error) {
      throw result.error;
    }

    await writeAudit(supabase, context, {
      table: "people",
      recordId: personId,
      action: "DELETE",
      before: { id: person.id, full_name: person.full_name },
      after: null,
    });

    revalidatePath("/people");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Usuario eliminado.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function revokePersonAccessAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");
  const personId = String(formData.get("personId") ?? "").trim();

  try {
    await requireAdminAccessManager();

    const supabase = await createSupabaseServerClient();
    const personQuery = await supabase
      .from("people")
      .select("id, email, full_name")
      .eq("id", personId)
      .maybeSingle();

    if (personQuery.error) {
      throw personQuery.error;
    }

    const person = personQuery.data;

    if (!person) {
      throw new Error("No se encontró el usuario.");
    }

    if (!person.email) {
      throw new Error("Este usuario no tiene correo asociado.");
    }

    const revoked = await revokeCollaboratorAccessByEmail(person.email);

    if (!revoked) {
      throw new Error("No se encontró acceso colaborador para revocar.");
    }

    revalidatePath("/people");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Acceso de colaborador revocado.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function togglePersonActiveAction(formData: FormData) {
  const ctx = await requireEditor();

  const personId = String(formData.get("personId") ?? "").trim();
  const nextActive = String(formData.get("active") ?? "") === "on";

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .from("people")
      .update(stampUpdate(ctx, { active: nextActive }))
      .eq("id", personId);

    if (result.error) {
      throw result.error;
    }

    await writeAudit(supabase, ctx, {
      table: "people",
      recordId: personId,
      action: "UPDATE",
      before: null,
      after: { id: personId, active: nextActive },
    });

    revalidatePath("/people");
  } catch (error) {
    rethrowNavigationError(error);
    const redirectTo = getRedirectTarget(formData, "/people");
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}
