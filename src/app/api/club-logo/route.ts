import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { clubLogoVersionSql, parseImageDataUrl } from "@/lib/club-logo";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Crests stay in clubs.logo_url as data URLs; this route serves them as plain
// images so pages carry a short URL instead of ~130 KB of base64 per club.
export const GET = withAuth({}, async (request) => {
  const url = new URL(request.url);
  const clubId = url.searchParams.get("club")?.trim() ?? "";
  const requestedVersion = url.searchParams.get("v")?.trim() ?? "";

  if (!UUID_PATTERN.test(clubId)) {
    return NextResponse.json({ error: "Club inválido." }, { status: 400 });
  }

  let row: { logoUrl: string | null; version: string | null } | undefined;
  try {
    [row] = await db
      .select({
        logoUrl: clubs.logoUrl,
        version: clubLogoVersionSql(clubs.logoUrl, clubs.updatedAt),
      })
      .from(clubs)
      .where(eq(clubs.id, clubId))
      .limit(1);
  } catch (error) {
    console.error("[club-logo] failed to load logo", error);
    return NextResponse.json(
      { error: "No se pudo cargar el escudo." },
      { status: 500 },
    );
  }

  const image = row?.logoUrl ? parseImageDataUrl(row.logoUrl) : null;

  if (!image) {
    return NextResponse.json({ error: "Escudo no encontrado." }, { status: 404 });
  }

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      // An uploaded SVG opened on its own must not run scripts on this origin.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      // A versioned URL never changes content; an outdated or missing version
      // must not pin the old logo in the browser.
      "Cache-Control":
        requestedVersion && requestedVersion === row?.version
          ? "private, max-age=31536000, immutable"
          : "private, no-cache",
    },
  });
});
