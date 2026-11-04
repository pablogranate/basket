import { withRequestLog } from "basket-tv-telemetry/next";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/server";

export const runtime = "nodejs";

const handler = toNextJsHandler(auth);
const ROUTE = "/api/auth/[...all]";

type RouteContext = { params: Promise<{ all: string[] }> };

export const GET = withRequestLog<Request, RouteContext>(ROUTE, handler.GET);
export const POST = withRequestLog<Request, RouteContext>(ROUTE, handler.POST);
