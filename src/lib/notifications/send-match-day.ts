import "server-only";

import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  people as peopleTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import { getDayRange } from "@/lib/date";
import { sendMatchNotificationEmail } from "@/lib/email/mailer";
import { isOpenwaConfigured } from "@/lib/env";
import {
  buildMatchNotificationMessage,
  buildMatchNotificationSubject,
} from "@/lib/integrations";
import { sendWhatsAppText } from "@/lib/integrations/openwa";
import { insertNotificationLogs } from "@/lib/notifications/log";
import {
  buildRecipientLogRows,
  type ChannelOutcome,
  type NotificationLogRow,
  type NotificationTrigger,
} from "@/lib/notifications/log-rows";
import {
  buildMatchRecipients,
  type AssignmentRecipientRow,
} from "@/lib/notifications/recipients";
import { computeSendAt } from "@/lib/notifications/schedule";
import { ensureErrorMessage } from "@/lib/utils";

// Per-match send time is keyed on kickoff clock time (see schedule.ts). The
// hourly tick fires this for any match whose send time has passed. Per-match
// display timezone is display-only (D4c).
const ARG_TZ = "America/Argentina/Buenos_Aires";
// Small gap between WhatsApp sends to avoid OpenWA throttling/ban (D9b).
const WHATSAPP_GAP_MS = 1500;

type Trigger = "cron" | "catchup" | "boot";

export type MatchNotifySummary = {
  recipients: number;
  waSent: number;
  waSkipped: number;
  emailSent: number;
  emailSkipped: number;
  noContact: number;
};

export type NotifyMatchRow = {
  id: string;
  away_team: string;
  competition: string | null;
  home_team: string;
  kickoff_at: string;
  production_mode: string | null;
  timezone: string;
  venue: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMatchDayNotifications(trigger: Trigger) {
  const now = new Date();

  // Window spans today + tomorrow: the 22:00 tick notifies tomorrow's morning
  // matches (send time = prior day 22:00). Per-match send time then decides
  // which rows are actually due now.
  const today = formatInTimeZone(now, ARG_TZ, "yyyy-MM-dd");
  const tomorrow = formatInTimeZone(
    new Date(now.getTime() + 86400000),
    ARG_TZ,
    "yyyy-MM-dd",
  );
  const { startUtc } = getDayRange(today, ARG_TZ);
  const { endUtc } = getDayRange(tomorrow, ARG_TZ);

  let candidates: NotifyMatchRow[];
  try {
    candidates = (await db
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
      .where(
        and(
          inArray(matchesTable.status, ["Pendiente", "Confirmado"]),
          gte(matchesTable.kickoffAt, startUtc),
          lte(matchesTable.kickoffAt, endUtc),
          isNull(matchesTable.dayNotifiedAt),
        ),
      )) as NotifyMatchRow[];
  } catch (error) {
    console.error("[notifications] failed to load matches", error);
    return;
  }

  // Due = the match's computed send time has passed.
  const matches = candidates.filter(
    (match) => computeSendAt(match.kickoff_at).getTime() <= now.getTime(),
  );

  if (!matches.length) {
    console.info(`[notifications] ${trigger}: no due matches at ${now.toISOString()}`);
    return;
  }

  console.info(
    `[notifications] ${trigger}: ${matches.length} due match(es) at ${now.toISOString()}`,
  );

  for (const match of matches) {
    try {
      await notifyMatch(match, trigger);
    } catch (error) {
      console.error(
        `[notifications] match ${match.id} failed; skipping`,
        error,
      );
    }
  }
}

export async function notifyMatch(
  match: NotifyMatchRow,
  trigger: NotificationTrigger,
): Promise<MatchNotifySummary> {
  // Drizzle throws on query failure; a throw here is caught by the caller, which
  // does NOT mark the match — the next tick retries it.
  const assignmentRows = await db
    .select({
      role: { name: rolesTable.name },
      person: {
        id: peopleTable.id,
        full_name: peopleTable.fullName,
        phone: peopleTable.phone,
        email: peopleTable.email,
      },
    })
    .from(assignmentsTable)
    .leftJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
    .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
    .where(eq(assignmentsTable.matchId, match.id));

  const recipients = buildMatchRecipients(
    assignmentRows.map((row) => ({
      role: row.role?.name ? row.role : null,
      person: row.person?.id ? row.person : null,
    })) as AssignmentRecipientRow[],
  );
  const subject = buildMatchNotificationSubject(match);
  const matchLabel = `${match.home_team} vs ${match.away_team}`;
  const logRows: NotificationLogRow[] = [];

  let waSent = 0;
  let waSkipped = 0;
  let emailSent = 0;
  let emailSkipped = 0;
  let noContact = 0;

  for (const recipient of recipients) {
    const message = buildMatchNotificationMessage({
      match,
      personName: recipient.personName,
      roleNames: recipient.roleNames,
    });

    const outcomes: ChannelOutcome[] = [];

    if (recipient.phone) {
      if (isOpenwaConfigured) {
        const result = await sendWhatsAppText({
          phone: recipient.phone,
          message,
        });
        outcomes.push({
          channel: "whatsapp",
          attempted: true,
          ok: result.ok,
          error: result.error ?? null,
        });
        if (result.ok) {
          waSent += 1;
        } else {
          waSkipped += 1;
        }
        await sleep(WHATSAPP_GAP_MS);
      } else {
        outcomes.push({
          channel: "whatsapp",
          attempted: false,
          ok: false,
          error: "OpenWA no está configurado.",
        });
        waSkipped += 1;
        console.warn("[notifications] OpenWA not configured; WhatsApp skipped");
      }
    }

    if (recipient.email) {
      try {
        await sendMatchNotificationEmail({
          to: recipient.email,
          subject,
          text: message,
        });
        outcomes.push({ channel: "email", attempted: true, ok: true });
        emailSent += 1;
      } catch (error) {
        outcomes.push({
          channel: "email",
          attempted: true,
          ok: false,
          error: ensureErrorMessage(error),
        });
        emailSkipped += 1;
      }
    }

    if (!outcomes.length) {
      noContact += 1;
      console.warn(
        `[notifications] ${recipient.personName} has no phone or email; skipped`,
      );
    }

    logRows.push(
      ...buildRecipientLogRows({
        match: { id: match.id, label: matchLabel },
        trigger,
        recipient,
        outcomes,
      }),
    );
  }

  await insertNotificationLogs(logRows);

  // Stamp the marker after one full attempt regardless of failures (A1),
  // including zero-recipient matches so catch-up stops re-querying them.
  try {
    await db
      .update(matchesTable)
      .set({ dayNotifiedAt: new Date().toISOString() })
      .where(eq(matchesTable.id, match.id));
  } catch (error) {
    console.error(
      `[notifications] failed to mark match ${match.id} as notified`,
      error,
    );
  }

  console.info(
    `[notifications] match ${match.id} (${match.home_team} vs ${match.away_team}): ` +
      `WhatsApp ${waSent} sent / ${waSkipped} skipped, ` +
      `email ${emailSent} sent / ${emailSkipped} skipped, ` +
      `${noContact} without contact, ${recipients.length} recipient(s)`,
  );

  return {
    recipients: recipients.length,
    waSent,
    waSkipped,
    emailSent,
    emailSkipped,
    noContact,
  };
}
