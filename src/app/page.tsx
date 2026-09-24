import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Landing } from "@/components/landing/landing";
import { listAccesosForUser } from "@/lib/acceso/accesos";
import { launcherApps } from "@/lib/acceso/catalog";
import { getUserContext } from "@/lib/auth";
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

    const apps = launcherApps({
      hasPortalAccess: user.hasAccess,
      accesos: user.userId ? await listAccesosForUser(user.userId) : [],
    });

    return <Landing host={host} userEmail={user.email} apps={apps} />;
  }

  const user = await getUserContext();

  redirect(user.userId ? getDefaultDashboardHrefForRole(user.role) : "/login");
}
