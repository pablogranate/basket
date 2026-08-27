import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
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
  // Fixed catch notice instead of ensureErrorMessage(error).
  errorNotice?: string;
  onError?: (error: unknown) => void;
};

export function defineAction<Ctx, I>(
  options: DefineActionOptions<Ctx, I>,
): (formData: FormData) => Promise<void> {
  return async function action(formData: FormData) {
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

      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: ensureErrorMessage(error),
      });
      return;
    }

    try {
      const parseResult = options.parse(formData);

      if (!parseResult.ok) {
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: parseResult.error,
        });
        return;
      }

      const outcome = await options.run(ctx, parseResult.input, { redirectTo });

      if ("error" in outcome) {
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
      options.onError?.(error);
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: options.errorNotice ?? ensureErrorMessage(error),
      });
    }
  };
}
