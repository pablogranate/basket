import {
  getProductionModeLabel,
  normalizeCommentaryPlan,
  RESPONSIBLE_DISPLAY_LABEL,
} from "@/lib/constants";
import { formatMatchDate, formatMatchTimeLabel } from "@/lib/date";
import type { MatchListItem } from "@/lib/types";

export type GridExportRow = {
  Dia: string;
  Produccion: string;
  ID: string;
  Liga: string;
  Partido: string;
  Hora: string;
  Responsable: string;
  Realizador: string;
  "Operador de Grafica": string;
  "Camara 1": string;
  "Camara 2": string;
  "Camara 3": string;
  "Camara 4": string;
  "Camara 5": string;
  "Relatos/Comentarios": string;
  Relator: string;
  "Comentarista 1": string;
  "Comentarista 2": string;
  "Operador de Control": string;
  "Soporte tecnico": string;
  Transporte: string;
  Observacion: string;
};

export const GRID_EXPORT_COLUMNS: Array<{
  key: keyof GridExportRow;
  label: string;
}> = [
  { key: "Dia", label: "Dia" },
  { key: "Produccion", label: "Produccion" },
  { key: "ID", label: "ID Plataforma" },
  { key: "Liga", label: "Liga" },
  { key: "Partido", label: "Partido" },
  { key: "Hora", label: "Hora" },
  { key: "Responsable", label: RESPONSIBLE_DISPLAY_LABEL },
  { key: "Realizador", label: "Realizador" },
  { key: "Operador de Grafica", label: "Operador de Grafica" },
  { key: "Camara 1", label: "Camara 1" },
  { key: "Camara 2", label: "Camara 2" },
  { key: "Camara 3", label: "Camara 3" },
  { key: "Camara 4", label: "Camara 4" },
  { key: "Camara 5", label: "Camara 5" },
  { key: "Relatos/Comentarios", label: "Relatos/Comentarios" },
  { key: "Relator", label: "Relator" },
  { key: "Comentarista 1", label: "Comentarista 1" },
  { key: "Comentarista 2", label: "Comentarista 2" },
  { key: "Operador de Control", label: "Operador de Control" },
  { key: "Soporte tecnico", label: "Soporte tecnico" },
  { key: "Transporte", label: "Transporte" },
  { key: "Observacion", label: "Observacion" },
] as const;

export function getAssignmentName(
  match: MatchListItem,
  roleName: string,
  fallback = "Sin asignar",
) {
  const assignment = match.assignments.find((item) => item.role.name === roleName);
  return assignment?.person?.full_name ?? fallback;
}

export function toExportRows(matches: MatchListItem[]): GridExportRow[] {
  return matches.map((match) => ({
    Dia: formatMatchDate(match.kickoff_at, match.timezone, "dd/MM/yyyy"),
    Produccion: getProductionModeLabel(match.production_mode) || "Sin definir",
    ID: match.production_code ?? "",
    Liga: match.competition ?? "",
    Partido: `${match.home_team} vs ${match.away_team}`,
    Hora: formatMatchTimeLabel(match.kickoff_at, match.timezone),
    Responsable:
      getAssignmentName(
        match,
        "Responsable",
        match.owner?.full_name ?? "Sin asignar",
      ),
    Realizador: getAssignmentName(match, "Realizador"),
    "Operador de Grafica": getAssignmentName(match, "Operador de Grafica"),
    "Camara 1": getAssignmentName(match, "Camara 1"),
    "Camara 2": getAssignmentName(match, "Camara 2"),
    "Camara 3": getAssignmentName(match, "Camara 3"),
    "Camara 4": getAssignmentName(match, "Camara 4"),
    "Camara 5": getAssignmentName(match, "Camara 5"),
    "Relatos/Comentarios":
      normalizeCommentaryPlan(match.commentary_plan) || "Sin definir",
    Relator: getAssignmentName(match, "Relator"),
    "Comentarista 1": getAssignmentName(match, "Comentario 1"),
    "Comentarista 2": getAssignmentName(match, "Comentario 2"),
    "Operador de Control": getAssignmentName(match, "Operador de Control"),
    "Soporte tecnico": getAssignmentName(match, "Soporte tecnico"),
    Transporte: match.transport?.trim() || "Sin definir",
    Observacion: match.notes?.trim() || "",
  }));
}
