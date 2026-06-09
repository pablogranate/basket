import "server-only";

import { appEnv, isOpenwaConfigured } from "@/lib/env";
import { sanitizePhone } from "@/lib/utils";

const WHATSAPP_USER_SUFFIX = "@s.whatsapp.net";

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

export async function sendWhatsAppText(params: {
  phone: string | null | undefined;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!appEnv.openwaNotifyEnabled || !isOpenwaConfigured) {
    return { ok: false, error: "OpenWA no está configurado." };
  }

  const chatId = normalizeToWhatsAppChatId(params.phone);

  if (!chatId) {
    return { ok: false, error: "Número de teléfono inválido." };
  }

  try {
    const response = await fetch(
      `${appEnv.openwaApiUrl.replace(/\/$/, "")}/api/sendText`,
      {
        method: "POST",
        headers: {
          authorization: appEnv.openwaApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatId, content: params.message }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error("[openwa] sendText failed", {
        status: response.status,
        detail,
      });
      return { ok: false, error: `OpenWA respondió ${response.status}.` };
    }

    return { ok: true };
  } catch (error) {
    console.error("[openwa] sendText threw", error);
    return { ok: false, error: "No se pudo conectar con OpenWA." };
  }
}
