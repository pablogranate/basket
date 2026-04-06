import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

type CookieLike = {
  getAll(): Array<{ name: string }>;
  delete(name: string): void;
};

function isSupabaseAuthCookieName(name: string) {
  return (
    name === "supabase-auth-token" ||
    (name.startsWith("sb-") &&
      (name.includes("-auth-token") || name.includes("-code-verifier")))
  );
}

export function isRefreshTokenNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "refresh_token_not_found"
  );
}

export async function getSupabaseUserSafely(
  supabase: SupabaseClient<Database>,
): Promise<{ user: User | null; staleSession: boolean }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return { user: user ?? null, staleSession: false };
  } catch (error) {
    if (isRefreshTokenNotFoundError(error)) {
      return { user: null, staleSession: true };
    }

    throw error;
  }
}

export function clearSupabaseAuthCookies(...stores: Array<CookieLike | undefined>) {
  stores.forEach((store) => {
    if (!store) {
      return;
    }

    store
      .getAll()
      .filter((cookie) => isSupabaseAuthCookieName(cookie.name))
      .forEach((cookie) => {
        try {
          store.delete(cookie.name);
        } catch {
          // Ignore read-only cookie stores.
        }
      });
  });
}
