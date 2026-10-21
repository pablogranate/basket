"use client";

import { useId, useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  countTeamsInLeague,
  getTeamPickerLeagues,
  NO_LEAGUE,
  searchTeamPicker,
  type TeamPickerCatalog,
  type TeamPickerLeague,
  type TeamPickerTeam,
} from "@/lib/team-picker";
import type { PersonTeamLink } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_LEAGUES = "";

// Every linked team is submitted as a hidden teamIds field, including one the
// catalog does not hold: saving the ficha replaces all links, and a link the
// picker cannot show must not vanish unseen.
export function PersonTeamsField({
  catalog,
  selected,
  disabled = false,
}: {
  catalog: TeamPickerCatalog;
  selected: PersonTeamLink[];
  disabled?: boolean;
}) {
  const [picked, setPicked] = useState<PersonTeamLink[]>(selected);
  const pickedIds = useMemo(
    () => new Set(picked.map((team) => team.id)),
    [picked],
  );

  function toggle(team: TeamPickerTeam) {
    setPicked((current) =>
      current.some((entry) => entry.id === team.id)
        ? current.filter((entry) => entry.id !== team.id)
        : [...current, { id: team.id, name: team.name }],
    );
  }

  function remove(teamId: string) {
    setPicked((current) => current.filter((entry) => entry.id !== teamId));
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-[var(--n-700)]">Club</legend>
      <p className="text-[11px] italic text-[var(--n-400)]">
        Equipos de los que esta persona es responsable de cancha.
      </p>
      {picked.map((team) => (
        <input key={team.id} type="hidden" name="teamIds" value={team.id} />
      ))}
      {disabled ? null : (
        <TeamSearch catalog={catalog} pickedIds={pickedIds} onToggle={toggle} />
      )}
      <AssignedTeams
        catalog={catalog}
        teams={picked}
        canRemove={!disabled}
        onRemove={remove}
      />
    </fieldset>
  );
}

function TeamSearch({
  catalog,
  pickedIds,
  onToggle,
}: {
  catalog: TeamPickerCatalog;
  pickedIds: Set<string>;
  onToggle: (team: TeamPickerTeam) => void;
}) {
  const listboxId = useId();
  const [leagueSlug, setLeagueSlug] = useState(ALL_LEAGUES);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const groups = useMemo(
    () =>
      searchTeamPicker(catalog, { leagueSlug: leagueSlug || null, query }),
    [catalog, leagueSlug, query],
  );
  const options = groups.flatMap((group) => group.teams);
  const groupOffsets = groups.map((_, groupIndex) =>
    groups
      .slice(0, groupIndex)
      .reduce((total, group) => total + group.teams.length, 0),
  );
  const optionId = (index: number) => `${listboxId}-${index}`;

  if (!catalog.teams.length) {
    return (
      <p className="text-[11px] text-[var(--n-400)]">
        No hay equipos disponibles.
      </p>
    );
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((index) =>
        Math.min(Math.max(index + step, 0), options.length - 1),
      );
    } else if (event.key === "Enter") {
      // Never submits the ficha from the search box.
      event.preventDefault();
      if (isOpen && options[highlighted]) {
        onToggle(options[highlighted]);
      }
    } else if (event.key === "Escape" && isOpen) {
      // Closes the list, not the modal around it.
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    }
  }

  return (
    <div
      className="space-y-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label="Liga"
          className="sm:w-56 sm:flex-none"
          value={leagueSlug}
          onChange={(event) => {
            setLeagueSlug(event.target.value);
            setHighlighted(0);
            setIsOpen(true);
          }}
        >
          <option value={ALL_LEAGUES}>Todas las ligas</option>
          {catalog.leagues.map((league) => (
            <option key={league.slug} value={league.slug}>
              {league.name} ({countTeamsInLeague(catalog, league.slug)})
            </option>
          ))}
        </Select>
        <Input
          type="search"
          role="combobox"
          aria-label="Buscar equipo"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && options.length ? optionId(highlighted) : undefined
          }
          autoComplete="off"
          placeholder="Agregar equipo…"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setIsOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          className="max-h-64 overflow-y-auto rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-white py-1"
        >
          {options.length ? null : (
            <li className="px-3 py-2 text-xs text-[var(--n-400)]">
              Ningún equipo coincide.
            </li>
          )}
          {groups.map((group, groupIndex) => (
            <li key={group.league.slug} role="presentation">
              <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--n-400)]">
                <LeagueDot league={group.league} />
                {group.league.name}
              </div>
              <ul role="group" aria-label={group.league.name}>
                {group.teams.map((team, teamIndex) => {
                  const index = groupOffsets[groupIndex] + teamIndex;
                  const isPicked = pickedIds.has(team.id);

                  return (
                    <li
                      key={team.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={isPicked}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm text-[var(--n-800)]",
                        index === highlighted && "bg-[var(--n-100)]",
                        isPicked && "font-semibold",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => onToggle(team)}
                    >
                      <span>
                        {team.name}
                        <OtherLeagues
                          catalog={catalog}
                          team={team}
                          except={group.league.slug}
                        />
                      </span>
                      {isPicked ? (
                        <Check className="size-4 flex-none text-[var(--n-700)]" />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OtherLeagues({
  catalog,
  team,
  except,
}: {
  catalog: TeamPickerCatalog;
  team: TeamPickerTeam;
  except: string;
}) {
  const others = getTeamPickerLeagues(catalog, team.id).filter(
    (league) => league.slug !== except,
  );

  if (!others.length) {
    return null;
  }

  return (
    <span className="ml-2 text-[11px] font-normal text-[var(--n-400)]">
      {others.map((league) => league.name).join(" · ")}
    </span>
  );
}

function AssignedTeams({
  catalog,
  teams,
  canRemove,
  onRemove,
}: {
  catalog: TeamPickerCatalog;
  teams: PersonTeamLink[];
  canRemove: boolean;
  onRemove: (teamId: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (!teams.length) {
    return (
      <p className="rounded-[var(--panel-radius)] border border-dashed border-[var(--n-200)] px-3 py-2.5 text-xs text-[var(--n-400)]">
        Todavía no es responsable de ningún equipo.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px] text-[var(--n-400)]">
        <span>Asignados</span>
        <span>{teams.length}</span>
      </div>
      <ul className="divide-y divide-[var(--n-100)] overflow-hidden rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-white">
        {teams.map((team) => {
          const leagues = getTeamPickerLeagues(catalog, team.id);
          const isConfirming = confirmingId === team.id;

          return (
            <li
              key={team.id}
              className={cn(
                "group flex min-h-11 flex-wrap items-center gap-2.5 px-3 py-2 text-sm",
                isConfirming && "bg-[var(--n-50)]",
              )}
              onBlur={(event) => {
                if (
                  isConfirming &&
                  !event.currentTarget.contains(event.relatedTarget)
                ) {
                  setConfirmingId(null);
                }
              }}
              onKeyDown={(event) => {
                if (isConfirming && event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setConfirmingId(null);
                }
              }}
            >
              {leagues[0] ? <LeagueDot league={leagues[0]} /> : null}
              <span className="font-medium text-[var(--n-800)]">{team.name}</span>
              {isConfirming ? (
                <>
                  <span className="ml-auto whitespace-nowrap text-xs text-[var(--n-600)]">
                    ¿Quitar como responsable?
                  </span>
                  <Button
                    variant="secondary"
                    className="px-2.5 py-1 text-xs"
                    onClick={() => setConfirmingId(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    autoFocus
                    variant="danger"
                    className="px-2.5 py-1 text-xs"
                    onClick={() => {
                      setConfirmingId(null);
                      onRemove(team.id);
                    }}
                  >
                    Quitar
                  </Button>
                </>
              ) : (
                <>
                  <span className="ml-auto whitespace-nowrap text-[11px] text-[var(--n-400)]">
                    {leagues.length
                      ? leagues.map((league) => league.name).join(" · ")
                      : NO_LEAGUE.name}
                  </span>
                  {canRemove ? (
                    <button
                      type="button"
                      aria-label={`Quitar ${team.name}`}
                      title="Quitar"
                      className="grid size-6 flex-none place-items-center rounded-md text-[var(--n-400)] transition hover:bg-[var(--n-100)] hover:text-[var(--n-700)] focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                      onClick={() => setConfirmingId(team.id)}
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LeagueDot({ league }: { league: TeamPickerLeague }) {
  return (
    <span
      aria-hidden
      className="size-2 flex-none rounded-full bg-[var(--n-300)]"
      style={league.color ? { backgroundColor: league.color } : undefined}
    />
  );
}
