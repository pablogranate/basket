"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { eq } from "drizzle-orm";

import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-access";
import { db } from "@/lib/db/client";
import { roles as rolesTable } from "@/lib/db/schema";
import { normalizeRoleCategoryInput, normalizeRoleNameInput } from "@/lib/display";
import { ensureErrorMessage } from "@/lib/utils";

export async function upsertRoleAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/roles");
  const ctx = await requireAdmin();

  const payload = {
    name: normalizeRoleNameInput(String(formData.get("name") ?? "")),
    category: normalizeRoleCategoryInput(
      String(formData.get("category") ?? "Produccion"),
    ),
    sort_order: Number(formData.get("sortOrder") ?? 0),
    active: String(formData.get("active") ?? "") !== "off",
  };

  try {
    const roleId = String(formData.get("roleId") ?? "");
    let rows: { id: string }[];

    if (roleId) {
      const stamped = stampUpdate(ctx, payload);
      rows = await db
        .update(rolesTable)
        .set({
          name: stamped.name,
          category: stamped.category,
          sortOrder: stamped.sort_order,
          active: stamped.active,
          updatedBy: stamped.updated_by,
          updatedAt: stamped.updated_at,
        })
        .where(eq(rolesTable.id, roleId))
        .returning({ id: rolesTable.id });
    } else {
      const stamped = stampInsert(ctx, payload);
      rows = await db
        .insert(rolesTable)
        .values({
          name: stamped.name,
          category: stamped.category,
          sortOrder: stamped.sort_order,
          active: stamped.active,
          createdBy: stamped.created_by,
          updatedBy: stamped.updated_by,
          createdAt: stamped.created_at,
          updatedAt: stamped.updated_at,
        })
        .returning({ id: rolesTable.id });
    }

    const row = rows[0];
    if (!row) {
      throw new Error("No se encontró el rol.");
    }

    await writeAudit(ctx, {
      table: "roles",
      recordId: row.id,
      action: roleId ? "UPDATE" : "INSERT",
      before: null,
      after: { id: row.id, ...payload },
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
  const ctx = await requireAdmin();

  try {
    const roleId = String(formData.get("roleId") ?? "");
    await db.delete(rolesTable).where(eq(rolesTable.id, roleId));

    await writeAudit(ctx, {
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
