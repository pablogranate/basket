"use client";

import { useEffect } from "react";

import { ErrorFallback } from "@/components/errors/error-fallback";
import { captureBoundaryError } from "@/lib/telemetry-browser";
import "./globals.css";

// Replaces the root layout when the layout itself fails, so it renders its
// own html and body and imports the global styles again.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureBoundaryError(error, { boundary: "global", digest: error.digest ?? null });
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <ErrorFallback onRetry={reset} />
      </body>
    </html>
  );
}
