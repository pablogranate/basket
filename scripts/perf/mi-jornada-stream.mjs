#!/usr/bin/env node
// Splits the /mi-jornada document by *arrival time*, so "why is LCP late" is
// answered with numbers instead of a DevTools guess.
//
// The page has a `loading.tsx`, so the browser paints a skeleton at TTFB and the
// real greeting (the LCP text node) only lands once the RSC stream resolves the
// suspense boundary. DevTools attributes that gap to "render delay" and blames
// hydration. This measures which half is actually true:
//
//   ttfbMs        -> first byte (skeleton shell is already paintable)
//   markerMs      -> byte offset where the LCP text first appears in the stream
//   tailMs        -> stream close
//
// If markerMs is close to tailMs and far from ttfbMs, the cost is the SERVER
// data waterfall (auth -> profile -> linked person -> assignments -> crew).
// If markerMs is close to ttfbMs, the bytes were there early and the delay is
// CLIENT-side hydration.
//
// Usage:
//   MI_JORNADA_PERF_COOKIE="better-auth.session_token=..." \
//     node scripts/perf/mi-jornada-stream.mjs --base=https://portal.basket-app.com
//
// Options:
//   --base=https://portal.basket-app.com   origin to hit (default localhost:3000)
//   --runs=3                               requests; the median is reported
//   --json                                 machine-readable output
//
// Read-only GETs. Grab the cookie from devtools (Application -> Cookies); a
// wrong or stale cookie measures the login redirect, so this fails loudly.

const DEFAULT_BASE = "http://localhost:3000";
const TARGET_PATH = "/mi-jornada";

// Markers, in stream order, that bracket the render:
// - `shell` only exists in loading.tsx's skeleton (aria-busy) or the real header.
// - `greeting` is the eyebrow above the LCP name node in the page header.
// - `summary` is the second summary card label, i.e. data-derived content.
const MARKERS = [
  { key: "shell", label: "skeleton shell", needle: 'aria-busy="true"' },
  { key: "greeting", label: "greeting eyebrow (LCP)", needle: "Hola esta tu jornada" },
  { key: "summary", label: "summary cards", needle: "Partidos asignados" },
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
  const cookie = process.env.MI_JORNADA_PERF_COOKIE;

  if (!cookie) {
    throw new Error(
      "MI_JORNADA_PERF_COOKIE is not set. Copy the session cookie from devtools, e.g.\n" +
        '  MI_JORNADA_PERF_COOKIE="better-auth.session_token=..." node scripts/perf/mi-jornada-stream.mjs',
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
      hits.set(marker.key, { atMs: elapsedMs, byteOffset: Buffer.byteLength(text.slice(0, index), "utf8") });
    }
  }
}

async function fetchOnce(url, cookie) {
  const startedAt = process.hrtime.bigint();
  const sinceStartMs = () => Number(process.hrtime.bigint() - startedAt) / 1e6;

  const response = await fetch(url, {
    headers: { cookie, "user-agent": "mi-jornada-stream-perf/1" },
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
  const longestNeedle = Math.max(...MARKERS.map((marker) => marker.needle.length));
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
  scanForMarkers(text, scanFrom, MARKERS.filter((marker) => !hits.has(marker.key)), sinceStartMs(), hits);
  const tailMs = sinceStartMs();

  if (text.includes('action="/api/auth/sign-in') || text.includes("Iniciar sesión con Google")) {
    throw new Error(`${url} rendered the login page — the session cookie is not valid.`);
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
        atMs: seen.length ? Math.round(median(seen.map((run) => run.markers[marker.key].atMs))) : null,
        byteOffset: seen.length
          ? Math.round(median(seen.map((run) => run.markers[marker.key].byteOffset)))
          : null,
      };
    }),
  };

  if (options.json) {
    console.log(JSON.stringify({ base: options.base, path: TARGET_PATH, runs: options.runs, ...summary }, null, 2));
    return;
  }

  console.log(`\n${url}  (${options.runs} runs, median)`);
  console.log(`  ttfb           ${summary.ttfbMs} ms`);
  for (const marker of summary.markers) {
    const at = marker.atMs === null ? "not found" : `${marker.atMs} ms`;
    const offset = marker.byteOffset === null ? "" : `  @ byte ${marker.byteOffset}`;
    const missing = marker.seenIn === options.runs ? "" : `  (${marker.seenIn}/${options.runs} runs)`;
    console.log(`  ${marker.label.padEnd(24)} ${at}${offset}${missing}`);
  }
  console.log(`  stream close   ${summary.tailMs} ms`);
  console.log(`  document       ${formatBytes(summary.totalBytes)}`);

  const greeting = summary.markers.find((marker) => marker.key === "greeting");
  if (greeting?.atMs !== null && greeting !== undefined) {
    const gap = greeting.atMs - summary.ttfbMs;
    console.log(
      `\n  greeting arrives ${gap} ms after ttfb -> ${gap > 100 ? "SERVER data waterfall dominates" : "bytes are early; delay is CLIENT hydration"}\n`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
