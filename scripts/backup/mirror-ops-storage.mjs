// Mirrors every Supabase Storage bucket of Ops (venue photos, WhatsApp media)
// into a local folder, so offsite.sh takes it to Drive with the rest. A pg_dump
// of Ops does not hold these files. Only new or resized objects are downloaded;
// files gone from Supabase are removed here too, and restic keeps their history.
//
//   node --env-file=/opt/bp-ops-hub/worker/.env scripts/backup/mirror-ops-storage.mjs <dir>
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const PAGE_SIZE = 1000;

const [targetDir] = process.argv.slice(2);
const baseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!targetDir || !baseUrl || !serviceKey) {
  console.error("[ops-storage] usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… mirror-ops-storage.mjs <dir>");
  process.exit(2);
}

// Photos of people and venues: root only, like the DB dumps.
process.umask(0o077);

async function storageApi(pathname, init = {}) {
  const response = await fetch(`${baseUrl}/storage/v1${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} → ${response.status} ${await response.text()}`);
  }
  return response;
}

async function listObjects(bucket, prefix = "") {
  const objects = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await storageApi(`/object/list/${bucket}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prefix,
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    const items = await response.json();
    for (const item of items) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders come back with no id.
      if (item.id === null) {
        objects.push(...(await listObjects(bucket, name)));
      } else {
        objects.push({ name, size: item.metadata?.size ?? null });
      }
    }
    if (items.length < PAGE_SIZE) {
      return objects;
    }
  }
}

async function localFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await localFiles(full, base)));
    } else {
      files.push(path.relative(base, full));
    }
  }
  return files;
}

async function isUpToDate(file, size) {
  const info = await stat(file).catch(() => null);
  return info !== null && (size === null || info.size === size);
}

async function mirrorBucket(bucket) {
  const bucketDir = path.resolve(targetDir, bucket);
  const objects = await listObjects(bucket);
  const wanted = new Set();
  let downloaded = 0;
  let failed = 0;

  for (const object of objects) {
    const file = path.resolve(bucketDir, object.name);
    if (!file.startsWith(`${bucketDir}${path.sep}`)) {
      console.error(`[ops-storage] ${bucket}: skipped unsafe name ${object.name}`);
      failed += 1;
      continue;
    }
    wanted.add(path.relative(bucketDir, file));
    if (await isUpToDate(file, object.size)) {
      continue;
    }
    try {
      const encoded = object.name.split("/").map(encodeURIComponent).join("/");
      const response = await storageApi(`/object/authenticated/${bucket}/${encoded}`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      downloaded += 1;
    } catch (error) {
      console.error(`[ops-storage] ${bucket}: failed ${object.name}:`, error instanceof Error ? error.message : error);
      failed += 1;
    }
  }

  let removed = 0;
  for (const file of await localFiles(bucketDir)) {
    if (!wanted.has(file)) {
      await rm(path.join(bucketDir, file));
      removed += 1;
    }
  }

  console.info(`[ops-storage] ${bucket}: ${objects.length} objects, ${downloaded} downloaded, ${removed} removed${failed ? `, ${failed} FAILED` : ""}`);
  return failed;
}

const buckets = await (await storageApi("/bucket")).json();
let failures = 0;
for (const bucket of buckets) {
  failures += await mirrorBucket(bucket.id);
}
if (failures > 0) {
  console.error(`[ops-storage] done with FAILURES (${failures} objects).`);
  process.exit(1);
}
console.info(`[ops-storage] done — ${buckets.length} buckets in ${targetDir}.`);
