import "server-only";

import { getAccessRequestRecipientConfig } from "@/lib/access-requests/config";
import { resolveAccessRequestRecipients } from "@/lib/access-requests/recipients";
import { sendAccessRequestEmail } from "@/lib/email/mailer";
import { appEnv } from "@/lib/env";

// Best-effort per recipient: a bounced or misconfigured address must never lose
// the request, which is already persisted by the time this runs (D-05).
export async function notifyAccessRequest(request: {
  fullName: string;
  email: string;
  phone: string;
  funcion: string;
  ciudad: string | null;
  mensaje: string | null;
}) {
  const config = await getAccessRequestRecipientConfig();
  const recipients = resolveAccessRequestRecipients({
    funcion: request.funcion,
    config,
  });

  if (!recipients.length) {
    console.warn(
      `[access-requests] no recipients configured for funcion "${request.funcion}"`,
    );
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    recipients.map((to) =>
      sendAccessRequestEmail({
        to,
        request,
        portalUrl: `${appEnv.portalBaseUrl}/grid`,
      }),
    ),
  );

  const failed = results.filter((result) => result.status === "rejected").length;

  if (failed) {
    console.error(
      `[access-requests] ${failed}/${recipients.length} notification emails failed`,
    );
  }

  return { sent: recipients.length - failed, failed };
}
