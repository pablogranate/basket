import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { appEnv, assertSupabaseEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createSupabaseBrowserClient() {
  assertSupabaseEnv();

  if (!client) {
    client = createBrowserClient<Database>(
      appEnv.supabaseUrl,
      appEnv.supabaseAnonKey,
      {
        // Domain-data only; Better Auth owns identity. Disable session handling
        // so a stray Supabase auth cookie can't trigger a GoTrue refresh.
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  return client;
}
