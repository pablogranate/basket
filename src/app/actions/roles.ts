"use server";

import { eq } from "drizzle-orm";

import { defineAction } from "@/lib/actions/define-action";
import {
  parseDeleteRole,
  parseUpsertRole,
} from "@/lib/actions/parse/roles";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-access";
import { db } from "@/lib/db/client";
import { roles as rolesTable } from "@/lib/db/schema";

const upsertRole = defineAction({
  fallbackRedirect: "/roles",
  authz: requireAdmin,
  parse: parseUpsertRole,
  revalidate: ["/roles", "/grid"],
  async run(ctx, { roleId, payload }) {
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

    return { notice: roleId ? "Rol actualizado." : "Rol creado." };
  },
});

export async function upsertRoleAction(formData: FormData) {
  await upsertRole(formData);
}

const deleteRole = defineAction({
  fallbackRedirect: "/roles",
  authz: requireAdmin,
  parse: parseDeleteRole,
  revalidate: ["/roles", "/grid"],
  async run(ctx, { roleId }) {
    await db.delete(rolesTable).where(eq(rolesTable.id, roleId));

    await writeAudit(ctx, {
      table: "roles",
      recordId: roleId,
      action: "DELETE",
      before: { id: roleId },
      after: null,
    });

    return { notice: "Rol eliminado." };
  },
});

export async function deleteRoleAction(formData: FormData) {
  await deleteRole(formData);
}
