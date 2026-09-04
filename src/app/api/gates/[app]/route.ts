import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import type { Capability } from "@/lib/roles";

// Per-app gate consumed by infrastructure (nginx auth_request) — see ADR 0006.
// Must never live under /api/auth/*: the Better Auth catch-all owns that prefix.
const APP_GATE_ALLOWLIST: Record<string, Capability> = {
  generator: "dashboard.full",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ app: string }> },
) {
  const { app } = await params;
  const capability = APP_GATE_ALLOWLIST[app];

  if (!capability) {
    return NextResponse.json({ error: "App desconocida." }, { status: 404 });
  }

  return withAuth({ capability }, () => new Response(null, { status: 204 }))(
    request,
  );
}
