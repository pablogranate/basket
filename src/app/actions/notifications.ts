"use server";

import { revalidatePath } from "next/cache";

import {
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { getRoleDisplayName } from "@/lib/display";
import { buildMatchNotificationMessage } from "@/lib/integrations";
import { sendWhatsAppText } from "@/lib/integrations/openwa";
import { insertNotificationLogs } from "@/lib/notifications/log";
import {
  buildRecipientLogRows,
  type NotificationLogRow,
} from "@/lib/notifications/log-rows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureErrorMessage } from "@/lib/utils";

type Recipient = {
  personId: string | null;
  personName: string;
  phone: string;
  roleNames: string[];
};

type AssignmentNotifyRow = {
  id: string;
  role: { name: string } | null;
  person: { id: string; full_name: string; phone: string | null } | null;
};

export async function sendAssignmentNotificationsAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const redirectTo = `/match/${matchId}`;
  await requireEditor();

  try {
    const assignmentIds = String(formData.get("assignmentIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!matchId || !assignmentIds.length) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: "No hay asignaciones para notificar.",
      });
    }

    const supabase = await createSupabaseServerClient();

    const matchResult = await supabase
      .from("matches")
      .select(
        "away_team, competition, home_team, kickoff_at, production_mode, timezone, venue",
      )
      .eq("id", matchId)
      .single();

    if (matchResult.error) {
      throw matchResult.error;
    }

    const assignmentsResult = await supabase
      .from("assignments")
      .select(
        "id, role:roles!assignments_role_id_fkey(name), person:people!assignments_person_id_fkey(id, full_name, phone)",
      )
      .eq("match_id", matchId)
      .in("id", assignmentIds);

    if (assignmentsResult.error) {
      throw assignmentsResult.error;
    }

    const recipientsByPerson = new Map<string, Recipient>();
    const assignmentRows = (assignmentsResult.data ?? []) as AssignmentNotifyRow[];

    for (const assignment of assignmentRows) {
      const person = assignment.person;
      const phone = person?.phone?.trim();

      if (!person || !phone) {
        continue;
      }

      const key = `${person.full_name}::${phone}`;
      const roleName = getRoleDisplayName(assignment.role?.name ?? "");
      const existing = recipientsByPerson.get(key);

      if (existing) {
        if (roleName && !existing.roleNames.includes(roleName)) {
          existing.roleNames.push(roleName);
        }
      } else {
        recipientsByPerson.set(key, {
          personId: person.id,
          personName: person.full_name,
          phone,
          roleNames: roleName ? [roleName] : [],
        });
      }
    }

    const recipients = [...recipientsByPerson.values()];
    const matchLabel = `${matchResult.data.home_team} vs ${matchResult.data.away_team}`;
    const logRows: NotificationLogRow[] = [];
    let sent = 0;
    let skipped = 0;

    for (const recipient of recipients) {
      const result = await sendWhatsAppText({
        phone: recipient.phone,
        message: buildMatchNotificationMessage({
          match: matchResult.data,
          personName: recipient.personName,
          roleNames: recipient.roleNames,
        }),
      });

      if (result.ok) {
        sent += 1;
      } else {
        skipped += 1;
      }

      logRows.push(
        ...buildRecipientLogRows({
          match: { id: matchId, label: matchLabel },
          trigger: "manual",
          recipient: {
            personId: recipient.personId,
            personName: recipient.personName,
            phone: recipient.phone,
            email: null,
            roleNames: recipient.roleNames,
          },
          outcomes: [
            {
              channel: "whatsapp",
              attempted: true,
              ok: result.ok,
              error: result.error ?? null,
            },
          ],
        }),
      );
    }

    await insertNotificationLogs(logRows);

    revalidatePath(redirectTo);
    redirectWithNotice({
      redirectTo,
      intent: skipped && !sent ? "error" : "success",
      notice: `Notificaciones por WhatsApp: enviadas ${sent}, omitidas ${skipped}.`,
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}
