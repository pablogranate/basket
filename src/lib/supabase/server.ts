import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { appEnv, assertSupabaseEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  assertSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
    // Better Auth owns identity; this client is domain-data only. Disable session
    // handling so a stray (pre-cutover) Supabase auth cookie can't trigger a
    // GoTrue refresh ("refresh_token_not_found"). RLS is dropped, so anon is fine.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server components can render with read-only cookies.
        }
      },
    },
  });
}
