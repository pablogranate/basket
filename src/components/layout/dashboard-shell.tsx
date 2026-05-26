import { LogOut } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { DashboardFooterMeta } from "@/components/layout/dashboard-footer-meta";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { UserProfileChip } from "@/components/layout/user-profile-chip";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  APP_PORTAL_LABEL,
} from "@/lib/constants";
import type { AnnouncementSummary } from "@/lib/data/announcements";
import { getAppRoleDisplayName } from "@/lib/display";
import type { UserContext } from "@/lib/types";

export function DashboardShell(props: {
  children: React.ReactNode;
  user: UserContext | null;
  announcement: AnnouncementSummary | null;
}) {
  const { children, user } = props;
  const displayName =
    user?.profile?.full_name?.trim() ||
    user?.email?.split("@")[0] ||
    "Usuario";
  const roleLabel = getAppRoleDisplayName(user?.role).toUpperCase();

  return (
    <div className="min-h-screen bg-[var(--page-canvas)]">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-r border-[#10203f] bg-[#07122b] lg:flex">
          <div className="border-b border-[#10203f] px-6 py-7">
            <div className="flex flex-col gap-2">
              <p className="text-[1.6rem] font-black leading-none tracking-[-0.03em] text-[#e61218]">
                BASKET.TV
              </p>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#9eb0cc]">
                {APP_PORTAL_LABEL}
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-between px-5 py-6">
            <DashboardNav role={user?.role ?? null} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(255,255,255,0.88)] backdrop-blur-md">
            <div className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex items-center gap-3 lg:hidden">
                  <p className="text-xl font-black leading-none tracking-[-0.03em] text-[#e61218]">
                    BASKET.TV
                  </p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-4 sm:gap-5">
                <UserProfileChip
                  userId={user?.userId ?? null}
                  fullName={displayName}
                  email={user?.email ?? null}
                  roleLabel={roleLabel}
                  role={user?.role ?? null}
                  mobileMenu
                  className="sm:hidden"
                />
                <UserProfileChip
                  userId={user?.userId ?? null}
                  fullName={displayName}
                  email={user?.email ?? null}
                  roleLabel={roleLabel}
                  role={user?.role ?? null}
                  className="hidden sm:flex"
                />
                {user?.userId ? (
                  <form action={signOutAction} className="hidden sm:block">
                    <SubmitButton
                      variant="ghost"
                      pendingLabel="Saliendo..."
                      className="size-11 rounded-2xl px-0"
                    >
                      <LogOut className="size-4" />
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 bg-[var(--page-canvas)] px-4 py-5 sm:px-6 lg:px-8">
            {children}
          </main>

          <footer className="border-t border-[var(--border)] bg-[var(--page-footer-bg)] px-4 py-6 backdrop-blur-sm sm:px-6 lg:px-8">
            <DashboardFooterMeta userName={displayName} />
          </footer>
        </div>
      </div>
    </div>
  );
}
