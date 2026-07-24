"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Native event fired by Chromium browsers when the app is installable. Not in
// the DOM lib types, so we describe the shape we use.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_STORAGE_KEY = "pwa-install-dismissed-at";
const REPROMPT_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SHOW_DELAY_MS = 2000;

type BannerMode = "android" | "ios";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes standalone on navigator, not via display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function wasDismissedRecently() {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < REPROMPT_AFTER_MS;
}

// iOS has no beforeinstallprompt; only Safari can add to the home screen, so
// other iOS browsers (Chrome/Firefox/Edge → CriOS/FxiOS/EdgiOS) show nothing.
function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as desktop Mac but has a touch screen.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  return !/crios|fxios|edgios/i.test(ua);
}

export function PwaInstallBanner() {
  const [mode, setMode] = useState<BannerMode | null>(null);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || !isMobile() || wasDismissedRecently()) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const onBeforeInstallPrompt = (event: Event) => {
      // Stop Chrome's own mini-infobar; we drive the prompt from our button.
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      timer = setTimeout(() => setMode("android"), SHOW_DELAY_MS);
    };

    const onInstalled = () => {
      deferredPrompt.current = null;
      setMode(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (isIosSafari()) {
      timer = setTimeout(() => setMode("ios"), SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, String(Date.now()));
    setMode(null);
  }

  async function install() {
    const prompt = deferredPrompt.current;
    if (!prompt) {
      dismiss();
      return;
    }
    await prompt.prompt();
    await prompt.userChoice;
    // Whatever the choice, retire this banner: an accept fires appinstalled,
    // a decline should respect the 30-day quiet window.
    deferredPrompt.current = null;
    dismiss();
  }

  if (!mode) return null;

  return (
    <div
      role="dialog"
      aria-label="Agregar BasquetPass a tu inicio"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]",
        "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-md rounded-[var(--panel-radius)] border border-[var(--border)]",
          "bg-[var(--surface)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
        )}
      >
        <div className="flex items-start gap-3">
          <img
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-[10px]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Agregá BasquetPass a tu inicio
            </p>
            {mode === "android" ? (
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                Acceso directo desde tu pantalla de inicio a la app
              </p>
            ) : (
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-[var(--muted)]">
                Tocá el botón Compartir
                <Share className="inline h-4 w-4" aria-hidden />
                y elegí «Agregar a inicio»
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Cerrar"
            className="-m-1 shrink-0 rounded-full p-1 text-[var(--muted)] transition hover:bg-[var(--background-soft)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          {mode === "android" ? (
            <Button variant="primary" onClick={install}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Agregar
            </Button>
          ) : (
            <Button variant="secondary" onClick={dismiss}>
              Entendido
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
