import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { findActiveSuperAdmin } from "@/lib/usuarios/super-admin";

// Superadmin gate consumed by nginx auth_request in front of the telemetry
// panel and server monitor (server.basket-app.com). Same shape as the App gate
// in ../[app]/route.ts: 401 without a session, 403 for anyone who is not an
// active super admin (ADR 0010), 204 with an empty body otherwise. This static
// segment takes precedence over the dynamic [app] segment, so the App gate
// never sees "superadmin".
//
// Read uncached through findActiveSuperAdmin, not from the session's
// superAdmin flag: a demoted or banned super admin must lose the panel at once.
export async function GET(request: Request) {
  return withAuth({}, async (_request, context) => {
    const superAdmin = await findActiveSuperAdmin(context.userId!);

    if (!superAdmin) {
      console.error("[gate] rejected identity that is not a super admin", {
        userId: context.userId,
      });
      return NextResponse.json(
        { error: "Solo un super admin puede entrar." },
        { status: 403 },
      );
    }

    return new Response(null, { status: 204 });
  })(request);
}
