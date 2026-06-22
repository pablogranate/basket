import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CollaboratorShell } from "@/components/layout/collaborator-shell";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  buildApexUrl,
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
  const user = isSupabaseConfigured ? await getUserContext() : null;
  const announcement =
    isSupabaseConfigured && user?.userId
      ? await getActiveAnnouncement(user)
      : null;
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

  const landingUrl = isAdminDashboardRole(user?.role)
    ? buildApexUrl(requestHeaders.get("host") ?? "")
    : null;

  return (
    <DashboardShell
      user={user}
      announcement={announcement}
      landingUrl={landingUrl}
    >
      {children}
    </DashboardShell>
  );
}
