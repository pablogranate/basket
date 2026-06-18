import {
  RELATOS_DISPLAY_LABEL,
  RESPONSIBLE_DISPLAY_LABEL,
} from "@/lib/constants";
import type { AppRole } from "@/lib/database.types";
import type { PersonListItem } from "@/lib/types";

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  Responsable: RESPONSIBLE_DISPLAY_LABEL,
  Realizador: "Realizador",
  Productor: "Productor",
  "Operador de Control": "Operador de control",
  "Operador de Grafica": "Operador de gráfica",
  "Soporte tecnico": "Soporte técnico",
  "Comentario 1": "Comentario 1",
  "Comentario 2": "Comentario 2",
  Encoder: "Encoder",
  Ingenieria: "Ingeniería",
  "Camara 1": "Cámara 1",
  "Camara 2": "Cámara 2",
  "Camara 3": "Cámara 3",
  "Camara 4": "Cámara 4",
  "Camara 5": "Cámara 5",
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  Coordinacion: "Coordinación",
  Produccion: "Producción",
  Talento: RELATOS_DISPLAY_LABEL,
  Transmision: "Transmisión",
  Camaras: "Cámaras",
};

const FUNCTION_DISPLAY_NAMES: Record<string, string> = {
  Responsable: RESPONSIBLE_DISPLAY_LABEL,
  Realizador: "Realizador",
  "Operador de Control": "Operador de control",
  "Operador de Grafica": "Operador de gráfica",
  "Soporte tecnico": "Soporte técnico",
  Productor: "Productor",
  Relator: "Relator",
  Comentario: "Comentario",
  Campo: "Campo",
  Encoder: "Encoder",
  Ingenieria: "Ingeniería",
  Camara: "Cámara",
};

const ASSIGNMENT_STATE_DISPLAY_NAMES: Record<PersonListItem["assignment_state"], string> = {
  "En asignacion": "En asignación",
  Disponible: "Disponible",
  Inactivo: "Inactivo",
};

export const APP_ROLE_DISPLAY_NAMES: Record<AppRole, string> = {
  admin: "Admin",
  editor: "Productor",
  coordinator: "Productor",
  collaborator: "Externo",
  viewer: "Externo",
};

export function getRoleDisplayName(value?: string | null) {
  if (!value) {
    return "";
  }

  return ROLE_DISPLAY_NAMES[value] ?? value;
}

export function getRoleCategoryDisplayName(value?: string | null) {
  if (!value) {
    return "";
  }

  return CATEGORY_DISPLAY_NAMES[value] ?? value;
}

export function getAssignmentStateDisplayName(
  value: PersonListItem["assignment_state"],
) {
  return ASSIGNMENT_STATE_DISPLAY_NAMES[value] ?? value;
}

export function getFunctionDisplayName(value?: string | null) {
  if (!value) {
    return "";
  }

  return FUNCTION_DISPLAY_NAMES[value] ?? value;
}

export function getAppRoleDisplayName(value?: AppRole | null) {
  if (!value) {
    return "Externo";
  }

  return APP_ROLE_DISPLAY_NAMES[value] ?? value;
}

export function getCompactPersonName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length <= 1 || name === "TBD") {
    return name;
  }

  const surnameCandidate =
    parts.length >= 3 ? parts[1] : parts[parts.length - 1];

  return `${parts[0]?.[0]?.toUpperCase() ?? ""}. ${surnameCandidate}`;
}

export function normalizeRoleNameInput(value: string) {
  const normalized = value.trim();
  const reverseMap = new Map(
    Object.entries(ROLE_DISPLAY_NAMES).map(([rawValue, displayValue]) => [
      displayValue.toLowerCase(),
      rawValue,
    ]),
  );

  return reverseMap.get(normalized.toLowerCase()) ?? normalized;
}

export function normalizeRoleCategoryInput(value: string) {
  const normalized = value.trim();
  const reverseMap = new Map(
    Object.entries(CATEGORY_DISPLAY_NAMES).map(([rawValue, displayValue]) => [
      displayValue.toLowerCase(),
      rawValue,
    ]),
  );

  return reverseMap.get(normalized.toLowerCase()) ?? normalized;
}
