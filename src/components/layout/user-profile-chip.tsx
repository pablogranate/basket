"use client";

import Image from "next/image";
import Link from "next/link";
import { BriefcaseBusiness, Camera, LogOut, Settings2, Shield, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { signOutAction } from "@/app/actions/auth";
import type { AppRole } from "@/lib/database.types";
import { isCollaboratorLimitedRole } from "@/lib/constants";
import {
  AVATAR_CHANGE_EVENT,
  getAvatarStorageKey,
} from "@/lib/profile-avatar";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserProfileChip({
  userId,
  fullName,
  email,
  roleLabel,
  role,
  className,
  mobileMenu = false,
}: {
  userId: string | null;
  fullName: string;
  email: string | null;
  roleLabel: string;
  role?: AppRole | null;
  className?: string;
  mobileMenu?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const storageKey = useMemo(
    () => getAvatarStorageKey({ userId, email, fullName }),
    [email, fullName, userId],
  );

  const [isHydrated, setIsHydrated] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsHydrated(true);
      if (!storageKey || typeof window === "undefined") {
        setAvatarSrc(null);
        return;
      }

      setAvatarSrc(window.localStorage.getItem(storageKey));
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [storageKey]);

  useEffect(() => {
    if (!isHydrated || !storageKey || typeof window === "undefined") {
      return;
    }

    const syncAvatar = () => {
      setAvatarSrc(window.localStorage.getItem(storageKey));
    };

    window.addEventListener("storage", syncAvatar);
    window.addEventListener(AVATAR_CHANGE_EVENT, syncAvatar);

    return () => {
      window.removeEventListener("storage", syncAvatar);
      window.removeEventListener(AVATAR_CHANGE_EVENT, syncAvatar);
    };
  }, [isHydrated, storageKey]);

  useEffect(() => {
    if (!mobileMenu || !menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen, mobileMenu]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const nextValue = typeof reader.result === "string" ? reader.result : null;
      if (!nextValue) {
        return;
      }

      setAvatarSrc(nextValue);

      if (storageKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, nextValue);
          window.dispatchEvent(new Event(AVATAR_CHANGE_EVENT));
        } catch {
          // If localStorage is full, keep the preview for this session only.
        }
      }
    };

    reader.readAsDataURL(file);
  };

  const avatarButtonClassName = mobileMenu
    ? "relative flex size-14 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[#edf1f4] shadow-sm ring-2 ring-white transition hover:border-[var(--accent)]"
    : "group relative flex size-14 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[#edf1f4] shadow-sm ring-2 ring-white transition hover:border-[var(--accent)]";

  const avatarContent = avatarSrc ? (
    <Image
      src={avatarSrc}
      alt={`Foto de perfil de ${fullName}`}
      fill
      sizes="56px"
      className="object-cover"
    />
  ) : (
    <div className="flex size-full items-center justify-center bg-[#d8e3e2] text-[#324b53]">
      {fullName.trim() ? (
        <span className="text-sm font-extrabold">{getInitials(fullName)}</span>
      ) : (
        <UserRound className="size-6" />
      )}
    </div>
  );
  const limitedCollaborator = isCollaboratorLimitedRole(role);

  if (mobileMenu) {
    return (
      <div ref={menuRef} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className={avatarButtonClassName}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Abrir menú de perfil"
        >
          {avatarContent}
        </button>

        {menuOpen ? (
          <div className="panel-surface absolute right-0 top-[calc(100%+0.75rem)] z-50 w-56 border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_18px_40px_rgba(20,24,35,0.12)]">
            <Link
              href="/mi-jornada"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-3 rounded-[calc(var(--panel-radius)-4px)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
            >
              <BriefcaseBusiness className="size-4 text-[#617187]" />
              Mi jornada
            </Link>
            <Link
              href="/teams"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-3 rounded-[calc(var(--panel-radius)-4px)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
            >
              <Shield className="size-4 text-[#617187]" />
              Equipos
            </Link>
            {!limitedCollaborator ? (
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-3 rounded-[calc(var(--panel-radius)-4px)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
              >
                <Settings2 className="size-4 text-[#617187]" />
                Configuración
              </Link>
            ) : null}
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-[calc(var(--panel-radius)-4px)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
              >
                <LogOut className="size-4 text-[#617187]" />
                Cerrar sesión
              </button>
            </form>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="hidden text-right sm:block">
        <p className="text-[15px] font-extrabold leading-none text-[var(--foreground)]">
          {fullName}
        </p>
        <p className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--accent)]">
          {roleLabel}
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={avatarButtonClassName}
        title="Cambiar foto de perfil"
      >
        {avatarContent}
        <span className="absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full border-2 border-white bg-[var(--accent)] text-white shadow-sm transition group-hover:scale-105">
          <Camera className="size-3.5" />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
