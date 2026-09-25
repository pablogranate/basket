import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { buildApexUrl, USUARIOS_PATH } from "@/lib/constants";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Accesos moved to the apex users section (ADR 0010); old bookmarks and the
// deep link from Personal keep working. /usuarios does its own guarding.
export default async function AccessPage({ searchParams }: PageProps) {
  const [host, resolvedSearchParams] = await Promise.all([
    headers().then((requestHeaders) => requestHeaders.get("host") ?? ""),
    searchParams,
  ]);
  const email =
    typeof resolvedSearchParams.email === "string"
      ? `?email=${encodeURIComponent(resolvedSearchParams.email)}`
      : "";

  redirect(`${buildApexUrl(host) ?? ""}${USUARIOS_PATH}${email}`);
}
