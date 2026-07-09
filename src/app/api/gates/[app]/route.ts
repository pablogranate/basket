import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { FULL_DASHBOARD_ACCESS_ROLES } from "@/lib/constants";
import type { AppRole } from "@/lib/database.types";

// Per-app gate consumed by infrastructure (nginx auth_request) — see ADR 0006.
// Must never live under /api/auth/*: the Better Auth catch-all owns that prefix.
const APP_GATE_ALLOWLIST: Record<string, ReadonlyArray<AppRole>> = {
  generator: FULL_DASHBOARD_ACCESS_ROLES,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ app: string }> },
) {
  const { app } = await params;
  const roles = APP_GATE_ALLOWLIST[app];

  if (!roles) {
    return NextResponse.json({ error: "App desconocida." }, { status: 404 });
  }

  return withAuth({ roles }, () => new Response(null, { status: 204 }))(
    request,
  );
}
