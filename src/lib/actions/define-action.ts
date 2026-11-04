import { addFields } from "basket-tv-telemetry/log";
import { withActionLog } from "basket-tv-telemetry/next";
import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { isDomainError, userErrorMessage } from "@/lib/errors";
import { reportError } from "@/lib/log";
import { ensureErrorMessage } from "@/lib/utils";

export type ParseResult<I> =
  | { ok: true; input: I }
  | { ok: false; error: string };

export function parsed<I>(input: I): ParseResult<I> {
  return { ok: true, input };
}

export function parseFailure<I>(error: string): ParseResult<I> {
  return { ok: false, error };
}

// What `run` resolves to: either a success redirect (optionally overriding the
// target, adding revalidations, notify ids or a non-success intent for partial
// outcomes) or an explicit error notice (optionally redirected elsewhere).
export type ActionOutcome =
  | {
      notice: string;
      intent?: "success" | "error";
      redirectTo?: string;
      revalidate?: string[];
      notify?: string[];
    }
  | { error: string; redirectTo?: string };

export type ActionMeta = { redirectTo: string };

type DefineActionOptions<Ctx, I> = {
  // The exported action's name: the `route` of its log line.
  name: string;
  // Fallback for getRedirectTarget when the form carries no redirectTo.
  fallbackRedirect: string;
  // Replaces getRedirectTarget entirely (actions whose base target is derived
  // from the form, e.g. /match/{id}).
  resolveRedirect?: (formData: FormData) => string;
  authz: () => Promise<Ctx>;
  // When true an authz failure surfaces as an error-notice redirect; when
  // false/omitted it propagates unhandled (the historical pre-try guard).
  authzFailureNotice?: boolean;
  // PURE: no db, no auth. A failure becomes an error-notice redirect and run
  // is never called.
  parse: (formData: FormData) => ParseResult<I>;
  run: (ctx: Ctx, input: I, meta: ActionMeta) => Promise<ActionOutcome>;
  // Static paths revalidated on success, before run's own revalidate list.
  revalidate?: string[];
  // Fixed catch notice instead of a DomainError's message or the generic one.
  errorNotice?: string;
};

// The actor's Better Auth id and portal role, when the authz context has them.
// Only the keys it has: an undefined one would erase what getUserContext set.
function actorFields(ctx: unknown): { user_id?: string; role?: string } {
  const { userId, role } = (ctx ?? {}) as { userId?: unknown; role?: unknown };
  return {
    ...(typeof userId === "string" ? { user_id: userId } : {}),
    ...(typeof role === "string" ? { role } : {}),
  };
}

function rejected(reason: string) {
  addFields({ outcome: "rejected", reason });
}

export function defineAction<Ctx, I>(
  options: DefineActionOptions<Ctx, I>,
): (formData: FormData) => Promise<void> {
  return withActionLog(options.name, async (formData: FormData) => {
    const redirectTo = options.resolveRedirect
      ? options.resolveRedirect(formData)
      : getRedirectTarget(formData, options.fallbackRedirect);

    let ctx: Ctx;

    try {
      ctx = await options.authz();
    } catch (error) {
      rethrowNavigationError(error);

      if (!options.authzFailureNotice) {
        throw error;
      }

      rejected("no_access");
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: ensureErrorMessage(error),
      });
      return;
    }

    addFields(actorFields(ctx));

    try {
      const parseResult = options.parse(formData);

      if (!parseResult.ok) {
        rejected("invalid_input");
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: parseResult.error,
        });
        return;
      }

      const outcome = await options.run(ctx, parseResult.input, { redirectTo });

      if ("error" in outcome) {
        rejected("domain_rule");
        redirectWithNotice({
          redirectTo: outcome.redirectTo ?? redirectTo,
          intent: "error",
          notice: outcome.error,
        });
        return;
      }

      for (const path of options.revalidate ?? []) {
        revalidatePath(path);
      }

      for (const path of outcome.revalidate ?? []) {
        revalidatePath(path);
      }

      redirectWithNotice({
        redirectTo: outcome.redirectTo ?? redirectTo,
        intent: outcome.intent ?? "success",
        notice: outcome.notice,
        notify: outcome.notify,
      });
    } catch (error) {
      rethrowNavigationError(error);
      // Only what run threw: a parse failure, a returned { error } or a
      // DomainError is a domain outcome, not a failure of the app.
      if (isDomainError(error)) {
        rejected("domain_rule");
      } else {
        reportError(error, options.name);
      }
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: options.errorNotice ?? userErrorMessage(error),
      });
    }
  });
}
