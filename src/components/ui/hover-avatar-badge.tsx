import { cn } from "@/lib/utils";

// Deliberately NOT a client component: the hover reveal is pure CSS
// (`group-hover:`), so there is nothing to hydrate. /grid renders six of these
// per match card — as a client boundary each one cost a module reference plus
// serialized props in the RSC payload and a hydration node on the main thread.

export function HoverAvatarBadge({
  initials,
  roleLabel,
  showTooltip = true,
  tone = "accent",
  size = "md",
  className,
}: {
  initials: string;
  roleLabel?: string;
  showTooltip?: boolean;
  tone?: "accent" | "neutral";
  size?: "sm" | "md";
  className?: string;
}) {
  // Class strings live in globals.css (.hab-*): the month grid renders hundreds
  // of badges, so inline Tailwind strings repeated per badge dominated the
  // /grid payload. `group` stays inline as the group-hover: marker.
  return (
    <div className={cn("group hab", className)}>
      <div
        className={cn(
          "hab-badge",
          size === "sm" ? "hab-sm" : "hab-md",
          tone === "accent" ? "hab-accent" : "hab-neutral",
        )}
      >
        {initials}
      </div>
      {roleLabel && showTooltip ? (
        <div className="hab-tip">{roleLabel}</div>
      ) : null}
    </div>
  );
}
