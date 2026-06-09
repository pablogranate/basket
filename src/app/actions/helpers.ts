import { redirect, unstable_rethrow } from "next/navigation";

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
