import { sanitizeRedirectTo } from "@/lib/constants";

// Better Auth validates a relative `callbackURL` against a strict charset
// (`/^\/(?!\/|\\|%2f|%5c)[\w\-.+/@]*(?:\?[\w\-.+/=&%@]*)?$/`) and decodes the
// value a different number of times per flow: `/magic-link/verify` runs its own
// `decodeURIComponent` on top of the framework's query parsing, while the OAuth
// callback replays the value verbatim from the signed state. A cross-subdomain
// target such as `https://basket-app.com/login` therefore fails validation
// (INVALID_CALLBACK_URL) as soon as it decodes to a literal `:` and `//`, and no
// fixed number of encode passes is correct for both flows.
//
// Carry the target as a base64url token instead: its charset is
// `[A-Za-z0-9_-]`, which the regex accepts and `decodeURIComponent` leaves
// untouched no matter how many times it runs.
export const LOGIN_REDIRECT_PARAM = "r";

const LOGIN_PATH = "/login";

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string) {
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeLoginRedirect(target: string) {
  return toBase64Url(target);
}

// Tokens travel through the browser, so the decoded target is untrusted input
// and goes back through the open-redirect guard before any caller uses it.
export function decodeLoginRedirect(token?: string | null): string | null {
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return null;
  }

  try {
    return sanitizeRedirectTo(fromBase64Url(token));
  } catch {
    return null;
  }
}

// The post-auth landing URL handed to Better Auth. Always a bare path plus an
// opaque token so it survives callbackURL validation in every flow.
export function buildLoginCallbackURL(rawRedirectTo?: string | null) {
  const safe = sanitizeRedirectTo(rawRedirectTo);
  if (!safe) {
    return LOGIN_PATH;
  }

  return `${LOGIN_PATH}?${LOGIN_REDIRECT_PARAM}=${encodeLoginRedirect(safe)}`;
}

// The login page is reached two ways: straight from middleware (plain
// `?redirectTo=/grid`) and as the post-auth callback (`?r=<token>`). Accept both.
export function resolveLoginRedirectTarget(
  searchParams: Record<string, string | string[] | undefined>,
): string | null {
  const token = searchParams[LOGIN_REDIRECT_PARAM];
  const fromToken = decodeLoginRedirect(
    typeof token === "string" ? token : null,
  );
  if (fromToken) {
    return fromToken;
  }

  const raw = searchParams.redirectTo;
  return sanitizeRedirectTo(typeof raw === "string" ? raw : null);
}
