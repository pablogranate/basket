"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

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

export function PeopleFilterBar({
  filters,
  options,
  query,
}: PeopleFilterBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasActiveFilters = FILTER_KEYS.some((key) => filters[key]);

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

  function handleChange(key: (typeof FILTER_KEYS)[number], value: string) {
    startTransition(() => {
      router.push(buildHref({ [key]: value }));
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 transition-opacity",
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
        label="Responsable de equipos"
        value={filters.team}
        options={options.teams}
        onChange={(value) => handleChange("team", value)}
      />
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={() =>
            startTransition(() => {
              router.push(buildHref({ role: "", state: "", city: "", team: "" }));
            })
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
