// Shared with the sheet-driven team creation in `src/lib/people/teams-from-listas.ts`
// so both paths mint the same slug for the same name.
export function slugifyTeamValue(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}
