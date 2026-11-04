import { addFields } from "basket-tv-telemetry/log";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api/with-auth";
import { AI_COPY } from "@/lib/copy";
import { getGeminiRuntimeConfig } from "@/lib/settings";
import { upstreamDetail } from "@/lib/log";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const extractedSchema = z.object({
  ping: z.string().trim().min(1).max(40).nullable(),
  upload: z.string().trim().min(1).max(40).nullable(),
  download: z.string().trim().min(1).max(40).nullable(),
  provider: z.string().trim().min(1).max(120).nullable(),
  locationServer: z.string().trim().min(1).max(160).nullable(),
  dateTime: z.string().trim().min(1).max(120).nullable(),
  note: z.string().trim().min(1).max(240).nullable(),
});

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

export const POST = withAuth({ route: "/api/ai/speedtest" }, async (request) => {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Adjunta una captura válida del speedtest." },
      { status: 400 },
    );
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "La prueba adjunta debe ser una imagen." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await image.arrayBuffer()).toString("base64");
  const { apiKey, model, source } = await getGeminiRuntimeConfig();

  if (!apiKey) {
    return NextResponse.json(
      {
        error: AI_COPY.globalGeminiCaptureHint,
      },
      { status: 400 },
    );
  }

  const prompt = [
    `Extrae datos visibles de una captura de speedtest ${AI_COPY.portalCaptureContext}`,
    "Responde SOLO JSON válido.",
    "No inventes nada.",
    "Si un dato no está visible, usa null.",
    "Normaliza así:",
    '- ping: ejemplo "18 ms"',
    '- upload: ejemplo "97.43 Mbps"',
    '- download: ejemplo "103.58 Mbps"',
    '- provider: proveedor o ISP visible',
    '- locationServer: ciudad + servidor si aparece',
    '- dateTime: fecha y hora visibles',
    '- note: comentario corto si la captura es parcial, borrosa o ambigua',
    "",
    "Devuelve exactamente este objeto:",
    '{"ping":null,"upload":null,"download":null,"provider":null,"locationServer":null,"dateTime":null,"note":null}',
  ].join("\n");

  addFields({ gemini: { model, source, image_bytes: image.size } });

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
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: image.type,
                  data: bytes,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    addFields({
      reason: "upstream_error",
      gemini: { model, source, image_bytes: image.size, status: response.status },
    });

    return NextResponse.json(
      {
        error:
          "No pudimos leer la captura con Gemini. Revisa la configuración o intenta con otra imagen.",
        detail: upstreamDetail(body),
      },
      { status: 502 },
    );
  }

  const data = (await response.json()) as GeminiResponse;
  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!answer) {
    addFields({ reason: "empty_answer" });
    return NextResponse.json(
      { error: "Gemini no devolvió contenido para esta captura." },
      { status: 502 },
    );
  }

  const jsonText = extractJson(answer);

  if (!jsonText) {
    addFields({ reason: "missing_json" });
    return NextResponse.json(
      { error: "No pudimos convertir la lectura del speedtest a datos estructurados." },
      { status: 502 },
    );
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    addFields({ reason: "invalid_json" });
    return NextResponse.json(
      { error: "La respuesta de Gemini no vino en JSON válido." },
      { status: 502 },
    );
  }

  const extracted = extractedSchema.safeParse(parsedJson);

  if (!extracted.success) {
    addFields({ reason: "schema_mismatch" });
    return NextResponse.json(
      { error: "La lectura del speedtest no devolvió el formato esperado." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    extracted: extracted.data,
  });
});
