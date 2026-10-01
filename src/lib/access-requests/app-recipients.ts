import "server-only";

import { asc, eq } from "drizzle-orm";

import { authAppRequestRecipients } from "@/lib/auth/schema";
import { authDb } from "@/lib/db/auth-client";

// The "new Solicitud" mailing list of every app but the portal, edited by super
// admins in /usuarios. The portal's routing stays in app_settings (config.ts).

export async function listAppRequestRecipients(app: string): Promise<string[]> {
  const rows = await authDb
    .select({ email: authAppRequestRecipients.email })
    .from(authAppRequestRecipients)
    .where(eq(authAppRequestRecipients.app, app))
    .orderBy(asc(authAppRequestRecipients.email));

  return rows.map((row) => row.email);
}

export async function listAllAppRequestRecipients(): Promise<
  Record<string, string[]>
> {
  const rows = await authDb
    .select()
    .from(authAppRequestRecipients)
    .orderBy(asc(authAppRequestRecipients.email));
  const byApp: Record<string, string[]> = {};

  for (const row of rows) {
    (byApp[row.app] ??= []).push(row.email);
  }

  return byApp;
}

// Replaces the whole list in one transaction. Addresses arrive already parsed
// and validated.
export async function setAppRequestRecipients(input: {
  app: string;
  emails: string[];
}): Promise<void> {
  await authDb.transaction(async (tx) => {
    await tx
      .delete(authAppRequestRecipients)
      .where(eq(authAppRequestRecipients.app, input.app));

    if (input.emails.length) {
      await tx
        .insert(authAppRequestRecipients)
        .values(input.emails.map((email) => ({ app: input.app, email })));
    }
  });
}
