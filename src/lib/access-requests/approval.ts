import { normalizeText } from "@/lib/utils";

export type ApprovalCandidate = {
  id: string;
  fullName: string;
  email: string | null;
  profileId?: string | null;
};

export type ApprovalTarget =
  | { kind: "link"; person: ApprovalCandidate }
  | { kind: "suggest"; suggestions: ApprovalCandidate[] }
  | { kind: "create" };

function tokens(value: string) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

// "Parecido" without being fuzzy about identity: every token of the shorter name
// has to appear in the longer one, and a single shared token (a common first
// name) is not enough.
function looksLikeSameName(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);

  if (!left.length || !right.length) {
    return false;
  }

  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];

  if (shorter.length < 2) {
    return shorter[0] === longer[0] && longer.length < 2;
  }

  return shorter.every((token) => longer.includes(token));
}

// Exact email is the only thing that auto-links. Name similarity is surfaced to
// the approver as a suggestion — never acted on by itself (D-08).
export function resolveApprovalTarget({
  email,
  fullName,
  candidates,
}: {
  email: string;
  fullName: string;
  candidates: ApprovalCandidate[];
}): ApprovalTarget {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail) {
    const byEmail = candidates.find(
      (candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail,
    );

    if (byEmail) {
      return { kind: "link", person: byEmail };
    }
  }

  const suggestions = candidates.filter(
    (candidate) =>
      !candidate.profileId && looksLikeSameName(candidate.fullName, fullName),
  );

  if (suggestions.length) {
    return { kind: "suggest", suggestions };
  }

  return { kind: "create" };
}
