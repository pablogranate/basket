import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api/with-auth";
import { AI_COPY } from "@/lib/copy";
import { getGeminiRuntimeConfig } from "@/lib/settings";

const requestSchema = z.object({
  question: z.string().trim().min(3).max(500),
  people: z
    .array(
      z.object({
        fullName: z.string(),
        role: z.string(),
        coverage: z.string(),
        phone: z.string(),
        email: z.string(),
        status: z.string(),
        notes: z.string(),
      }),
    )
    .min(1)
    .max(500),
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

export const POST = withAuth(
  { roles: ["admin", "editor", "coordinator"] },
  async (request) => {
  const payload = requestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Solicitud inválida para el asistente." },
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
    "Usa SOLO el contexto suministrado.",
    "Si un dato no está en el contexto, di claramente que no aparece en la pantalla actual.",
    "Sé breve, operativo y directo.",
    "Cuando te pregunten por varias personas, responde en bullets simples.",
    "",
    "Contexto visible del módulo Personal:",
    JSON.stringify(payload.data.people),
    "",
    `Pregunta: ${payload.data.question}`,
  ].join("\n");

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
    console.error("[ai][people] gemini request failed", {
      model,
      source,
      peopleCount: payload.data.people.length,
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
  },
);
