"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { setAccesoAction } from "@/app/actions/access";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  accesoLevelLabel,
  accesoLevelOptions,
  isLevelOffered,
  SIBLING_APP_LABELS,
  type AccesoLevel,
  type LevelOption,
  NONE_LEVEL_OPTION,
  type SiblingApp,
} from "@/lib/acceso/catalog";

// One matrix cell: the Nivel for one identity in one app. Saving grants,
// changes or revokes (none) the Acceso; the person feels it on their next
// request in that app.
export function AccesoLevelCell({
  userId,
  app,
  currentLevel,
}: {
  userId: string;
  app: SiblingApp;
  currentLevel: AccesoLevel | null;
}) {
  const current: LevelOption = currentLevel ?? NONE_LEVEL_OPTION;
  const [level, setLevel] = useState<LevelOption>(current);
  const hasChanged = level !== current;
  const options = accesoLevelOptions(app);
  // A Nivel the app no longer offers still shows, so the cell reflects the row.
  if (currentLevel && !isLevelOffered(app, currentLevel)) {
    options.unshift({ level: currentLevel, label: accesoLevelLabel(app, currentLevel) });
  }

  return (
    <form action={setAccesoAction} className="flex items-center gap-2">
      <input type="hidden" name="redirectTo" value="/access" />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="app" value={app} />
      <Select
        name="level"
        value={level}
        onChange={(event) => setLevel(event.target.value as LevelOption)}
        aria-label={`Nivel en ${SIBLING_APP_LABELS[app]}`}
        className={
          currentLevel
            ? "h-10 min-w-[8.5rem] px-3 py-0 font-semibold"
            : "h-10 min-w-[8.5rem] px-3 py-0 text-[var(--n-500)]"
        }
      >
        <option value={NONE_LEVEL_OPTION}>Sin acceso</option>
        {options.map((option) => (
          <option key={option.level} value={option.level}>
            {option.label}
          </option>
        ))}
      </Select>
      {hasChanged ? (
        <SubmitButton
          pendingLabel="…"
          className="h-10 gap-1 rounded-[var(--panel-radius)] px-3 text-xs font-bold"
        >
          <Check className="size-4" />
          Guardar
        </SubmitButton>
      ) : null}
    </form>
  );
}
