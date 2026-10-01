import { ArrowLeft, LogOut } from "lucide-react";

import { DashboardAnnouncementBell } from "@/components/layout/dashboard-announcement-bell";
import { CollaboratorNav } from "@/components/layout/collaborator-nav";
import { DashboardFooterMeta } from "@/components/layout/dashboard-footer-meta";
import { UserProfileChip } from "@/components/layout/user-profile-chip";
import { LOGOUT_PATH } from "@/lib/constants";
import { getAppRoleDisplayName } from "@/lib/display";
import type { AnnouncementSummary } from "@/lib/data/announcements";
import type { UserContext } from "@/lib/auth";

export function CollaboratorShell({
  children,
  user,
  announcement,
  landingUrl = null,
}: {
  children: React.ReactNode;
  user: UserContext | null;
  announcement: AnnouncementSummary | null;
  // The apex directory; null below two apps (basket#202).
  landingUrl?: string | null;
}) {
  const displayName =
    user?.profile?.full_name?.trim() ||
    user?.email?.split("@")[0] ||
    "Invitado";
  const roleLabel = getAppRoleDisplayName(user?.role).toUpperCase();

  return (
    <div className="min-h-screen bg-[var(--page-canvas)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(255,255,255,0.92)] backdrop-blur-md">
        <div className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {landingUrl ? (
                <a
                  href={landingUrl}
                  aria-label="Volver"
                  title="Volver"
                  className="inline-flex items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </a>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/basket-tv-horizontal-rojo.png"
                alt="BasquetPass"
                className="h-8 w-auto"
              />
            </div>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <CollaboratorNav />
            {user?.userId ? (
              <a
                href={LOGOUT_PATH}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--muted)] transition hover:bg-[var(--background-soft)] hover:text-[var(--foreground)]"
              >
                <LogOut className="size-4" />
                Cerrar sesión
              </a>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <DashboardAnnouncementBell announcement={announcement} />
            {user?.userId ? (
              <>
                <UserProfileChip
                  userId={user.userId}
                  fullName={displayName}
                  email={user.email}
                  roleLabel={roleLabel}
                  role={user.role}
                  mobileMenu
                  className="lg:hidden"
                />
                <UserProfileChip
                  userId={user.userId}
                  fullName={displayName}
                  email={user.email}
                  roleLabel={roleLabel}
                  role={user.role}
                  className="hidden lg:flex"
                />
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="min-w-0 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-8">
        {children}
      </main>

      <footer className="hidden border-t border-[var(--border)] bg-[var(--page-footer-bg)] px-4 py-6 backdrop-blur-sm lg:block lg:px-8">
        <DashboardFooterMeta userName={displayName} />
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[rgba(255,255,255,0.96)] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
        <CollaboratorNav mobile />
      </div>
    </div>
  );
}
