import { sql, type AnyColumn } from "drizzle-orm";

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

export const CLUB_LOGO_ROUTE = "/api/club-logo";

export function isImageDataUrl(value: string) {
  return DATA_URL_PATTERN.test(value);
}

export function parseImageDataUrl(value: string) {
  const match = DATA_URL_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  return {
    contentType: match[1].toLowerCase(),
    bytes: Buffer.from(match[2], "base64"),
  };
}

// Size plus clubs.updated_at (bumped on every logo save): reading the size
// skips detoasting the image, while hashing all crests costs ~60 ms per load.
export function clubLogoVersionSql(logoUrl: AnyColumn, updatedAt: AnyColumn) {
  return sql<
    string | null
  >`octet_length(${logoUrl}) || '-' || floor(extract(epoch from ${updatedAt}))::bigint`;
}

// The URL changes whenever the logo does, so the browser can cache each URL
// forever.
export function buildClubLogoSrc(clubId: string, version: string | null) {
  if (!version) {
    return null;
  }

  const params = new URLSearchParams({ club: clubId, v: version });
  return `${CLUB_LOGO_ROUTE}?${params.toString()}`;
}
