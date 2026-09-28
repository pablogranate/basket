import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { resolveUsuariosDestination } from "@/lib/constants";
import { findActiveSuperAdmin, type SuperAdmin } from "@/lib/usuarios/super-admin";

// The /usuarios gate for the page and every action: 404 off the apex, login
// without a session, /no-access for anyone but a super admin. Independent of
// the Cuenta, so a super admin with no portal profile still gets in.
export async function requireSuperAdmin(): Promise<SuperAdmin> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const session = await auth.api.getSession({ headers: requestHeaders });
  const superAdmin = session?.user
    ? await findActiveSuperAdmin(session.user.id)
    : null;
  const destination = resolveUsuariosDestination({
    host,
    hasSession: Boolean(session?.user),
    superAdmin: Boolean(superAdmin),
  });

  if (destination.kind === "not-found") {
    notFound();
  }

  if (destination.kind === "redirect" || !superAdmin) {
    redirect(destination.kind === "redirect" ? destination.path : "/no-access");
  }

  return superAdmin;
}
