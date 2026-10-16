import "server-only";

import { appEnv, isWhatsAppSendEnabled } from "@/lib/env";
import { normalizeToWhatsAppChatId } from "@/lib/integrations/whatsapp-chat-id";

export async function sendWhatsAppText(params: {
  phone: string | null | undefined;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isWhatsAppSendEnabled) {
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
