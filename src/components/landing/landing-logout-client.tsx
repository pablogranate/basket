"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { authClient } from "@/lib/auth/client";

export function LandingLogoutClient({ loginUrl }: { loginUrl: string }) {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await authClient.signOut();
    } finally {
      window.location.href = loginUrl;
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:opacity-80 disabled:opacity-60"
    >
      <LogOut className="size-4" />
      {pending ? "Cerrando sesión..." : "Cerrar sesión"}
    </button>
  );
}
