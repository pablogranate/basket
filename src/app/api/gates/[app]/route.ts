import { NextResponse } from "next/server";

import { getAcceso, type SiblingApp } from "@/lib/acceso/accesos";
import { withAuth } from "@/lib/api/with-auth";

// App gate consumed by infrastructure (nginx auth_request) — see ADR 0006 for
// the nginx shape and ADR 0009 for the decision: the gate answers by looking up
// the identity's Acceso, not a portal capability. Readers (analytics,
// incidencias, ops) gate themselves in-process, so only the static generator
// is served here. Must never live under /api/auth/*: the Better Auth catch-all
// owns that prefix.
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
  // Nivel of `generator` Acceso does.
  return withAuth({}, async (_request, context) => {
    const acceso = await getAcceso(context.userId!, app);

    if (!acceso) {
      console.error("[gate] rejected identity without Acceso", {
        app,
        userId: context.userId,
      });
      return NextResponse.json(
        { error: "No tenés acceso a esta app." },
        { status: 403 },
      );
    }

    return new Response(null, { status: 204 });
  })(request);
}
