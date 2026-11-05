import { isDevEnvironmentUrl } from "@/lib/environment";

export type CrossSubdomainCookieConfig = {
  enabled: boolean;
  domain?: string;
};

export function resolveCrossSubdomainCookieConfig(
  baseUrl: string,
): CrossSubdomainCookieConfig {
  const host = new URL(baseUrl).hostname;
  const labels = host.split(".");
  if (labels.length < 2 || host.endsWith(".localhost")) {
    return { enabled: false };
  }
  const root = labels.slice(-2).join(".");
  return { enabled: true, domain: `.${root}` };
}

// Production keeps Better Auth's default; the Entorno de desarrollo uses its own
// so its login never overwrites the production cookie on .basket-app.com.
// Session readers in development must use this same literal.
export function resolveSessionCookiePrefix(baseUrl: string) {
  return isDevEnvironmentUrl(baseUrl) ? "basket-dev" : "better-auth";
}
