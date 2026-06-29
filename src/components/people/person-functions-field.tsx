import { getFunctionDisplayName } from "@/lib/display";
import { PERSON_FUNCTIONS } from "@/lib/functions";

export function PersonFunctionsField({
  selected,
  disabled = false,
}: {
  selected: string[];
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected);

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-[var(--n-700)]">Funciones</legend>
      <p className="text-[11px] italic text-[var(--n-400)]">
        Determinan en qué columnas del grid se sugiere a esta persona.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PERSON_FUNCTIONS.map((functionKey) => (
          <label
            key={functionKey}
            className="flex items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-3 py-2 text-sm font-medium text-[var(--n-800)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-white"
          >
            <input
              type="checkbox"
              name="functions"
              value={functionKey}
              defaultChecked={selectedSet.has(functionKey)}
              className="size-4 accent-[var(--accent)]"
            />
            {getFunctionDisplayName(functionKey)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
