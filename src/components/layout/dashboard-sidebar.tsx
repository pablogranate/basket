"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_COLLAPSED_STORAGE_KEY = "basket-production.shell.nav-collapsed.v1";

type DashboardSidebarProps = {
  brand: React.ReactNode;
  children: React.ReactNode;
};

export function DashboardSidebar({ brand, children }: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === "true";
  });

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-[#10203f] bg-[#07122b] transition-[width] lg:flex",
        collapsed ? "w-[4.25rem]" : "w-72",
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-[#10203f] py-7",
          collapsed ? "justify-center px-2" : "justify-between gap-3 px-6",
        )}
      >
        {collapsed ? null : brand}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Mostrar navegación" : "Compactar navegación"}
          title={collapsed ? "Mostrar navegación" : "Compactar navegación"}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#1c3057] bg-[#0c1c3f] text-[#9eb0cc] transition hover:border-[#2a4474] hover:text-white"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <div
        className={cn(
          "flex flex-1 flex-col justify-between px-5 py-6",
          collapsed && "hidden",
        )}
      >
        {children}
      </div>
    </aside>
  );
}
