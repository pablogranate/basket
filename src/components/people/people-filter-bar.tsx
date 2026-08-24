"use client";

import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

import { SERVER_RENDERED_PEOPLE_PARAMS } from "@/components/people/people-redirect-to";
import { Select } from "@/components/ui/select";
import { getAssignmentStateDisplayName } from "@/lib/display";
import {
  STATE_FILTER_VALUES,
  STATE_HIDE_INACTIVE,
  type PeopleFilterOptions,
  type PeopleFilters,
} from "@/lib/people-filters";
import type { PersonListItem } from "@/lib/types";

type PeopleFilterBarProps = {
  filters: PeopleFilters;
  options: PeopleFilterOptions;
  query: string;
};

const FILTER_KEYS = ["role", "state", "city", "team"] as const;

// Selects used to `router.push`, so every filter change re-ran getPeopleData and
// re-serialized the whole list server-side. The list is already on the client,
// so a select now only pushes the URL (shallow, via history.pushState) and the
// workspace re-filters from `useSearchParams`. The push stays inside a
// transition: that keeps the dimmed/aria-busy state while React repaints the
// (large) table.
export function PeopleFilterBar({
  filters,
  options,
  query,
}: PeopleFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const hasActiveFilters = FILTER_KEYS.some((key) => filters[key]);
  // buildHref drops `edit`/`notice`/`intent`, and the modal overlay and notice
  // banner behind them are server-rendered: a shallow update would leave them on
  // screen contradicting the URL. Fall back to the router in that case only.
  const needsServerRender = SERVER_RENDERED_PEOPLE_PARAMS.some((key) =>
    searchParams.has(key),
  );

  function buildHref(overrides: Partial<PeopleFilters>) {
    const params = new URLSearchParams();

    if (query) {
      params.set("q", query);
    }

    const next = { ...filters, ...overrides };
    for (const key of FILTER_KEYS) {
      if (next[key]) {
        params.set(key, next[key]);
      }
    }

    const search = params.toString();
    return search ? `/people?${search}` : "/people";
  }

  function navigate(href: string) {
    startTransition(() => {
      if (needsServerRender) {
        router.push(href);
        return;
      }

      window.history.pushState(null, "", href);
    });
  }

  function handleChange(key: (typeof FILTER_KEYS)[number], value: string) {
    navigate(buildHref({ [key]: value }));
  }

  return (
    <div
      className={cn(
        // Four full-width selects stacked into a ~260px wall at phone width, so
        // the filters pair up two-per-row there and only go back to the flex
        // toolbar from sm up.
        "grid grid-cols-2 items-end gap-2 transition-opacity sm:flex sm:flex-wrap sm:gap-3",
        isPending && "opacity-60",
      )}
      aria-busy={isPending}
    >
      <FilterSelect
        label="Rol"
        value={filters.role}
        options={options.roles}
        onChange={(value) => handleChange("role", value)}
      />
      <FilterSelect
        label="Estado"
        value={filters.state}
        options={[
          ...STATE_FILTER_VALUES.map((state) => ({
            value: state,
            label: getAssignmentStateDisplayName(
              state as PersonListItem["assignment_state"],
            ),
          })),
          { value: STATE_HIDE_INACTIVE, label: "Ocultar inactivos" },
        ]}
        onChange={(value) => handleChange("state", value)}
      />
      <FilterSelect
        label="Ciudad"
        value={filters.city}
        options={options.cities}
        onChange={(value) => handleChange("city", value)}
      />
      <FilterSelect
        label="Club"
        value={filters.team}
        options={options.teams}
        onChange={(value) => handleChange("team", value)}
      />
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={() =>
            navigate(buildHref({ role: "", state: "", city: "", team: "" }))
          }
          className="col-span-2 inline-flex h-11 items-center justify-center gap-1.5 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--n-500)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] sm:col-span-1 sm:justify-start"
        >
          <X className="size-4" />
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}

type FilterSelectOption = string | { value: string; label: string };

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 sm:min-w-[180px] sm:flex-1 sm:gap-1.5">
      <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--n-400)] sm:text-[11px] sm:tracking-[0.14em]">
        {label}
      </span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0"
      >
        <option value="">Todos</option>
        {options.map((option) => {
          const optionValue =
            typeof option === "string" ? option : option.value;
          const optionLabel =
            typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </Select>
    </label>
  );
}
