import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CollaboratorShell } from "@/components/layout/collaborator-shell";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  buildApexUrl,
  buildSiblingAppUrl,
  isAdminDashboardRole,
  isCollaboratorLimitedRole,
  isDashboardPathAllowedForRole,
} from "@/lib/constants";
import { getUserContext } from "@/lib/auth";
import { getActiveAnnouncement } from "@/lib/data/announcements";
import { appEnv, isSupabaseConfigured } from "@/lib/env";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname");
  // Fire the user + announcement reads concurrently. getActiveAnnouncement does
  // not depend on the user (it voids its ctx); we still only surface it once we
  // know the request is authenticated (gate below).
  const [user, activeAnnouncement] = await Promise.all([
    isSupabaseConfigured ? getUserContext() : Promise.resolve(null),
    isSupabaseConfigured ? getActiveAnnouncement(null) : Promise.resolve(null),
  ]);
  const announcement = user?.userId ? activeAnnouncement : null;
  const allowsGuestMiJornada = appEnv.allowGuestMiJornadaAccess && !user?.userId;

  if (isSupabaseConfigured && !user?.userId && !allowsGuestMiJornada) {
    redirect("/login");
  }

  // Authenticated but unprovisioned (no profiles row) -> dead-end (D-13).
  if (user?.userId && !user.hasAccess) {
    redirect("/no-access");
  }

  if (
    user?.userId &&
    pathname &&
    !isDashboardPathAllowedForRole(pathname, user.role)
  ) {
    redirect("/mi-jornada");
  }

  const collaboratorExperience =
    allowsGuestMiJornada || isCollaboratorLimitedRole(user?.role);

  if (collaboratorExperience) {
    return (
      <CollaboratorShell user={user} announcement={announcement}>
        {children}
      </CollaboratorShell>
    );
  }

  const host = requestHeaders.get("host") ?? "";
  const landingUrl = isAdminDashboardRole(user?.role)
    ? buildApexUrl(host)
    : null;
  // Only full-access roles reach DashboardShell, which matches the generator's
  // app gate — no extra role check needed. Null on unrecognized hosts.
  const generatorUrl = buildApexUrl(host)
    ? buildSiblingAppUrl(host, "generator")
    : null;

  return (
    <DashboardShell
      user={user}
      announcement={announcement}
      landingUrl={landingUrl}
      generatorUrl={generatorUrl}
    >
      {children}
    </DashboardShell>
  );
}
