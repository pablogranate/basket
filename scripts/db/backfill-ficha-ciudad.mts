// Fills the city of fichas approved before the approval copied it: each ficha
// with no city takes the ciudad of its latest approved portal Solicitud. Fichas
// that already have a city are left alone, so nothing an admin set is lost.
//
//   npm run db:backfill-ficha-ciudad                 (dry run: only reports)
//   npm run db:backfill-ficha-ciudad -- --apply      (writes; backup first)
//
// Needs DATABASE_URL and AUTH_DATABASE_URL (loaded from .env.local when
// present). Before writing, the notes of every ficha it changes go to
// ficha-ciudad-backup-<timestamp>.json in the current directory.
import { writeFileSync } from "node:fs";

import postgres from "postgres";

import { buildPersonNotesMeta, parsePersonNotesMeta } from "@/lib/people-notes";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
const authDatabaseUrl = process.env.AUTH_DATABASE_URL;

if (!databaseUrl || !authDatabaseUrl) {
  console.error("[backfill-ciudad] DATABASE_URL and AUTH_DATABASE_URL are required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const authSql = postgres(authDatabaseUrl, { max: 1 });

const requests = await authSql<{ person_id: string; ciudad: string }[]>`
  select distinct on (person_id) person_id, ciudad
  from auth_access_request
  where app = 'portal'
    and status = 'aprobada'
    and person_id is not null
    and nullif(trim(ciudad), '') is not null
  order by person_id, decided_at desc nulls last
`;

const people = requests.length
  ? await sql<{ id: string; full_name: string; notes: string | null }[]>`
      select id, full_name, notes from people
      where id in ${sql(requests.map((request) => request.person_id))}
        and deleted_at is null
    `
  : [];
const ciudadByPerson = new Map(
  requests.map((request) => [request.person_id, request.ciudad.trim()]),
);

const changes: Array<{
  id: string;
  fullName: string;
  before: string | null;
  after: string | null;
  ciudad: string;
}> = [];

for (const person of people) {
  const meta = parsePersonNotesMeta(person.notes);
  const ciudad = ciudadByPerson.get(person.id);

  if (meta.city || !ciudad) {
    continue;
  }

  changes.push({
    id: person.id,
    fullName: person.full_name,
    before: person.notes,
    after: buildPersonNotesMeta({ ...meta, city: ciudad }),
    ciudad,
  });
}

changes.forEach((change) =>
  console.log(`[backfill-ciudad] ${change.fullName}: ${change.ciudad}`),
);
console.log(
  `[backfill-ciudad] ${requests.length} solicitudes aprobadas con ciudad, ${changes.length} fichas sin ciudad para completar`,
);

if (!apply) {
  console.log("[backfill-ciudad] dry run; pass --apply to write");
  await Promise.all([sql.end(), authSql.end()]);
  process.exit(0);
}

const backupPath = `ficha-ciudad-backup-${Date.now()}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(
    changes.map(({ id, fullName, before }) => ({ id, full_name: fullName, notes: before })),
    null,
    2,
  ),
);
console.log(`[backfill-ciudad] backup written to ${backupPath}`);

let written = 0;
for (const change of changes) {
  // Only replaces the exact notes that were read, so an edit made meanwhile wins.
  const result = await sql`
    update people
    set notes = ${change.after}, updated_at = timezone('utc'::text, now())
    where id = ${change.id} and notes is not distinct from ${change.before}
  `;
  written += result.count;
}

console.log(`[backfill-ciudad] ${written} of ${changes.length} fichas updated`);
await Promise.all([sql.end(), authSql.end()]);
