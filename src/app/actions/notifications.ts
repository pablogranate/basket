"use server";

import { and, eq, inArray } from "drizzle-orm";

import { defineAction } from "@/lib/actions/define-action";
import {
  parseSendAllMatchNotifications,
  parseSendAssignmentNotifications,
  resolveMatchRedirect,
} from "@/lib/actions/parse/notifications";
import { requireEditor } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  people as peopleTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import { isWhatsAppSendEnabled } from "@/lib/env";
import { buildMatchNotificationMessage } from "@/lib/integrations";
import { sendWhatsAppText } from "@/lib/integrations/openwa";
import { insertNotificationLogs } from "@/lib/notifications/log";
import { trackServerEvent } from "@/lib/telemetry";
import {
  buildRecipientLogRows,
  type ChannelOutcome,
  type NotificationLogRow,
} from "@/lib/notifications/log-rows";
import {
  buildMatchRecipients,
  getChannelEligibility,
  INVALID_PHONE_ERROR,
} from "@/lib/notifications/recipients";
import {
  notifyMatch,
  type NotifyMatchRow,
} from "@/lib/notifications/send-match-day";

// Manual "Enviar notificación a todos": fires WhatsApp + email to every current
// assignee, always (regardless of day_notified_at), then (re)stamps the marker
// so the automatic schedule treats the match as handled. Reuses the same send
// core as the cron via notifyMatch. Admin client is justified here — it mirrors
// the cron's privileged send and authorization is enforced by requireEditor.
const sendAllMatchNotifications = defineAction({
  fallbackRedirect: "/grid",
  resolveRedirect: resolveMatchRedirect,
  authz: requireEditor,
  // A permission error surfaces as a notice instead of an unhandled action
  // rejection.
  authzFailureNotice: true,
  parse: parseSendAllMatchNotifications,
  async run(ctx, { matchId }, meta) {
    if (!matchId) {
      return {
        error: "No se indicó el partido a notificar.",
        redirectTo: "/grid",
      };
    }

    const matchRows = await db
      .select({
        id: matchesTable.id,
        away_team: matchesTable.awayTeam,
        competition: matchesTable.competition,
        home_team: matchesTable.homeTeam,
        kickoff_at: matchesTable.kickoffAt,
        production_mode: matchesTable.productionMode,
        timezone: matchesTable.timezone,
        venue: matchesTable.venue,
      })
      .from(matchesTable)
      .where(eq(matchesTable.id, matchId))
      .limit(1);

    const matchRow = matchRows[0];
    if (!matchRow) {
      throw new Error("No se encontró el partido.");
    }

    const summary = await notifyMatch(matchRow as NotifyMatchRow, "manual");

    if (summary.recipients > 0) {
      trackServerEvent("match_notifications_sent", ctx.userId, {
        match_id: matchId,
        recipients_count: summary.recipients,
        scope: "all",
      });
    }

    return {
      intent: summary.recipients === 0 ? ("error" as const) : ("success" as const),
      notice:
        summary.recipients === 0
          ? "No hay personas asignadas para notificar."
          : `Notificación enviada — WhatsApp ${summary.waSent}/${summary.waSent + summary.waSkipped}, ` +
            `correo ${summary.emailSent}/${summary.emailSent + summary.emailSkipped}, ` +
            `${summary.recipients} convocados.`,
      revalidate: [meta.redirectTo],
    };
  },
});

export async function sendAllMatchNotificationsAction(formData: FormData) {
  await sendAllMatchNotifications(formData);
}

const sendAssignmentNotifications = defineAction({
  fallbackRedirect: "/grid",
  resolveRedirect: resolveMatchRedirect,
  authz: requireEditor,
  parse: parseSendAssignmentNotifications,
  async run(ctx, { matchId, assignmentIds }, meta) {
    if (!matchId || !assignmentIds.length) {
      return { error: "No hay asignaciones para notificar." };
    }

    const matchRows = await db
      .select({
        away_team: matchesTable.awayTeam,
        competition: matchesTable.competition,
        home_team: matchesTable.homeTeam,
        kickoff_at: matchesTable.kickoffAt,
        production_mode: matchesTable.productionMode,
        timezone: matchesTable.timezone,
        venue: matchesTable.venue,
      })
      .from(matchesTable)
      .where(eq(matchesTable.id, matchId))
      .limit(1);

    const matchRow = matchRows[0];
    if (!matchRow) {
      throw new Error("No se encontró el partido.");
    }

    const rawAssignmentRows = await db
      .select({
        role: { name: rolesTable.name },
        person: {
          id: peopleTable.id,
          full_name: peopleTable.fullName,
          phone: peopleTable.phone,
        },
      })
      .from(assignmentsTable)
      .leftJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
      .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
      .where(
        and(
          eq(assignmentsTable.matchId, matchId),
          inArray(assignmentsTable.id, assignmentIds),
        ),
      );

    // One recipient per person (not per name+phone), and people without a phone
    // stay in so the log gets a no_contact row for them.
    const recipients = buildMatchRecipients(
      rawAssignmentRows.map((row) => ({
        role: row.role?.name ? row.role : null,
        person: row.person?.id ? { ...row.person, email: null } : null,
      })),
    );
    const matchLabel = `${matchRow.home_team} vs ${matchRow.away_team}`;
    const logRows: NotificationLogRow[] = [];
    let sent = 0;
    let skipped = 0;
    let noPhone = 0;

    for (const recipient of recipients) {
      const outcomes: ChannelOutcome[] = [];
      const { whatsapp } = getChannelEligibility(recipient);

      if (whatsapp === "missing") {
        noPhone += 1;
      } else if (whatsapp === "invalid") {
        outcomes.push({
          channel: "whatsapp",
          attempted: false,
          ok: false,
          error: INVALID_PHONE_ERROR,
        });
        skipped += 1;
      } else if (!isWhatsAppSendEnabled) {
        outcomes.push({
          channel: "whatsapp",
          attempted: false,
          ok: false,
          error: "OpenWA no está configurado.",
        });
        skipped += 1;
      } else {
        const result = await sendWhatsAppText({
          phone: recipient.phone,
          message: buildMatchNotificationMessage({
            match: matchRow,
            personName: recipient.personName,
            roleNames: recipient.roleNames,
          }),
        });
        outcomes.push({
          channel: "whatsapp",
          attempted: true,
          ok: result.ok,
          error: result.error ?? null,
        });

        if (result.ok) {
          sent += 1;
        } else {
          skipped += 1;
        }
      }

      logRows.push(
        ...buildRecipientLogRows({
          match: { id: matchId, label: matchLabel },
          trigger: "manual",
          recipient,
          outcomes,
        }),
      );
    }

    await insertNotificationLogs(logRows);

    if (recipients.length > 0) {
      trackServerEvent("match_notifications_sent", ctx.userId, {
        match_id: matchId,
        recipients_count: recipients.length,
        scope: "assignments",
      });
    }

    return {
      intent: (skipped || noPhone) && !sent ? ("error" as const) : ("success" as const),
      notice:
        `Notificaciones por WhatsApp: enviadas ${sent}, omitidas ${skipped}` +
        (noPhone ? `, sin teléfono ${noPhone}.` : "."),
      revalidate: [meta.redirectTo],
    };
  },
});

export async function sendAssignmentNotificationsAction(formData: FormData) {
  await sendAssignmentNotifications(formData);
}
