import "server-only";

import { formatInTimeZone } from "date-fns-tz";

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
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const supabase = createSupabaseAdminClient();

  const matchesResult = await supabase
    .from("matches")
    .select(
      "id, away_team, competition, home_team, kickoff_at, production_mode, timezone, venue",
    )
    .in("status", ["Pendiente", "Confirmado"])
    .gte("kickoff_at", startUtc)
    .lte("kickoff_at", endUtc)
    .is("day_notified_at", null);

  if (matchesResult.error) {
    console.error("[notifications] failed to load matches", matchesResult.error);
    return;
  }

  const candidates = (matchesResult.data ?? []) as NotifyMatchRow[];
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
      await notifyMatch(supabase, match, trigger);
    } catch (error) {
      console.error(
        `[notifications] match ${match.id} failed; skipping`,
        error,
      );
    }
  }
}

export async function notifyMatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  match: NotifyMatchRow,
  trigger: NotificationTrigger,
): Promise<MatchNotifySummary> {
  const assignmentsResult = await supabase
    .from("assignments")
    .select(
      "id, role:roles!assignments_role_id_fkey(name), person:people!assignments_person_id_fkey(id, full_name, phone, email)",
    )
    .eq("match_id", match.id);

  if (assignmentsResult.error) {
    // Do not mark — let the next tick retry this match.
    throw assignmentsResult.error;
  }

  const recipients = buildMatchRecipients(
    (assignmentsResult.data ?? []) as AssignmentRecipientRow[],
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
  const markResult = await supabase
    .from("matches")
    .update({ day_notified_at: new Date().toISOString() })
    .eq("id", match.id);

  if (markResult.error) {
    console.error(
      `[notifications] failed to mark match ${match.id} as notified`,
      markResult.error,
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
