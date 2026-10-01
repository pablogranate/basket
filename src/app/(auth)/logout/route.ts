import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import { buildAppUrlFromAnyHost } from "@/lib/constants";

// Sign-out link for the Session readers (ADR 0009): siblings never call
// Better Auth's sign-out themselves, they send the browser here. Ends the
// shared session and clears the cross-subdomain cookie, so the person is
// logged out on every subdomain, then lands on the portal login.
export async function GET(request: NextRequest) {
  const signedOut = await auth.api.signOut({
    headers: await headers(),
    asResponse: true,
  });

  // Behind nginx, request.url is the upstream (localhost:3000); the Host
  // header is the public portal host.
  const portalUrl =
    buildAppUrlFromAnyHost(request.headers.get("host") ?? "", "portal") ??
    request.nextUrl.origin;
  const response = NextResponse.redirect(new URL("/login", portalUrl));
  for (const cookie of signedOut.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
