// The Entorno de desarrollo serves each app at dev.<app>.basket-app.com, next
// to production on the same VPS. Hosts are the only signal: the portal and the
// Session readers derive the same answer from the same URL, so no env var can
// drift between them.
const DEV_ENVIRONMENT_LABEL = "dev";

// Production keeps Better Auth's default; a different prefix in development
// keeps its cookie from overwriting the production one on .basket-app.com.
// Session readers in the Entorno de desarrollo must use this same literal.
const PRODUCTION_SESSION_COOKIE_PREFIX = "better-auth";
const DEV_SESSION_COOKIE_PREFIX = "basket-dev";

export function isDevEnvironmentHost(host: string) {
  const hostname = host.split(":")[0];
  return hostname.split(".")[0] === DEV_ENVIRONMENT_LABEL;
}

export function resolveSessionCookiePrefix(baseUrl: string) {
  return isDevEnvironmentHost(new URL(baseUrl).host)
    ? DEV_SESSION_COOKIE_PREFIX
    : PRODUCTION_SESSION_COOKIE_PREFIX;
}
