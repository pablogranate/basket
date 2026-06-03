import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeGuestRateLimit } from "@/lib/api/rate-limit";
import { withAuth } from "@/lib/api/with-auth";
import { AI_COPY } from "@/lib/copy";
import { getGeminiRuntimeConfig } from "@/lib/settings";

function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

const requestSchema = z.object({
  section: z.string().trim().min(2).max(80),
  question: z.string().trim().min(3).max(500),
  contextLabel: z.string().trim().min(2).max(160),
  guidance: z.string().trim().max(1500).optional(),
  context: z.unknown(),
});

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

export const POST = withAuth({ allowGuest: true }, async (request, ctx) => {
  if (!ctx.userId) {
    const limit = await consumeGuestRateLimit(getClientKey(request));

    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes, intenta más tarde." },
        { status: 429 },
      );
    }
  }

  const payload = requestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Solicitud inválida para el asistente." },
      { status: 400 },
    );
  }

  const contextText = JSON.stringify(payload.data.context);

  if (!contextText || contextText === "null" || contextText === "[]") {
    return NextResponse.json(
      { error: "No hay contexto visible para consultar en esta sección." },
      { status: 400 },
    );
  }

  if (contextText.length > 120_000) {
    return NextResponse.json(
      {
        error:
          "El contexto visible es demasiado grande para enviarlo completo a la IA. Reduce la búsqueda o aplica filtros antes de consultar.",
      },
      { status: 400 },
    );
  }

  const { apiKey, model, source } = await getGeminiRuntimeConfig();

  if (!apiKey) {
    return NextResponse.json(
      {
        error: AI_COPY.globalGeminiHint,
      },
      { status: 400 },
    );
  }

  const prompt = [
    AI_COPY.assistantIdentity,
    "Responde siempre en español.",
    "Usa SOLO el contexto suministrado en esta solicitud.",
    "No inventes datos, no supongas y no completes campos ausentes.",
    "Si un dato no está en el contexto visible, dilo con claridad.",
    "Sé breve, operativo y directo.",
    "Cuando el usuario pregunte por varios elementos, responde con bullets simples.",
    `Sección actual: ${payload.data.section}.`,
    `Contexto visible: ${payload.data.contextLabel}.`,
    payload.data.guidance ? `Instrucciones del módulo: ${payload.data.guidance}` : "",
    "",
    "Contexto estructurado visible:",
    contextText,
    "",
    `Pregunta: ${payload.data.question}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error("[ai][section] gemini request failed", {
      section: payload.data.section,
      contextLabel: payload.data.contextLabel,
      model,
      source,
      status: response.status,
      detail: text,
    });

    return NextResponse.json(
      {
        error:
          "No pudimos consultar Gemini. Revisa la API key o el modelo configurado.",
        detail: text,
      },
      { status: 502 },
    );
  }

  const data = (await response.json()) as GeminiResponse;
  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  return NextResponse.json({
    answer:
      answer || "No pude generar una respuesta útil con el contexto disponible.",
  });
});
