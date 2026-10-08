import "server-only";

import { decodeCabbCsv } from "@/lib/fixtures/parse";

// Gesdeportiva has no API: we log in like a browser and press "Aplicar filtros
// y descargar listado completo" on the partidos page. Bypassing the reCAPTCHA
// with the `recaptcha=NO` cookie is authorized by the site owners. Keep the
// load low: 4 requests per account, a pause between them, no retries.
const BASE_URL = "https://gesdeportiva.cabb.com.ar/gestiondeportiva";
const LOGIN_URL = `${BASE_URL}/index.aspx?ReturnUrl=%2fgestiondeportiva%2fes%2fdelegacion%2fpartidos.aspx`;
const PARTIDOS_URL = `${BASE_URL}/es/delegacion/partidos.aspx`;
const FIELD_PREFIX = "ctl00$contenedor_informacion$";
const EXPORT_BUTTON = [`${FIELD_PREFIX}BDescargarListado`, "Aplicar filtros y descargar listado completo"] as const;
const REQUEST_TIMEOUT_MS = 30_000;
const PAUSE_BETWEEN_REQUESTS_MS = 1_500;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

export type CabbAccount = {
  key: string;
  user: string;
  password: string;
};

type FormField = [string, string];

function decodeEntities(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function readAttr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]!) : null;
}

function readFormFields(html: string): FormField[] {
  const fields: FormField[] = [];

  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    const name = readAttr(tag, "name");
    if (!name) continue;
    const type = (readAttr(tag, "type") ?? "text").toLowerCase();
    if (["submit", "button", "image", "reset", "file"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && !/\schecked\b/i.test(tag)) continue;
    fields.push([name, readAttr(tag, "value") ?? (type === "checkbox" ? "on" : "")]);
  }

  for (const [, attrs = "", body = ""] of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = readAttr(attrs, "name");
    if (!name) continue;
    const options = [...body.matchAll(/<option\b[^>]*>/gi)].map(([tag]) => tag);
    const selected = options.find((tag) => /\sselected\b/i.test(tag)) ?? options[0];
    fields.push([name, selected ? readAttr(selected, "value") ?? "" : ""]);
  }

  for (const [, attrs = "", body = ""] of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const name = readAttr(attrs, "name");
    if (name) fields.push([name, decodeEntities(body)]);
  }

  return fields;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createSession() {
  const cookies = new Map([["recaptcha", "NO"]]);
  let requestCount = 0;

  async function request(
    url: string,
    { form, followRedirects = true }: { form?: FormField[]; followRedirects?: boolean } = {},
  ) {
    let currentUrl = url;
    let method = form ? "POST" : "GET";
    let body = form ? new URLSearchParams(form).toString() : undefined;

    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      if (requestCount > 0) await sleep(PAUSE_BETWEEN_REQUESTS_MS);
      requestCount += 1;

      const response = await fetch(currentUrl, {
        method,
        body,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "user-agent": USER_AGENT,
          cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
          ...(body
            ? { "content-type": "application/x-www-form-urlencoded", origin: "https://gesdeportiva.cabb.com.ar", referer: url }
            : {}),
        },
      });

      for (const header of response.headers.getSetCookie()) {
        const [pair = ""] = header.split(";");
        const separator = pair.indexOf("=");
        cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }

      const location = response.headers.get("location");
      if (!followRedirects || response.status < 300 || response.status >= 400 || !location) {
        return { response, url: currentUrl };
      }
      await response.body?.cancel();
      currentUrl = new URL(location, currentUrl).toString();
      method = "GET";
      body = undefined;
    }

    throw new Error(`[cabb] demasiadas redirecciones desde ${url}`);
  }

  return { request, hasCookie: (name: string) => cookies.has(name) };
}

function formatDdMmYyyy(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// Downloads every game of one account between two ISO dates (inclusive) as
// the raw CSV text. `DDLEstadoFiltro=-1` matters: the page defaults to "No
// comenzado" and would silently drop played games.
export async function downloadCabbPartidos({
  account,
  from,
  to,
}: {
  account: CabbAccount;
  from: string;
  to: string;
}) {
  const tag = `[cabb:${account.key.toLowerCase()}]`;
  if (!account.user || !account.password) {
    throw new Error(`${tag} faltan CABB_USER_${account.key} y/o CABB_PASS.`);
  }

  const session = createSession();

  const loginPage = await session.request(LOGIN_URL);
  const loginFields = readFormFields(await loginPage.response.text()).filter(
    ([name]) => !["TBUsuario", "TBClave", "CBNoPedirRecaptcha"].includes(name),
  );
  const login = await session.request(LOGIN_URL, {
    form: [
      ...loginFields,
      ["TBUsuario", account.user],
      ["TBClave", account.password],
      ["CBNoPedirRecaptcha", "on"],
      ["BEntrar", "Entrar"],
    ],
    followRedirects: false,
  });
  await login.response.body?.cancel();
  if (login.response.status !== 302 || !session.hasCookie(".GESTIONDEPORTIVA")) {
    throw new Error(`${tag} login rechazado (HTTP ${login.response.status}, sin cookie de sesion).`);
  }

  const partidos = await session.request(PARTIDOS_URL);
  const partidosHtml = await partidos.response.text();
  if (/\/gestiondeportiva\/index\.aspx/i.test(partidos.url) || /name="TBClave"/i.test(partidosHtml)) {
    throw new Error(`${tag} la sesion no llego a la pagina de partidos.`);
  }

  const overrides = new Map<string, string>([
    [`${FIELD_PREFIX}RBLBuscarFiltro`, "entre_fechas"],
    [`${FIELD_PREFIX}TBFechaInicioFiltro`, formatDdMmYyyy(from)],
    [`${FIELD_PREFIX}TBFechaFinFiltro`, formatDdMmYyyy(to)],
    [`${FIELD_PREFIX}DDLEstadoFiltro`, "-1"],
  ]);
  const form: FormField[] = [
    ...readFormFields(partidosHtml).filter(
      ([name]) => !overrides.has(name) && name !== "__EVENTTARGET" && name !== "__EVENTARGUMENT",
    ),
    ...overrides,
    [...EXPORT_BUTTON],
    ["__EVENTTARGET", ""],
    ["__EVENTARGUMENT", ""],
  ];

  const exported = await session.request(PARTIDOS_URL, { form });
  const contentType = exported.response.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await exported.response.arrayBuffer());
  if (!/text\/csv/i.test(contentType)) {
    throw new Error(`${tag} la exportacion devolvio ${contentType || "sin content-type"}, no CSV.`);
  }

  return decodeCabbCsv(bytes);
}
