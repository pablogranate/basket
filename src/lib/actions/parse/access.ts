import {
  parsed,
  parseFailure,
  type ParseResult,
} from "@/lib/actions/define-action";
import {
  type AccesoLevel,
  accesoLevelOptions,
  isAccesoLevel,
  isSiblingApp,
  NONE_LEVEL_OPTION,
  type SiblingApp,
} from "@/lib/acceso/catalog";

// One matrix cell: level null means "none" — revoke the Acceso.
export type SetAccesoInput = {
  userId: string;
  app: SiblingApp;
  level: AccesoLevel | null;
};

export function parseSetAcceso(formData: FormData): ParseResult<SetAccesoInput> {
  const userId = String(formData.get("userId") ?? "").trim();
  const app = String(formData.get("app") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim();

  if (!userId) {
    return parseFailure("Falta la identidad.");
  }

  if (!isSiblingApp(app)) {
    return parseFailure("App desconocida.");
  }

  if (level === NONE_LEVEL_OPTION) {
    return parsed({ userId, app, level: null });
  }

  if (!isAccesoLevel(level)) {
    return parseFailure("Nivel desconocido.");
  }

  if (!accesoLevelOptions(app).some((option) => option.level === level)) {
    return parseFailure("Ese nivel no aplica a esta app.");
  }

  return parsed({ userId, app, level });
}
