"use client";

import { useState } from "react";

import {
  ChevronLeft,
  ChevronRight,
  Hash,
  MapPin,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ExpandDivider } from "@/components/ui/expand-divider";
import { RESPONSIBLE_DISPLAY_LABEL } from "@/lib/constants";
import type {
  InsightsTopPerson,
  ProductionInsightsSummary,
} from "@/lib/grid/insights";
import { getInitials } from "@/components/people/people-view-helpers";

type ProductionInsightsPanelProps = {
  summary: ProductionInsightsSummary;
  currentDateLabel: string;
  previousDateHref: string;
  nextDateHref: string;
};

const SAMPLE_TOP_PEOPLE = [
  {
    id: "sample-marco-rossi",
    fullName: "Marco Rossi",
    totalMatches: 4,
    roleLabel: "Director técnico",
  },
  {
    id: "sample-elena-beltran",
    fullName: "Elena Beltrán",
    totalMatches: 6,
    roleLabel: "Coord. logística",
  },
  {
    id: "sample-lucas-mendez",
    fullName: "Lucas Méndez",
    totalMatches: 2,
    roleLabel: "Operador de cámara",
  },
  {
    id: "sample-valentina-castro",
    fullName: "Valentina Castro",
    totalMatches: 3,
    roleLabel: "Productora",
  },
  {
    id: "sample-diego-herrera",
    fullName: "Diego Herrera",
    totalMatches: 2,
    roleLabel: "Operador de control",
  },
  {
    id: "sample-natalia-ramirez",
    fullName: "Natalia Ramírez",
    totalMatches: 5,
    roleLabel: RESPONSIBLE_DISPLAY_LABEL,
  },
  {
    id: "sample-sergio-mora",
    fullName: "Sergio Mora",
    totalMatches: 4,
    roleLabel: "Relator",
  },
  {
    id: "sample-lucia-pineda",
    fullName: "Lucía Pineda",
    totalMatches: 2,
    roleLabel: "Soporte técnico",
  },
  {
    id: "sample-camilo-vega",
    fullName: "Camilo Vega",
    totalMatches: 3,
    roleLabel: "Camarógrafo",
  },
  {
    id: "sample-ana-torres",
    fullName: "Ana Torres",
    totalMatches: 1,
    roleLabel: "Productora",
  },
] as const;

function getAssignmentLoadTone(totalMatches: number) {
  if (totalMatches >= 3) {
    return {
      avatarClassName: "border-[#c9ead8] bg-[#eefbf3] text-[#1b8b56]",
      badgeClassName: "border-[#c9ead8] bg-[#eefbf3] text-[#1b8b56]",
    };
  }

  return {
    avatarClassName: "border-[#f2ddb1] bg-[#fff7e8] text-[#b7791f]",
    badgeClassName: "border-[#f2ddb1] bg-[#fff7e8] text-[#b7791f]",
  };
}

function buildMissingHighlights(
  missing: ProductionInsightsSummary["missing"],
) {
  return [
    {
      label: "Sin sede definida",
      value: missing.venue,
      icon: MapPin,
      emphasis: "critical" as const,
    },
    {
      label: "Sin responsable",
      value: missing.responsible,
      icon: UserRound,
      emphasis: "critical" as const,
    },
    {
      label: "Sin ID Plataforma",
      value: missing.productionCode,
      icon: Hash,
      emphasis: "warning" as const,
    },
  ];
}

function getAttentionTone(emphasis: "critical" | "warning", value: number) {
  if (value <= 0) {
    return {
      avatarClassName: "border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)]",
      badgeClassName: "border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)]",
    };
  }

  if (emphasis === "critical") {
    return {
      avatarClassName: "border-[#f4d3d9] bg-[#fff5f7] text-[#bc3556]",
      badgeClassName: "border-[#f4d3d9] bg-[#fff5f7] text-[#bc3556]",
    };
  }

  return {
    avatarClassName: "border-[#f7e3c0] bg-[#fff8eb] text-[#b97712]",
    badgeClassName: "border-[#f7e3c0] bg-[#fff8eb] text-[#b97712]",
  };
}

function formatOperationalHourLabel(time: string) {
  if (time === "--:--") {
    return "--";
  }

  const [hours] = time.split(":");
  return `${hours} HS`;
}

function buildDisplayedTopPeople(topPeople: InsightsTopPerson[]) {
  const normalized = [...topPeople];
  const existingIds = new Set(normalized.map((person) => person.id));

  for (const sample of SAMPLE_TOP_PEOPLE) {
    if (normalized.length >= 10) {
      break;
    }

    if (existingIds.has(sample.id)) {
      continue;
    }

    normalized.push(sample);
    existingIds.add(sample.id);
  }

  return normalized
    .sort((left, right) => {
      if (right.totalMatches !== left.totalMatches) {
        return right.totalMatches - left.totalMatches;
      }

      return left.fullName.localeCompare(right.fullName, "es");
    })
    .slice(0, Math.max(5, Math.min(10, normalized.length)));
}

export function ProductionInsightsPanel({
  summary,
  currentDateLabel,
  previousDateHref,
  nextDateHref,
}: ProductionInsightsPanelProps) {
  const [showAllPeople, setShowAllPeople] = useState(false);
  const assignedPeopleCount = summary.assignedPeopleCount;
  const displayedTopPeople = buildDisplayedTopPeople(summary.topPeople);
  const visibleTopPeople = displayedTopPeople.slice(0, showAllPeople ? 10 : 5);
  const canExpandPeople = displayedTopPeople.length > 5;
  const missingHighlights = buildMissingHighlights(summary.missing);
  const startWindowLabel = formatOperationalHourLabel(summary.startWindow);
  const endWindowLabel = formatOperationalHourLabel(summary.endWindow);
  return (
    <Card className="p-4 sm:p-6">
      <section className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
              Resumen
            </h3>
            <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.26em] text-[var(--accent)]">
              {currentDateLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={previousDateHref}
              aria-label="Ir a la fecha anterior"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--n-100)] text-[var(--n-500)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href={nextDateHref}
              aria-label="Ir a la fecha siguiente"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--n-100)] text-[var(--n-500)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex min-h-[8.5rem] flex-col items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-2 py-4 text-center sm:min-h-[10.5rem] sm:px-3 sm:py-5">
            <div className="grid h-full w-full max-w-[8.5rem] place-content-center justify-items-center gap-4">
              <p className="text-[11px] font-bold uppercase leading-[1.45] tracking-[0.24em] text-[var(--muted)]">
                Partidos de hoy
              </p>
              <p className="text-[2rem] font-black leading-none text-[var(--foreground)] sm:text-[2.6rem]">
                {summary.totalMatches}
              </p>
            </div>
          </div>
          <div className="flex min-h-[8.5rem] flex-col items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-2 py-4 text-center sm:min-h-[10.5rem] sm:px-3 sm:py-5">
            <div className="grid h-full w-full max-w-[8.5rem] place-content-center justify-items-center gap-4">
              <p className="text-[11px] font-bold uppercase leading-[1.45] tracking-[0.24em] text-[var(--muted)]">
                Ligas activas
              </p>
              <p className="text-[2rem] font-black leading-none text-[var(--foreground)] sm:text-[2.6rem]">
                {summary.activeLeagues}
              </p>
            </div>
          </div>
          <div className="flex min-h-[8.5rem] flex-col items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-2 py-4 text-center sm:min-h-[10.5rem] sm:px-3 sm:py-5">
            <div className="flex w-full max-w-[8.5rem] flex-col items-center justify-center gap-3">
              <p className="text-[11px] font-bold uppercase leading-[1.45] tracking-[0.24em] text-[var(--muted)]">
                Presión operativa
              </p>
              <div className="grid w-[5.75rem] justify-items-center gap-1.5 text-center">
                <p className="text-[1.3rem] font-black leading-none tabular-nums tracking-tight text-[var(--foreground)] sm:text-[1.6rem]">
                  {startWindowLabel}
                </p>
                <p className="text-[1.3rem] font-black leading-none tabular-nums tracking-tight text-[var(--foreground)] sm:text-[1.6rem]">
                  {endWindowLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <h4 className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-[var(--foreground)]">
            Asignaciones por personal
          </h4>
          {assignedPeopleCount > 0 ? (
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--n-400)]">
              {assignedPeopleCount} en línea
            </span>
          ) : null}
        </div>
        <div className="space-y-4">
          {visibleTopPeople.map((person, index) => {
              const tone = getAssignmentLoadTone(person.totalMatches);

              return (
                <div
                  key={person.id}
                  className={index === visibleTopPeople.length - 1 ? "flex items-center justify-between gap-3" : "flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4"}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border text-[0.82rem] font-black ${tone.avatarClassName}`}
                    >
                      {getInitials(person.fullName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[0.92rem] font-bold text-[var(--foreground)]">
                        {person.fullName}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--n-500)]">
                        {person.roleLabel}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] ${tone.badgeClassName}`}
                  >
                    {person.totalMatches}
                  </div>
                </div>
              );
            })}
          {canExpandPeople ? (
            <ExpandDivider
              expanded={showAllPeople}
              onToggle={() => setShowAllPeople((current) => !current)}
              collapsedLabel="Mostrar más personal"
              expandedLabel="Mostrar menos personal"
              className="py-[0.55rem]"
              lineClassName="border-[var(--border)]"
              buttonClassName="border-[var(--border)] text-[var(--n-500)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
            />
          ) : null}
        </div>
      </section>

      <section className="mt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <h4 className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-[var(--foreground)]">
            Focos de atención
          </h4>
        </div>
        <div className="space-y-4">
          {missingHighlights.map((item, index) => {
            const Icon = item.icon;
            const tone = getAttentionTone(item.emphasis, item.value);

            return (
              <div
                key={item.label}
                className={
                  index === missingHighlights.length - 1
                    ? "flex items-center justify-between gap-3"
                    : "flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4"
                }
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border ${tone.avatarClassName}`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[0.92rem] font-bold text-[var(--foreground)]">
                      {item.label}
                    </p>
                  </div>
                </div>
                <div
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] ${tone.badgeClassName}`}
                >
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 space-y-4 border-t border-[var(--border)] pt-6">
        <div>
          <h4 className="text-lg font-extrabold text-[var(--foreground)]">
            Insights rápidos
          </h4>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Métricas simples para entender en qué está fuerte o floja la jornada.
          </p>
        </div>
        <div className="grid gap-3">
          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--muted)]">
              IDs Plataforma listos
            </p>
            <p className="mt-2 text-lg font-black text-[var(--foreground)]">
              {summary.ready.productionCode}
            </p>
          </div>
          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--muted)]">
              Sedes confirmadas
            </p>
            <p className="mt-2 text-lg font-black text-[var(--foreground)]">
              {summary.ready.venue}
            </p>
          </div>
        </div>
      </section>
    </Card>
  );
}
