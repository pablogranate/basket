import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Hash, Sparkles, UserRound } from "lucide-react";

import { SectionAiAssistant } from "@/components/ai/section-ai-assistant";
import { MyDayAssignmentsPanel } from "@/components/collaborators/my-day-assignments-panel";
import { TeamLogoResolutionProvider } from "@/components/team-logo-resolution-context";
import { SetupPanel } from "@/components/layout/setup-panel";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { getUserContext } from "@/lib/auth";
import { isDashboardPathAllowedForRole } from "@/lib/constants";
import {
  type CollaboratorAssignmentItem,
  type CollaboratorGroupContact,
  getCollaboratorDayData,
} from "@/lib/data/collaborators";
import { appEnv, isSupabaseConfigured } from "@/lib/env";
import { getSettingsSnapshot } from "@/lib/settings";
import { resolveTeamLogoMap } from "@/lib/team-logos";
import { cn } from "@/lib/utils";

function capitalizeSentence(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCompactMatchDate(dateValue: string) {
  return format(parseISO(`${dateValue}T00:00:00`), "dd MMM, yyyy", {
    locale: es,
  }).toUpperCase();
}

function formatAssignmentDateLabel(dateTimeValue: string) {
  return capitalizeSentence(format(parseISO(dateTimeValue), "d MMM yyyy", { locale: es }));
}

function formatContentUpdatedLabel() {
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat("es-CO", {
    timeZone: appEnv.appTimezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("es-CO", {
    timeZone: appEnv.appTimezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const dateParts = dateFormatter.formatToParts(now);
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const year = dateParts.find((part) => part.type === "year")?.value ?? "";

  return `${day} de ${month} de ${year}, ${timeFormatter.format(now)}`;
}

function getTodayDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: appEnv.appTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function DaySummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  valueClassName,
}: {
  label: ReactNode;
  value: string | number;
  icon: typeof UserRound;
  tone?: "default" | "accent";
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
          {label}
        </p>
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--panel-radius)] border",
            tone === "accent"
              ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--n-400)]",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p
        className={cn(
          "mt-4 text-[28px] font-black leading-none text-[var(--foreground)]",
          typeof value === "string" && value.length > 18 && "text-base leading-tight",
          tone === "accent" && "text-[var(--accent)]",
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function buildDemoAssignment(params: {
  date: string;
  collaboratorName: string;
}): CollaboratorAssignmentItem {
  const contacts: CollaboratorGroupContact[] = [
    {
      roleName: "Responsable",
      roleCategory: "Coordinacion",
      sortOrder: 10,
      personName: params.collaboratorName,
      phone: "573000000000",
      email: "santiago.demo@basketproduction.pro",
    },
    {
      roleName: "Realizador",
      roleCategory: "Produccion",
      sortOrder: 20,
      personName: params.collaboratorName,
      phone: "573000000000",
      email: "santiago.demo@basketproduction.pro",
    },
    {
      roleName: "Operador de Control",
      roleCategory: "Produccion",
      sortOrder: 30,
      personName: "Mauro Ruiz Díaz",
      phone: "573001112233",
      email: "mauro.ruiz@basketproduction.pro",
    },
    {
      roleName: "Soporte tecnico",
      roleCategory: "Produccion",
      sortOrder: 40,
      personName: "Fary Leonardo Urriaga",
      phone: "573001112244",
      email: "fary.urriaga@basketproduction.pro",
    },
    {
      roleName: "Productor",
      roleCategory: "Produccion",
      sortOrder: 50,
      personName: "M. Casella",
      phone: "573001112255",
      email: "casella@basketproduction.pro",
    },
    {
      roleName: "Relator",
      roleCategory: "Talento",
      sortOrder: 60,
      personName: "Matias Díaz",
      phone: "573001112266",
      email: "matias.diaz@basketproduction.pro",
    },
  ];

  return {
    assignmentId: "demo-assignment",
    matchId: "demo-match-boca-atenas",
    confirmed: false,
    attendanceConfirmedAt: null,
    attendanceResponse: null,
    attendanceNote: null,
    notes: "Vista demo para validar la tarjeta móvil de Mi jornada.",
    roleName: "Realizador",
    roleCategory: "Produccion",
    competition: "Liga Nacional",
    productionMode: "Encoder",
    productionCode: "27900",
    status: "Pendiente",
    homeTeam: "Boca Juniors",
    awayTeam: "Atenas de Córdoba",
    venue: "Luis Conde, Buenos Aires",
    kickoffAt: `${params.date}T19:30:00-05:00`,
    durationMinutes: 150,
    timezone: "America/Bogota",
    ownerName: params.collaboratorName,
    ownerPhone: "573000000000",
    ownerEmail: "santiago.demo@basketproduction.pro",
    responsibleName: params.collaboratorName,
    realizerName: params.collaboratorName,
    operatorControlName: "Mauro Ruiz Díaz",
    supportTechName: "Fary Leonardo Urriaga",
    producerName: "M. Casella",
    encoderName: "Encoder HD",
    relatorName: "Matias Díaz",
    cameraCount: 4,
    talentLabel: "L. Montero / G. Pérez",
    commentaryPlan: "Relato principal con apoyo de comentario 1 en cierres de cuarto.",
    transport: "Llegar 45 minutos antes. La sede suele abrir tarde.",
    matchNotes: "Confirmar acceso a cabina y validar energía antes de entrar al aire.",
    contacts,
    dateLabel: formatCompactMatchDate(params.date),
    timeLabel: "19:30",
  };
}

export default async function CollaboratorDayPage() {
  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  const user = await getUserContext();
  const guestMode = appEnv.allowGuestMiJornadaAccess && !user.userId;
  const settings = await getSettingsSnapshot();
  const emptyData = {
    person: null,
    linkedBy: null,
    allAssignments: [],
    upcomingAssignments: [],
    pastMonthAssignments: [],
    summary: {
      totalUpcoming: 0,
      pendingUpcoming: 0,
      nextKickoffLabel: null,
    },
  } satisfies Awaited<ReturnType<typeof getCollaboratorDayData>>;
  const data = guestMode
    ? emptyData
    : await getCollaboratorDayData(user, {
      email: user.email,
      profileName: user.profile?.full_name ?? null,
    }).catch((error) => {
      console.error("[mi-jornada] failed to load collaborator data", error);
      return emptyData;
    });

  const todayDateKey = getTodayDateKey();
  const fallbackCollaboratorName =
    user.profile?.full_name?.trim() || "Modo invitado";
  const greetingName = capitalizeSentence(
    data.person?.full_name?.trim() || fallbackCollaboratorName,
  );

  const showDemo =
    guestMode || !data.person || data.upcomingAssignments.length === 0;
  const upcomingAssignments = showDemo
    ? [
      buildDemoAssignment({
        date: todayDateKey,
        collaboratorName: data.person?.full_name ?? fallbackCollaboratorName,
      }),
    ]
    : data.upcomingAssignments;
  const pastAssignments = data.pastMonthAssignments;

  // Resolve every visible crest on the server so the assignment cards paint
  // logos from the initial markup instead of fetching /api/team-logo per crest.
  const teamLogoMap = resolveTeamLogoMap(
    [...upcomingAssignments, ...pastAssignments].flatMap((assignment) => [
      { teamName: assignment.homeTeam, competition: assignment.competition },
      { teamName: assignment.awayTeam, competition: assignment.competition },
    ]),
  );

  const totalUpcoming = upcomingAssignments.length;
  const pendingUpcoming = upcomingAssignments.filter(
    (assignment) => !assignment.attendanceResponse,
  ).length;
  const contentUpdatedLabel = formatContentUpdatedLabel();
  const aiContext = upcomingAssignments.map((assignment) => ({
    partido: `${assignment.homeTeam} vs ${assignment.awayTeam}`,
    liga: assignment.competition ?? "Sin liga",
    fecha: formatAssignmentDateLabel(assignment.kickoffAt),
    hora: assignment.timeLabel,
    sede: assignment.venue ?? "Sede por definir",
    responsable: assignment.responsibleName ?? assignment.ownerName ?? "Sin asignar",
    modo: assignment.productionMode ?? "Sin definir",
    rol: assignment.roleName,
    camaras: assignment.cameraCount,
    asistencia: assignment.attendanceResponse ?? "pendiente",
  }));

  return (
    <div className="w-full max-w-none pb-10">
      <TeamLogoResolutionProvider value={teamLogoMap}>
      <MyDayAssignmentsPanel
        hasLinkedPerson={Boolean(data.person)}
        showDemoToday={showDemo}
        canViewGrid={isDashboardPathAllowedForRole("/grid", user.role)}
        assignments={upcomingAssignments}
        pastAssignments={pastAssignments}
        topContent={
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <SectionPageHeader
              title={(
                <>
                  <span className="block text-xs font-bold uppercase tracking-[0.32em] text-[var(--accent)]">
                    Hola esta tu jornada
                  </span>
                  <span className="mt-2 block text-[1.6rem] leading-[1.05] md:mt-2.5 md:text-[1.6rem]">
                    {greetingName}
                  </span>
                </>
              )}
              description={contentUpdatedLabel}
              className="order-1 gap-0 md:block"
              contentClassName="mx-auto text-center md:mx-0 md:text-left"
              descriptionClassName="mt-3 block w-full max-w-none text-center text-xs font-bold uppercase tracking-[0.14em] text-[var(--n-400)] md:mx-0 md:text-left md:text-sm md:font-medium md:normal-case md:tracking-normal"
            />
            <div className="order-3 hidden md:order-2 md:flex md:justify-self-end">
              <SectionAiAssistant
                section="Mi jornada"
                title="Consulta tu jornada visible"
                description="Pregunta por tus partidos visibles, horarios, responsables, ligas, sedes o modos de producción."
                placeholder="Ej. ¿Qué partidos tengo y quién es el responsable?"
                contextLabel="Partidos visibles en Mi jornada"
                context={aiContext}
                guidance="Prioriza partido, liga, fecha, hora, sede, responsable, modo de producción, rol asignado, cámaras y el estado de asistencia."
                examples={[
                  "¿Qué partidos tengo y a qué hora?",
                  "¿Quién es el responsable de Boca Juniors vs Atenas de Córdoba?",
                  "¿Qué partidos visibles están en modo Encoder?",
                ]}
                hasGeminiKey={settings.hasGeminiKey}
                buttonVariant="icon"
              />
            </div>
            <div className="order-2 grid grid-cols-2 gap-3 md:order-3 md:col-span-2">
              <DaySummaryCard label="Partidos asignados" value={totalUpcoming} icon={Hash} />
              <DaySummaryCard
                label={
                  <>
                    <span className="md:hidden">Sin confirmar</span>
                    <span className="hidden md:inline">Asistencia sin confirmar</span>
                  </>
                }
                value={pendingUpcoming}
                icon={Sparkles}
                tone="accent"
              />
            </div>
          </div>
        }
      />
      </TeamLogoResolutionProvider>
    </div>
  );
}
