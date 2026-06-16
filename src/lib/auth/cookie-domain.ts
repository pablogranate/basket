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
