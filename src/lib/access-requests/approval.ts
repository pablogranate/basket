import { normalizeText } from "@/lib/utils";

export type ApprovalCandidate = {
  id: string;
  fullName: string;
  email: string | null;
  profileId?: string | null;
  phone?: string | null;
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

// Last ten digits: the fichas hold phones in every legacy format ("54 9 2996
// 23-9091", "+541128961652") while the form posts E.164 with the mobile 9, and
// the national number survives all of them.
function phoneKey(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");

  return digits.length >= 8 ? digits.slice(-10) : null;
}

export type ExistingAccountReason = "phone" | "name";

export function describeExistingAccountReasons(reasons: ExistingAccountReason[]) {
  if (reasons.includes("phone") && reasons.includes("name")) {
    return "Mismo teléfono y mismo nombre";
  }

  return reasons.includes("phone") ? "Mismo teléfono" : "Mismo nombre";
}

export type ExistingAccountMatch = {
  person: ApprovalCandidate;
  reasons: ExistingAccountReason[];
};

// The applicant may already be someone with a Cuenta under another email: a
// second login would mean a second ficha. A ficha that already holds a Cuenta
// and shares the phone or a same-looking name is surfaced for the approver to
// decide; like name suggestions, it is never acted on by itself (D-08). The
// same email is a plain link, not a second account.
export function findExistingAccount({
  email,
  fullName,
  phone,
  candidates,
}: {
  email: string;
  fullName: string;
  phone: string | null;
  candidates: ApprovalCandidate[];
}): ExistingAccountMatch | null {
  const normalizedEmail = email.trim().toLowerCase();
  const applicantPhone = phoneKey(phone);
  const matches: ExistingAccountMatch[] = [];

  for (const candidate of candidates) {
    if (
      !candidate.profileId ||
      candidate.email?.trim().toLowerCase() === normalizedEmail
    ) {
      continue;
    }

    const reasons: ExistingAccountReason[] = [];

    if (applicantPhone && phoneKey(candidate.phone) === applicantPhone) {
      reasons.push("phone");
    }

    if (looksLikeSameName(candidate.fullName, fullName)) {
      reasons.push("name");
    }

    if (reasons.length) {
      matches.push({ person: candidate, reasons });
    }
  }

  // Both signals beat one; the phone alone beats the name alone.
  const score = (match: ExistingAccountMatch) =>
    match.reasons.length * 2 + (match.reasons.includes("phone") ? 1 : 0);

  return matches.sort((left, right) => score(right) - score(left))[0] ?? null;
}
