import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { appEnv, assertServiceRoleKey, assertSupabaseEnv } from "@/lib/env";

// One client per process: the service-role client holds no per-request state
// (no session persistence, no auth refresh), and each loader used to rebuild
// it — several times per request — for nothing.
let adminClient: SupabaseClient<Database> | null = null;

export function createSupabaseAdminClient() {
  if (adminClient) {
    return adminClient;
  }

  assertSupabaseEnv();
  assertServiceRoleKey();

  adminClient = createClient<Database>(
    appEnv.supabaseUrl,
    appEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return adminClient;
}
