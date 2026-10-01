import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CollaboratorShell } from "@/components/layout/collaborator-shell";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { NavLatencyReporter } from "@/components/perf/nav-latency-reporter";
import { FichaCompletionModalClient } from "@/components/people/ficha-completion-modal-client";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";
import { listEffectiveAccessForUser } from "@/lib/acceso/accesos";
import { directoryLinkFor, launcherApps } from "@/lib/acceso/catalog";
import {
  buildApexUrl,
  getRequestHost,
  isCollaboratorLimitedRole,
  isDashboardPathAllowedForRole,
} from "@/lib/constants";
import { PORTAL_APP } from "@/lib/acceso/portal";
import { buildNoAccessPath } from "@/lib/access-requests/no-access";
import { getUserContext, type UserContext } from "@/lib/auth";
import { getAccessRequestReview } from "@/lib/access-requests/review";
import { can } from "@/lib/roles";
import { getActiveAnnouncement } from "@/lib/data/announcements";
import { appEnv } from "@/lib/env";
import { getFichaCompletionPrompt } from "@/lib/people/ficha-completion-data";

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
    getUserContext(),
    getActiveAnnouncement(null),
  ]);
  const announcement = user?.userId ? activeAnnouncement : null;
  const allowsGuestMiJornada = appEnv.allowGuestMiJornadaAccess && !user?.userId;

  if (!user?.userId && !allowsGuestMiJornada) {
    redirect("/login");
  }

  // Authenticated without a portal Acceso: opening the portal is asking for it.
  if (user?.userId && !user.hasAccess) {
    redirect(buildNoAccessPath(PORTAL_APP));
  }

  if (
    user?.userId &&
    pathname &&
    !isDashboardPathAllowedForRole(pathname, user.role)
  ) {
    redirect("/mi-jornada");
  }

  const host = getRequestHost(requestHeaders);
  const [landingUrl, fichaCompletion] = await Promise.all([
    resolveDirectoryLink(user, host),
    getFichaCompletionPrompt(user),
  ]);
  const fichaModal = fichaCompletion ? (
    <FichaCompletionModalClient {...fichaCompletion} />
  ) : null;

  const collaboratorExperience =
    allowsGuestMiJornada || isCollaboratorLimitedRole(user?.role);

  if (collaboratorExperience) {
    return (
      <CollaboratorShell
        user={user}
        announcement={announcement}
        landingUrl={landingUrl}
      >
        {children}
        {fichaModal}
        <PwaInstallBanner />
        <Suspense fallback={null}>
          <NavLatencyReporter />
        </Suspense>
      </CollaboratorShell>
    );
  }

  // Approvers get the Solicitudes badge and the auto-opening modal on every
  // dashboard page; nobody else pays for the read (D-15).
  const accessRequests =
    can(user, "access.approve")
      ? await getAccessRequestReview()
      : null;

  return (
    <DashboardShell
      user={user}
      announcement={announcement}
      landingUrl={landingUrl}
      accessRequests={accessRequests}
    >
      {children}
      {fichaModal}
      <PwaInstallBanner />
      <Suspense fallback={null}>
        <NavLatencyReporter />
      </Suspense>
    </DashboardShell>
  );
}

// The back link to the apex directory, for people with two apps or more
// (basket#202). Unreadable access hides it rather than failing the page.
async function resolveDirectoryLink(
  user: UserContext,
  host: string,
): Promise<string | null> {
  const apexUrl = buildApexUrl(host);

  if (!user.userId || !apexUrl) {
    return null;
  }

  try {
    const access = await listEffectiveAccessForUser(user.userId);
    const apps = launcherApps({
      hasPortalAccess: user.hasAccess,
      superAdmin: user.superAdmin,
      apps: access.map((row) => row.app),
    });

    return directoryLinkFor({ apps, apexUrl });
  } catch (error) {
    console.error("[acceso] failed to count the user's apps", error);
    return null;
  }
}
