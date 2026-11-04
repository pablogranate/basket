import { addFields } from "basket-tv-telemetry/log";
import { withRequestLog } from "basket-tv-telemetry/next";
import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth";
import type { UserContext } from "@/lib/auth";
import { can, type Capability } from "@/lib/roles";

type WithAuthOptions = {
  // The route pattern (`/api/gates/[app]`): the `route` of the request's line.
  route: string;
  capability?: Capability;
  allowGuest?: boolean;
};

type RouteContext = { params: Promise<Record<string, string>> };

type AuthedHandler<C> = (
  request: Request,
  context: UserContext,
  routeContext: C,
) => Promise<Response> | Response;

// A route rejected by its guard is an expected outcome: an info line with the
// reason, not an error.
export function rejectRequest(reason: "no_session" | "no_access" | "invalid_key") {
  addFields({ outcome: "rejected", reason });
}

export function withAuth<C = RouteContext>(
  options: WithAuthOptions,
  handler: AuthedHandler<C>,
) {
  return withRequestLog<Request, C>(options.route, async (request, routeContext) => {
    const context = await getUserContext();

    if (!context.userId && !options.allowGuest) {
      rejectRequest("no_session");
      return NextResponse.json(
        { error: "Tu sesión no está activa para usar este endpoint." },
        { status: 401 },
      );
    }

    if (
      context.userId &&
      options.capability &&
      !can(context, options.capability)
    ) {
      rejectRequest("no_access");
      return NextResponse.json(
        { error: "No tenes permisos para usar este endpoint." },
        { status: 403 },
      );
    }

    return handler(request, context, routeContext);
  });
}
