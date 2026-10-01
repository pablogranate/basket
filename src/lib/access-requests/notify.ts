import "server-only";

import { listAppRequestRecipients } from "@/lib/access-requests/app-recipients";
import { getAccessRequestRecipientConfig } from "@/lib/access-requests/config";
import { resolveRequestRecipients } from "@/lib/access-requests/recipients";
import { requestAsksFuncion } from "@/lib/acceso/catalog";
import { buildApexUrl } from "@/lib/constants";
import { sendAccessRequestEmail } from "@/lib/email/mailer";
import { appEnv } from "@/lib/env";

async function loadAppRecipients(app: string): Promise<string[]> {
  try {
    return await listAppRequestRecipients(app);
  } catch (error) {
    console.error("[access-requests] failed to load app recipients", error);
    return [];
  }
}

// Where the email sends a decider: the portal dashboard for portal requests,
// the apex directory (where super admins decide every app) otherwise.
function reviewUrl(app: string): string {
  if (requestAsksFuncion(app)) {
    return `${appEnv.portalBaseUrl}/grid`;
  }

  return buildApexUrl(new URL(appEnv.portalBaseUrl).host) ?? appEnv.portalBaseUrl;
}

// Best-effort per recipient: a bounced or misconfigured address must never lose
// the request, which is already persisted by the time this runs (D-05).
export async function notifyAccessRequest(request: {
  app: string;
  appLabel: string;
  fullName: string;
  email: string;
  phone: string;
  funcion: string | null;
  ciudad: string | null;
  mensaje: string | null;
}) {
  const asksFuncion = requestAsksFuncion(request.app);
  const [portalConfig, appRecipients] = await Promise.all([
    asksFuncion ? getAccessRequestRecipientConfig() : null,
    asksFuncion ? [] : loadAppRecipients(request.app),
  ]);
  const recipients = resolveRequestRecipients({
    app: request.app,
    funcion: request.funcion,
    portalConfig: portalConfig ?? { byFuncion: {}, always: [] },
    appRecipients,
  });

  if (!recipients.length) {
    console.warn(
      `[access-requests] no recipients configured for app "${request.app}"${
        request.funcion ? `, funcion "${request.funcion}"` : ""
      }`,
    );
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    recipients.map((to) =>
      sendAccessRequestEmail({
        to,
        request,
        reviewUrl: reviewUrl(request.app),
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
