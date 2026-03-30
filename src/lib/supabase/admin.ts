import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { appEnv, assertServiceRoleKey, assertSupabaseEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  assertSupabaseEnv();
  assertServiceRoleKey();

  return createClient<Database>(
    appEnv.supabaseUrl,
    appEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
