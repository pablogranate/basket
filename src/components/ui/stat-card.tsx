import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "neutral" | "accent" | "danger" | "info";
}) {
  const toneClassName =
    tone === "accent"
      ? "border-[#d9efe3] bg-[#f4fbf7] text-[#177245]"
      : tone === "danger"
        ? "border-[#f1d3da] bg-[#fff5f7] text-[#b42343]"
        : tone === "info"
          ? "border-[#dbe6f6] bg-[#f7faff] text-[#315e9d]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]";

  const iconToneClassName =
    tone === "accent"
      ? "bg-[#e6f6ed] text-[#179a56]"
      : tone === "danger"
        ? "bg-[#fff0f3] text-[var(--accent)]"
        : tone === "info"
          ? "bg-[#eef4ff] text-[#315e9d]"
          : "bg-[var(--background-soft)] text-[var(--n-500)]";

  return (
    <div className={`rounded-[var(--panel-radius)] border px-5 py-4 ${toneClassName}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
            {label}
          </p>
          <p className="mt-3 font-[family-name:var(--font-oswald)] text-[2rem] font-bold leading-none">{value}</p>
        </div>
        <span
          className={`inline-flex size-11 items-center justify-center rounded-2xl ${iconToneClassName}`}
        >
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  );
}
