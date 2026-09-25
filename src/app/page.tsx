import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Landing } from "@/components/landing/landing";
import { listAccesosForUser } from "@/lib/acceso/accesos";
import { launcherApps } from "@/lib/acceso/catalog";
import { getUserContext } from "@/lib/auth";
import { findActiveSuperAdmin } from "@/lib/usuarios/super-admin";
import {
  getDefaultDashboardHrefForRole,
  isApexHost,
  resolveApexDestination,
} from "@/lib/constants";

export default async function Home() {
  const host = (await headers()).get("host") ?? "";

  if (isApexHost(host)) {
    const user = await getUserContext();
    const destination = resolveApexDestination({
      hasSession: Boolean(user.userId),
    });

    if (destination.kind === "redirect") {
      redirect(destination.path);
    }

    // Read apart from getUserContext, which only knows super admins with a Cuenta.
    const [superAdmin, accesos] = user.userId
      ? await Promise.all([
          findActiveSuperAdmin(user.userId),
          listAccesosForUser(user.userId),
        ])
      : [null, []];
    const apps = launcherApps({
      hasPortalAccess: user.hasAccess,
      superAdmin: Boolean(superAdmin),
      accesos,
    });

    return (
      <Landing
        host={host}
        userEmail={user.email}
        apps={apps}
        showUsuarios={Boolean(superAdmin)}
      />
    );
  }

  const user = await getUserContext();

  redirect(user.userId ? getDefaultDashboardHrefForRole(user.role) : "/login");
}
