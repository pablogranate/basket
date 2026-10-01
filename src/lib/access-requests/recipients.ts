import type { AccessRequestFuncion } from "@/lib/access-requests/constants";
import { requestAsksFuncion } from "@/lib/acceso/catalog";

export type AccessRequestRecipientConfig = {
  byFuncion: Partial<Record<string, string[]>>;
  always: string[];
};

// Seed for the Configuración form. Editing happens in the DB from there on, so
// changing these values only affects portals that never saved the setting.
export const DEFAULT_ACCESS_REQUEST_RECIPIENTS: AccessRequestRecipientConfig = {
  byFuncion: {
    Relator: ["carlos.altamirano@basquetpass.tv"],
    Comentarista: ["carlos.altamirano@basquetpass.tv"],
    "Operador de Control": ["pablo.granate@basquetpass.tv"],
    "Soporte Tecnico": ["pablo.granate@basquetpass.tv"],
  },
  always: ["produccion@basquetpass.tv"],
};

// Deliberately loose: this only has to catch the typos a human makes in a
// settings form, not validate RFC 5322.
const ADDRESS_PATTERN = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

export function isValidRecipientAddress(value: string) {
  return ADDRESS_PATTERN.test(value.trim());
}

export function parseRecipientList(raw: string): string[] {
  const seen = new Set<string>();

  for (const candidate of raw.split(/[,;\n\r]+/)) {
    const normalized = candidate.trim().toLowerCase();

    if (normalized) {
      seen.add(normalized);
    }
  }

  return Array.from(seen);
}

function cleanRecipients(addresses: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const raw of addresses) {
    const address = raw.trim().toLowerCase();

    if (!address || seen.has(address) || !isValidRecipientAddress(address)) {
      continue;
    }

    seen.add(address);
    recipients.push(address);
  }

  return recipients;
}

// Función list first, then the always-notify list, deduped case-insensitively.
// Malformed entries are dropped rather than handed to the transport.
export function resolveAccessRequestRecipients({
  funcion,
  config,
}: {
  funcion: AccessRequestFuncion | string;
  config: AccessRequestRecipientConfig;
}): string[] {
  return cleanRecipients([...(config.byFuncion[funcion] ?? []), ...config.always]);
}

// Who hears about a new Solicitud for one app. The portal keeps its
// per-Función routing (app_settings); every other app has one flat list
// (auth_app_request_recipients).
export function resolveRequestRecipients({
  app,
  funcion,
  portalConfig,
  appRecipients,
}: {
  app: string;
  funcion: string | null;
  portalConfig: AccessRequestRecipientConfig;
  appRecipients: ReadonlyArray<string>;
}): string[] {
  if (requestAsksFuncion(app)) {
    return resolveAccessRequestRecipients({
      funcion: funcion ?? "",
      config: portalConfig,
    });
  }

  return cleanRecipients(appRecipients);
}
