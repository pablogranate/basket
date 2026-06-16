import "server-only";

import { formatInTimeZone } from "date-fns-tz";

import { getDayRange } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import { sendMatchNotificationEmail } from "@/lib/email/mailer";
import { isOpenwaConfigured } from "@/lib/env";
import {
  buildMatchNotificationMessage,
  buildMatchNotificationSubject,
} from "@/lib/integrations";
import { sendWhatsAppText } from "@/lib/integrations/openwa";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// The match-day blast trigger is fixed at 12:30 Argentina time. Per-match
// timezone is display-only (D4c).
const ARG_TZ = "America/Argentina/Buenos_Aires";
const SEND_HOUR = 12;
const SEND_MINUTE = 30;
// Small gap between WhatsApp sends to avoid OpenWA throttling/ban (D9b).
const WHATSAPP_GAP_MS = 1500;

type Trigger = "cron" | "catchup" | "boot";

type NotifyMatchRow = {
  id: string;
  away_team: string;
  competition: string | null;
  home_team: string;
  kickoff_at: string;
  production_mode: string | null;
  timezone: string;
  venue: string | null;
};

type AssignmentNotifyRow = {
  id: string;
  role: { name: string } | null;
  person: { full_name: string; phone: string | null; email: string | null } | null;
};

type Recipient = {
  personName: string;
  phone: string | null;
  email: string | null;
  roleNames: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPastSendTime(now: Date) {
  const hhmm = formatInTimeZone(now, ARG_TZ, "HH:mm");
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour > SEND_HOUR || (hour === SEND_HOUR && minute >= SEND_MINUTE);
}

export async function runMatchDayNotifications(trigger: Trigger) {
  const now = new Date();

  // The 12:30 cron fires exactly at the send time; catch-up/boot must verify
  // we are already past 12:30 ARG before sending (D6).
  if (trigger !== "cron" && !isPastSendTime(now)) {
    return;
  }

  const today = formatInTimeZone(now, ARG_TZ, "yyyy-MM-dd");
  const { startUtc, endUtc } = getDayRange(today, ARG_TZ);

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

  const matches = (matchesResult.data ?? []) as NotifyMatchRow[];

  if (!matches.length) {
    console.info(`[notifications] ${trigger}: no qualifying matches for ${today}`);
    return;
  }

  console.info(
    `[notifications] ${trigger}: ${matches.length} match(es) to notify for ${today}`,
  );

  for (const match of matches) {
    try {
      await notifyMatch(supabase, match);
    } catch (error) {
      console.error(
        `[notifications] match ${match.id} failed; skipping`,
        error,
      );
    }
  }
}

async function notifyMatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  match: NotifyMatchRow,
) {
  const assignmentsResult = await supabase
    .from("assignments")
    .select(
      "id, role:roles!assignments_role_id_fkey(name), person:people!assignments_person_id_fkey(full_name, phone, email)",
    )
    .eq("match_id", match.id);

  if (assignmentsResult.error) {
    // Do not mark — let the next tick retry this match.
    throw assignmentsResult.error;
  }

  const assignmentRows = (assignmentsResult.data ?? []) as AssignmentNotifyRow[];
  const recipientsByPerson = new Map<string, Recipient>();

  for (const assignment of assignmentRows) {
    const person = assignment.person;
    if (!person) {
      continue;
    }

    const phone = person.phone?.trim() || null;
    const email = person.email?.trim() || null;
    const key = `${person.full_name}::${phone ?? ""}::${email ?? ""}`;
    const roleName = getRoleDisplayName(assignment.role?.name ?? "");
    const existing = recipientsByPerson.get(key);

    if (existing) {
      if (roleName && !existing.roleNames.includes(roleName)) {
        existing.roleNames.push(roleName);
      }
    } else {
      recipientsByPerson.set(key, {
        personName: person.full_name,
        phone,
        email,
        roleNames: roleName ? [roleName] : [],
      });
    }
  }

  const recipients = [...recipientsByPerson.values()];
  const subject = buildMatchNotificationSubject(match);

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

    if (!recipient.phone && !recipient.email) {
      noContact += 1;
      console.warn(
        `[notifications] ${recipient.personName} has no phone or email; skipped`,
      );
      continue;
    }

    if (recipient.phone) {
      if (isOpenwaConfigured) {
        const result = await sendWhatsAppText({
          phone: recipient.phone,
          message,
        });
        if (result.ok) {
          waSent += 1;
        } else {
          waSkipped += 1;
        }
        await sleep(WHATSAPP_GAP_MS);
      } else {
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
        emailSent += 1;
      } catch {
        emailSkipped += 1;
      }
    }
  }

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
}
