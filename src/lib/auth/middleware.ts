import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { appEnv } from "@/lib/env";

function isGuestMiJornadaPath(pathname: string) {
  return (
    appEnv.allowGuestMiJornadaAccess &&
    (pathname === "/mi-jornada" ||
      pathname === "/api/ai/metric-capture" ||
      pathname === "/api/ai/section")
  );
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/no-access" ||
    pathname.startsWith("/api/auth/")
  );
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Optimistic cookie-presence check only (no DB). Role/profile gating stays in
  // getUserContext + the dashboard layout.
  const hasSession = Boolean(getSessionCookie(request));

  if (hasSession || isPublicPath(pathname) || isGuestMiJornadaPath(pathname)) {
    return response;
  }

  if (isApiRoute) {
    return NextResponse.json(
      { error: "Tu sesión no está activa para usar este endpoint." },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("redirectTo", pathname);
  return NextResponse.redirect(loginUrl);
}
