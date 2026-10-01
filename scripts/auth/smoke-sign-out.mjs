// Sign-out smoke (basket#203). Needs the dev server and the Auth DB env:
//   set -a; . ./.env.local; set +a
//   node scripts/auth/smoke-sign-out.mjs stale    # why a server action fails
//   node scripts/auth/smoke-sign-out.mjs logout   # the /logout path
// "stale" ends the session through the API and then renders /login with the
// original cookies, which is what signOutAction's redirect did: the
// cookieCache still accepts them, so /login forwards instead of showing the
// form. "logout" follows /logout like a browser and expects the form.
import crypto from "node:crypto";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3000";
const secret = process.env.BETTER_AUTH_SECRET;
const sql = postgres(process.env.AUTH_DATABASE_URL);
const mode = process.argv[2] ?? "logout";

const [user] = await sql`select id from auth_user where email = 'wences.capolo@basquetpass.tv'`;
const token = "smoke-" + crypto.randomBytes(16).toString("hex");
await sql`insert into auth_session (id, token, user_id, expires_at, created_at, updated_at)
  values (${token}, ${token}, ${user.id}, now() + interval '1 day', now(), now())`;
const sig = crypto.createHmac("sha256", secret).update(token).digest("base64");
const jar = new Map([["better-auth.session_token", encodeURIComponent(`${token}.${sig}`)]]);
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const absorb = (res) => {
  for (const c of res.headers.getSetCookie()) {
    const [pair, ...attrs] = c.split(";");
    const [k, ...rest] = pair.split("=");
    const v = rest.join("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a)) || v === "";
    if (expired) jar.delete(k.trim()); else jar.set(k.trim(), v);
  }
};
const loginState = async (cookie) => {
  const res = await fetch(`${BASE}/login`, { headers: { cookie }, redirect: "manual" });
  const body = await res.text();
  const refresh = body.match(/http-equiv="refresh" content="[^"]*url=([^"]+)"/i)?.[1];
  const redirected = res.status >= 300 && res.status < 400;
  const form = /Continuar con Google|correo/i.test(body) && !redirected && !refresh && !/NEXT_REDIRECT/.test(body);
  return `${res.status} ${redirected ? "-> " + res.headers.get("location") : ""}${refresh ? "meta-> " + refresh : ""}${/NEXT_REDIRECT/.test(body) ? " NEXT_REDIRECT" : ""} form=${form}`;
};

try {
  // Prime the cookieCache cookie (session_data) like a real browser would have.
  const s = await fetch(`${BASE}/api/auth/get-session`, { headers: { cookie: cookieHeader() } });
  absorb(s);
  console.log("cookies before:", [...jar.keys()].join(", "));
  console.log("/login before sign-out:", await loginState(cookieHeader()));

  if (mode === "stale") {
    // What signOutAction's redirect("/login") render sees: the ORIGINAL request
    // cookies, while the session row is already gone.
    const original = cookieHeader();
    const out = await fetch(`${BASE}/api/auth/sign-out`, {
      method: "POST", headers: { cookie: original, origin: BASE, "content-type": "application/json" }, body: "{}",
    });
    console.log("sign-out status:", out.status);
    const [row] = await sql`select count(*)::int as n from auth_session where token = ${token}`;
    console.log("session rows left:", row.n);
    console.log("/login rendered with original cookies:", await loginState(original));
  } else {
    const out = await fetch(`${BASE}/logout`, { headers: { cookie: cookieHeader() }, redirect: "manual" });
    console.log("/logout:", out.status, out.headers.get("location"));
    console.log("set-cookie:", out.headers.getSetCookie().map((c) => c.split(";").slice(0, 1).concat(c.match(/Max-Age=\d+/i) ?? []).join(" ")).join(" | "));
    absorb(out);
    const [row] = await sql`select count(*)::int as n from auth_session where token = ${token}`;
    console.log("session rows left:", row.n, "cookies after:", [...jar.keys()].join(", ") || "(none)");
    console.log("/login after /logout:", await loginState(cookieHeader()));
  }
} finally {
  await sql`delete from auth_session where token like 'smoke-%'`;
  await sql.end();
}
