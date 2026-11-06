// The postgres driver puts the SQLSTATE on `code`, and drizzle wraps driver
// failures in a DrizzleQueryError whose `cause` is the driver error — so the
// code is found by walking the cause chain, not on the thrown object itself.
// Driver errors are not always Error instances, hence the structural reads.
function findDriverError(error: unknown, code: string) {
  let current: unknown = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    if ((current as { code?: string }).code === code) {
      return current as { code: string; constraint_name?: string };
    }

    current = (current as { cause?: unknown }).cause;
  }

  return null;
}

// Postgres unique_violation.
export function isUniqueViolation(error: unknown): boolean {
  return findDriverError(error, "23505") !== null;
}

// Postgres foreign_key_violation: the constraint that refused, or null when
// the error is something else.
export function foreignKeyViolation(error: unknown): { constraint: string } | null {
  const found = findDriverError(error, "23503");
  return found ? { constraint: found.constraint_name ?? "" } : null;
}
