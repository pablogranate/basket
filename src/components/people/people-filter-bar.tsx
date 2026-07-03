"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { getAssignmentStateDisplayName } from "@/lib/display";
import {
  STATE_FILTER_VALUES,
  type PeopleFilterOptions,
  type PeopleFilters,
} from "@/lib/people-filters";
import type { PersonListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type PeopleFilterBarProps = {
  filters: PeopleFilters;
  options: PeopleFilterOptions;
  query: string;
};

const FILTER_KEYS = ["role", "state", "city", "team"] as const;

export function PeopleFilterBar({
  filters,
  options,
  query,
}: PeopleFilterBarProps) {
  const router = useRouter();
  const hasActiveFilters =
    FILTER_KEYS.some((key) => filters[key]) || filters.hideInactive;

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

    if (next.hideInactive) {
      params.set("hideInactive", "1");
    }

    const search = params.toString();
    return search ? `/people?${search}` : "/people";
  }

  function handleChange(key: (typeof FILTER_KEYS)[number], value: string) {
    router.push(buildHref({ [key]: value }));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        label="Rol"
        value={filters.role}
        options={options.roles}
        onChange={(value) => handleChange("role", value)}
      />
      <FilterSelect
        label="Estado"
        value={filters.state}
        options={STATE_FILTER_VALUES.map((state) => ({
          value: state,
          label: getAssignmentStateDisplayName(
            state as PersonListItem["assignment_state"],
          ),
        }))}
        onChange={(value) => handleChange("state", value)}
      />
      <FilterSelect
        label="Ciudad"
        value={filters.city}
        options={options.cities}
        onChange={(value) => handleChange("city", value)}
      />
      <FilterSelect
        label="Responsable de equipos"
        value={filters.team}
        options={options.teams}
        onChange={(value) => handleChange("team", value)}
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--n-400)]">
          Inactivos
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={filters.hideInactive}
          onClick={() =>
            router.push(buildHref({ hideInactive: !filters.hideInactive }))
          }
          className="inline-flex h-11 items-center gap-2.5 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--n-600)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]"
        >
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition",
              filters.hideInactive
                ? "border-[var(--accent-border)] bg-[var(--accent)]"
                : "border-[var(--n-200)] bg-[var(--n-100)]",
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute left-0.5 inline-flex size-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(28,13,16,0.2)] transition-transform",
                filters.hideInactive && "translate-x-4",
              )}
            />
          </span>
          Ocultar inactivos
        </button>
      </label>
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={() =>
            router.push(
              buildHref({
                role: "",
                state: "",
                city: "",
                team: "",
                hideInactive: false,
              }),
            )
          }
          className="inline-flex h-11 items-center gap-1.5 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--n-500)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
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
    <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--n-400)]">
        {label}
      </span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11"
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
