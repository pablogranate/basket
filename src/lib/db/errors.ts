// Postgres unique_violation. The postgres driver puts the SQLSTATE on `code`,
// and drizzle wraps driver failures in a DrizzleQueryError whose `cause` is the
// driver error — so the code is found by walking the cause chain, not on the
// thrown object itself. Driver errors are not always Error instances, hence the
// structural reads.
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    if ((current as { code?: string }).code === "23505") {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
