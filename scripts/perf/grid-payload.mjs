#!/usr/bin/env node
// Measures what /grid actually ships, per URL, so "did that get faster" is
// answered with numbers instead of impressions.
//
// The point of splitting RSC-payload bytes from HTML bytes: prior rounds found
// the serialized Flight payload was 73-80% of the document, which is what makes
// the payload-trim work worth doing and the class-attribute work not.
//
// Usage:
//   npm run build && npm run start          # prod build, port 3000
//   GRID_PERF_COOKIE="better-auth.session_token=..." node scripts/perf/grid-payload.mjs
//
// Options:
//   --base=http://localhost:3000   origin to hit
//   --runs=3                       requests per URL; the median is reported
//   --json                         machine-readable output
//
// Grab the cookie from devtools (Application -> Cookies), or mint one through
// the local magic-link flow. There is no default: a wrong or stale cookie
// silently measures the login redirect instead of the grid, so this fails loudly
// rather than reporting a fast, empty page.

const DEFAULT_BASE = "http://localhost:3000";

const GRID_URLS = [
  { label: "day view", path: "/grid?view=day" },
  { label: "month table", path: "/grid?view=month" },
  { label: "month cards", path: "/grid?view=month&display=cards" },
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
  const cookie = process.env.GRID_PERF_COOKIE;

  if (!cookie) {
    throw new Error(
      "GRID_PERF_COOKIE is not set. Copy the session cookie from devtools, e.g.\n" +
        '  GRID_PERF_COOKIE="better-auth.session_token=..." node scripts/perf/grid-payload.mjs',
    );
  }

  return cookie;
}

// The Flight payload arrives as inline `self.__next_f.push([1,"..."])` script
// blocks. Everything else in the document is HTML, inline styles, and the small
// bootstrap scripts.
const FLIGHT_CHUNK = /self\.__next_f\.push\(/g;

function measureFlightBytes(html) {
  let total = 0;
  let match;

  FLIGHT_CHUNK.lastIndex = 0;
  while ((match = FLIGHT_CHUNK.exec(html)) !== null) {
    const openIndex = html.indexOf("(", match.index + "self.__next_f.push".length);
    if (openIndex === -1) {
      continue;
    }

    // Walk to the matching close paren so a payload containing "(" or ")" inside
    // a string does not truncate the measurement.
    let depth = 0;
    let index = openIndex;
    for (; index < html.length; index += 1) {
      const char = html[index];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }

    if (depth === 0) {
      total += Buffer.byteLength(html.slice(openIndex, index + 1), "utf8");
    }
  }

  return total;
}

function measureClassAttrBytes(html) {
  let total = 0;
  for (const match of html.matchAll(/class="[^"]*"/g)) {
    total += Buffer.byteLength(match[0], "utf8");
  }
  return total;
}

async function fetchOnce(url, cookie) {
  const startedAt = process.hrtime.bigint();
  const response = await fetch(url, {
    headers: { cookie, "user-agent": "grid-payload-perf/1" },
    redirect: "manual",
  });
  const html = await response.text();
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `${url} redirected to ${response.headers.get("location") ?? "?"} — the session cookie is missing or expired.`,
    );
  }

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}.`);
  }

  if (html.includes('action="/api/auth/sign-in') || html.includes("Iniciar sesión con Google")) {
    throw new Error(`${url} rendered the login page — the session cookie is not valid.`);
  }

  return {
    elapsedMs,
    totalBytes: Buffer.byteLength(html, "utf8"),
    flightBytes: measureFlightBytes(html),
    classAttrBytes: measureClassAttrBytes(html),
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
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function share(part, whole) {
  return whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cookie = requireCookie();
  const results = [];

  for (const target of GRID_URLS) {
    const url = `${options.base}${target.path}`;
    const runs = [];

    for (let run = 0; run < options.runs; run += 1) {
      runs.push(await fetchOnce(url, cookie));
    }

    results.push({
      label: target.label,
      path: target.path,
      runs: options.runs,
      totalBytes: Math.round(median(runs.map((r) => r.totalBytes))),
      flightBytes: Math.round(median(runs.map((r) => r.flightBytes))),
      classAttrBytes: Math.round(median(runs.map((r) => r.classAttrBytes))),
      medianMs: Math.round(median(runs.map((r) => r.elapsedMs))),
    });
  }

  if (options.json) {
    console.log(JSON.stringify({ base: options.base, results }, null, 2));
    return;
  }

  console.log(`\n/grid payload — ${options.base} (median of ${options.runs} runs)\n`);

  for (const result of results) {
    console.log(`${result.label}  ${result.path}`);
    console.log(`  document     ${formatBytes(result.totalBytes)}`);
    console.log(
      `  RSC payload  ${formatBytes(result.flightBytes)}  (${share(result.flightBytes, result.totalBytes)} of document)`,
    );
    console.log(
      `  class attrs  ${formatBytes(result.classAttrBytes)}  (${share(result.classAttrBytes, result.totalBytes)} of document)`,
    );
    console.log(`  time         ${result.medianMs} ms\n`);
  }
}

main().catch((error) => {
  console.error(`[grid-payload] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
