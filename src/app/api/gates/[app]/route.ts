import { NextResponse } from "next/server";

import { getEffectiveAccess } from "@/lib/acceso/accesos";
import type { SiblingApp } from "@/lib/acceso/catalog";
import { buildNoAccessPath } from "@/lib/access-requests/no-access";
import { withAuth } from "@/lib/api/with-auth";
import { appEnv } from "@/lib/env";

// App gate consumed by infrastructure (nginx auth_request) — see ADR 0006 for
// the nginx shape and ADRs 0009/0010 for the decision: the gate answers from the
// identity's effective access (super admins included), not a portal capability. Readers (analytics,
// incidencias, ops) gate themselves in-process, so only the static generator
// is served here. Must never live under /api/auth/*: the Better Auth catch-all
// owns that prefix.
//
// A 403 names where nginx sends the browser (`X-Gate-Redirect`, read with
// `auth_request_set`): the Solicitud form for this app, so the request is
// tagged with it.
const GATE_REDIRECT_HEADER = "X-Gate-Redirect";

const NGINX_GATED_APPS: ReadonlyArray<SiblingApp> = ["generator"];

function parseGatedApp(app: string): SiblingApp | null {
  return (NGINX_GATED_APPS as ReadonlyArray<string>).includes(app)
    ? (app as SiblingApp)
    : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ app: string }> },
) {
  const { app: raw } = await params;
  const app = parseGatedApp(raw);

  if (!app) {
    return NextResponse.json({ error: "App desconocida." }, { status: 404 });
  }

  // withAuth answers 401 without a session; no capability — a Cuenta's portal
  // role says nothing about sibling access. Identity alone admits nobody: any
  // `generator` role does, and a super admin resolves to its admin role.
  return withAuth({}, async (_request, context) => {
    const access = await getEffectiveAccess(context.userId!, app);

    if (!access) {
      console.error("[gate] rejected identity without access", {
        app,
        userId: context.userId,
      });
      return NextResponse.json(
        { error: "No tenés acceso a esta app." },
        {
          status: 403,
          headers: {
            [GATE_REDIRECT_HEADER]: `${appEnv.appUrl}${buildNoAccessPath(app)}`,
          },
        },
      );
    }

    return new Response(null, { status: 204 });
  })(request);
}
