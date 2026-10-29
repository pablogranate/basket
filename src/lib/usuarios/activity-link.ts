import { buildAppUrlFromAnyHost } from "@/lib/constants";

// The telemetry panel (basket-telemetry) lives on server.basket-app.com; its
// Ficha 360 of an identity is /users/<Better Auth id>.
const TELEMETRY_SUBDOMAIN = "server";
const TELEMETRY_PANEL_FALLBACK = "https://server.basket-app.com";

export function buildUserActivityUrl(host: string, authUserId: string): string {
  const panel =
    buildAppUrlFromAnyHost(host, TELEMETRY_SUBDOMAIN) ?? TELEMETRY_PANEL_FALLBACK;
  return `${panel}/users/${encodeURIComponent(authUserId)}`;
}
