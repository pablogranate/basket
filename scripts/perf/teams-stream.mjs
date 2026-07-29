#!/usr/bin/env node
// Splits the /teams document by *arrival time*, the same way
// mi-jornada-stream.mjs does, so "why is LCP late" is answered with numbers.
//
// DevTools reported LCP 688 ms on /teams with 431 ms of it as "render delay",
// blaming hydration. The LCP element is the SectionPageHeader description
// paragraph, which is server-rendered — so the question is whether those bytes
// arrive early (delay is CLIENT hydration) or late (delay is the SERVER
// waterfall: auth -> settings -> team directory -> people).
//
//   ttfbMs      -> first byte
//   description -> the LCP paragraph
//   tabs        -> league tabs, first thing that needs the directory
//   cards       -> the directory grid
//   stats       -> the summary panel below the grid
//   tailMs      -> stream close
//
// `description` sitting at ttfb while `tabs`/`cards` land much later is the
// intended shape: the header no longer waits on the directory query.
//
// Usage:
//   TEAMS_PERF_COOKIE="better-auth.session_token=..." \
//     node scripts/perf/teams-stream.mjs --base=http://localhost:3000
//
// Options:
//   --base=http://localhost:3000   origin to hit
//   --runs=3                       requests; the median is reported
//   --json                         machine-readable output
//
// Read-only GETs. A wrong or stale cookie measures the login redirect, so this
// fails loudly rather than reporting a fast, empty page.

const DEFAULT_BASE = "http://localhost:3000";
const TARGET_PATH = "/teams";

// Markers in expected stream order. These must match the *HTML*, not the RSC
// Flight payload: the same strings appear in both, and the Flight copy usually
// lands first, which would report a paint that has not happened. Flight escapes
// its attributes (`\"className\":\"…`), so anchoring on the unescaped
// `class="…` form keeps this honest.
const MARKERS = [
  {
    key: "description",
    label: "header copy (LCP)",
    needle: 'class="max-w-2xl text-sm font-medium',
  },
  { key: "tabs", label: "league tabs", needle: ">Todos (" },
  {
    key: "cards",
    label: "directory grid",
    needle: 'class="panel-surface group',
  },
  { key: "stats", label: "summary panel", needle: ">Equipos visibles<" },
];

function parseArgs(argv) {
  const options = { base: DEFAULT_BASE, runs: 3, json: false };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }

    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    if (key === "base") {
      options.base = value.replace(/\/$/, "");
    }

    if (key === "runs") {
      const runs = Number.parseInt(value, 10);
      if (!Number.isFinite(runs) || runs < 1) {
        throw new Error(`--runs must be a positive integer, got "${value}"`);
      }
      options.runs = runs;
    }
  }

  return options;
}

function requireCookie() {
  const cookie = process.env.TEAMS_PERF_COOKIE;

  if (!cookie) {
    throw new Error(
      "TEAMS_PERF_COOKIE is not set. Copy the session cookie from devtools, e.g.\n" +
        '  TEAMS_PERF_COOKIE="better-auth.session_token=..." node scripts/perf/teams-stream.mjs',
    );
  }

  return cookie;
}

// Markers can straddle a chunk boundary, so match against the accumulated text
// but only re-scan from just before the previous chunk's end.
function scanForMarkers(text, scanFrom, pending, elapsedMs, hits) {
  for (const marker of pending) {
    const index = text.indexOf(marker.needle, scanFrom);
    if (index !== -1) {
      hits.set(marker.key, {
        atMs: elapsedMs,
        byteOffset: Buffer.byteLength(text.slice(0, index), "utf8"),
      });
    }
  }
}

async function fetchOnce(url, cookie) {
  const startedAt = process.hrtime.bigint();
  const sinceStartMs = () => Number(process.hrtime.bigint() - startedAt) / 1e6;

  const response = await fetch(url, {
    headers: { cookie, "user-agent": "teams-stream-perf/1" },
    redirect: "manual",
  });
  const ttfbMs = sinceStartMs();

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `${url} redirected to ${response.headers.get("location") ?? "?"} — the session cookie is missing or expired.`,
    );
  }

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}.`);
  }

  const decoder = new TextDecoder();
  const hits = new Map();
  const longestNeedle = Math.max(
    ...MARKERS.map((marker) => marker.needle.length),
  );
  let text = "";
  let scanFrom = 0;

  for await (const chunk of response.body) {
    text += decoder.decode(chunk, { stream: true });
    const elapsedMs = sinceStartMs();
    const pending = MARKERS.filter((marker) => !hits.has(marker.key));
    if (pending.length) {
      scanForMarkers(text, scanFrom, pending, elapsedMs, hits);
    }
    scanFrom = Math.max(0, text.length - longestNeedle);
  }

  text += decoder.decode();
  scanForMarkers(
    text,
    scanFrom,
    MARKERS.filter((marker) => !hits.has(marker.key)),
    sinceStartMs(),
    hits,
  );
  const tailMs = sinceStartMs();

  if (
    text.includes('action="/api/auth/sign-in') ||
    text.includes("Iniciar sesión con Google")
  ) {
    throw new Error(
      `${url} rendered the login page — the session cookie is not valid.`,
    );
  }

  return {
    ttfbMs,
    tailMs,
    totalBytes: Buffer.byteLength(text, "utf8"),
    markers: Object.fromEntries(hits),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} kB`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cookie = requireCookie();
  const url = `${options.base}${TARGET_PATH}`;
  const runs = [];

  for (let run = 0; run < options.runs; run += 1) {
    runs.push(await fetchOnce(url, cookie));
  }

  const summary = {
    ttfbMs: Math.round(median(runs.map((run) => run.ttfbMs))),
    tailMs: Math.round(median(runs.map((run) => run.tailMs))),
    totalBytes: Math.round(median(runs.map((run) => run.totalBytes))),
    markers: MARKERS.map((marker) => {
      const seen = runs.filter((run) => run.markers[marker.key]);
      return {
        key: marker.key,
        label: marker.label,
        seenIn: seen.length,
        atMs: seen.length
          ? Math.round(median(seen.map((run) => run.markers[marker.key].atMs)))
          : null,
        byteOffset: seen.length
          ? Math.round(
              median(seen.map((run) => run.markers[marker.key].byteOffset)),
            )
          : null,
      };
    }),
  };

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          base: options.base,
          path: TARGET_PATH,
          runs: options.runs,
          ...summary,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n${url}  (${options.runs} runs, median)`);
  console.log(`  ttfb           ${summary.ttfbMs} ms`);
  for (const marker of summary.markers) {
    const at = marker.atMs === null ? "not found" : `${marker.atMs} ms`;
    const offset =
      marker.byteOffset === null ? "" : `  @ byte ${marker.byteOffset}`;
    const missing =
      marker.seenIn === options.runs ? "" : `  (${marker.seenIn}/${options.runs} runs)`;
    console.log(`  ${marker.label.padEnd(20)} ${at}${offset}${missing}`);
  }
  console.log(`  stream close   ${summary.tailMs} ms`);
  console.log(`  document       ${formatBytes(summary.totalBytes)}`);

  const description = summary.markers.find(
    (marker) => marker.key === "description",
  );
  if (description?.atMs != null) {
    const gap = description.atMs - summary.ttfbMs;
    console.log(
      `\n  LCP copy arrives ${gap} ms after ttfb -> ${
        gap > 100
          ? "SERVER data waterfall dominates"
          : "bytes are early; delay is CLIENT hydration"
      }\n`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
