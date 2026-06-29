"use client";

import { useEffect, useMemo, useState } from "react";

function formatDateTimeParts(date: Date) {
  const dateLabel = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

  const timeLabel = new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return { dateLabel, timeLabel };
}

export function DashboardFooterMeta({ userName }: { userName: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateNow = () => {
      setNow(new Date());
    };

    const frameId = window.requestAnimationFrame(updateNow);

    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
    };
  }, []);

  const dateTimeLabel = useMemo(() => {
    if (!now) {
      return null;
    }

    const { dateLabel, timeLabel } = formatDateTimeParts(now);
    return `${dateLabel} · ${timeLabel}`;
  }, [now]);

  return (
    <div className="flex flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-black tracking-tight text-[var(--foreground)]">
        {userName}
      </p>
      <p className="text-xs font-medium text-[var(--n-500)]">
        {dateTimeLabel ?? <span className="opacity-0">00 de marzo de 2026 · 00:00</span>}
      </p>
    </div>
  );
}
