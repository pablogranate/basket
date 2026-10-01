import { LogOut } from "lucide-react";

import { AccessRequestsBellClient } from "@/components/access-requests/access-requests-bell-client";
import type { AccessRequestReviewItem } from "@/lib/access-requests/review-item";
import { DashboardFooterMeta } from "@/components/layout/dashboard-footer-meta";
import { MarcoDelPortal } from "@/components/layout/marco-del-portal";
import { UserProfileChip } from "@/components/layout/user-profile-chip";
import { LOGOUT_PATH } from "@/lib/constants";
import { can } from "@/lib/roles";
import type { AnnouncementSummary } from "@/lib/data/announcements";
import { getAppRoleDisplayName } from "@/lib/display";
import type { UserContext } from "@/lib/auth";

export function DashboardShell(props: {
  children: React.ReactNode;
  user: UserContext | null;
  announcement: AnnouncementSummary | null;
  landingUrl?: string | null;
  accessRequests: {
    items: AccessRequestReviewItem[];
    funcionOptions: { id: string; name: string }[];
  } | null;
}) {
  const { children, user, landingUrl, accessRequests } = props;
  const displayName =
    user?.profile?.full_name?.trim() ||
    user?.email?.split("@")[0] ||
    "Usuario";
  const roleLabel = getAppRoleDisplayName(user?.role).toUpperCase();

  return (
    <MarcoDelPortal
      role={user?.role ?? null}
      lanzadorUrl={landingUrl ?? null}
      cabecera={
        <>
          {accessRequests ? (
            <AccessRequestsBellClient
              items={accessRequests.items}
              funcionOptions={accessRequests.funcionOptions}
              canSelectAccessTier={can(user, "admin")}
            />
          ) : null}
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
            <a
              href={LOGOUT_PATH}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="hidden size-11 items-center justify-center rounded-2xl border border-transparent text-[var(--muted)] transition hover:bg-[var(--background-soft)] hover:text-[var(--foreground)] sm:inline-flex"
            >
              <LogOut className="size-4" />
            </a>
          ) : null}
        </>
      }
    >
      {children}
      <footer className="border-t border-[var(--border)] pt-6">
        <DashboardFooterMeta userName={displayName} />
      </footer>
    </MarcoDelPortal>
  );
}
