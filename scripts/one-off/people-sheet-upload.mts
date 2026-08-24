// One-off: push the "Contactos Portal" tab into the roster without removing
// anyone. Same plan the confirmation modal shows, minus step 4 (soft-delete +
// access revoke), so the sheet's creates/updates land while the phone-only
// contacts imported from the CSV seed and the grilla stay untouched.
//
// Dry run (prints the diff, writes nothing):
//   npx tsx --tsconfig tsconfig.scripts.json scripts/one-off/people-sheet-upload.mts
// Apply:
//   npx tsx --tsconfig tsconfig.scripts.json scripts/one-off/people-sheet-upload.mts --apply
//
// Add --create-teams to also create the unambiguous new clubs from "Listas";
// look-alike names are never auto-merged, they need the modal.

import { previewPeopleSync, runPeopleSync } from "@/lib/people/sync";

const apply = process.argv.includes("--apply");
const createTeams = process.argv.includes("--create-teams");

function list(title: string, names: string[]) {
  console.log(`\n${title} (${names.length})`);
  for (const name of names) {
    console.log(`  · ${name}`);
  }
}

async function main() {
  const preview = await previewPeopleSync();

  list("Se agregan", preview.created);
  list(
    "Se actualizan",
    preview.updated.map(
      (item) =>
        `${item.name} — ${item.restored ? "se restaura" : item.changes.join(", ")}`,
    ),
  );
  list("Se eliminarían en un sync normal (acá NO se tocan)", preview.deleted);
  list("No se tocan (internos)", preview.protected);
  list("No se tocan (sin correo)", preview.withoutEmail);
  list("Filas de la planilla sin correo (no se sincronizan)", preview.skippedNoEmail);
  list("Equipos nuevos en Listas", preview.teams.created);
  list(
    "Equipos ambiguos (requieren el modal)",
    preview.teams.ambiguous.map((item) => item.name),
  );

  console.log(`\nSin cambios: ${preview.unchanged}`);
  if (preview.teamsError) {
    console.log(`Listas no se pudo leer: ${preview.teamsError}`);
  }
  if (preview.warnings.length) {
    list("Avisos", preview.warnings);
  }

  if (!apply) {
    console.log("\nDry run. Volvé a correr con --apply para escribir.");
    return;
  }

  const result = await runPeopleSync(
    "manual",
    createTeams ? { create: preview.teams.created, aliases: [] } : undefined,
    { skipDeletes: true },
  );

  console.log(`\nEstado: ${result.status}`);
  console.log(
    `creados ${result.created}, actualizados ${result.updated}, restaurados ${result.restored}, eliminados ${result.deleted}, sin cambios ${result.unchanged}, descartados ${result.skippedRows}, equipos ${result.teamsCreated}`,
  );
  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
  }
  if (result.warnings.length) {
    list("Avisos", result.warnings);
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
