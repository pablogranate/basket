import { LogOut } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { DashboardAnnouncementBell } from "@/components/layout/dashboard-announcement-bell";
import { CollaboratorNav } from "@/components/layout/collaborator-nav";
import { DashboardFooterMeta } from "@/components/layout/dashboard-footer-meta";
import { UserProfileChip } from "@/components/layout/user-profile-chip";
import { SubmitButton } from "@/components/ui/submit-button";
import { PRODUCT_COPY } from "@/lib/copy";
import { getAppRoleDisplayName } from "@/lib/display";
import type { AnnouncementSummary } from "@/lib/data/announcements";
import type { UserContext } from "@/lib/types";

function BasketMark() {
  return (
    <div className="flex size-10 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-[0_12px_28px_rgba(230,18,56,0.22)]">
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <circle cx="16" cy="16" r="11.5" />
        <path d="M16 4.5v23" />
        <path d="M5.5 16h21" />
        <path d="M9.5 7.5c2.6 2.2 4 5.1 4 8.5s-1.4 6.3-4 8.5" />
        <path d="M22.5 7.5c-2.6 2.2-4 5.1-4 8.5s1.4 6.3 4 8.5" />
      </svg>
    </div>
  );
}

export function CollaboratorShell({
  children,
  user,
  announcement,
  allowTeams = true,
}: {
  children: React.ReactNode;
  user: UserContext | null;
  announcement: AnnouncementSummary | null;
  allowTeams?: boolean;
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
              <BasketMark />
              <div className="min-w-0">
                <p className="text-base font-extrabold leading-none tracking-[-0.03em] text-[var(--foreground)]">
                  {PRODUCT_COPY.collaboratorWordmark.line1}
                </p>
                <p className="mt-1 text-base font-extrabold leading-none tracking-[-0.03em] text-[var(--foreground)]">
                  {PRODUCT_COPY.collaboratorWordmark.line2}
                </p>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <CollaboratorNav allowTeams={allowTeams} />
            {user?.userId ? (
              <form action={signOutAction}>
                <SubmitButton
                  variant="ghost"
                  pendingLabel="Saliendo..."
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[#617187] hover:bg-[var(--background-soft)] hover:text-[var(--foreground)]"
                >
                  <LogOut className="size-4" />
                  Cerrar sesión
                </SubmitButton>
              </form>
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

      <main className="min-w-0 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:pb-8">
        {children}
      </main>

      <footer className="hidden border-t border-[var(--border)] bg-[var(--page-footer-bg)] px-4 py-6 backdrop-blur-sm lg:block lg:px-8">
        <DashboardFooterMeta userName={displayName} />
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[rgba(255,255,255,0.96)] px-4 py-3 backdrop-blur-md lg:hidden">
        <CollaboratorNav mobile allowTeams={allowTeams} />
      </div>
    </div>
  );
}
