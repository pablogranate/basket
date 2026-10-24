// Canonical capabilities a person can perform.
// IMPORTANT: keep this list in sync with the CHECK constraint in
// supabase/migrations/0012_add_person_functions.sql (person_functions_key_check).
export const PERSON_FUNCTIONS = [
  "Responsable",
  "Realizador",
  "Operador de Control",
  "Operador de Grafica",
  "Soporte tecnico",
  "Productor",
  "Relator",
  "Comentario", // collapsed from Comentario 1 / Comentario 2
  "Campo",
  "Encoder",
  "Ingenieria",
  "Camara", // collapsed from Camara 1..5
] as const;

export type PersonFunctionKey = (typeof PERSON_FUNCTIONS)[number];

const PERSON_FUNCTION_SET = new Set<string>(PERSON_FUNCTIONS);

export function isPersonFunctionKey(value: string): value is PersonFunctionKey {
  return PERSON_FUNCTION_SET.has(value);
}

// Maps a roles.name (the value stored in ASSIGNMENT_ROLE_BY_KEY) to its function,
// collapsing the trailing slot index. Anchored to avoid matching "Camarografo".
export function roleNameToFunctionKey(roleName: string): PersonFunctionKey | null {
  const trimmed = roleName.trim();

  if (/^Camara\s*\d+$/i.test(trimmed)) {
    return "Camara";
  }

  if (/^Comentario\s*\d+$/i.test(trimmed)) {
    return "Comentario";
  }

  const exact = PERSON_FUNCTIONS.find(
    (key) => key.toLowerCase() === trimmed.toLowerCase(),
  );

  return exact ?? null;
}

// Strict filter: only people whose declared capabilities include the role's
// function. A null key (role with no mapped function) leaves the list untouched.
// Used by every assignment dropdown so the rule has a single definition.
export function peopleAssignableTo<T extends { functions: PersonFunctionKey[] }>(
  people: T[],
  functionKey: PersonFunctionKey | null,
): T[] {
  if (!functionKey) {
    return people;
  }

  return people.filter((person) => person.functions.includes(functionKey));
}
