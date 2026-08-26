// The funciones a self-signup applicant can declare. Deliberately a separate
// vocabulary from the `roles` table: the grilla depends on those exact rows, so
// this list routes the notification email and nothing else. The approver picks
// the real grid role, pre-selected through FUNCION_ROLE_NAME below.
export const ACCESS_REQUEST_FUNCIONES = [
  "Relator",
  "Comentarista",
  "Operador de Control",
  "Soporte Tecnico",
  "Responsable de Cancha",
  "Realizador",
  "Camarografo",
] as const;

export type AccessRequestFuncion = (typeof ACCESS_REQUEST_FUNCIONES)[number];

export function isAccessRequestFuncion(
  value: string,
): value is AccessRequestFuncion {
  return (ACCESS_REQUEST_FUNCIONES as readonly string[]).includes(value);
}

// Pre-selection only — the approver can pick any active role. Camarografo maps
// to Camara 1 because a camarógrafo can be any of the five and someone has to
// be the default.
export const FUNCION_ROLE_NAME: Record<AccessRequestFuncion, string> = {
  Relator: "Relator",
  Comentarista: "Comentario 1",
  "Operador de Control": "Operador de Control",
  "Soporte Tecnico": "Soporte tecnico",
  "Responsable de Cancha": "Campo",
  Realizador: "Realizador",
  Camarografo: "Camara 1",
};

export const ACCESS_REQUEST_STATUSES = [
  "pendiente",
  "aprobada",
  "rechazada",
] as const;

export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];
