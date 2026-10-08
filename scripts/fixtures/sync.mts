// Runs the CABB fixtures sync once, outside the daily cron — for the season
// backfill or a manual catch-up. Same code path as the 06:00 run: one export
// request per account whatever the range, and a 30-minute cooldown between
// runs unless --force.
//
//   npm run fixtures:sync                                  (default window)
//   npm run fixtures:sync -- --from 2026-09-01 --to 2027-06-30
//
// Needs DATABASE_URL and the CABB_* vars (loaded from .env.local when
// present). Runs under Node's `react-server` condition so the `server-only`
// imports resolve to no-ops.
import { runFixturesSync } from "@/lib/fixtures/sync";
import { defaultFixturesSyncWindow } from "@/lib/fixtures/window";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const readArg = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const window = defaultFixturesSyncWindow(new Date());
const from = readArg("--from") ?? window.from;
const to = readArg("--to") ?? window.to;

if (!isoDate.test(from) || !isoDate.test(to) || from > to) {
  console.error("[fixtures-sync] --from/--to must be YYYY-MM-DD with from <= to");
  process.exit(1);
}

const result = await runFixturesSync({ from, to, force: args.includes("--force") });

if (result.skipped) {
  console.log(`[fixtures-sync] skipped (${result.reason}); pass --force to run anyway`);
  process.exit(0);
}

result.warnings.forEach((warning) => console.warn(`[fixtures-sync] ${warning}`));
result.errors.forEach((error) => console.error(`[fixtures-sync] ${error}`));
console.log(
  `[fixtures-sync] ${from} a ${to}: ${JSON.stringify(result.fetched)} descargados, ${result.upserted} guardados, ${result.deleted} eliminados, ${result.linked} vinculados`,
);
process.exit(result.errors.length ? 1 : 0);
