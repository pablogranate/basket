import { withRequestLog } from "basket-tv-telemetry/next";
import { NextResponse } from "next/server";

import { rejectRequest } from "@/lib/api/with-auth";
import { appEnv } from "@/lib/env";

export const INTAKE_API_KEY_HEADER = "x-intake-key";

type ApiKeyHandler = (request: Request) => Promise<Response> | Response;

export function withApiKey(route: string, handler: ApiKeyHandler) {
  return withRequestLog<Request, unknown>(route, async (request) => {
    const expected = appEnv.intakeApiKey;
    const provided = request.headers.get(INTAKE_API_KEY_HEADER)?.trim() ?? "";

    if (!expected || !provided || provided !== expected) {
      rejectRequest("invalid_key");
      return NextResponse.json(
        { error: "Credencial de máquina inválida o ausente." },
        { status: 401 },
      );
    }

    return handler(request);
  });
}
