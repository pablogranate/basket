import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Megaphone,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatMatchDateTime } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import type {
  MatchCollaboratorReport,
  MatchReportIncidentLevel,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const INCIDENT_LEVEL_STYLES: Record<
  MatchReportIncidentLevel,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  sin: {
    label: "Sin incidencia",
    icon: CheckCircle2,
    className: "border-[#bfe4ca] bg-[#eefaf2] text-[#1b7d43]",
  },
  baja: {
    label: "Incidencia baja",
    icon: Circle,
    className: "border-[#d7dee8] bg-[#f4f7fa] text-[#70819b]",
  },
  alta: {
    label: "Incidencia alta",
    icon: AlertTriangle,
    className: "border-[#f0c4ce] bg-[#fff0f3] text-[#cf2246]",
  },
  critica: {
    label: "Incidencia crítica",
    icon: ShieldAlert,
    className: "border-[#e1cdf4] bg-[#fbf2ff] text-[#a12ad6]",
  },
};

const PROBLEM_LABELS: Record<string, string> = {
  internet: "Problema Internet",
  img: "Problema IMG",
  ocr: "OCR",
  overlays: "Overlays (GES)",
  grafica: "Gráfica",
  club: "Club",
  responsableCancha: "Responsable de cancha",
};

const CHECK_LABELS: Array<{
  key: keyof Pick<
    MatchCollaboratorReport,
    "testCheck" | "soundCheck" | "graphicsCheck" | "internetCheck" | "cameraCheck"
  >;
  label: string;
}> = [
  { key: "testCheck", label: "Prueba" },
  { key: "soundCheck", label: "Sonido" },
  { key: "graphicsCheck", label: "Gráfica" },
  { key: "internetCheck", label: "Internet" },
  { key: "cameraCheck", label: "Cámara" },
];

function activeProblemLabels(problems: Record<string, boolean>) {
  return Object.entries(problems)
    .filter(([key, active]) => active && key !== "hasAny")
    .map(([key]) => PROBLEM_LABELS[key] ?? key);
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--n-500)]">
        {label}
      </p>
      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
        {value}
      </p>
    </div>
  );
}

export function CollaboratorReportsPanel({
  reports,
  timezone,
}: {
  reports: MatchCollaboratorReport[];
  timezone: string;
}) {
  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-8">
      <div className="flex items-center gap-2">
        <Megaphone className="size-5 text-[var(--accent)]" />
        <h3 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Reportes e Incidencias
        </h3>
        {reports.length ? <Badge>{reports.length}</Badge> : null}
      </div>

      {reports.length ? (
        <div className="space-y-3">
          {reports.map((report) => {
            const level = INCIDENT_LEVEL_STYLES[report.incidentLevel];
            const LevelIcon = level.icon;
            const problems = activeProblemLabels(report.problems);

            return (
              <article
                key={report.id}
                className="panel-surface space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black",
                        level.className,
                      )}
                    >
                      <LevelIcon className="size-3.5" />
                      {level.label}
                    </span>
                    <span className="text-sm font-semibold text-[var(--foreground)]">
                      {report.reporterName ?? "Colaborador sin identificar"}
                    </span>
                    {report.roleName ? (
                      <Badge>{getRoleDisplayName(report.roleName)}</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs font-medium text-[var(--n-500)]">
                    {formatMatchDateTime(report.submittedAt, timezone)}
                  </p>
                </div>

                {problems.length ? (
                  <div className="flex flex-wrap gap-2">
                    {problems.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 rounded-full border border-[#f0c4ce] bg-[#fff0f3] px-2.5 py-0.5 text-xs font-bold text-[#cf2246]"
                      >
                        <AlertTriangle className="size-3" />
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {report.generalObservations ? (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--foreground)]">
                    {report.generalObservations}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--border)] pt-4 sm:grid-cols-3 lg:grid-cols-6">
                  <MetricItem label="Señal" value={report.signalLabel} />
                  <MetricItem
                    label="Apto lineal"
                    value={report.aptoLineal ? "Sí" : "No"}
                  />
                  <MetricItem
                    label="Feed"
                    value={report.feedDetected ? "Detectado" : "No detectado"}
                  />
                  <MetricItem
                    label="Hora prueba"
                    value={report.testTime?.trim() || "—"}
                  />
                  <MetricItem
                    label="Speedtest"
                    value={report.speedtestValue?.trim() || "—"}
                  />
                  <MetricItem
                    label="Ping / GPU"
                    value={`${report.pingValue?.trim() || "—"} / ${report.gpuValue?.trim() || "—"}`}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {CHECK_LABELS.map(({ key, label }) => {
                    const ok = report[key];

                    return (
                      <span
                        key={key}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          ok
                            ? "border-[#cce8db] bg-[#effaf4] text-[#17654d]"
                            : "border-[var(--n-200)] bg-[var(--n-50)] text-[var(--n-500)]",
                        )}
                      >
                        {ok ? (
                          <CheckCircle2 className="size-3" />
                        ) : (
                          <XCircle className="size-3" />
                        )}
                        {label}
                      </span>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel-surface border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          Todavía no hay reportes de colaboradores para este partido.
        </div>
      )}
    </section>
  );
}
