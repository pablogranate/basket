import type { ApprovalCandidate, ApprovalTarget } from "@/lib/access-requests/approval";
import type { ExistingAccountView } from "@/lib/access-requests/existing-account";
import type { AccessRequestSummary } from "@/lib/access-requests/requests";

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
  // Cuenta-less fichas that look like the applicant, offered for fusión into
  // the ficha the request lands on, whether it is linked by email or new.
  mergeSuggestions: ApprovalCandidate[];
  // Another login of the same person, flagged by phone or name (never by itself
  // acted on): the card asks which login stays.
  existingAccount: ExistingAccountView | null;
};
