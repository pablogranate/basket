import { getRoleDisplayName } from "@/lib/display";
import { normalizeToWhatsAppChatId } from "@/lib/integrations/whatsapp-chat-id";

export type AssignmentRecipientRow = {
  role: { name: string } | null;
  person: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
};

export type MatchRecipient = {
  personId: string;
  personName: string;
  phone: string | null;
  email: string | null;
  roleNames: string[];
};

// Resolve a match's assignment rows into one recipient per person, collecting
// each person's role display names and their phone/email presence. Shared by
// the automatic match-day send and the manual "send to all" action.
export function buildMatchRecipients(
  rows: AssignmentRecipientRow[],
): MatchRecipient[] {
  const byPerson = new Map<string, MatchRecipient>();

  for (const row of rows) {
    const person = row.person;
    if (!person) {
      continue;
    }

    const roleName = getRoleDisplayName(row.role?.name ?? "");
    const existing = byPerson.get(person.id);

    if (existing) {
      if (roleName && !existing.roleNames.includes(roleName)) {
        existing.roleNames.push(roleName);
      }
      continue;
    }

    byPerson.set(person.id, {
      personId: person.id,
      personName: person.full_name,
      phone: person.phone?.trim() || null,
      email: person.email?.trim() || null,
      roleNames: roleName ? [roleName] : [],
    });
  }

  return [...byPerson.values()];
}

export type ChannelEligibility = "ok" | "missing" | "invalid";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Whether each channel can be tried for a recipient: "missing" means there is
// no contact (no log row for that channel), "invalid" means there is one but it
// cannot be sent to (logged as skipped).
export function getChannelEligibility(
  recipient: Pick<MatchRecipient, "phone" | "email">,
): { whatsapp: ChannelEligibility; email: ChannelEligibility } {
  return {
    whatsapp: !recipient.phone
      ? "missing"
      : normalizeToWhatsAppChatId(recipient.phone)
        ? "ok"
        : "invalid",
    email: !recipient.email
      ? "missing"
      : EMAIL_PATTERN.test(recipient.email)
        ? "ok"
        : "invalid",
  };
}

export const INVALID_PHONE_ERROR = "Número de teléfono inválido.";
export const INVALID_EMAIL_ERROR = "Correo inválido.";
