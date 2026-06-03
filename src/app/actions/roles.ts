"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { normalizeRoleCategoryInput, normalizeRoleNameInput } from "@/lib/display";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureErrorMessage } from "@/lib/utils";

export async function upsertRoleAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/roles");
  const ctx = await requireEditor();

  const payload = {
    name: normalizeRoleNameInput(String(formData.get("name") ?? "")),
    category: normalizeRoleCategoryInput(
      String(formData.get("category") ?? "Produccion"),
    ),
    sort_order: Number(formData.get("sortOrder") ?? 0),
    active: String(formData.get("active") ?? "") !== "off",
  };

  try {
    const supabase = await createSupabaseServerClient();
    const roleId = String(formData.get("roleId") ?? "");
    const result = roleId
      ? await supabase
          .from("roles")
          .update(stampUpdate(ctx, payload))
          .eq("id", roleId)
          .select("id")
          .single()
      : await supabase
          .from("roles")
          .insert(stampInsert(ctx, payload))
          .select("id")
          .single();

    if (result.error) {
      throw result.error;
    }

    await writeAudit(supabase, ctx, {
      table: "roles",
      recordId: result.data.id,
      action: roleId ? "UPDATE" : "INSERT",
      before: null,
      after: { id: result.data.id, ...payload },
    });

    revalidatePath("/roles");
    revalidatePath("/grid");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: roleId ? "Rol actualizado." : "Rol creado.",
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

export async function deleteRoleAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/roles");
  const ctx = await requireEditor();

  try {
    const supabase = await createSupabaseServerClient();
    const roleId = String(formData.get("roleId") ?? "");
    const result = await supabase.from("roles").delete().eq("id", roleId);

    if (result.error) {
      throw result.error;
    }

    await writeAudit(supabase, ctx, {
      table: "roles",
      recordId: roleId,
      action: "DELETE",
      before: { id: roleId },
      after: null,
    });

    revalidatePath("/roles");
    revalidatePath("/grid");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Rol eliminado.",
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
