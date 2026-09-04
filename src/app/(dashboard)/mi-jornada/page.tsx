import { Suspense, type ReactNode } from "react";
import { Hash, Sparkles, UserRound } from "lucide-react";

import { MyDayAssignmentsPanel } from "@/components/collaborators/my-day-assignments-panel";
import { TeamLogoResolutionProvider } from "@/components/team-logo-resolution-context";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { getUserContext } from "@/lib/auth";
import { isDashboardPathAllowedForRole } from "@/lib/constants";
import { getCollaboratorDayData } from "@/lib/data/collaborators";
import { appEnv } from "@/lib/env";
import { resolveTeamLogoMap } from "@/lib/team-logos";
import { cn } from "@/lib/utils";

function capitalizeSentence(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
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

const EMPTY_DAY_DATA = {
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

type CollaboratorDayData = Awaited<ReturnType<typeof getCollaboratorDayData>>;

// The two data-derived slots of the header grid. Rendered as a fragment so they
// stay direct grid children (and keep their responsive `order-*` positions)
// while suspending as one unit.
async function DayHeaderSlots({
  dataPromise,
}: {
  dataPromise: Promise<CollaboratorDayData>;
}) {
  const data = await dataPromise;
  const upcomingAssignments = data.upcomingAssignments;
  const pendingUpcoming = upcomingAssignments.filter(
    (assignment) => !assignment.attendanceResponse,
  ).length;

  return (
    <div className="order-2 grid grid-cols-2 gap-3 md:order-3 md:col-span-2">
      <DaySummaryCard
        label="Partidos asignados"
        value={upcomingAssignments.length}
        icon={Hash}
      />
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
  );
}

function DayHeaderSlotsFallback() {
  return (
    <div className="order-2 grid grid-cols-2 gap-3 md:order-3 md:col-span-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)]"
        />
      ))}
    </div>
  );
}

async function DayAssignments({
  dataPromise,
  role,
}: {
  dataPromise: Promise<CollaboratorDayData>;
  role: Awaited<ReturnType<typeof getUserContext>>["role"];
}) {
  const data = await dataPromise;
  const upcomingAssignments = data.upcomingAssignments;
  const pastAssignments = data.pastMonthAssignments;

  // Resolve every visible crest on the server so the assignment cards paint
  // logos from the initial markup instead of fetching /api/team-logo per crest.
  const teamLogoMap = resolveTeamLogoMap(
    [...upcomingAssignments, ...pastAssignments].flatMap((assignment) => [
      { teamName: assignment.homeTeam, competition: assignment.competition },
      { teamName: assignment.awayTeam, competition: assignment.competition },
    ]),
  );

  return (
    <TeamLogoResolutionProvider value={teamLogoMap}>
      <MyDayAssignmentsPanel
        hasLinkedPerson={Boolean(data.person)}
        canViewGrid={isDashboardPathAllowedForRole("/grid", role)}
        assignments={upcomingAssignments}
        pastAssignments={pastAssignments}
      />
    </TeamLogoResolutionProvider>
  );
}

function DayAssignmentsFallback() {
  return (
    <div className="h-72 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />
  );
}

export default async function CollaboratorDayPage() {
  const user = await getUserContext();
  const guestMode = appEnv.allowGuestMiJornadaAccess && !user.userId;
  const fallbackCollaboratorName =
    user.profile?.full_name?.trim() || "Modo invitado";

  // Started, not awaited: the greeting below paints from the session alone while
  // this resolves, and both suspended regions share the one promise rather than
  // reading twice.
  const dataPromise = guestMode
    ? Promise.resolve<CollaboratorDayData>(EMPTY_DAY_DATA)
    : getCollaboratorDayData(user, {
      profileId: user.profileId,
      email: user.email,
      profileName: user.profile?.full_name ?? null,
    }).catch((error) => {
      console.error("[mi-jornada] failed to load collaborator data", error);
      return EMPTY_DAY_DATA as CollaboratorDayData;
    });

  // The greeting is the LCP element, so it names the collaborator from their
  // profile instead of waiting on the linked `people` row it used to prefer. The
  // two are the same string for essentially every collaborator; when they differ,
  // the profile spelling is what shows.
  const greetingName = capitalizeSentence(fallbackCollaboratorName);

  return (
    <div className="w-full max-w-none pb-10">
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
          description={formatContentUpdatedLabel()}
          className="order-1 gap-0 md:block"
          contentClassName="mx-auto text-center md:mx-0 md:text-left"
          descriptionClassName="mt-3 block w-full max-w-none text-center text-xs font-bold uppercase tracking-[0.14em] text-[var(--n-400)] md:mx-0 md:text-left md:text-sm md:font-medium md:normal-case md:tracking-normal"
        />
        <Suspense fallback={<DayHeaderSlotsFallback />}>
          <DayHeaderSlots dataPromise={dataPromise} />
        </Suspense>
      </div>

      <div className="mt-8">
        <Suspense fallback={<DayAssignmentsFallback />}>
          <DayAssignments dataPromise={dataPromise} role={user.role} />
        </Suspense>
      </div>
    </div>
  );
}
