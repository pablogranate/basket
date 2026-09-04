import { existsSync } from "node:fs";
import path from "node:path";

import { appEnv } from "@/lib/env";

export type SystemStatusItem = {
  label: string;
  value: string;
  tone: "success" | "neutral";
};

export function getSystemStatus(hasSession: boolean): SystemStatusItem[] {
  const hasLogos = existsSync(path.join(process.cwd(), "public", "Logos"));

  return [
    {
      label: "Base de datos",
      value: appEnv.databaseUrl ? "Conectada" : "Pendiente",
      tone: appEnv.databaseUrl ? "success" : "neutral",
    },
    {
      label: "Auth",
      value: hasSession ? "Activa" : "Pendiente",
      tone: hasSession ? "success" : "neutral",
    },
    {
      label: "Logos",
      value: hasLogos ? "Locales" : "Pendiente",
      tone: hasLogos ? "success" : "neutral",
    },
    {
      label: "Google Calendar",
      value: "Disponible",
      tone: "neutral",
    },
    {
      label: "WhatsApp",
      value: "Disponible",
      tone: "neutral",
    },
  ];
}
