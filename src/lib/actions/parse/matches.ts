import { parsed, type ParseResult } from "@/lib/actions/define-action";
import {
  MATCH_STATUS_OPTIONS,
  normalizeProductionMode,
} from "@/lib/constants";
import { maybeNull, pickFirstString } from "@/lib/utils";

export const STAFF_ROLE_FIELD_MAP = [
  {
    fields: ["responsableId", "responsableEnCanchaId", "ownerId"],
    roleName: "Responsable",
  },
  { fields: ["realizadorId"], roleName: "Realizador" },
  {
    fields: ["graphicsOperatorId", "graficaId"],
    roleName: "Operador de Grafica",
  },
  {
    fields: ["controlOperatorId", "controlId"],
    roleName: "Operador de Control",
  },
  { fields: ["supportTechId", "soporteId"], roleName: "Soporte tecnico" },
  { fields: ["camera1Id", "camara1Id"], roleName: "Camara 1" },
  { fields: ["camera2Id", "camara2Id"], roleName: "Camara 2" },
  { fields: ["camera3Id", "camara3Id"], roleName: "Camara 3" },
  { fields: ["camera4Id", "camara4Id"], roleName: "Camara 4" },
  { fields: ["camera5Id", "camara5Id"], roleName: "Camara 5" },
  { fields: ["relatorId"], roleName: "Relator" },
  {
    fields: ["commentator1Id", "comentario1Id"],
    roleName: "Comentario 1",
  },
  {
    fields: ["commentator2Id", "comentario2Id"],
    roleName: "Comentario 2",
  },
] as const;

export type StaffRoleName = (typeof STAFF_ROLE_FIELD_MAP)[number]["roleName"];

export type StaffSelection = {
  roleName: StaffRoleName;
  personId: string | null;
};

export function collectStaffSelections(formData: FormData): StaffSelection[] {
  return STAFF_ROLE_FIELD_MAP.map(({ fields, roleName }) => ({
    personId: maybeNull(
      pickFirstString(fields.map((field) => formData.get(field))),
    ),
    roleName,
  }));
}

export type MatchStatus = (typeof MATCH_STATUS_OPTIONS)[number];

export function assertMatchStatus(value: string): MatchStatus {
  if (!MATCH_STATUS_OPTIONS.includes(value as MatchStatus)) {
    return "Pendiente";
  }

  return value as MatchStatus;
}

export function assertProductionMode(value: string) {
  return normalizeProductionMode(value);
}

export function getGridRedirectForCreatedMatch(params: {
  fallback: string;
  date: string;
  timezone: string;
}) {
  const url = new URL(params.fallback, "http://localhost");

  url.pathname = "/grid";
  url.searchParams.set("view", "day");

  // Trim here, not in parseMatchFormFields: buildKickoffAt must keep seeing
  // the raw values for byte-identical validation behaviour.
  const date = params.date.trim();
  const timezone = params.timezone.trim();

  if (date) {
    url.searchParams.set("date", date);
  }

  if (timezone) {
    url.searchParams.set("timezone", timezone);
  }

  for (const key of ["q", "league", "mode", "status", "owner", "intent", "notice"]) {
    url.searchParams.delete(key);
  }

  return `${url.pathname}${url.search}`;
}

type MatchFormFields = {
  date: string;
  time: string;
  timezone: string;
  competition: string | null;
  productionMode: ReturnType<typeof normalizeProductionMode>;
  status: MatchStatus;
  homeTeam: string;
  awayTeam: string;
  venue: string | null;
  durationMinutes: number;
  ownerId: string | null;
  notes: string | null;
  staffSelections: StaffSelection[];
};

function getCreateOwnerId(formData: FormData) {
  return maybeNull(
    pickFirstString([
      formData.get("responsableId"),
      formData.get("responsableEnCanchaId"),
      formData.get("ownerId"),
    ]),
  );
}

function parseMatchFormFields(formData: FormData): MatchFormFields {
  return {
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    competition: maybeNull(String(formData.get("competition") ?? "")),
    productionMode: assertProductionMode(
      String(formData.get("productionMode") ?? ""),
    ),
    status: assertMatchStatus(String(formData.get("status") ?? "Pendiente")),
    homeTeam: String(formData.get("homeTeam") ?? "").trim(),
    awayTeam: String(formData.get("awayTeam") ?? "").trim(),
    venue: maybeNull(String(formData.get("venue") ?? "")),
    durationMinutes: Number(formData.get("durationMinutes") ?? 150),
    ownerId: getCreateOwnerId(formData),
    notes: maybeNull(String(formData.get("notes") ?? "")),
    staffSelections: collectStaffSelections(formData),
  };
}

export type CreateMatchInput = MatchFormFields & {
  productionCode: string | null;
  commentaryPlan: string | null;
  transport: string | null;
};

export function parseCreateMatch(
  formData: FormData,
): ParseResult<CreateMatchInput> {
  return parsed({
    ...parseMatchFormFields(formData),
    productionCode: maybeNull(String(formData.get("productionCode") ?? "")),
    commentaryPlan: maybeNull(String(formData.get("commentaryPlan") ?? "")),
    transport: maybeNull(String(formData.get("transport") ?? "")),
  });
}

export type UpdateMatchInput = MatchFormFields & {
  matchId: string;
  hasProductionCode: boolean;
  productionCode: string | null;
  hasCommentaryPlan: boolean;
  commentaryPlan: string | null;
  hasTransport: boolean;
  transport: string | null;
};

export function parseUpdateMatch(
  formData: FormData,
): ParseResult<UpdateMatchInput> {
  return parsed({
    ...parseMatchFormFields(formData),
    matchId: String(formData.get("matchId") ?? ""),
    hasProductionCode: formData.has("productionCode"),
    productionCode: maybeNull(String(formData.get("productionCode") ?? "")),
    hasCommentaryPlan: formData.has("commentaryPlan"),
    commentaryPlan: maybeNull(String(formData.get("commentaryPlan") ?? "")),
    hasTransport: formData.has("transport"),
    transport: maybeNull(String(formData.get("transport") ?? "")),
  });
}

export type QuickUpdateMatchFieldInput = {
  matchId: string;
  field: string;
  rawValue: string;
};

export function parseQuickUpdateMatchField(
  formData: FormData,
): ParseResult<QuickUpdateMatchFieldInput> {
  return parsed({
    matchId: String(formData.get("matchId") ?? ""),
    field: String(formData.get("field") ?? ""),
    rawValue: String(formData.get("value") ?? "").trim(),
  });
}

export type DeleteMatchInput = { matchId: string };

export function parseDeleteMatch(
  formData: FormData,
): ParseResult<DeleteMatchInput> {
  return parsed({ matchId: String(formData.get("matchId") ?? "") });
}

export type SetAttendanceConfirmationInput = {
  assignmentId: string;
  response: "attending" | "declined" | null;
  note: string | null;
  // Present only on the two roles that report the encoder (Responsable de
  // cancha / Soporte tecnico); absent fields leave stored numbers untouched.
  encoder: { encoderNumber1: string; encoderNumber2: string } | null;
};

export function parseSetAttendanceConfirmation(
  formData: FormData,
): ParseResult<SetAttendanceConfirmationInput> {
  const rawResponse = String(formData.get("response") ?? "");
  const hasEncoderFields =
    formData.has("encoderNumber1") || formData.has("encoderNumber2");

  return parsed({
    assignmentId: String(formData.get("assignmentId") ?? ""),
    response:
      rawResponse === "attending" || rawResponse === "declined"
        ? rawResponse
        : null,
    note: maybeNull(String(formData.get("note") ?? "")),
    encoder: hasEncoderFields
      ? {
          encoderNumber1: String(formData.get("encoderNumber1") ?? ""),
          encoderNumber2: String(formData.get("encoderNumber2") ?? ""),
        }
      : null,
  });
}

export type SetEncoderNumbersInput = {
  assignmentId: string;
  encoderNumber1: string;
  encoderNumber2: string;
};

export function parseSetEncoderNumbers(
  formData: FormData,
): ParseResult<SetEncoderNumbersInput> {
  return parsed({
    assignmentId: String(formData.get("assignmentId") ?? ""),
    encoderNumber1: String(formData.get("encoderNumber1") ?? ""),
    encoderNumber2: String(formData.get("encoderNumber2") ?? ""),
  });
}

export type UpsertAssignmentInput = {
  matchId: string;
  roleId: string;
  personId: string | null;
  confirmed: boolean;
  notes: string | null;
};

export function parseUpsertAssignment(
  formData: FormData,
): ParseResult<UpsertAssignmentInput> {
  return parsed({
    matchId: String(formData.get("matchId") ?? ""),
    roleId: String(formData.get("roleId") ?? ""),
    personId: maybeNull(String(formData.get("personId") ?? "")),
    confirmed: String(formData.get("confirmed") ?? "") === "on",
    notes: maybeNull(String(formData.get("notes") ?? "")),
  });
}
