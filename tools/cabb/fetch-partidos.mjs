#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const SAMPLES_DIR = path.join(__dirname, "samples");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local"), quiet: true });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

const BASE_URL = "https://gesdeportiva.cabb.com.ar/gestiondeportiva";
const LOGIN_URL = `${BASE_URL}/index.aspx?ReturnUrl=%2fgestiondeportiva%2fes%2fdelegacion%2fpartidos.aspx`;
const PARTIDOS_URL = `${BASE_URL}/es/delegacion/partidos.aspx`;
const FIELD_PREFIX = "ctl00$contenedor_informacion$";
const DEFAULT_EXPORT_TARGET = `submit:${FIELD_PREFIX}BDescargarListado:Aplicar filtros y descargar listado completo`;
const LOCK_PATH = path.join(SAMPLES_DIR, ".fetch.lock");
const LAST_RUN_PATH = path.join(SAMPLES_DIR, ".last-run.json");
const COOLDOWN_MINUTES = 30;
const REQUEST_TIMEOUT_MS = 30_000;
const PAUSE_BETWEEN_REQUESTS_MS = 1_500;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

function parseArgs(argv) {
  const args = { discover: false, force: false, from: null, to: null, accounts: [], exportTarget: process.env.CABB_EXPORT_TARGET ?? DEFAULT_EXPORT_TARGET };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--discover") args.discover = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--from") args.from = argv[++index];
    else if (arg === "--to") args.to = argv[++index];
    else if (arg === "--export-target") args.exportTarget = argv[++index];
    else if (arg === "--account") args.accounts.push(argv[++index].toUpperCase());
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return args;
}

function formatDdMmYyyy(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function defaultRange() {
  const from = new Date();
  from.setDate(from.getDate() - 1);
  const to = new Date();
  to.setDate(to.getDate() + 14);
  return { from: formatDdMmYyyy(from), to: formatDdMmYyyy(to) };
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readAttr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]) : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createSession() {
  const cookies = new Map([["recaptcha", "NO"]]);
  let requestCount = 0;

  function storeCookies(response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const separator = pair.indexOf("=");
      cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }

  async function request(url, { method = "GET", form, followRedirects = true } = {}) {
    let currentUrl = url;
    let options = {
      method,
      headers: {
        "user-agent": USER_AGENT,
        ...(form ? { "content-type": "application/x-www-form-urlencoded", origin: "https://gesdeportiva.cabb.com.ar", referer: url } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    };

    for (let hop = 0; hop < 5; hop += 1) {
      if (requestCount > 0) await sleep(PAUSE_BETWEEN_REQUESTS_MS);
      requestCount += 1;
      options.headers.cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
      const response = await fetch(currentUrl, {
        ...options,
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      storeCookies(response);
      const location = response.headers.get("location");
      if (!followRedirects || response.status < 300 || response.status >= 400 || !location) {
        return { response, url: currentUrl };
      }
      currentUrl = new URL(location, currentUrl).toString();
      options = { method: "GET", headers: { "user-agent": USER_AGENT } };
    }
    throw new Error(`[cabb] demasiadas redirecciones desde ${url}`);
  }

  return {
    request,
    hasCookie: (name) => cookies.has(name),
    cookieNames: () => [...cookies.keys()],
    requestCount: () => requestCount,
  };
}

function readFormFields(html) {
  const fields = [];

  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    const name = readAttr(tag, "name");
    if (!name) continue;
    const type = (readAttr(tag, "type") ?? "text").toLowerCase();
    if (["submit", "button", "image", "reset", "file"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && !/\schecked\b/i.test(tag)) continue;
    fields.push([name, readAttr(tag, "value") ?? (type === "checkbox" ? "on" : "")]);
  }

  for (const [, attrs, body] of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = readAttr(attrs, "name");
    if (!name) continue;
    const options = [...body.matchAll(/<option\b[^>]*>/gi)].map(([tag]) => tag);
    const selected = options.find((tag) => /\sselected\b/i.test(tag)) ?? options[0];
    fields.push([name, selected ? readAttr(selected, "value") ?? "" : ""]);
  }

  for (const [, attrs, body] of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const name = readAttr(attrs, "name");
    if (name) fields.push([name, decodeEntities(body)]);
  }

  return fields;
}

function findExportCandidates(html) {
  const candidates = [];
  const keyword = /export|csv|excel|xls|descarg/i;

  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    const type = (readAttr(tag, "type") ?? "").toLowerCase();
    if (!["submit", "image", "button"].includes(type)) continue;
    candidates.push({ kind: `input:${type}`, name: readAttr(tag, "name"), label: readAttr(tag, "value") ?? readAttr(tag, "title") ?? readAttr(tag, "alt") });
  }

  for (const [tag, inner] of html.matchAll(/<a\b[^>]*href="javascript:__doPostBack\([^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = readAttr(tag, "href") ?? "";
    const target = href.match(/__doPostBack\('([^']*)'/)?.[1];
    const text = inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    candidates.push({ kind: "postback-link", name: target, label: text || readAttr(tag, "title") || readAttr(tag, "id") });
  }

  return candidates.map((candidate) => ({
    ...candidate,
    likelyExport: keyword.test(`${candidate.name ?? ""} ${candidate.label ?? ""}`),
  }));
}

function assertLoggedIn(url, html) {
  if (/\/gestiondeportiva\/index\.aspx/i.test(url) || /name="TBClave"/i.test(html)) {
    throw new Error("[cabb] login rechazado: el servidor devolvio de nuevo el formulario de acceso.");
  }
}

function listConfiguredAccounts() {
  return Object.keys(process.env)
    .map((key) => key.match(/^CABB_USER_([A-Z0-9]+)$/)?.[1])
    .filter(Boolean);
}

function getCredentials(account) {
  const user = process.env[`CABB_USER_${account}`];
  const password = process.env[`CABB_PASS_${account}`] ?? process.env.CABB_PASS;
  if (!user || !password) {
    throw new Error(`Faltan CABB_USER_${account} y/o CABB_PASS(_${account}) en .env.local.`);
  }
  return { user, password };
}

async function login(session, { user, password }) {

  const loginPage = await session.request(LOGIN_URL);
  const fields = readFormFields(await loginPage.response.text()).filter(([name]) => name !== "CBNoPedirRecaptcha");
  const form = [
    ...fields.filter(([name]) => !["TBUsuario", "TBClave"].includes(name)),
    ["TBUsuario", user],
    ["TBClave", password],
    ["CBNoPedirRecaptcha", "on"],
    ["BEntrar", "Entrar"],
  ];

  const { response } = await session.request(LOGIN_URL, { method: "POST", form, followRedirects: false });
  await response.body?.cancel();
  if (response.status !== 302 || !session.hasCookie(".GESTIONDEPORTIVA")) {
    throw new Error(`[cabb] login rechazado (HTTP ${response.status}, sin cookie de sesion).`);
  }
}

function buildExportForm({ fields, from, to, exportTarget }) {
  const overrides = new Map([
    [`${FIELD_PREFIX}RBLBuscarFiltro`, "entre_fechas"],
    [`${FIELD_PREFIX}TBFechaInicioFiltro`, from],
    [`${FIELD_PREFIX}TBFechaFinFiltro`, to],
    [`${FIELD_PREFIX}DDLEstadoFiltro`, "-1"],
  ]);
  const form = fields.filter(([name]) => !overrides.has(name) && name !== "__EVENTTARGET" && name !== "__EVENTARGUMENT");
  form.push(...overrides);

  if (exportTarget.endsWith(".x")) {
    const base = exportTarget.slice(0, -2);
    form.push([`${base}.x`, "10"], [`${base}.y`, "10"], ["__EVENTTARGET", ""], ["__EVENTARGUMENT", ""]);
  } else if (exportTarget.startsWith("submit:")) {
    const [, name, value = ""] = exportTarget.split(":");
    form.push([name, value], ["__EVENTTARGET", ""], ["__EVENTARGUMENT", ""]);
  } else {
    form.push(["__EVENTTARGET", exportTarget], ["__EVENTARGUMENT", ""]);
  }
  return form;
}

async function fetchAccount({ account, args, from, to }) {
  const tag = `[cabb:${account.toLowerCase()}]`;
  const session = createSession();

  await login(session, getCredentials(account));
  console.info(`${tag} login ok`);

  const partidos = await session.request(PARTIDOS_URL);
  const partidosHtml = await partidos.response.text();
  assertLoggedIn(partidos.url, partidosHtml);
  await fs.mkdir(SAMPLES_DIR, { recursive: true });

  if (args.discover) {
    const htmlPath = path.join(SAMPLES_DIR, `partidos-${account.toLowerCase()}.html`);
    await fs.writeFile(htmlPath, partidosHtml);
    console.info(`${tag} HTML guardado en ${path.relative(ROOT_DIR, htmlPath)}`);
    console.table(findExportCandidates(partidosHtml));
    return;
  }

  const form = buildExportForm({ fields: readFormFields(partidosHtml), from, to, exportTarget: args.exportTarget });
  const result = await session.request(PARTIDOS_URL, { method: "POST", form });
  const contentType = result.response.headers.get("content-type") ?? "";
  const body = Buffer.from(await result.response.arrayBuffer());

  if (!/text\/csv/i.test(contentType)) {
    const debugPath = path.join(SAMPLES_DIR, `export-response-${account.toLowerCase()}.html`);
    await fs.writeFile(debugPath, body);
    throw new Error(`${tag} la exportacion devolvio ${contentType || "sin content-type"}, no CSV. Respuesta en ${path.relative(ROOT_DIR, debugPath)}`);
  }

  const csv = new TextDecoder("latin1").decode(body);
  const stamp = new Date().toISOString().slice(0, 10);
  const csvPath = path.join(SAMPLES_DIR, `partidos-${account.toLowerCase()}-${stamp}.csv`);
  await fs.writeFile(csvPath, csv);
  const rows = csv.split(/\r?\n/).filter((line) => line.trim()).length - 1;
  console.info(`${tag} ${rows} partidos (${from} a ${to}) -> ${path.relative(ROOT_DIR, csvPath)} [${session.requestCount()} requests]`);
}

async function readLastRun() {
  try {
    return JSON.parse(await fs.readFile(LAST_RUN_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function acquireLock() {
  await fs.mkdir(SAMPLES_DIR, { recursive: true });
  try {
    const handle = await fs.open(LOCK_PATH, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`[cabb] ya hay una ejecucion en curso (${path.relative(ROOT_DIR, LOCK_PATH)}). Si quedo colgado, borralo a mano.`);
    }
    throw error;
  }
}

async function assertCooldown(force) {
  const lastRun = await readLastRun();
  if (force || !lastRun?.startedAt) return;
  const minutesAgo = (Date.now() - new Date(lastRun.startedAt).getTime()) / 60_000;
  if (minutesAgo < COOLDOWN_MINUTES) {
    throw new Error(
      `[cabb] ultima ejecucion hace ${Math.round(minutesAgo)} min; espera ${COOLDOWN_MINUTES} min entre corridas o usa --force.`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const range = defaultRange();
  const from = args.from ?? range.from;
  const to = args.to ?? range.to;
  const accounts = args.accounts.length > 0 ? args.accounts : listConfiguredAccounts();
  if (accounts.length === 0) {
    throw new Error("No hay cuentas: defini CABB_USER_<CUENTA> en .env.local.");
  }

  await assertCooldown(args.force);
  await acquireLock();
  try {
    await fs.writeFile(LAST_RUN_PATH, JSON.stringify({ startedAt: new Date().toISOString(), accounts, from, to }));
    let failed = false;
    for (const account of accounts) {
      try {
        await fetchAccount({ account, args, from, to });
      } catch (error) {
        failed = true;
        console.error(`[cabb:${account.toLowerCase()}]`, error instanceof Error ? error.message : error);
      }
    }
    if (failed) process.exitCode = 1;
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
