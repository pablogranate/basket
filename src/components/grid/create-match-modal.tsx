"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Mail,
  MapPin,
  MessageCircleMore,
  Mic2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

import {
  createMatchAction,
  deleteMatchAction,
  updateMatchAction,
} from "@/app/actions/matches";
import { LeagueLogoMarkClient } from "@/components/league-logo-mark-client";
import { ClientTeamLogoMark } from "@/components/team-logo-mark-client";
import { Button } from "@/components/ui/button";
import { HoverAvatarBadge } from "@/components/ui/hover-avatar-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { ALL_CLUB_OPTIONS, CLUB_COMPETITIONS } from "@/lib/club-catalog";
import {
  COMMENTARY_PLAN_OPTIONS,
  DEFAULT_MATCH_DURATION_MINUTES,
  DEFAULT_TIMEZONE,
  normalizeCommentaryPlan,
  PRODUCTION_MODE_OPTIONS,
  RESPONSIBLE_DISPLAY_LABEL,
} from "@/lib/constants";
import { formatMatchDate, formatMatchTime } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import { getTeamCompetitionByName, getTeamVenueByName } from "@/lib/team-directory";
import type { PersonRow } from "@/lib/database.types";
import { type PersonFunctionKey, peopleAssignableTo } from "@/lib/functions";
import type { MatchEditPrefill } from "@/lib/types";
import { buildWhatsAppUrl, cn } from "@/lib/utils";

const CORE_REQUIRED_FIELDS = [
  "productionCode",
  "competition",
  "homeTeam",
  "awayTeam",
  "date",
  "time",
  "productionMode",
  "venue",
] as const;

const CORE_FIELD_LABELS: Record<(typeof CORE_REQUIRED_FIELDS)[number], string> = {
  productionCode: "Producción",
  competition: "Liga",
  homeTeam: "Local",
  awayTeam: "Visitante",
  date: "Día",
  time: "Hora",
  productionMode: "Producción",
  venue: "Sede",
};

type MatchModalPerson = Pick<PersonRow, "id" | "full_name" | "phone" | "email"> & {
  functions: PersonFunctionKey[];
};

type CreateMatchModalProps = {
  people: MatchModalPerson[];
  redirectTo: string;
  canEdit: boolean;
  initialDate: string;
  match?: MatchEditPrefill;
  triggerVariant?: "primary" | "icon";
  triggerClassName?: string;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
};

type MatchIntakeFields = {
  productionCode: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  time: string;
  productionMode: string;
  status: string;
  venue: string;
  durationMinutes: string;
  responsableId: string;
  realizadorId: string;
  graficaId: string;
  camara1Id: string;
  camara2Id: string;
  camara3Id: string;
  camara4Id: string;
  camara5Id: string;
  commentaryPlan: string;
  relatorId: string;
  comentario1Id: string;
  comentario2Id: string;
  controlId: string;
  soporteId: string;
  transport: string;
  notes: string;
};

const CAMERA_FIELD_CONFIGS = [
  { label: "Cámara 1", name: "camara1Id" },
  { label: "Cámara 2", name: "camara2Id" },
  { label: "Cámara 3", name: "camara3Id" },
  { label: "Cámara 4", name: "camara4Id" },
  { label: "Cámara 5", name: "camara5Id" },
] as const;

const IDENTIFICATION_FIELDS = [
  "productionCode",
  "competition",
  "homeTeam",
  "awayTeam",
  "date",
  "time",
  "venue",
] as const;

const CONTEXT_FIELDS = [
  "productionMode",
  "commentaryPlan",
  "transport",
  "notes",
] as const;

const STAFF_FIELDS = [
  "responsableId",
  "realizadorId",
  "graficaId",
  "controlId",
  "soporteId",
  "relatorId",
] as const;

const ADVANCED_FIELDS = [
  "camara1Id",
  "camara2Id",
  "camara3Id",
  "camara4Id",
  "camara5Id",
  "comentario1Id",
  "comentario2Id",
] as const;

// Maps each staff form field to the capability a person must hold to be
// offered for it. Drives the strict dropdown filter; mirrors the server guard
// in src/app/actions/matches.ts.
const FIELD_FUNCTION_KEYS: Partial<Record<keyof MatchIntakeFields, PersonFunctionKey>> = {
  responsableId: "Responsable",
  realizadorId: "Realizador",
  graficaId: "Operador de Grafica",
  controlId: "Operador de Control",
  soporteId: "Soporte tecnico",
  relatorId: "Relator",
  camara1Id: "Camara",
  camara2Id: "Camara",
  camara3Id: "Camara",
  camara4Id: "Camara",
  camara5Id: "Camara",
  comentario1Id: "Comentario",
  comentario2Id: "Comentario",
};

const NOTIFICATION_ROLE_FIELDS = [
  { field: "responsableId", label: RESPONSIBLE_DISPLAY_LABEL },
  { field: "realizadorId", label: "Realizador" },
  { field: "graficaId", label: "Operador de gráfica" },
  { field: "controlId", label: "Operador de control" },
  { field: "soporteId", label: "Soporte técnico" },
  { field: "relatorId", label: "Relator" },
  { field: "comentario1Id", label: "Comentario 1" },
  { field: "comentario2Id", label: "Comentario 2" },
  { field: "camara1Id", label: "Cámara 1" },
  { field: "camara2Id", label: "Cámara 2" },
  { field: "camara3Id", label: "Cámara 3" },
  { field: "camara4Id", label: "Cámara 4" },
  { field: "camara5Id", label: "Cámara 5" },
] as const;

type NotificationRecipient = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  emailHref: string;
  whatsappHref: string;
  message: string;
};

const MATCH_PREVIEW_EXAMPLE = {
  competition: "Liga Nacional",
  homeTeam: "Bochas Sport Club",
  awayTeam: "River Plate",
  date: "2026-03-05",
  time: "19:00",
  venue: "Luis Conde, Buenos Aires",
  roles: {
    [RESPONSIBLE_DISPLAY_LABEL]: "Juan Pérez",
    Realizador: "Mauro Ruiz",
    Relatos: "Leonardo Chianese",
    Produ: "TV",
  },
  assignedPeopleCount: 3,
} as const;

function getVisibleCameraCount(fields: MatchIntakeFields) {
  const highestFilledIndex = CAMERA_FIELD_CONFIGS.reduce((highest, field, index) => {
    return fields[field.name].trim() ? index + 1 : highest;
  }, 0);

  return Math.max(2, highestFilledIndex);
}

function countCompletedFields<
  TFieldName extends keyof MatchIntakeFields,
>(fields: MatchIntakeFields, fieldNames: readonly TFieldName[]) {
  return fieldNames.reduce(
    (count, fieldName) => count + Number(Boolean(fields[fieldName].trim())),
    0,
  );
}

function formatDraftDateLabel(date: string) {
  if (!date) {
    return "Sin fecha";
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "short",
  })
    .format(parsed)
    .replaceAll(".", "");
}

function formatDraftTimeLabel(time: string) {
  return time.trim() || "--:--";
}

function shouldShowAdvancedByDefault(fields: MatchIntakeFields) {
  return ADVANCED_FIELDS.some((fieldName) => fields[fieldName].trim());
}

function getAssignedPeopleCount(fields: MatchIntakeFields) {
  return new Set(
    [
      fields.responsableId,
      fields.realizadorId,
      fields.graficaId,
      fields.controlId,
      fields.soporteId,
      fields.relatorId,
      fields.comentario1Id,
      fields.comentario2Id,
      fields.camara1Id,
      fields.camara2Id,
      fields.camara3Id,
      fields.camara4Id,
      fields.camara5Id,
    ].filter(Boolean),
  ).size;
}

function getInitials(value: string) {
  const parts = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "?";
  }

  return parts
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function buildInitialFields(initialDate: string): MatchIntakeFields {
  return {
    productionCode: "",
    competition: "",
    homeTeam: "",
    awayTeam: "",
    date: initialDate,
    time: "19:00",
    productionMode: "",
    status: "Pendiente",
    venue: "",
    durationMinutes: String(DEFAULT_MATCH_DURATION_MINUTES),
    responsableId: "",
    realizadorId: "",
    graficaId: "",
    camara1Id: "",
    camara2Id: "",
    camara3Id: "",
    camara4Id: "",
    camara5Id: "",
    commentaryPlan: "",
    relatorId: "",
    comentario1Id: "",
    comentario2Id: "",
    controlId: "",
    soporteId: "",
    transport: "No aplica",
    notes: "",
  };
}

function getAssignedPersonId(match: MatchEditPrefill, roleName: string) {
  return match.assignedPersonByRole[roleName] ?? "";
}

function normalizeTransportFieldValue(value?: string | null) {
  const normalized = value?.trim();

  if (!normalized) {
    return "No aplica";
  }

  const lowerValue = normalized.toLowerCase();

  if (
    lowerValue === "x" ||
    lowerValue === "n/a" ||
    lowerValue === "na" ||
    lowerValue === "no aplica"
  ) {
    return "No aplica";
  }

  return normalized;
}

function buildFieldsFromMatch(match: MatchEditPrefill): MatchIntakeFields {
  return {
    productionCode: match.production_code ?? "",
    competition: match.competition ?? "",
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    date: formatMatchDate(match.kickoff_at, match.timezone, "yyyy-MM-dd"),
    time: formatMatchTime(match.kickoff_at, match.timezone, "HH:mm"),
    productionMode: match.production_mode ?? "",
    status: match.status ?? "Pendiente",
    venue: match.venue ?? "",
    durationMinutes: String(
      match.duration_minutes ?? DEFAULT_MATCH_DURATION_MINUTES,
    ),
    responsableId:
      getAssignedPersonId(match, "Responsable") || match.ownerId || "",
    realizadorId: getAssignedPersonId(match, "Realizador"),
    graficaId: getAssignedPersonId(match, "Operador de Grafica"),
    camara1Id: getAssignedPersonId(match, "Camara 1"),
    camara2Id: getAssignedPersonId(match, "Camara 2"),
    camara3Id: getAssignedPersonId(match, "Camara 3"),
    camara4Id: getAssignedPersonId(match, "Camara 4"),
    camara5Id: getAssignedPersonId(match, "Camara 5"),
    commentaryPlan: normalizeCommentaryPlan(match.commentary_plan),
    relatorId: getAssignedPersonId(match, "Relator"),
    comentario1Id: getAssignedPersonId(match, "Comentario 1"),
    comentario2Id: getAssignedPersonId(match, "Comentario 2"),
    controlId: getAssignedPersonId(match, "Operador de Control"),
    soporteId: getAssignedPersonId(match, "Soporte tecnico"),
    transport: normalizeTransportFieldValue(match.transport),
    notes: match.notes ?? "",
  };
}

function SectionBlock({
  step,
  title,
  status,
  children,
}: {
  step: string;
  title: string;
  status?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-6 py-6 shadow-[var(--shadow-lift)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[0.98rem] font-extrabold uppercase tracking-[0.2em] text-[var(--n-400)]">
            {step}. {title}
          </p>
        </div>
        {status ? (
          <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-600)]">
            {status}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function LabeledField({
  label,
  required,
  alert,
  children,
}: {
  label: string;
  required?: boolean;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="flex items-center gap-2 text-[0.82rem] font-semibold text-[var(--n-600)]">
        {label}
        {required ? <span className="text-[var(--accent)]">*</span> : null}
        {alert ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
            Falta
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function PersonSelectField({
  label,
  name,
  value,
  people,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  people: MatchModalPerson[];
  onChange: (name: keyof MatchIntakeFields, value: string) => void;
}) {
  const functionKey = FIELD_FUNCTION_KEYS[name as keyof MatchIntakeFields] ?? null;
  const assignablePeople = peopleAssignableTo(people, functionKey);

  return (
    <LabeledField label={label}>
      <Select
        name={name}
        value={value}
        onChange={(event) =>
          onChange(name as keyof MatchIntakeFields, event.target.value)
        }
      >
        <option value="">Sin asignar</option>
        {assignablePeople.map((person) => (
          <option key={person.id} value={person.id}>
            {person.full_name}
          </option>
        ))}
      </Select>
    </LabeledField>
  );
}

function buildNotificationSubject(fields: MatchIntakeFields) {
  const homeTeam = fields.homeTeam.trim() || "Equipo local";
  const awayTeam = fields.awayTeam.trim() || "Equipo visitante";
  return `Convocatoria · ${homeTeam} vs ${awayTeam}`;
}

function buildNotificationMessage(params: {
  fields: MatchIntakeFields;
  personName?: string | null;
  roles?: string[];
}) {
  const homeTeam = params.fields.homeTeam.trim() || "Equipo local";
  const awayTeam = params.fields.awayTeam.trim() || "Equipo visitante";
  const league = params.fields.competition.trim() || "Sin liga";
  const venue = params.fields.venue.trim() || "Sede por definir";
  const productionMode = params.fields.productionMode.trim() || "Sin definir";
  const recipientName = params.personName?.trim() || "equipo";
  const rolesLabel = params.roles?.length ? params.roles.join(", ") : "equipo asignado";
  const appUrl =
    typeof window !== "undefined" ? `${window.location.origin}/mi-jornada` : "/mi-jornada";

  return [
    `Hola ${recipientName},`,
    "",
    `Has sido convocado para ${homeTeam} vs ${awayTeam}.`,
    `Rol asignado: ${rolesLabel}.`,
    "",
    `Liga: ${league}`,
    `Fecha: ${formatDraftDateLabel(params.fields.date)}`,
    `Hora: ${formatDraftTimeLabel(params.fields.time)}`,
    `Lugar: ${venue}`,
    `Produ: ${productionMode}`,
    "",
    `Por favor confirma tu disponibilidad respondiendo este mensaje o revisando tu asignación en el portal: ${appUrl}`,
  ].join("\n");
}

function buildNotificationMailtoHref(params: {
  email: string | null;
  fields: MatchIntakeFields;
  personName?: string | null;
  roles?: string[];
}) {
  if (!params.email) {
    return "";
  }

  const query = new URLSearchParams({
    subject: buildNotificationSubject(params.fields),
    body: buildNotificationMessage({
      fields: params.fields,
      personName: params.personName,
      roles: params.roles,
    }),
  });

  return `mailto:${params.email}?${query.toString()}`;
}

function buildBulkNotificationMailtoHref(params: {
  emails: string[];
  fields: MatchIntakeFields;
}) {
  const recipients = [...new Set(params.emails.map((email) => email.trim()).filter(Boolean))];

  if (!recipients.length) {
    return "";
  }

  const query = new URLSearchParams({
    bcc: recipients.join(","),
    subject: buildNotificationSubject(params.fields),
    body: buildNotificationMessage({ fields: params.fields }),
  });

  return `mailto:?${query.toString()}`;
}

function buildNotificationWhatsAppHref(params: {
  phone: string | null;
  fields: MatchIntakeFields;
  personName?: string | null;
  roles?: string[];
}) {
  const baseUrl = buildWhatsAppUrl(params.phone);

  if (!baseUrl) {
    return "";
  }

  return `${baseUrl}?text=${encodeURIComponent(
    buildNotificationMessage({
      fields: params.fields,
      personName: params.personName,
      roles: params.roles,
    }),
  )}`;
}

async function copyToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function CreateMatchModal({
  people,
  redirectTo,
  canEdit,
  initialDate,
  match,
  triggerVariant = "primary",
  triggerClassName,
  triggerLabel,
  triggerIcon,
}: CreateMatchModalProps) {
  const isEditing = Boolean(match);
  const defaultFields = useMemo(
    () => (match ? buildFieldsFromMatch(match) : buildInitialFields(initialDate)),
    [initialDate, match],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [fields, setFields] = useState<MatchIntakeFields>(defaultFields);
  const [competitionTouched, setCompetitionTouched] = useState(false);
  const [venueTouched, setVenueTouched] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(() =>
    shouldShowAdvancedByDefault(defaultFields),
  );
  const [copiedNotificationKey, setCopiedNotificationKey] = useState<string | null>(null);
  const [visibleCameraCount, setVisibleCameraCount] = useState(() =>
    getVisibleCameraCount(defaultFields),
  );
  const [lastDefaultFields, setLastDefaultFields] = useState(defaultFields);

  if (defaultFields !== lastDefaultFields) {
    setLastDefaultFields(defaultFields);
    setFields(defaultFields);
    setVisibleCameraCount(getVisibleCameraCount(defaultFields));
    setShowAdvanced(shouldShowAdvancedByDefault(defaultFields));
  }

  useEffect(() => {
    // SSR-safe portal gate: document is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);

    return () => {
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const missingFields = CORE_REQUIRED_FIELDS.filter((field) => !fields[field].trim());
  const highlightedMissingFields = missingFields;
  const missingFieldLabels = missingFields.map(
    (field) => CORE_FIELD_LABELS[field],
  );

  const fieldSurfaceClass = "h-[54px] bg-[var(--background-soft)] text-[15px]";
  const missingFieldClass =
    "border-[var(--accent-border)] bg-[var(--accent-soft)] focus:border-[var(--accent)] focus:ring-[rgba(227,27,35,0.12)]";

  const peopleOptions = useMemo(
    () =>
      [...people].sort((left, right) =>
        left.full_name.localeCompare(right.full_name, "es"),
      ),
    [people],
  );
  const competitionOptions = useMemo(() => {
    const options = new Set<string>(CLUB_COMPETITIONS);

    if (fields.competition.trim()) {
      options.add(fields.competition.trim());
    }

    return [...options];
  }, [fields.competition]);
  const peopleById = useMemo(
    () => new Map(peopleOptions.map((person) => [person.id, person])),
    [peopleOptions],
  );
  const identificationCompleted = countCompletedFields(fields, IDENTIFICATION_FIELDS);
  const contextCompleted = countCompletedFields(fields, CONTEXT_FIELDS);
  const staffCompleted = countCompletedFields(fields, STAFF_FIELDS);
  const assignedPeopleCount = getAssignedPeopleCount(fields);
  const requiredCompletionRatio = missingFields.length
    ? ((CORE_REQUIRED_FIELDS.length - missingFields.length) / CORE_REQUIRED_FIELDS.length) * 100
    : 100;
  const previewHomeTeamLabel =
    fields.homeTeam.trim() || MATCH_PREVIEW_EXAMPLE.homeTeam;
  const previewAwayTeamLabel =
    fields.awayTeam.trim() || MATCH_PREVIEW_EXAMPLE.awayTeam;
  const previewCompetitionLabel =
    fields.competition.trim() || MATCH_PREVIEW_EXAMPLE.competition;
  const previewVenueLabel =
    fields.venue.trim() || MATCH_PREVIEW_EXAMPLE.venue;
  const previewDateLabel = formatDraftDateLabel(
    fields.date || MATCH_PREVIEW_EXAMPLE.date,
  );
  const previewTimeLabel = formatDraftTimeLabel(
    fields.time || MATCH_PREVIEW_EXAMPLE.time,
  );
  const getPersonRecord = (personId: string) =>
    personId ? peopleById.get(personId) ?? null : null;
  const summaryRoles = [
    {
      label: RESPONSIBLE_DISPLAY_LABEL,
      value:
        getPersonRecord(fields.responsableId)?.full_name ??
        MATCH_PREVIEW_EXAMPLE.roles[RESPONSIBLE_DISPLAY_LABEL],
      initials: getInitials(
        getPersonRecord(fields.responsableId)?.full_name ??
          MATCH_PREVIEW_EXAMPLE.roles[RESPONSIBLE_DISPLAY_LABEL],
      ),
    },
    {
      label: "Realizador",
      value:
        getPersonRecord(fields.realizadorId)?.full_name ??
        MATCH_PREVIEW_EXAMPLE.roles.Realizador,
      initials: getInitials(
        getPersonRecord(fields.realizadorId)?.full_name ??
          MATCH_PREVIEW_EXAMPLE.roles.Realizador,
      ),
    },
    {
      label: "Relatos",
      value:
        getPersonRecord(fields.relatorId)?.full_name ??
        MATCH_PREVIEW_EXAMPLE.roles.Relatos,
      initials: getInitials(
        getPersonRecord(fields.relatorId)?.full_name ??
          MATCH_PREVIEW_EXAMPLE.roles.Relatos,
      ),
    },
    {
      label: "Produ",
      value: fields.productionMode.trim() || MATCH_PREVIEW_EXAMPLE.roles.Produ,
      initials: getInitials(
        fields.productionMode.trim() || MATCH_PREVIEW_EXAMPLE.roles.Produ,
      ),
    },
  ];
  const previewAssignedPeopleCount =
    assignedPeopleCount || MATCH_PREVIEW_EXAMPLE.assignedPeopleCount;
  const notificationRecipients = useMemo(() => {
    const recipientsMap = new Map<string, NotificationRecipient>();

    NOTIFICATION_ROLE_FIELDS.forEach(({ field, label }) => {
      const personId = fields[field];
      const person = personId ? peopleById.get(personId) ?? null : null;

      if (!person) {
        return;
      }

      const existing = recipientsMap.get(person.id);

      if (existing) {
        if (!existing.roles.includes(label)) {
          existing.roles.push(label);
        }
        return;
      }

      recipientsMap.set(person.id, {
        id: person.id,
        fullName: person.full_name,
        phone: person.phone ?? null,
        email: person.email ?? null,
        roles: [label],
        emailHref: "",
        whatsappHref: "",
        message: "",
      });
    });

    return [...recipientsMap.values()]
      .map((recipient) => {
        const roles = recipient.roles.map((role) => getRoleDisplayName(role));
        const message = buildNotificationMessage({
          fields,
          personName: recipient.fullName,
          roles,
        });

        return {
          ...recipient,
          roles,
          emailHref: buildNotificationMailtoHref({
            email: recipient.email,
            fields,
            personName: recipient.fullName,
            roles,
          }),
          whatsappHref: buildNotificationWhatsAppHref({
            phone: recipient.phone,
            fields,
            personName: recipient.fullName,
            roles,
          }),
          message,
        };
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName, "es"));
  }, [fields, peopleById]);
  const batchNotificationMessage = useMemo(
    () => buildNotificationMessage({ fields }),
    [fields],
  );
  const bulkNotificationMailtoHref = useMemo(
    () =>
      buildBulkNotificationMailtoHref({
        emails: notificationRecipients.map((recipient) => recipient.email).filter(Boolean) as string[],
        fields,
      }),
    [fields, notificationRecipients],
  );

  function updateField(name: keyof MatchIntakeFields, value: string) {
    setFields((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleHomeTeamChange(value: string) {
    const suggestedVenue = getTeamVenueByName(value);
    const suggestedCompetition = getTeamCompetitionByName(value);

    setFields((current) => ({
      ...current,
      homeTeam: value,
      venue: venueTouched ? current.venue : suggestedVenue ?? current.venue,
      competition: competitionTouched
        ? current.competition
        : suggestedCompetition ?? current.competition,
    }));
  }

  function resetAndClose() {
    setIsOpen(false);
    setFields(defaultFields);
    setVisibleCameraCount(getVisibleCameraCount(defaultFields));
    setShowAdvanced(shouldShowAdvancedByDefault(defaultFields));
    setCompetitionTouched(false);
    setVenueTouched(false);
    setCopiedNotificationKey(null);
  }

  async function handleCopyNotification(value: string, key: string) {
    try {
      await copyToClipboard(value);
      setCopiedNotificationKey(key);
      window.setTimeout(() => {
        setCopiedNotificationKey((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      setCopiedNotificationKey(null);
    }
  }

  function handleBulkWhatsApp() {
    notificationRecipients
      .filter((recipient) => recipient.whatsappHref)
      .forEach((recipient, index) => {
        window.setTimeout(() => {
          window.open(recipient.whatsappHref, "_blank", "noopener,noreferrer");
        }, index * 180);
      });
  }

  return (
    <>
      {triggerVariant === "icon" ? (
        <button
          type="button"
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-full border border-[var(--n-200)] bg-[var(--n-50)] text-[var(--n-900)] transition hover:border-[rgba(227,27,35,0.24)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
            isOpen &&
              "border-[rgba(227,27,35,0.24)] bg-[var(--accent-soft)] text-[var(--accent)]",
            triggerClassName,
          )}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsOpen(true);
          }}
          disabled={!canEdit}
          aria-label={triggerLabel ?? (isEditing ? "Editar partido" : "Crear partido")}
        >
          {triggerIcon ?? <Plus className="size-4" />}
        </button>
      ) : (
        <Button
          type="button"
          className={cn("h-[52px] gap-2 px-5 text-sm font-extrabold", triggerClassName)}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsOpen(true);
          }}
          disabled={!canEdit}
        >
          {triggerIcon ?? <Plus className="size-4" />}
          {triggerLabel ?? "Crear partido"}
        </Button>
      )}

      {isOpen && isMounted
        ? createPortal(
        <div className="fixed inset-0 z-[300] flex items-start justify-center bg-[rgba(28,13,16,0.48)] px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-8">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={resetAndClose}
          />
          <div className="relative z-[1] flex max-h-[calc(100vh-2rem)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_32px_80px_rgba(28,13,16,0.22)] sm:max-h-[calc(100vh-4rem)]">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:gap-6 sm:px-7 sm:py-6">
                <div className="space-y-2">
                  <div>
                    <h2 className="font-[family-name:var(--font-oswald)] text-3xl font-bold tracking-tight text-[var(--foreground)]">
                      {isEditing ? "Editar partido" : "Crear partido"}
                    </h2>
                  </div>
                </div>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                onClick={resetAndClose}
                aria-label="Cerrar"
              >
                <X className="size-4.5" />
              </button>
            </div>

            <form
              action={isEditing ? updateMatchAction : createMatchAction}
              className="flex min-h-0 flex-1 flex-col"
            >
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input type="hidden" name="timezone" value={DEFAULT_TIMEZONE} />
              {isEditing ? <input type="hidden" name="matchId" value={match?.id} /> : null}

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,24rem)]">
                  <div className="space-y-6">
                    <SectionBlock
                      step="1"
                      title="Identificación"
                      status={`${identificationCompleted}/${IDENTIFICATION_FIELDS.length} listos`}
                    >
                      <div className="grid gap-4 lg:grid-cols-2">
                        <LabeledField
                          label="ID de Produ"
                          required
                          alert={highlightedMissingFields.includes("productionCode")}
                        >
                          <Input
                            name="productionCode"
                            value={fields.productionCode}
                            onChange={(event) =>
                              updateField("productionCode", event.target.value)
                            }
                            placeholder="PRD-EC39-E909"
                            className={cn(
                              fieldSurfaceClass,
                              highlightedMissingFields.includes("productionCode") &&
                                missingFieldClass,
                            )}
                          />
                        </LabeledField>
                        <LabeledField
                          label="Liga"
                          required
                          alert={highlightedMissingFields.includes("competition")}
                        >
                          <Select
                            name="competition"
                            value={fields.competition}
                            onChange={(event) => {
                              setCompetitionTouched(true);
                              updateField("competition", event.target.value);
                            }}
                            className={cn(
                              fieldSurfaceClass,
                              highlightedMissingFields.includes("competition") &&
                                missingFieldClass,
                            )}
                          >
                            <option value="">Selecciona una liga</option>
                            {competitionOptions.map((competition) => (
                              <option key={competition} value={competition}>
                                {competition}
                              </option>
                            ))}
                          </Select>
                        </LabeledField>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <LabeledField
                          label="Equipo local"
                          required
                          alert={highlightedMissingFields.includes("homeTeam")}
                        >
                          <div className="relative">
                            <Input
                              name="homeTeam"
                              list="match-club-catalog"
                              value={fields.homeTeam}
                              onChange={(event) =>
                                handleHomeTeamChange(event.target.value)
                              }
                              placeholder="Nombre del equipo local"
                              className={cn(
                                fieldSurfaceClass,
                                "pr-16",
                                highlightedMissingFields.includes("homeTeam") &&
                                  missingFieldClass,
                              )}
                            />
                            {fields.homeTeam.trim() ? (
                              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                                <ClientTeamLogoMark
                                  teamName={fields.homeTeam}
                                  competition={fields.competition}
                                  className="size-9 rounded-[10px]"
                                  imageClassName="p-1"
                                  initialsClassName="text-[10px] tracking-[0.16em]"
                                />
                              </div>
                            ) : null}
                          </div>
                        </LabeledField>
                        <LabeledField
                          label="Equipo visitante"
                          required
                          alert={highlightedMissingFields.includes("awayTeam")}
                        >
                          <div className="relative">
                            <Input
                              name="awayTeam"
                              list="match-club-catalog"
                              value={fields.awayTeam}
                              onChange={(event) =>
                                updateField("awayTeam", event.target.value)
                              }
                              placeholder="Nombre del equipo visitante"
                              className={cn(
                                fieldSurfaceClass,
                                "pr-16",
                                highlightedMissingFields.includes("awayTeam") &&
                                  missingFieldClass,
                              )}
                            />
                            {fields.awayTeam.trim() ? (
                              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                                <ClientTeamLogoMark
                                  teamName={fields.awayTeam}
                                  competition={fields.competition}
                                  className="size-9 rounded-[10px]"
                                  imageClassName="p-1"
                                  initialsClassName="text-[10px] tracking-[0.16em]"
                                />
                              </div>
                            ) : null}
                          </div>
                        </LabeledField>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <LabeledField
                          label="Fecha"
                          required
                          alert={highlightedMissingFields.includes("date")}
                        >
                          <Input
                            type="date"
                            name="date"
                            value={fields.date}
                            onChange={(event) =>
                              updateField("date", event.target.value)
                            }
                            className={cn(
                              fieldSurfaceClass,
                              highlightedMissingFields.includes("date") &&
                                missingFieldClass,
                            )}
                          />
                        </LabeledField>
                        <LabeledField
                          label="Hora"
                          required
                          alert={highlightedMissingFields.includes("time")}
                        >
                          <Input
                            type="time"
                            name="time"
                            value={fields.time}
                            onChange={(event) =>
                              updateField("time", event.target.value)
                            }
                            className={cn(
                              fieldSurfaceClass,
                              highlightedMissingFields.includes("time") &&
                                missingFieldClass,
                            )}
                          />
                        </LabeledField>
                      </div>

                      <div className="grid gap-4">
                        <LabeledField
                          label="Sede"
                          required
                          alert={highlightedMissingFields.includes("venue")}
                        >
                          <Input
                            name="venue"
                            value={fields.venue}
                            onChange={(event) => {
                              setVenueTouched(true);
                              updateField("venue", event.target.value);
                            }}
                            placeholder="Sede del local o ubicación remota"
                            className={cn(
                              fieldSurfaceClass,
                              highlightedMissingFields.includes("venue") &&
                                missingFieldClass,
                            )}
                          />
                        </LabeledField>
                      </div>
                    </SectionBlock>

                    <SectionBlock
                      step="2"
                      title="Contexto operativo"
                      status={`${contextCompleted}/${CONTEXT_FIELDS.length} listos`}
                    >
                      <div className="grid gap-4 lg:grid-cols-3">
                        <LabeledField
                          label="Produ"
                          required
                          alert={highlightedMissingFields.includes("productionMode")}
                        >
                          <Select
                            name="productionMode"
                            value={fields.productionMode}
                            onChange={(event) =>
                              updateField("productionMode", event.target.value)
                            }
                            className={cn(
                              fieldSurfaceClass,
                              highlightedMissingFields.includes("productionMode") &&
                                missingFieldClass,
                            )}
                          >
                            <option value="">Selecciona una Produ</option>
                            {PRODUCTION_MODE_OPTIONS.map((mode) => (
                              <option key={mode} value={mode}>
                                {mode}
                              </option>
                            ))}
                          </Select>
                        </LabeledField>
                        <LabeledField label="Tipo de relato">
                          <Select
                            name="commentaryPlan"
                            value={fields.commentaryPlan}
                            onChange={(event) =>
                              updateField("commentaryPlan", event.target.value)
                            }
                            aria-label="Modalidad de relatos"
                            className={fieldSurfaceClass}
                          >
                            <option value="">Sin definir</option>
                            {COMMENTARY_PLAN_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        </LabeledField>
                        <LabeledField label="Transporte">
                          <Input
                            name="transport"
                            value={fields.transport}
                            onChange={(event) =>
                              updateField("transport", event.target.value)
                            }
                            placeholder="Proveedor o movilidad"
                            className={fieldSurfaceClass}
                          />
                        </LabeledField>
                      </div>

                      <div className="grid gap-4">
                        <LabeledField label="Observación inicial">
                          <Textarea
                            name="notes"
                            value={fields.notes}
                            onChange={(event) =>
                              updateField("notes", event.target.value)
                            }
                            placeholder="Cualquier contexto editorial, técnico o logístico que convenga dejar visible desde el inicio."
                            className="min-h-28 bg-[var(--background-soft)] text-[15px]"
                          />
                        </LabeledField>
                      </div>
                    </SectionBlock>

                    <SectionBlock
                      step="3"
                      title="Personal"
                      status={`${staffCompleted}/${STAFF_FIELDS.length} roles`}
                    >
                      <div className="grid gap-4 lg:grid-cols-2">
                        <PersonSelectField
                          label={RESPONSIBLE_DISPLAY_LABEL}
                          name="responsableId"
                          value={fields.responsableId}
                          people={peopleOptions}
                          onChange={updateField}
                        />
                        <PersonSelectField
                          label="Realizador"
                          name="realizadorId"
                          value={fields.realizadorId}
                          people={peopleOptions}
                          onChange={updateField}
                        />
                        <PersonSelectField
                          label="Operador de gráfica"
                          name="graficaId"
                          value={fields.graficaId}
                          people={peopleOptions}
                          onChange={updateField}
                        />
                        <PersonSelectField
                          label="Operador de control"
                          name="controlId"
                          value={fields.controlId}
                          people={peopleOptions}
                          onChange={updateField}
                        />
                        <PersonSelectField
                          label="Soporte técnico"
                          name="soporteId"
                          value={fields.soporteId}
                          people={peopleOptions}
                          onChange={updateField}
                        />
                        <PersonSelectField
                          label="Relator"
                          name="relatorId"
                          value={fields.relatorId}
                          people={peopleOptions}
                          onChange={updateField}
                        />
                      </div>
                    </SectionBlock>

                    <SectionBlock
                      step="4"
                      title="Notificar"
                      status={`${notificationRecipients.length} contactos`}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="gap-2"
                            disabled={!bulkNotificationMailtoHref}
                            onClick={() => {
                              if (bulkNotificationMailtoHref) {
                                window.location.assign(bulkNotificationMailtoHref);
                              }
                            }}
                          >
                            <Mail className="size-4" />
                            Correo a todos
                          </Button>
                          <Button
                            type="button"
                            className="gap-2 bg-[#12b76a] shadow-[0_10px_24px_rgba(18,183,106,0.18)] hover:bg-[#0f9f5c]"
                            disabled={!notificationRecipients.some((recipient) => recipient.whatsappHref)}
                            onClick={handleBulkWhatsApp}
                          >
                            <MessageCircleMore className="size-4" />
                            WhatsApp a todos
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="gap-2"
                            onClick={() => handleCopyNotification(batchNotificationMessage, "batch")}
                          >
                            <Copy className="size-4" />
                            {copiedNotificationKey === "batch" ? "Copiado" : "Copiar texto"}
                          </Button>
                        </div>

                        <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
                            Mensaje base
                          </p>
                          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--foreground)]">
                            {batchNotificationMessage}
                          </pre>
                        </div>

                        {notificationRecipients.length ? (
                          <div className="space-y-4">
                            {notificationRecipients.map((recipient, index) => (
                              <div
                                key={recipient.id}
                                className={cn(
                                  "flex flex-wrap items-center justify-between gap-4",
                                  index === notificationRecipients.length - 1
                                    ? ""
                                    : "border-b border-[var(--border)] pb-4",
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <HoverAvatarBadge
                                    initials={getInitials(recipient.fullName)}
                                    roleLabel={recipient.roles.join(" · ")}
                                    showTooltip={false}
                                    tone="neutral"
                                    size="md"
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-[var(--foreground)]">
                                      {recipient.fullName}
                                    </p>
                                    <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--n-500)]">
                                      {recipient.roles.join(" · ")}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="gap-2 px-3"
                                    onClick={() => handleCopyNotification(recipient.message, recipient.id)}
                                  >
                                    <Copy className="size-4" />
                                    {copiedNotificationKey === recipient.id ? "Copiado" : "Copiar"}
                                  </Button>
                                  <button
                                    type="button"
                                    aria-label={`Enviar correo a ${recipient.fullName}`}
                                    disabled={!recipient.emailHref}
                                    onClick={() => {
                                      if (recipient.emailHref) {
                                        window.location.assign(recipient.emailHref);
                                      }
                                    }}
                                    className={cn(
                                      "inline-flex size-11 items-center justify-center rounded-full border transition",
                                      recipient.emailHref
                                        ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] hover:brightness-105"
                                        : "cursor-not-allowed border-[var(--border)] bg-[var(--n-50)] text-[var(--n-300)]",
                                    )}
                                  >
                                    <Mail className="size-4" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Abrir WhatsApp de ${recipient.fullName}`}
                                    disabled={!recipient.whatsappHref}
                                    onClick={() => {
                                      if (recipient.whatsappHref) {
                                        window.open(recipient.whatsappHref, "_blank", "noopener,noreferrer");
                                      }
                                    }}
                                    className={cn(
                                      "inline-flex size-11 items-center justify-center rounded-full border transition",
                                      recipient.whatsappHref
                                        ? "border-[#c9ead8] bg-[#eefbf3] text-[#1b8b56] hover:brightness-105"
                                        : "cursor-not-allowed border-[var(--border)] bg-[var(--n-50)] text-[var(--n-300)]",
                                    )}
                                  >
                                    <MessageCircleMore className="size-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-5 text-sm font-semibold text-[var(--n-500)]">
                            Primero asigna al menos una persona en el bloque de Personal para poder
                            preparar la convocatoria.
                          </div>
                        )}
                      </div>
                    </SectionBlock>

                    <div className="overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                        onClick={() => setShowAdvanced((current) => !current)}
                      >
                        <div>
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-[var(--n-400)]">
                            Detalles adicionales
                          </p>
                        </div>
                        <span className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--n-600)]">
                          {showAdvanced ? (
                            <ChevronUp className="size-4.5" />
                          ) : (
                            <ChevronDown className="size-4.5" />
                          )}
                        </span>
                      </button>

                      {showAdvanced ? (
                        <div className="space-y-5 border-t border-[var(--border)] px-6 py-6">
                          <div className="grid gap-5 xl:grid-cols-2">
                            <div className="space-y-4 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] p-5">
                              <div className="flex items-start gap-3">
                                <div className="flex size-10 items-center justify-center rounded-full bg-white text-[var(--accent)] shadow-[0_6px_18px_rgba(28,13,16,0.08)]">
                                  <Camera className="size-4.5" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-[var(--foreground)]">
                                    Cámaras
                                  </h3>
                                </div>
                              </div>
                              <div className="grid gap-4">
                                {CAMERA_FIELD_CONFIGS.slice(0, visibleCameraCount).map((field) => (
                                  <PersonSelectField
                                    key={field.name}
                                    label={field.label}
                                    name={field.name}
                                    value={fields[field.name]}
                                    people={peopleOptions}
                                    onChange={updateField}
                                  />
                                ))}
                                {visibleCameraCount < CAMERA_FIELD_CONFIGS.length ? (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="h-11 justify-center gap-2 border-dashed border-[var(--n-200)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                    onClick={() =>
                                      setVisibleCameraCount((current) =>
                                        Math.min(current + 1, CAMERA_FIELD_CONFIGS.length),
                                      )
                                    }
                                  >
                                    <Plus className="size-4" />
                                    Agregar cámara
                                  </Button>
                                ) : null}
                              </div>
                            </div>

                            <div className="space-y-4 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] p-5">
                              <div className="flex items-start gap-3">
                                <div className="flex size-10 items-center justify-center rounded-full bg-white text-[var(--accent)] shadow-[0_6px_18px_rgba(28,13,16,0.08)]">
                                  <Mic2 className="size-4.5" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-[var(--foreground)]">
                                    Comentarios extra
                                  </h3>
                                </div>
                              </div>
                              <div className="grid gap-4">
                                <PersonSelectField
                                  label="Comentarista 1"
                                  name="comentario1Id"
                                  value={fields.comentario1Id}
                                  people={peopleOptions}
                                  onChange={updateField}
                                />
                                <PersonSelectField
                                  label="Comentarista 2"
                                  name="comentario2Id"
                                  value={fields.comentario2Id}
                                  people={peopleOptions}
                                  onChange={updateField}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <aside className="order-first space-y-4 self-start xl:order-last xl:sticky xl:top-0">
                    <div className="overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
                      <div className="space-y-4 px-5 py-5">
                        <div className="rounded-[var(--panel-radius)] bg-[var(--background-soft)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <LeagueLogoMarkClient
                                league={previewCompetitionLabel}
                                className="size-10 shrink-0 rounded-[var(--panel-radius)]"
                              />
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
                                  Liga
                                </p>
                                <p className="truncate text-sm font-bold text-[var(--foreground)]">
                                  {previewCompetitionLabel}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
                                Hora
                              </p>
                              <p className="text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                                {previewTimeLabel}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-white p-4">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                            <div className="space-y-2">
                              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--background-soft)] shadow-[0_8px_18px_rgba(28,13,16,0.06)]">
                                <ClientTeamLogoMark
                                  teamName={previewHomeTeamLabel}
                                  competition={previewCompetitionLabel}
                                  className="size-14 rounded-full"
                                  imageClassName="p-2"
                                  initialsClassName="text-[11px] tracking-[0.14em]"
                                />
                              </div>
                              <p className="text-sm font-bold leading-tight text-[var(--foreground)]">
                                {previewHomeTeamLabel}
                              </p>
                            </div>
                            <p className="text-lg font-extrabold text-[var(--accent)]">VS</p>
                            <div className="space-y-2">
                              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--background-soft)] shadow-[0_8px_18px_rgba(28,13,16,0.06)]">
                                <ClientTeamLogoMark
                                  teamName={previewAwayTeamLabel}
                                  competition={previewCompetitionLabel}
                                  className="size-14 rounded-full"
                                  imageClassName="p-2"
                                  initialsClassName="text-[11px] tracking-[0.14em]"
                                />
                              </div>
                              <p className="text-sm font-bold leading-tight text-[var(--foreground)]">
                                {previewAwayTeamLabel}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="size-4" />
                              <span>{previewDateLabel}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="size-4" />
                              <span>{previewVenueLabel}</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-[var(--n-400)]">
                              Checklist rápido
                            </p>
                            <span className="text-sm font-bold text-[var(--foreground)]">
                              {CORE_REQUIRED_FIELDS.length - missingFields.length}/
                              {CORE_REQUIRED_FIELDS.length}
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--background-soft)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)] transition-all"
                              style={{ width: `${requiredCompletionRatio}%` }}
                            />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {missingFieldLabels.length ? (
                              missingFieldLabels.map((label) => (
                                <span
                                  key={label}
                                  className="rounded-full bg-[var(--background-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--n-600)]"
                                >
                                  {label}
                                </span>
                              ))
                            ) : (
                              <span className="inline-flex items-center gap-2 rounded-full bg-[#eff9f3] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#1a8b4f]">
                                <CheckCircle2 className="size-3.5" />
                                Listo para guardar
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-white p-4">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-[var(--n-400)]">
                            Roles clave
                          </p>
                          <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                            {summaryRoles.map((role) => (
                              <div
                                key={role.label}
                                className="flex items-center gap-3"
                              >
                                <HoverAvatarBadge
                                  initials={role.initials}
                                  roleLabel={role.label}
                                  showTooltip={false}
                                  tone="neutral"
                                  size="md"
                                />
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
                                    {role.label}
                                  </p>
                                  <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">
                                    {role.value}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-5 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2 xl:grid-cols-1">
                            <div className="space-y-1">
                              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
                                Personal asignado
                              </p>
                              <p className="mt-1 text-xl font-extrabold text-[var(--foreground)]">
                                {previewAssignedPeopleCount}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
                                Detalle técnico
                              </p>
                              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                                {showAdvanced ? "Abierto" : "Compacto"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </aside>
                </div>
                <input type="hidden" name="status" value={fields.status} />

                <datalist id="match-club-catalog">
                  {ALL_CLUB_OPTIONS.map((club) => (
                    <option key={club} value={club} />
                  ))}
                </datalist>
              </div>

              <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--background-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-7 sm:py-5">
                <div className="text-sm text-[var(--muted)]">
                  {missingFieldLabels.length ? (
                    <>
                      Revisa antes de guardar:
                      {" "}
                      <span className="font-bold text-[var(--foreground)]">
                        {missingFieldLabels.join(", ")}
                      </span>
                    </>
                  ) : (
                    isEditing
                      ? "Los cambios impactan esta producción y sus asignaciones visibles en grilla."
                      : "Si luego llega la API por ID, este modal ya está listo para autocompletar y remarcar faltantes."
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {isEditing ? (
                    <Button
                      type="submit"
                      variant="secondary"
                      formAction={deleteMatchAction}
                      className="h-11 border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)] hover:bg-[var(--accent-border)]"
                      onClick={(event) => {
                        if (
                          !window.confirm(
                            "Vas a eliminar este partido. Este cambio puede ser permanente y sacar la tarjeta de la grilla. ¿Quieres continuar?",
                          )
                        ) {
                          event.preventDefault();
                        }
                      }}
                    >
                      Borrar partido
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11"
                    onClick={resetAndClose}
                  >
                    Cancelar
                  </Button>
                  <SubmitButton
                    pendingLabel={isEditing ? "Guardando..." : "Creando..."}
                    className="h-11 gap-2"
                  >
                    {isEditing ? <Sparkles className="size-4" /> : <Plus className="size-4" />}
                    {isEditing ? "Guardar cambios" : "Crear partido"}
                  </SubmitButton>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}
