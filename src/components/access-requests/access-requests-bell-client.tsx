"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";

import { AccessRequestDecisionForm } from "@/components/access-requests/access-request-decision-form";
import type { AccessRequestReviewItem } from "@/lib/access-requests/review-item";
import { cn } from "@/lib/utils";

// Auto-open once per approver per pending set. Dismissing is local and never
// touches request state, so closing the modal cannot hide a request from anyone
// else (D-15). Same sessionStorage trick as dashboard-announcement-bell.
const AUTO_OPEN_STORAGE_PREFIX = "bp_access_requests_auto_opened:";

export function AccessRequestsBellClient({
  items,
  roleOptions,
  canSelectAccessTier,
}: {
  items: AccessRequestReviewItem[];
  roleOptions: { id: string; name: string }[];
  canSelectAccessTier: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    items[0]?.request.id ?? null,
  );
  const pendingVersion = useMemo(
    () => (items.length ? items.map((item) => item.request.id).join("|") : null),
    [items],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!pendingVersion) {
      return;
    }

    const storageKey = `${AUTO_OPEN_STORAGE_PREFIX}${pendingVersion}`;

    try {
      if (window.sessionStorage.getItem(storageKey)) {
        return;
      }

      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // A blocked storage just means the modal opens again next navigation.
    }

    const timeoutId = window.setTimeout(() => {
      setIsOpen(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingVersion]);

  const count = items.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={
          count
            ? `Solicitudes de acceso pendientes: ${count}`
            : "Solicitudes de acceso"
        }
        aria-haspopup="dialog"
        className={cn(
          "relative flex size-11 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--n-700)] transition hover:bg-[var(--background-soft)] hover:text-[var(--foreground)]",
          !count && "opacity-70",
        )}
      >
        <UserPlus className="size-5" />
        {count ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-black text-white">
            {count}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-[var(--n-900)]/60 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-requests-title"
            className="panel-surface relative my-8 w-full max-w-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">
                  Solicitudes
                </p>
                <h3
                  id="access-requests-title"
                  className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-[var(--foreground)]"
                >
                  {count
                    ? `${count} solicitud${count === 1 ? "" : "es"} pendiente${count === 1 ? "" : "s"}`
                    : "No hay solicitudes pendientes"}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--background-soft)] text-[var(--n-400)] transition hover:bg-[var(--n-100)] hover:text-[var(--n-700)]"
                aria-label="Cerrar solicitudes"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {items.length ? (
                items.map((item) => (
                  <div key={item.request.id} className="px-6 py-4">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(
                          expandedId === item.request.id ? null : item.request.id,
                        )
                      }
                      className="flex w-full items-center justify-between gap-4 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-base font-extrabold text-[var(--foreground)]">
                          {item.request.full_name}
                        </span>
                        <span className="block truncate text-sm text-[var(--n-500)]">
                          {item.request.funcion} · {item.request.email}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">
                        {expandedId === item.request.id ? "Cerrar" : "Revisar"}
                      </span>
                    </button>

                    {expandedId === item.request.id ? (
                      <div className="mt-4">
                        <AccessRequestDecisionForm
                          item={item}
                          roleOptions={roleOptions}
                          canSelectAccessTier={canSelectAccessTier}
                        />
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="px-6 py-6 text-sm text-[var(--n-500)]">
                  Cuando alguien se registre, su solicitud aparece acá.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
