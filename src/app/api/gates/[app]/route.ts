import { NextResponse } from "next/server";

import { getEffectiveAccess } from "@/lib/acceso/accesos";
import type { SiblingApp } from "@/lib/acceso/catalog";
import { buildNoAccessPath } from "@/lib/access-requests/no-access";
import { withAuth } from "@/lib/api/with-auth";
import { appEnv } from "@/lib/env";

// App gate consumed by infrastructure (nginx auth_request) — see ADR 0006 for
// the nginx shape and ADRs 0009/0010 for the decision: the gate answers from the
// identity's effective access (super admins included), not a portal capability.
// Readers (analytics, incidencias, ops, monitor) gate themselves in-process, so
// only the apps that can't read the session are served here: the static
// generator. Must never live under /api/auth/*: the Better Auth catch-all owns
// that prefix.
//
// A 403 names where nginx sends the browser (`X-Gate-Redirect`, read with
// `auth_request_set`): the Solicitud form for this app, so the request is
// tagged with it.
//
// A 204 names the Rol de app untranslated (`X-Gate-Role`) and the identity's
// email (`X-Gate-User`) for nginx to forward, for an app that tells its roles
// apart (the Python monitor did until its Next web read the session itself,
// matchwatch#2); the generator ignores both.
const GATE_REDIRECT_HEADER = "X-Gate-Redirect";
const GATE_ROLE_HEADER = "X-Gate-Role";
const GATE_USER_HEADER = "X-Gate-User";

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

    return new Response(null, {
      status: 204,
      headers: {
        [GATE_ROLE_HEADER]: access.role,
        [GATE_USER_HEADER]: context.email ?? "",
      },
    });
  })(request);
}
