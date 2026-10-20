// Shrinks the crests already stored in clubs.logo_url to what the team modal
// now saves on upload: at most LOGO_MAX_PX per side, WebP. SVGs and logos that
// would not get smaller are left alone.
//
//   npm run db:shrink-club-logos                 (dry run: only reports)
//   npm run db:shrink-club-logos -- --apply      (writes; backup first)
//
// Needs DATABASE_URL (loaded from .env.local when present). Before writing,
// the original data URLs of every club it changes go to
// club-logos-backup-<timestamp>.json in the current directory. Each update
// also bumps clubs.updated_at, which changes the crest URL so browsers drop
// the cached original.
import { writeFileSync } from "node:fs";

import postgres from "postgres";
import sharp from "sharp";

import { isImageDataUrl, parseImageDataUrl } from "@/lib/club-logo";
import { LOGO_MAX_PX, LOGO_WEBP_QUALITY } from "@/lib/shrink-logo";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("[shrink-logos] DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

type ClubLogo = { id: string; name: string; logo_url: string };

const rows = await sql<ClubLogo[]>`
  select id, name, logo_url from clubs where logo_url is not null order by name
`;

const changes: Array<{ id: string; name: string; before: string; after: string }> =
  [];
let skipped = 0;

for (const row of rows) {
  const image = isImageDataUrl(row.logo_url)
    ? parseImageDataUrl(row.logo_url)
    : null;

  if (!image || image.contentType === "image/svg+xml") {
    skipped += 1;
    continue;
  }

  try {
    const bytes = await sharp(image.bytes)
      .resize(LOGO_MAX_PX, LOGO_MAX_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: Math.round(LOGO_WEBP_QUALITY * 100) })
      .toBuffer();
    const after = `data:image/webp;base64,${bytes.toString("base64")}`;

    if (after.length >= row.logo_url.length) {
      skipped += 1;
      continue;
    }

    changes.push({ id: row.id, name: row.name, before: row.logo_url, after });
  } catch (error) {
    skipped += 1;
    console.warn(`[shrink-logos] could not process ${row.name}`, error);
  }
}

const kb = (chars: number) => `${Math.round(chars / 1024)} KB`;
const totalBefore = changes.reduce((sum, change) => sum + change.before.length, 0);
const totalAfter = changes.reduce((sum, change) => sum + change.after.length, 0);

changes.forEach((change) =>
  console.log(
    `[shrink-logos] ${change.name}: ${kb(change.before.length)} -> ${kb(change.after.length)}`,
  ),
);
console.log(
  `[shrink-logos] ${changes.length} logos ${kb(totalBefore)} -> ${kb(totalAfter)}, ${skipped} sin cambios`,
);

if (!apply) {
  console.log("[shrink-logos] dry run; pass --apply to write");
  await sql.end();
  process.exit(0);
}

const backupPath = `club-logos-backup-${Date.now()}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(
    changes.map(({ id, name, before }) => ({ id, name, logo_url: before })),
    null,
    2,
  ),
);
console.log(`[shrink-logos] backup written to ${backupPath}`);

let written = 0;
for (const change of changes) {
  // Only replaces the exact logo that was read, so an upload made meanwhile wins.
  const result = await sql`
    update clubs
    set logo_url = ${change.after}, updated_at = timezone('utc'::text, now())
    where id = ${change.id} and md5(logo_url) = md5(${change.before})
  `;
  written += result.count;
}

console.log(`[shrink-logos] ${written} of ${changes.length} logos updated`);
await sql.end();
