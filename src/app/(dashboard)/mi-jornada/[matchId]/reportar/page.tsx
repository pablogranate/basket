import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, Radio, UserRound, X } from "lucide-react";

import { CollaboratorReportForm } from "@/components/collaborators/collaborator-report-form";
import { SetupPanel } from "@/components/layout/setup-panel";
import { Card } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth";
import { getCollaboratorMatchData, isUuidLike } from "@/lib/data/collaborators";
import { getRoleCategoryDisplayName, getRoleDisplayName } from "@/lib/display";
import { isSupabaseConfigured } from "@/lib/env";

type PageProps = {
  params: Promise<{ matchId: string }>;
};

export default async function CollaboratorReportPage({ params }: PageProps) {
  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  const { matchId } = await params;
  const user = await requireUserContext();
  const data = await getCollaboratorMatchData(user, {
    email: user.email,
    profileName: user.profile?.full_name ?? null,
    matchId,
  });

  if (!data.assignment) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <Link
            href="/mi-jornada"
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)]"
          >
            <ArrowLeft className="size-4" />
            Volver a mi jornada
          </Link>
          <Link
            href="/mi-jornada"
            aria-label="Cerrar reporte"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--background-soft)] text-[#94a3b8] transition hover:text-[var(--foreground)]"
          >
            <X className="size-4" />
          </Link>
        </div>

        <Card className="space-y-4 rounded-[var(--panel-radius)] border-[#f2d8ae] bg-[#fffaf0] p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#9a5a0f]">
            Acceso no disponible
          </p>
          <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
            No encontramos una asignación tuya para este partido
          </h1>
          <p className="text-sm text-[#7a6546]">
            Si deberías poder reportar sobre este evento, revisa primero que tu
            usuario esté vinculado a `Personal` y que la asignación exista.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/mi-jornada"
              className="inline-flex h-11 items-center justify-center rounded-[var(--panel-radius)] bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(230,18,56,0.18)] transition hover:bg-[var(--accent-strong)]"
            >
              Ir a mi jornada
            </Link>
            <Link
              href="/grid"
              className="inline-flex h-11 items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
            >
              Abrir Producción
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const assignment = data.assignment;
  const canOpenMatch = isUuidLike(assignment.matchId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/mi-jornada"
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)]"
          >
            <ArrowLeft className="size-4" />
            Volver a mi jornada
          </Link>
          {canOpenMatch ? (
            <Link
              href={`/match/${assignment.matchId}`}
              className="inline-flex h-11 items-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
            >
              Abrir partido
            </Link>
          ) : (
            <Link
              href="/grid"
              className="inline-flex h-11 items-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
            >
              Abrir Producción
            </Link>
          )}
        </div>
        <Link
          href="/mi-jornada"
          aria-label="Cerrar reporte"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--background-soft)] text-[#94a3b8] transition hover:text-[var(--foreground)]"
        >
          <X className="size-4" />
        </Link>
      </div>

      <Card className="space-y-5 rounded-[var(--panel-radius)] p-5 sm:p-6">
        {data.trialAccess ? (
          <div className="rounded-[var(--panel-radius)] border border-[#cce8d7] bg-[#f2fbf6] px-4 py-3 text-sm text-[#256746]">
            <span className="font-black uppercase tracking-[0.18em] text-[11px]">
              Modo prueba
            </span>
            <p className="mt-1 font-medium">
              Acceso temporal habilitado aunque tu usuario todavía no tenga una asignación
              vinculada a este partido.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
                {assignment.competition ?? "Sin liga"}
              </span>
              {assignment.productionMode ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#617187]">
                  {assignment.productionMode}
                </span>
              ) : null}
            </div>

            <div>
              <h1 className="text-[31px] font-black tracking-tight leading-[1.02] text-[var(--foreground)]">
                {assignment.homeTeam} vs {assignment.awayTeam}
              </h1>
              <p className="mt-2 text-sm font-semibold text-[#617187]">
                Tu rol: {getRoleDisplayName(assignment.roleName)}
                {assignment.roleCategory
                  ? ` · ${getRoleCategoryDisplayName(assignment.roleCategory)}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#95a3ba]">
              <Clock3 className="size-4 text-[var(--accent)]" />
              Hora
            </div>
            <div className="mt-2 text-3xl font-black text-[var(--accent)]">
              {assignment.timeLabel}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#95a3ba]">
              <CalendarDays className="size-4 text-[var(--accent)]" />
              Fecha
            </div>
            <p className="mt-2 text-sm font-semibold">{assignment.dateLabel}</p>
          </div>
          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#95a3ba]">
              <MapPin className="size-4 text-[var(--accent)]" />
              Sede
            </div>
            <p className="mt-2 text-sm font-semibold">
              {assignment.venue ?? "Por definir"}
            </p>
          </div>
          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#95a3ba]">
              <UserRound className="size-4 text-[var(--accent)]" />
              Responsable
            </div>
            <p className="mt-2 text-sm font-semibold">
              {assignment.ownerName ?? "Sin responsable"}
            </p>
          </div>
          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#95a3ba]">
              <Radio className="size-4 text-[var(--accent)]" />
              Mi nota
            </div>
            <p className="mt-2 text-sm font-semibold">
              {assignment.notes?.trim() || "Sin nota previa"}
            </p>
          </div>
        </div>
      </Card>

      <CollaboratorReportForm
        key={assignment.assignmentId}
        assignment={assignment}
      />
    </div>
  );
}
