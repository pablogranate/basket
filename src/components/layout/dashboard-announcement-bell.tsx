"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Megaphone, X } from "lucide-react";

import type { AnnouncementSummary } from "@/lib/data/announcements";
import { cn } from "@/lib/utils";

const AUTO_OPEN_STORAGE_PREFIX = "bp_announcement_auto_opened:";

function formatAnnouncementDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardAnnouncementBell({
  announcement,
}: {
  announcement: AnnouncementSummary | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const announcementVersion = useMemo(() => {
    if (!announcement) {
      return null;
    }

    return `${announcement.id}:${announcement.updated_at}`;
  }, [announcement]);

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
    if (!announcementVersion) {
      return;
    }

    const storageKey = `${AUTO_OPEN_STORAGE_PREFIX}${announcementVersion}`;
    let shouldAutoOpen = false;

    try {
      if (window.sessionStorage.getItem(storageKey)) {
        return;
      }

      window.sessionStorage.setItem(storageKey, "1");
      shouldAutoOpen = true;
    } catch {
      shouldAutoOpen = true;
    }

    if (!shouldAutoOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsOpen(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [announcementVersion]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (announcement) {
            setIsOpen(true);
          }
        }}
        disabled={!announcement}
        aria-label={
          announcement
            ? "Abrir comunicado general"
            : "No hay comunicados generales"
        }
        aria-haspopup="dialog"
        className={cn(
          "relative flex size-11 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--n-700)] transition",
          announcement
            ? "hover:bg-[var(--background-soft)] hover:text-[var(--foreground)]"
            : "cursor-default opacity-60",
        )}
      >
        <Bell className="size-5" />
        {announcement ? (
          <span className="absolute right-3 top-2.5 size-2.5 rounded-full bg-[var(--accent)]" />
        ) : null}
      </button>

      {isOpen && announcement ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--n-900)]/60 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-announcement-title"
            className="panel-surface relative w-full max-w-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Megaphone className="size-5" />
                  </span>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">
                      Comunicado general
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--n-400)]">
                      {formatAnnouncementDate(announcement.updated_at)}
                    </p>
                  </div>
                </div>
                <h3
                  id="dashboard-announcement-title"
                  className="mt-4 text-2xl font-extrabold tracking-[-0.03em] text-[var(--foreground)]"
                >
                  {announcement.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--background-soft)] text-[var(--n-400)] transition hover:bg-[var(--n-100)] hover:text-[var(--n-700)]"
                aria-label="Cerrar comunicado"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <p className="whitespace-pre-line text-sm leading-7 text-[var(--n-600)]">
                {announcement.body}
              </p>
            </div>

            <div className="flex justify-end border-t border-[var(--border)] px-6 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition hover:bg-[var(--accent-strong)]"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
