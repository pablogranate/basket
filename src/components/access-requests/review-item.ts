import type { ApprovalTarget } from "@/lib/access-requests/approval";
import type { AccessRequestSummary } from "@/lib/data/access-requests";

// One pending request plus everything the approver needs to decide it: the
// resolved target (link / suggest / create), the person's current values when
// there is one, and the pre-selected grid role.
export type AccessRequestReviewItem = {
  request: AccessRequestSummary;
  target: ApprovalTarget;
  linkedPerson: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    roleId: string | null;
  } | null;
  defaultRoleId: string | null;
};
