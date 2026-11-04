import { isDomainError } from "@/lib/errors";
import {
  reportServerError,
  scrubErrorMessage,
  type ServerErrorContext,
} from "@/lib/telemetry";

// Ids, counts and enums only.
export type LogFields = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

const MAX_DETAIL_LENGTH = 200;

function describeOne(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name || "Error"}: ${scrubErrorMessage(error.message)}`;
  }

  return `${typeof error}: ${scrubErrorMessage(String(error))}`;
}

// A failed query wraps the driver's error, whose message says what went wrong.
export function describeError(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof Error
    ? `${describeOne(error)} (cause ${describeOne(cause)})`
    : describeOne(error);
}

function formatFields(fields: LogFields | undefined): string {
  if (!fields) {
    return "";
  }

  const pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length ? ` ${pairs.join(" ")}` : "";
}

// One line per failure: the tag, the error's name and its scrubbed message,
// then the extra fields. Never the error object.
export function logError(tag: string, error: unknown, extra?: LogFields): void {
  console.error(`${tag}: ${describeError(error)}${formatFields(extra)}`);
}

// Logs and reports a caught failure once. A DomainError is an outcome, not a
// failure: nothing is logged or reported.
export function reportError(
  tag: string,
  error: unknown,
  context: ServerErrorContext,
  extra?: LogFields,
): void {
  if (isDomainError(error)) {
    return;
  }

  logError(tag, error, extra);
  reportServerError(error, context);
}

// The start of an upstream response body, scrubbed.
export function upstreamDetail(body: string): string {
  return scrubErrorMessage(body).slice(0, MAX_DETAIL_LENGTH);
}

// A failed upstream call: its status and the start of its body.
export function logUpstreamError(
  tag: string,
  response: { status: number; body: string },
  extra?: LogFields,
): void {
  console.error(
    `${tag}: status=${response.status}${formatFields(extra)} detail=${upstreamDetail(response.body)}`,
  );
}

// A message to store where a page or a response reads it back later: a
// DomainError's own text, otherwise the scrubbed message. Driver errors are
// not always Error instances, so `.message` is read explicitly.
export function storedErrorMessage(error: unknown): string {
  if (isDomainError(error)) {
    return error.message;
  }

  const message =
    error instanceof Error
      ? error.message
      : (error as { message?: unknown } | null)?.message;
  return scrubErrorMessage(
    typeof message === "string" && message ? message : String(error),
  );
}
