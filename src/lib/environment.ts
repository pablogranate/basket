// The Entorno de desarrollo serves each app at dev.<app>.basket-app.com, next
// to production on the same VPS. Hosts are the only signal: the portal and the
// Session readers derive the same answer from the same URL, so no env var can
// drift between them.
const DEV_LABEL = "dev";
const DEV_DATABASE_SUFFIX = "_dev";

export function isDevEnvironmentHost(host: string) {
  const hostname = host.split(":")[0];
  return hostname.split(".")[0] === DEV_LABEL;
}

export function isDevEnvironmentUrl(url: string) {
  try {
    return isDevEnvironmentHost(new URL(url).host);
  } catch {
    return false;
  }
}

// dev.portal.basket-app.com → portal.basket-app.com; other hosts unchanged.
export function stripDevLabel(host: string) {
  return isDevEnvironmentHost(host) ? host.slice(DEV_LABEL.length + 1) : host;
}

// https://cashflow.basket-app.com → https://dev.cashflow.basket-app.com
export function withDevLabel(origin: string) {
  const url = new URL(origin);
  url.hostname = `${DEV_LABEL}.${url.hostname}`;
  return url.origin;
}

// Every database of the Entorno de desarrollo ends in _dev and no production
// one does, so a .env.local copied from production and left unedited fails at
// startup instead of writing to the real data.
export function databaseMatchesEnvironment({
  baseUrl,
  databaseUrl,
}: {
  baseUrl: string;
  databaseUrl: string;
}) {
  let name: string;
  try {
    name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    return true;
  }
  return name.endsWith(DEV_DATABASE_SUFFIX) === isDevEnvironmentUrl(baseUrl);
}

// The schedulers, notifications and WhatsApp default to on in production and
// to off in the Entorno de desarrollo, whose data has real phones and emails.
export function isSideEffectEnabled(
  raw: string | undefined,
  { devEnvironment }: { devEnvironment: boolean },
) {
  return devEnvironment ? raw === "true" : raw !== "false";
}
