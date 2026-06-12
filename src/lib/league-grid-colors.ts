export type GridLeagueColor = {
  background: string;
  text: string;
};

// League fill colors copied once from the source Google Sheet
// ("Grilla Producción 25/26", column D conditional formatting). Not synced.
// Keys are normalized league names (see normalizeLeagueName below).
const GRID_LEAGUE_COLORS: Record<string, string> = {
  "liga federal": "#e8811a",
  "liga nacional": "#e12121",
  "liga argentina": "#0a53a8",
  "liga proximo": "#2eac28",
  "liga femenina": "#c14588",
  "liga endesa (acb)": "#c6dbe1",
  "liga italiana (lba)": "#2b82d9",
  euroliga: "#7bb824",
  "liga chery": "#bfe1f6",
  "lpb fem ecuador": "#c076aa",
  exterior: "#ffcfc9",
  nbb: "#007520",
  bcla: "#00ffd0",
  "pre metropolina": "#ffe5a0",
};

function normalizeLeagueName(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replaceAll(/\s+/g, " ");
}

function pickReadableText(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

export function getGridLeagueColor(
  competition: string | null | undefined,
): GridLeagueColor | null {
  if (!competition) {
    return null;
  }

  const background = GRID_LEAGUE_COLORS[normalizeLeagueName(competition)];

  if (!background) {
    return null;
  }

  return { background, text: pickReadableText(background) };
}
