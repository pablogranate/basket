import type { FixturesSyncResult } from "@/lib/fixtures/sync";

export type FixturesSyncAlert = {
  subject: string;
  text: string;
};

// A run that threw, or any feed that failed or stopped parsing. Skipped runs
// and "sin partido oficial" warnings are not breakages.
export function buildFixturesSyncAlert(
  outcome: { result: FixturesSyncResult } | { error: string },
): FixturesSyncAlert | null {
  if ("error" in outcome) {
    return {
      subject: "[fixtures-sync] La corrida falló",
      text: `La sincronización de fixtures se cortó antes de terminar:\n\n${outcome.error}`,
    };
  }

  const { result } = outcome;
  if (result.skipped || result.errors.length === 0) {
    return null;
  }

  const feeds = [...new Set(result.errors.map((error) => error.split(":")[0]!))];
  return {
    subject: `[fixtures-sync] Error en ${feeds.join(", ")}`,
    text: [
      `Corrida ${result.from} a ${result.to}: ${result.upserted} guardados, ${result.deleted} eliminados, ${result.linked} vinculados.`,
      "",
      "Errores:",
      ...result.errors.map((error) => `- ${error}`),
    ].join("\n"),
  };
}
