"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { authClient } from "@/lib/auth/client";

export function LogoutButtonClient() {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await authClient.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--foreground)] text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
    >
      <LogOut className="size-5" />
      {pending ? "Cerrando sesión..." : "Cerrar sesión"}
    </button>
  );
}
