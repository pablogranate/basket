import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CollaboratorShell } from "@/components/layout/collaborator-shell";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
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
      <CollaboratorShell
        user={user}
        announcement={announcement}
        allowTeams={Boolean(user?.userId) && isCollaboratorLimitedRole(user?.role)}
      >
        {children}
      </CollaboratorShell>
    );
  }

  return (
    <DashboardShell user={user} announcement={announcement}>
      {children}
    </DashboardShell>
  );
}
