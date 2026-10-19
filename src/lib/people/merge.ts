import { looksLikeSameName } from "@/lib/access-requests/approval";

export type MergeFicha = {
  id: string;
  fullName: string;
  email: string | null;
  profileId: string | null;
};

export type FichaMergePlan =
  | { kind: "merge"; survivor: MergeFicha; merged: MergeFicha }
  | { kind: "blocked"; reason: string };

// Which ficha stays when two are fused. The one with a Cuenta survives, so the
// login keeps seeing its grilla; with no Cuenta on either side, the one being
// edited does. Two Cuentas are two logins: which one stays is decided on a
// Solicitud, not by fusing fichas.
export function planFichaMerge(current: MergeFicha, other: MergeFicha): FichaMergePlan {
  if (current.id === other.id) {
    return { kind: "blocked", reason: "Elegí otra ficha para fusionar." };
  }

  if (current.profileId && other.profileId) {
    return {
      kind: "blocked",
      reason: "Las dos fichas tienen cuenta del portal: no se pueden fusionar.",
    };
  }

  return other.profileId
    ? { kind: "merge", survivor: other, merged: current }
    : { kind: "merge", survivor: current, merged: other };
}

export type DuplicateFichas = {
  survivor: MergeFicha;
  duplicates: MergeFicha[];
};

// One key per unordered pair, as people_merge_dismissals stores it.
export function orderFichaPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pairKey(a: string, b: string) {
  return orderFichaPair(a, b).join("|");
}

// Fichas with a Cuenta paired with the Cuenta-less fichas that look like the
// same human: same email, or a name like the ones the approve modal suggests.
// Typically a grilla name ("Rene Nino Tolaba") that kept the assignments while
// the login was linked to another ficha ("Nino Tolaba"). A dismissed pair is
// one an admin confirmed are two people: it is not offered again.
export function findDuplicateFichas(
  fichas: MergeFicha[],
  dismissedPairs: [string, string][] = [],
): DuplicateFichas[] {
  const dismissed = new Set(dismissedPairs.map(([a, b]) => pairKey(a, b)));
  const unlinked = fichas.filter((ficha) => !ficha.profileId);

  return fichas.flatMap((survivor) => {
    if (!survivor.profileId) {
      return [];
    }

    const email = survivor.email?.trim().toLowerCase() ?? "";
    const duplicates = unlinked.filter(
      (ficha) =>
        !dismissed.has(pairKey(survivor.id, ficha.id)) &&
        ((email !== "" && ficha.email?.trim().toLowerCase() === email) ||
          looksLikeSameName(ficha.fullName, survivor.fullName)),
    );

    return duplicates.length ? [{ survivor, duplicates }] : [];
  });
}

// The fusión picker's options: look-alike names first, everyone else after.
export function groupMergeOptions(current: MergeFicha, options: MergeFicha[]) {
  const others = options
    .filter((option) => option.id !== current.id)
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "es"));
  const similar = others.filter((option) =>
    looksLikeSameName(option.fullName, current.fullName),
  );

  return { similar, rest: others.filter((option) => !similar.includes(option)) };
}
