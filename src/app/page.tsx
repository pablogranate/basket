import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Landing } from "@/components/landing/landing";
import { getUserContext } from "@/lib/auth";
import {
  getDefaultDashboardHrefForRole,
  isApexHost,
  resolveApexDestination,
} from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";

export default async function Home() {
  const host = (await headers()).get("host") ?? "";

  if (isApexHost(host)) {
    const user = await getUserContext();
    const destination = resolveApexDestination({
      role: user.role,
      hasSession: Boolean(user.userId),
    });

    if (destination.kind === "render-landing") {
      return <Landing host={host} userEmail={user.email} />;
    }

    redirect(destination.path);
  }

  if (!isSupabaseConfigured) {
    redirect("/mi-jornada");
  }

  const user = await getUserContext();

  redirect(user.userId ? getDefaultDashboardHrefForRole(user.role) : "/login");
}
