import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const ERROR_FALLBACK_COPY = {
  title: "Algo salió mal",
  detail:
    "El portal encontró un error inesperado. Probá de nuevo; si vuelve a pasar, avisale a quien administra la app.",
  retry: "Reintentar",
  home: "Ir al inicio",
} as const;

// The Spanish fallback shown by the root error boundaries (error.tsx and
// global-error.tsx), built on the basket-tv-ui tokens like the rest of the
// portal's cards.
export function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6 py-8">
      <div
        role="alert"
        className="w-full max-w-[440px] rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-[var(--panel-shadow)] sm:p-8"
      >
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <TriangleAlert className="size-7" />
        </div>
        <h1 className="text-[1.6rem] font-black leading-tight tracking-tight text-[var(--foreground)]">
          {ERROR_FALLBACK_COPY.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          {ERROR_FALLBACK_COPY.detail}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button onClick={onRetry} className="gap-2">
            <RotateCcw className="size-4" />
            {ERROR_FALLBACK_COPY.retry}
          </Button>
          <Link
            href="/"
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            {ERROR_FALLBACK_COPY.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
