import {
  Camera,
  Cpu,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCog,
  Wrench,
} from "lucide-react";

import { getFunctionDisplayName, getRoleDisplayName } from "@/lib/display";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import type { PersonListItem } from "@/lib/types";

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function getStatusBadgeClass(state: PersonListItem["assignment_state"]) {
  switch (state) {
    case "En asignacion":
      return "border-[#b8e7c7] bg-[#eefbf2] text-[#1b7d43] [&>span]:bg-[#23b25f]";
    case "Inactivo":
      return "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)] [&>span]:bg-[var(--accent)]";
    default:
      return "border-[var(--n-200)] bg-[var(--n-100)] text-[var(--n-600)] [&>span]:bg-[var(--n-400)]";
  }
}

export function getWhatsAppHref(phone: string | null) {
  if (!phone) {
    return null;
  }

  const normalizedPhone = phone.replaceAll(/\D+/g, "");
  return normalizedPhone ? `https://wa.me/${normalizedPhone}` : null;
}

export function getRolePresentation(role: string) {
  if (role === "Responsable") {
    return { Icon: ShieldCheck, className: "bg-[#fff3f6] text-[var(--accent)]" };
  }

  if (role === "Realizador" || role === "Productor") {
    return { Icon: UserRoundCog, className: "bg-[#eef2ff] text-[#4f46e5]" };
  }

  if (role === "Operador de Control") {
    return { Icon: SlidersHorizontal, className: "bg-[#eff6ff] text-[#2563eb]" };
  }

  if (role === "Operador de Grafica") {
    return { Icon: Palette, className: "bg-[#fff7ed] text-[#ea580c]" };
  }

  if (role === "Soporte tecnico" || role === "Ingenieria") {
    return { Icon: Wrench, className: "bg-[#ecfeff] text-[#0891b2]" };
  }

  if (
    role === "Relator" ||
    role === "Comentario" ||
    role === "Comentario 1" ||
    role === "Comentario 2" ||
    role === "Campo"
  ) {
    return { Icon: Mic, className: "bg-[#f5f3ff] text-[#7c3aed]" };
  }

  if (role === "Encoder") {
    return { Icon: Cpu, className: "bg-[#eefdf3] text-[#16a34a]" };
  }

  if (role.startsWith("Camara")) {
    return { Icon: Camera, className: "bg-[#f4f7fb] text-[#64748b]" };
  }

  return { Icon: ShieldCheck, className: "bg-[#f4f7fb] text-[#64748b]" };
}

// Functions (the person_functions relation) are the source of truth for a
// person's role(s). A person can hold several — join them — and fall back to
// the legacy notes role / assignment-derived primary_role only when untagged.
export function getPersonRoleDisplay(person: PersonListItem) {
  if (person.functions.length > 0) {
    return {
      roleLabel: person.functions.map(getFunctionDisplayName).join(", "),
      rolePresentation: getRolePresentation(person.functions[0]),
    };
  }

  const meta = parsePersonNotesMeta(person.notes);
  const legacy = meta.role || person.primary_role || "";

  return {
    roleLabel: legacy ? getRoleDisplayName(legacy) : "Sin rol",
    rolePresentation: getRolePresentation(legacy),
  };
}

export function getCityIndicator(city: string) {
  const normalizedCity = city
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalizedCity.includes("medellin") ||
    normalizedCity.includes("bogota") ||
    normalizedCity.includes("cali") ||
    normalizedCity.includes("barranquilla") ||
    normalizedCity.includes("colombia")
  ) {
    return { symbol: "CO", emoji: "🇨🇴", label: "Colombia" };
  }

  if (
    normalizedCity.includes("buenos aires") ||
    normalizedCity.includes("cordoba") ||
    normalizedCity.includes("rosario") ||
    normalizedCity.includes("santiago del estero") ||
    normalizedCity.includes("colonia caroya") ||
    normalizedCity.includes("argentina")
  ) {
    return { symbol: "AR", emoji: "🇦🇷", label: "Argentina" };
  }

  return { symbol: "CI", emoji: null, label: "Ciudad" };
}

export const PEOPLE_DIRECTORY_ACTION_STYLES = {
  neutral:
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--n-50)] px-3 text-xs font-bold text-[var(--n-600)] transition hover:bg-[var(--n-100)]",
  accent:
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--accent-border)]",
  disabled:
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--n-50)] px-3 text-xs font-bold text-[var(--n-400)]",
};

export { Mail, MapPin, MessageCircle };
