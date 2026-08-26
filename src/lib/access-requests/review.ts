import "server-only";

import { asc, eq } from "drizzle-orm";

import { resolveApprovalTarget } from "@/lib/access-requests/approval";
import {
  FUNCION_ROLE_NAME,
  isAccessRequestFuncion,
} from "@/lib/access-requests/constants";
import type { UserContext } from "@/lib/auth";
import type { AccessRequestReviewItem } from "@/lib/access-requests/review-item";
import { db } from "@/lib/db/client";
import { roles as rolesTable } from "@/lib/db/schema";
import {
  getApprovalCandidates,
  getPendingAccessRequests,
} from "@/lib/data/access-requests";
import { normalizeText } from "@/lib/utils";

export async function getActiveRoleOptions(ctx: UserContext) {
  void ctx;
  const rows = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.active, true))
    .orderBy(asc(rolesTable.sortOrder), asc(rolesTable.name));

  return rows;
}

// Everything the approve modal needs, resolved server-side: the pending list,
// the target each request would land on, and the pre-selected grid role.
export async function getAccessRequestReview(ctx: UserContext): Promise<{
  items: AccessRequestReviewItem[];
  roleOptions: { id: string; name: string }[];
}> {
  const requests = await getPendingAccessRequests(ctx);

  if (!requests.length) {
    return { items: [], roleOptions: [] };
  }

  const [candidates, roleOptions] = await Promise.all([
    getApprovalCandidates(ctx),
    getActiveRoleOptions(ctx),
  ]);

  const roleIdByName = new Map(
    roleOptions.map((role) => [normalizeText(role.name), role.id]),
  );

  const items = requests.map((request) => {
    const target = resolveApprovalTarget({
      email: request.email,
      fullName: request.full_name,
      candidates,
    });
    const linked =
      target.kind === "link"
        ? (candidates.find((candidate) => candidate.id === target.person.id) ??
          null)
        : null;
    const defaultRoleName = isAccessRequestFuncion(request.funcion)
      ? FUNCION_ROLE_NAME[request.funcion]
      : null;

    return {
      request,
      target,
      linkedPerson: linked
        ? {
            id: linked.id,
            fullName: linked.fullName,
            phone: linked.phone,
            email: linked.email,
            roleId: linked.roleId,
          }
        : null,
      defaultRoleId: defaultRoleName
        ? (roleIdByName.get(normalizeText(defaultRoleName)) ?? null)
        : null,
    } satisfies AccessRequestReviewItem;
  });

  return { items, roleOptions };
}
