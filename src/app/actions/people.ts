"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { requireAdminAccessManager } from "@/lib/auth-access";
import {
  hasFullDashboardAccessRole,
  resolveDashboardAccessRole,
} from "@/lib/constants";
import type { AppRole } from "@/lib/database.types";
import { appEnv } from "@/lib/env";
import { buildPersonNotesMeta } from "@/lib/people-notes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureErrorMessage, maybeNull } from "@/lib/utils";

async function findAuthUserByEmail(email: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const usersResult = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (usersResult.error) {
    throw usersResult.error;
  }

  return (
    usersResult.data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

async function sendCollaboratorSetupEmail(email: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appEnv.appUrl}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    throw error;
  }
}

async function revokeCollaboratorAccessByEmail(email: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const authUser = await findAuthUserByEmail(email);

  if (!authUser) {
    return false;
  }

  const profileQuery = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileQuery.error) {
    throw profileQuery.error;
  }

  const resolvedRole = resolveDashboardAccessRole({
    profileRole: (profileQuery.data?.role as AppRole | null | undefined) ?? null,
    appMetadata:
      (authUser.app_metadata as Record<string, unknown> | null) ?? null,
  });

  if (resolvedRole !== "collaborator") {
    return false;
  }

  const deleteProfile = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", authUser.id);

  if (deleteProfile.error) {
    throw deleteProfile.error;
  }

  const deleteAuthUser = await supabaseAdmin.auth.admin.deleteUser(authUser.id);

  if (deleteAuthUser.error) {
    throw deleteAuthUser.error;
  }

  return true;
}

export async function upsertPersonAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");
  await requireEditor();
  const hasActiveField = formData.has("active");
  const createPlatformAccess =
    String(formData.get("createPlatformAccess") ?? "off") === "on";
  const accessRole = String(formData.get("accessRole") ?? "collaborator").trim();
  const temporaryPassword = String(formData.get("temporaryPassword") ?? "").trim();

  const payload = {
    full_name: String(formData.get("fullName") ?? "").trim(),
    phone: maybeNull(String(formData.get("phone") ?? "")),
    email: maybeNull(String(formData.get("email") ?? "")),
    notes: buildPersonNotesMeta({
      role: maybeNull(String(formData.get("roleName") ?? "")),
      city: maybeNull(String(formData.get("city") ?? "")),
      coverage: maybeNull(String(formData.get("coverageTeams") ?? "")),
      notes: maybeNull(String(formData.get("notes") ?? "")),
    }),
    active: hasActiveField
      ? String(formData.get("active") ?? "") !== "off"
      : true,
  };

  try {
    if (createPlatformAccess) {
      await requireAdminAccessManager();

      if (!payload.email) {
        throw new Error("Ingresa un correo electrónico antes de crear acceso.");
      }

      if (temporaryPassword.length < 8) {
        throw new Error(
          "La contraseña temporal debe tener al menos 8 caracteres.",
        );
      }

      if (accessRole !== "collaborator") {
        throw new Error("Solo se permite crear acceso de colaborador.");
      }
    }

    const supabase = await createSupabaseServerClient();
    const personId = String(formData.get("personId") ?? "");
    const result = personId
      ? await supabase.from("people").update(payload).eq("id", personId)
      : await supabase.from("people").insert(payload);

    if (result.error) {
      throw result.error;
    }

    let accessNotice: string | null = null;
    let accessEmailSent = false;

    if (createPlatformAccess && payload.email) {
      try {
        const supabaseAdmin = createSupabaseAdminClient();
        const existingAuthUser = await findAuthUserByEmail(payload.email);
        let authUserId = existingAuthUser?.id ?? null;

        if (existingAuthUser) {
          const existingProfileQuery = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", existingAuthUser.id)
            .maybeSingle();

          if (existingProfileQuery.error) {
            throw existingProfileQuery.error;
          }

          const existingDashboardRole = resolveDashboardAccessRole({
            profileRole: existingProfileQuery.data?.role ?? null,
            appMetadata:
              (existingAuthUser.app_metadata as Record<string, unknown> | null) ??
              null,
          });

          if (hasFullDashboardAccessRole(existingDashboardRole)) {
            throw new Error(
              "Ese correo ya pertenece a un usuario interno con acceso de administración.",
            );
          }
        }

        if (existingAuthUser) {
          const updateUser = await supabaseAdmin.auth.admin.updateUserById(
            existingAuthUser.id,
            {
              password: temporaryPassword,
              email_confirm: true,
              app_metadata: {
                ...(existingAuthUser.app_metadata ?? {}),
                bp_access_role: "collaborator",
              },
              user_metadata: {
                ...(existingAuthUser.user_metadata ?? {}),
                full_name: payload.full_name,
              },
            },
          );

          if (updateUser.error) {
            throw updateUser.error;
          }
        } else {
          const createUser = await supabaseAdmin.auth.admin.createUser({
            email: payload.email,
            password: temporaryPassword,
            email_confirm: true,
            app_metadata: {
              bp_access_role: "collaborator",
            },
            user_metadata: {
              full_name: payload.full_name,
            },
          });

          if (createUser.error) {
            throw createUser.error;
          }

          authUserId = createUser.data.user.id;
        }

        if (!authUserId) {
          throw new Error("No se pudo resolver el usuario de acceso.");
        }

        const profileInsert = await supabaseAdmin.from("profiles").upsert(
          {
            id: authUserId,
            full_name: payload.full_name,
            role: "viewer",
          },
          {
            onConflict: "id",
          },
        );

        if (profileInsert.error) {
          throw profileInsert.error;
        }

        await sendCollaboratorSetupEmail(payload.email);
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
  await requireEditor();

  const personId = String(formData.get("personId") ?? "").trim();
  const nextActive = String(formData.get("active") ?? "") === "on";

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .from("people")
      .update({ active: nextActive })
      .eq("id", personId);

    if (result.error) {
      throw result.error;
    }

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
