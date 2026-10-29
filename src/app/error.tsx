"use client";

import { useEffect } from "react";

import { ErrorFallback } from "@/components/errors/error-fallback";
import { captureBoundaryError } from "@/lib/telemetry-browser";

// Root error boundary: a render error below the root layout lands here, goes
// to basket-telemetry through the browser SDK and shows the Spanish fallback.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureBoundaryError(error, { boundary: "root", digest: error.digest ?? null });
  }, [error]);

  return <ErrorFallback onRetry={reset} />;
}
