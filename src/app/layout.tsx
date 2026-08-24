import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Oswald, Poppins } from "next/font/google";

import { APP_NAME } from "@/lib/constants";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  // Only 600 (font-semibold) and 700 (font-bold) are used with Oswald.
  weight: ["600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  // Plex Mono only renders at its default 400.
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Grilla operativa con asignaciones, auditoría, permisos y flujo de producción en vivo.",
  icons: {
    icon: { url: "/favicon.webp", type: "image/webp" },
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
  },
  // iOS ignores the web manifest; these opt the added-to-home-screen app into
  // fullscreen standalone mode with the right label.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BasquetPass",
  },
};

// `viewport-fit=cover` is what makes env(safe-area-inset-*) resolve to a real
// value on notched iPhones; without it the collaborator bottom nav sits under
// the home indicator in installed-PWA mode.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${poppins.variable} ${oswald.variable} ${plexMono.variable} min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
