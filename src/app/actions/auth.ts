"use server";

import { redirect } from "next/navigation";

import {
  getDefaultDashboardHrefForRole,
  isDashboardPathAllowedForRole,
  resolveDashboardAccessRole,
} from "@/lib/constants";
import type { Database } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appEnv } from "@/lib/env";
import { ensureErrorMessage } from "@/lib/utils";
import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";

async function loginWithFallback(formData: FormData, fallbackRedirect: string) {
  const requestedRedirect = getRedirectTarget(formData, fallbackRedirect);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirectWithNotice({
      redirectTo: "/login",
      intent: "error",
      notice: "Correo electrónico y contraseña son obligatorios.",
    });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      throw result.error;
    }

    const signedUser = result.data.user;
    let role: Database["public"]["Enums"]["app_role"] | null = null;

    if (signedUser) {
      const profileQuery = await supabase
        .from("profiles")
        .select("role")
        .eq("id", signedUser.id)
        .maybeSingle();

      role = resolveDashboardAccessRole({
        profileRole: profileQuery.data?.role ?? null,
        appMetadata: signedUser.app_metadata,
      });
    }

    const defaultRedirect = getDefaultDashboardHrefForRole(role);
    const resolvedRedirect = isDashboardPathAllowedForRole(requestedRedirect, role)
      ? requestedRedirect
      : defaultRedirect;

    redirect(resolvedRedirect);
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo: "/login",
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function loginAction(formData: FormData) {
  return loginWithFallback(formData, "/grid");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirectWithNotice({
      redirectTo: "/forgot-password",
      intent: "error",
      notice: "Ingresa el correo electrónico de tu cuenta.",
    });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appEnv.appUrl}/auth/confirm?next=/reset-password`,
    });

    if (error) {
      throw error;
    }

    redirectWithNotice({
      redirectTo: "/forgot-password",
      intent: "success",
      notice:
        "Si el correo existe, te enviamos un enlace para restablecer la contraseña.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo: "/forgot-password",
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || !confirmPassword) {
    redirectWithNotice({
      redirectTo: "/reset-password",
      intent: "error",
      notice: "Completa y confirma tu nueva contraseña.",
    });
  }

  if (password.length < 8) {
    redirectWithNotice({
      redirectTo: "/reset-password",
      intent: "error",
      notice: "La contraseña debe tener al menos 8 caracteres.",
    });
  }

  if (password !== confirmPassword) {
    redirectWithNotice({
      redirectTo: "/reset-password",
      intent: "error",
      notice: "Las contraseñas no coinciden.",
    });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("El enlace de recuperación expiró. Solicita uno nuevo.");
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw error;
    }

    await supabase.auth.signOut();

    redirectWithNotice({
      redirectTo: "/login",
      intent: "success",
      notice: "Contraseña actualizada. Ya puedes ingresar de nuevo.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo: "/reset-password",
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
