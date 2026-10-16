import { sanitizePhone } from "@/lib/utils";

const WHATSAPP_USER_SUFFIX = "@s.whatsapp.net";

// 10 digits is an Argentine number without country code (549 is prepended);
// 12+ digits already carries one. Anything else has no chat id ("").
export function normalizeToWhatsAppChatId(phone: string | null | undefined) {
  const digits = sanitizePhone(phone);

  if (!digits) {
    return "";
  }

  if (digits.length === 10) {
    return `549${digits}${WHATSAPP_USER_SUFFIX}`;
  }

  if (digits.length >= 12) {
    return `${digits}${WHATSAPP_USER_SUFFIX}`;
  }

  return "";
}
