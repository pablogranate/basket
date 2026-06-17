import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Better Auth owns identity; Supabase is the domain DB only. Since migration
// 0020 RLS denies the anon/authenticated roles on every table, so all
// server-side domain access runs through the service-role client (which
// bypasses RLS). Authorization is enforced in the app layer
// (withAuth / requireEditor / requireUserContext), never in the database.
//
// Kept async + same name so the existing callers need no change. The
// `server-only` import guarantees this never reaches a client bundle.
export async function createSupabaseServerClient() {
  return createSupabaseAdminClient();
}
