"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageMessage({
  intent,
  message,
}: {
  intent?: string | null;
  message?: string | null;
}) {
  const [visible, setVisible] = useState(Boolean(message));
  const [lastMessage, setLastMessage] = useState(message);

  if (message !== lastMessage) {
    setLastMessage(message);
    setVisible(Boolean(message));
  }

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  if (!message || !visible) {
    return null;
  }

  const success = intent === "success";
  const Icon = success ? CheckCircle2 : AlertTriangle;

  return (
    <div
      className={cn(
        "panel-surface flex items-center gap-3 border px-4 py-3 text-sm",
        success
          ? "border-[#cce8db] bg-[#effaf4] text-[#17654d]"
          : "border-[#f2d8ae] bg-[#fff8ea] text-[#9a5a0f]",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar mensaje"
        className="inline-flex size-7 items-center justify-center rounded-full transition hover:bg-black/5"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
