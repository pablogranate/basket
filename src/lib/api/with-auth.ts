import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth";
import type { UserContext } from "@/lib/auth";
import type { AppRole } from "@/lib/database.types";

type WithAuthOptions = {
  roles?: ReadonlyArray<AppRole>;
  allowGuest?: boolean;
};

type AuthedHandler = (
  request: Request,
  context: UserContext,
) => Promise<Response> | Response;

export function withAuth(options: WithAuthOptions, handler: AuthedHandler) {
  return async (request: Request): Promise<Response> => {
    const context = await getUserContext();

    if (!context.userId && !options.allowGuest) {
      console.error("[with-auth] rejected request without active session");
      return NextResponse.json(
        { error: "Tu sesión no está activa para usar este endpoint." },
        { status: 401 },
      );
    }

    if (
      context.userId &&
      options.roles &&
      !options.roles.includes(context.role)
    ) {
      console.error("[with-auth] rejected request with insufficient role", {
        role: context.role,
      });
      return NextResponse.json(
        { error: "No tenes permisos para usar este endpoint." },
        { status: 403 },
      );
    }

    return handler(request, context);
  };
}
