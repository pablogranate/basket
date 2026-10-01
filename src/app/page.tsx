import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Landing } from "@/components/landing/landing";
import { listEffectiveAccessForUser } from "@/lib/acceso/accesos";
import { APP_SUBDOMAINS, launcherApps } from "@/lib/acceso/catalog";
import { PORTAL_APP } from "@/lib/acceso/portal";
import { buildNoAccessPath } from "@/lib/access-requests/no-access";
import { getUserContext } from "@/lib/auth";
import { findActiveSuperAdmin } from "@/lib/usuarios/super-admin";
import {
  buildSiblingAppUrl,
  getDefaultDashboardHrefForRole,
  isApexHost,
  resolveApexDestination,
} from "@/lib/constants";

export default async function Home() {
  const host = (await headers()).get("host") ?? "";
  const user = await getUserContext();

  if (isApexHost(host)) {
    // Read apart from getUserContext, which only knows super admins with a Cuenta.
    const [superAdmin, access] = user.userId
      ? await Promise.all([
          findActiveSuperAdmin(user.userId),
          listEffectiveAccessForUser(user.userId),
        ])
      : [null, []];
    const apps = launcherApps({
      hasPortalAccess: user.hasAccess,
      superAdmin: Boolean(superAdmin),
      apps: access.map((row) => row.app),
    });
    const destination = resolveApexDestination({
      hasSession: Boolean(user.userId),
      superAdmin: Boolean(superAdmin),
      apps,
    });
    const portalUrl = buildSiblingAppUrl(host, APP_SUBDOMAINS.portal);

    switch (destination.kind) {
      case "redirect":
        redirect(destination.path);
      case "open-app":
        redirect(buildSiblingAppUrl(host, APP_SUBDOMAINS[destination.app]));
      case "request-access":
        redirect(`${portalUrl}${buildNoAccessPath(PORTAL_APP)}`);
      case "render-landing":
        return (
          <Landing
            host={host}
            userEmail={user.email}
            apps={apps}
            superAdmin={Boolean(superAdmin)}
          />
        );
    }
  }

  if (!user.userId) {
    redirect("/login");
  }

  redirect(
    user.hasAccess
      ? getDefaultDashboardHrefForRole(user.role)
      : buildNoAccessPath(PORTAL_APP),
  );
}
