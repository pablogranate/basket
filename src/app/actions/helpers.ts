import { redirect, unstable_rethrow } from "next/navigation";

import { userErrorMessage } from "@/lib/errors";
import { reportError } from "@/lib/log";
import { sanitizeRedirectTo, getRedirectWithMessage } from "@/lib/search-params";

export function getRedirectTarget(
  formData: FormData,
  fallback = "/grid",
) {
  const redirectTo = formData.get("redirectTo");
  return sanitizeRedirectTo(
    typeof redirectTo === "string" ? redirectTo : null,
    fallback,
  );
}

export function redirectWithNotice(params: {
  redirectTo: string;
  intent: "success" | "error";
  notice: string;
  notify?: string[];
}) {
  redirect(
    getRedirectWithMessage(params.redirectTo, {
      intent: params.intent,
      notice: params.notice,
      notify: params.notify,
    }),
  );
}

export function rethrowNavigationError(error: unknown) {
  unstable_rethrow(error);
}

// The catch of an action (wrapped in withActionLog) that answers
// { ok: false, error } instead of redirecting: a DomainError keeps its
// message; anything else is reported on the action's line and answered with
// the generic message.
export function failedActionResult(error: unknown): { ok: false; error: string } {
  rethrowNavigationError(error);
  reportError(error, "action");
  return { ok: false, error: userErrorMessage(error) };
}
