import type { PersonTeamLink } from "@/lib/types";

export function PersonTeamsField({
  options,
  selected,
  disabled = false,
}: {
  options: PersonTeamLink[];
  selected: string[];
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected);

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-[var(--n-700)]">Club</legend>
      <p className="text-[11px] italic text-[var(--n-400)]">
        Equipos de los que esta persona es responsable de cancha.
      </p>
      {options.length ? (
        <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {options.map((team) => (
            <label
              key={team.id}
              className="flex items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-3 py-2 text-sm font-medium text-[var(--n-800)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-white"
            >
              <input
                type="checkbox"
                name="teamIds"
                value={team.id}
                defaultChecked={selectedSet.has(team.id)}
                className="size-4 accent-[var(--accent)]"
              />
              {team.name}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--n-400)]">
          No hay equipos disponibles.
        </p>
      )}
    </fieldset>
  );
}
