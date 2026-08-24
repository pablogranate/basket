"use client";

import { useMemo, type ReactNode } from "react";
import { Camera, Mic2, UserRoundX, Users, Video } from "lucide-react";

import { PeopleCardList } from "@/components/people/people-card-list";
import { PeopleFilterBar } from "@/components/people/people-filter-bar";
import { PeopleSearchField } from "@/components/people/people-search-field";
import { PeopleTable } from "@/components/people/people-table";
import { usePeopleView } from "@/components/people/people-view-context";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTableCard } from "@/components/ui/section-table-card";
import { StatCard } from "@/components/ui/stat-card";
import { SECTION_COPY } from "@/lib/copy";
import { derivePeopleFilterOptions } from "@/lib/people-filters";

// Stats, filter bar and table all read the same client-side slice, so a filter
// change repaints them together without a server round-trip. `deleteButton` is a
// server-rendered node (it needs the selected person) handed in as a prop.
export function PeopleWorkspaceClient({
  canEdit,
  deleteButton,
}: {
  canEdit: boolean;
  deleteButton?: ReactNode;
}) {
  const { allPeople, rows, filters, query } = usePeopleView();
  const filterOptions = useMemo(
    () => derivePeopleFilterOptions(allPeople),
    [allPeople],
  );
  // One pass over the visible rows, reading the funciones each person carries,
  // instead of three passes each re-parsing every person's notes.
  const stats = useMemo(() => {
    let activeCount = 0;
    let relatorCount = 0;
    let producerCount = 0;
    let cameraCount = 0;

    for (const row of rows) {
      if (!row.person.active) {
        continue;
      }

      activeCount += 1;

      const functions = row.person.functions;

      if (functions.includes("Relator")) {
        relatorCount += 1;
      }

      if (functions.includes("Productor")) {
        producerCount += 1;
      }

      if (functions.includes("Camara")) {
        cameraCount += 1;
      }
    }

    return {
      activeCount,
      inactiveCount: rows.length - activeCount,
      relatorCount,
      producerCount,
      cameraCount,
    };
  }, [rows]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          label="Personal activo"
          value={stats.activeCount}
          icon={Users}
          tone="accent"
        />
        <StatCard
          label="Personal inactivo"
          value={stats.inactiveCount}
          icon={UserRoundX}
          tone="danger"
        />
        <div className="hidden sm:block">
          <StatCard
            label="Relatores activos"
            value={stats.relatorCount}
            icon={Mic2}
            tone="info"
          />
        </div>
        <div className="hidden sm:block">
          <StatCard
            label="Productores activos"
            value={stats.producerCount}
            icon={Video}
            tone="neutral"
          />
        </div>
        <div className="hidden sm:block">
          <StatCard
            label="Cámaras activas"
            value={stats.cameraCount}
            icon={Camera}
            tone="neutral"
          />
        </div>
      </div>

      <div className="space-y-3">
        {/* The header keeps the search field from sm up; at phone width it sits
            here instead, right above the filters it feeds. */}
        <PeopleSearchField className="sm:hidden" />
        {allPeople.length ? (
          <PeopleFilterBar
            filters={filters}
            options={filterOptions}
            query={query}
          />
        ) : null}
      </div>

      <SectionTableCard
        title={SECTION_COPY.people.tableTitle}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--n-200)] bg-[var(--n-100)] px-3 py-1 text-xs font-bold text-[var(--n-600)]">
              <span className="size-1.5 rounded-full bg-[var(--n-400)]" />
              {stats.activeCount} Activos
            </span>
            {deleteButton}
          </div>
        }
      >
        {rows.length ? (
          <>
            <div className="hidden sm:block">
              <PeopleTable rows={rows} canEdit={canEdit} />
            </div>
            <div className="sm:hidden">
              <PeopleCardList rows={rows} canEdit={canEdit} />
            </div>
          </>
        ) : (
          <div className="p-6">
            <EmptyState
              title="No hay personal cargado"
              description="Agrega integrantes del equipo técnico, talento y responsables para empezar a asignar."
            />
          </div>
        )}
      </SectionTableCard>
    </>
  );
}
