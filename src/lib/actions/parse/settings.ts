import {
  parsed,
  parseFailure,
  type ParseResult,
} from "@/lib/actions/define-action";
import { isAccessRequestFuncion } from "@/lib/access-requests/constants";
import {
  isValidRecipientAddress,
  parseRecipientList,
} from "@/lib/access-requests/recipients";

export type SaveGeminiSettingsInput = {
  apiKey: string;
  model: string;
};

export function parseSaveGeminiSettings(
  formData: FormData,
): ParseResult<SaveGeminiSettingsInput> {
  return parsed({
    apiKey: String(formData.get("geminiApiKey") ?? "").trim(),
    model: String(formData.get("geminiModel") ?? "gemini-2.5-flash").trim(),
  });
}

export type SavePreferencesInput = { density: string };

export function parseSavePreferences(
  formData: FormData,
): ParseResult<SavePreferencesInput> {
  return parsed({
    density: String(formData.get("uiDensity") ?? "comoda").trim(),
  });
}

export type SaveAnnouncementInput = {
  announcementId: string;
  title: string;
  body: string;
  active: boolean;
};

export function parseSaveAnnouncement(
  formData: FormData,
): ParseResult<SaveAnnouncementInput> {
  const announcementId = String(formData.get("announcementId") ?? "").trim();
  const title = String(formData.get("announcementTitle") ?? "").trim();
  const body = String(formData.get("announcementBody") ?? "").trim();
  const active = formData.get("announcementActive") === "on";

  if (!title || !body) {
    return parseFailure("El comunicado necesita título y mensaje.");
  }

  return parsed({ announcementId, title, body, active });
}

export type SaveAccessRequestRecipientsInput = {
  byFuncion: Record<string, string[]>;
  always: string[];
};

export function parseSaveAccessRequestRecipients(
  formData: FormData,
): ParseResult<SaveAccessRequestRecipientsInput> {
  // Repeated fields keep DOM order, so funcion[i] pairs with recipients[i].
  const funciones = formData.getAll("funcion").map((value) => String(value));
  const lists = formData.getAll("recipients").map((value) => String(value));
  const byFuncion: Record<string, string[]> = {};
  const invalid: string[] = [];

  funciones.forEach((funcion, index) => {
    if (!isAccessRequestFuncion(funcion)) {
      return;
    }

    const addresses = parseRecipientList(lists[index] ?? "");
    addresses
      .filter((address) => !isValidRecipientAddress(address))
      .forEach((address) => invalid.push(address));
    byFuncion[funcion] = addresses;
  });

  const always = parseRecipientList(
    String(formData.get("alwaysRecipients") ?? ""),
  );
  always
    .filter((address) => !isValidRecipientAddress(address))
    .forEach((address) => invalid.push(address));

  if (invalid.length) {
    return parseFailure(
      `Revisá estas direcciones: ${Array.from(new Set(invalid)).join(", ")}`,
    );
  }

  return parsed({ byFuncion, always });
}
