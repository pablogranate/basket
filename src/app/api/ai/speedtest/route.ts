import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api/with-auth";
import { AI_COPY } from "@/lib/copy";
import { getGeminiRuntimeConfig } from "@/lib/settings";

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

export const POST = withAuth({}, async (request) => {
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
  const requestId = crypto.randomUUID();
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

  console.info("[ai][speedtest] start", {
    requestId,
    mimeType: image.type,
    size: image.size,
    model,
    source,
  });

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
    const detail = await response.text();
    console.error("[ai][speedtest] gemini request failed", {
      requestId,
      model,
      source,
      status: response.status,
      detail,
    });

    return NextResponse.json(
      {
        error:
          "No pudimos leer la captura con Gemini. Revisa la configuración o intenta con otra imagen.",
        detail,
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
    console.warn("[ai][speedtest] empty answer", {
      requestId,
      model,
      source,
    });
    return NextResponse.json(
      { error: "Gemini no devolvió contenido para esta captura." },
      { status: 502 },
    );
  }

  const jsonText = extractJson(answer);

  if (!jsonText) {
    console.warn("[ai][speedtest] missing json block", {
      requestId,
      model,
      source,
      answer,
    });
    return NextResponse.json(
      { error: "No pudimos convertir la lectura del speedtest a datos estructurados." },
      { status: 502 },
    );
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(jsonText);
  } catch (error) {
    console.warn("[ai][speedtest] invalid json", {
      requestId,
      model,
      source,
      jsonText,
      error,
    });
    return NextResponse.json(
      { error: "La respuesta de Gemini no vino en JSON válido." },
      { status: 502 },
    );
  }

  const extracted = extractedSchema.safeParse(parsedJson);

  if (!extracted.success) {
    console.warn("[ai][speedtest] schema mismatch", {
      requestId,
      model,
      source,
      parsedJson,
    });
    return NextResponse.json(
      { error: "La lectura del speedtest no devolvió el formato esperado." },
      { status: 502 },
    );
  }

  console.info("[ai][speedtest] success", {
    requestId,
    model,
    source,
    hasUpload: Boolean(extracted.data.upload),
    hasPing: Boolean(extracted.data.ping),
    hasDownload: Boolean(extracted.data.download),
  });

  return NextResponse.json({
    extracted: extracted.data,
  });
});
