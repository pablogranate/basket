"use client";

import { CalendarDays } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

type MyDayPeriodCalendarButtonProps = {
  view: "day" | "month";
  value: string;
};

export function MyDayPeriodCalendarButton({
  view,
  value,
}: MyDayPeriodCalendarButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();

  const openPicker = () => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    if ("showPicker" in input && typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={isPending}
        aria-label={
          view === "month" ? "Elegir mes de jornada" : "Elegir día de jornada"
        }
        className="inline-flex size-[52px] shrink-0 items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] text-[#617187] shadow-sm transition hover:border-[#f0d9de] hover:bg-[#fff7f8] hover:text-[var(--accent)] disabled:opacity-70"
      >
        <CalendarDays className="size-5" />
      </button>

      <input
        ref={inputRef}
        type={view === "month" ? "month" : "date"}
        defaultValue={value}
        className="sr-only"
        onChange={(event) => {
          const nextValue = event.currentTarget.value;

          if (!nextValue) {
            return;
          }

          startTransition(() => {
            router.push(`${pathname || "/mi-jornada"}?view=${view}&date=${nextValue}`);
          });
        }}
      />
    </>
  );
}
