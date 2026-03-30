import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { getDefaultDashboardHrefForRole } from "@/lib/constants";

export default async function Home() {
  if (!isSupabaseConfigured) {
    redirect("/mi-jornada");
  }

  const user = await getUserContext();

  redirect(
    user.userId ? getDefaultDashboardHrefForRole(user.role) : "/login",
  );
}
