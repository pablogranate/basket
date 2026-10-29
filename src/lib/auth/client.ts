"use client";

import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  emailOTPClient,
  magicLinkClient,
} from "better-auth/client/plugins";

import { appEnv } from "@/lib/env";

export const authClient = createAuthClient({
  baseURL: appEnv.betterAuthUrl,
  plugins: [magicLinkClient(), emailOTPClient(), adminClient()],
});
