import { resolveSamples, stable } from "./lib";
import { buildCasePairs } from "./cases";

// Within-day match ordering was unspecified under PostgREST (ties left to the
// query plan). The ported query sorts ties by id for determinism; canonicalize
// both sides the same way so a benign tie permutation is not a diff.
function canonicalize(name: string, value: unknown): unknown {
  if (!name.startsWith("grid") || !value || typeof value !== "object") {
    return value;
  }
  const v = value as { dayGroups?: Array<{ items?: Array<Record<string, unknown>> }> };
  if (!Array.isArray(v.dayGroups)) return value;
  for (const group of v.dayGroups) {
    if (Array.isArray(group.items)) {
      group.items.sort((a, b) => {
        const ka = String(a.kickoff_at);
        const kb = String(b.kickoff_at);
        if (ka !== kb) return ka < kb ? -1 : 1;
        return String(a.id) < String(b.id) ? -1 : 1;
      });
    }
  }
  return value;
}

async function runSide(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    return { __threw: (error as Error).message };
  }
}

async function main() {
  const only = process.argv[2] ?? null;

  const samples = await resolveSamples();
  console.log(`samples: ${JSON.stringify(samples)}`);
  const allPairs = await buildCasePairs(samples);
  const pairs = only ? allPairs.filter((c) => c.name.includes(only)) : allPairs;

  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  for (const c of pairs) {
    // Run both sides back-to-back so volatile tables cannot drift between them.
    const oldStr = stable(canonicalize(c.name, await runSide(c.oldRun)));
    const newStr = stable(canonicalize(c.name, await runSide(c.newRun)));

    if (oldStr === newStr) {
      console.log(`ok        ${c.name}`);
      pass++;
      continue;
    }

    console.log(`DIFF      ${c.name}`);
    fail++;
    failures.push(c.name);
    const g = oldStr.split("\n");
    const a = newStr.split("\n");
    let shown = 0;
    for (let i = 0; i < Math.max(g.length, a.length) && shown < 20; i++) {
      if (g[i] !== a[i]) {
        console.log(`  L${i + 1} old ${g[i] ?? "∅"}`);
        console.log(`  L${i + 1} new ${a[i] ?? "∅"}`);
        shown++;
      }
    }
  }

  console.log(
    `\nPARITY: ${pass} ok, ${fail} diff${failures.length ? ` -> ${failures.join(", ")}` : ""}`,
  );
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
