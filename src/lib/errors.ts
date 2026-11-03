import { unexpectedErrorMessage } from "@/lib/utils";

// An expected outcome of a domain rule ("No se encontró el partido."), safe to
// show as it is. Anything else that reaches a catch is unexpected: it is
// logged, reported and shown as the generic message.
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function userErrorMessage(error: unknown): string {
  return isDomainError(error) ? error.message : unexpectedErrorMessage();
}
