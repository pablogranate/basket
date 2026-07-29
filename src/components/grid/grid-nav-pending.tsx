"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Pending feedback for the /grid toolbar links. Mirrors the dimmed, aria-busy
// treatment GridDisplayToggle already applies around its router.push transition,
// so every toolbar control signals an in-flight navigation the same way.
//
// Must render as a child of a <Link>; useLinkStatus reads that link's state.
export function GridNavPending({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      className={cn("transition-opacity", pending && "opacity-60", className)}
      aria-busy={pending}
    >
      {children}
    </span>
  );
}
