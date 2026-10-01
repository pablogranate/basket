import { LogOut } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { AccessRequestsBellClient } from "@/components/access-requests/access-requests-bell-client";
import type { AccessRequestReviewItem } from "@/lib/access-requests/review-item";
import { DashboardFooterMeta } from "@/components/layout/dashboard-footer-meta";
import { MarcoDelPortal } from "@/components/layout/marco-del-portal";
import { UserProfileChip } from "@/components/layout/user-profile-chip";
import { SubmitButton } from "@/components/ui/submit-button";
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
      superAdmin={user?.superAdmin ?? false}
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
