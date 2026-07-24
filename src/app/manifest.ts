import type { MetadataRoute } from "next";

// The installed home-screen app. start_url is "/" so the existing middleware +
// apex/role resolution decide where each user lands — the manifest never
// encodes role logic. No service worker is registered: the app needs a live
// connection (Supabase) and offline caching would only risk stale data.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BasquetPass Portal",
    short_name: "BasquetPass",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#e31b23",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
