import { NextResponse } from "next/server";

import { appEnv } from "@/lib/env";

export const INTAKE_API_KEY_HEADER = "x-intake-key";

type ApiKeyHandler = (request: Request) => Promise<Response> | Response;

export function withApiKey(handler: ApiKeyHandler) {
  return async (request: Request): Promise<Response> => {
    const expected = appEnv.intakeApiKey;
    const provided = request.headers.get(INTAKE_API_KEY_HEADER)?.trim() ?? "";

    if (!expected || !provided || provided !== expected) {
      console.error("[with-api-key] rejected machine request with invalid key");
      return NextResponse.json(
        { error: "Credencial de máquina inválida o ausente." },
        { status: 401 },
      );
    }

    return handler(request);
  };
}
