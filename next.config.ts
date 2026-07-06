import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client Router Cache: reuse a visited page's RSC payload for 30s so
    // back/forward and repeat navigations render instantly instead of
    // re-paying the full server render on every click. Server actions still
    // purge this cache via revalidatePath, so the acting user always sees
    // their own mutations immediately; other tabs/users are bounded by 30s.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
