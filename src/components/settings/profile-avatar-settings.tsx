"use client";

import Image from "next/image";
import { Camera, Trash2, UserRound } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  AVATAR_CHANGE_EVENT,
  getAvatarStorageKey,
} from "@/lib/profile-avatar";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileAvatarSettings({
  userId,
  email,
  fullName,
}: {
  userId: string | null;
  email: string | null;
  fullName: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const storageKey = useMemo(
    () => getAvatarStorageKey({ userId, email, fullName }),
    [email, fullName, userId],
  );
  const [avatarSrc, setAvatarSrc] = useState<string | null>(() => {
    if (!storageKey || typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(storageKey);
  });

  const applyAvatar = (nextValue: string | null) => {
    setAvatarSrc(nextValue);

    if (!storageKey || typeof window === "undefined") {
      return;
    }

    if (nextValue) {
      window.localStorage.setItem(storageKey, nextValue);
    } else {
      window.localStorage.removeItem(storageKey);
    }

    window.dispatchEvent(new Event(AVATAR_CHANGE_EVENT));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const nextValue = typeof reader.result === "string" ? reader.result : null;
      if (nextValue) {
        applyAvatar(nextValue);
      }
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-center">
      <div className="relative flex size-24 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--n-100)] shadow-sm">
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt={`Avatar de ${fullName}`}
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[var(--n-200)] text-[var(--n-700)]">
            {fullName.trim() ? (
              <span className="text-xl font-extrabold">{getInitials(fullName)}</span>
            ) : (
              <UserRound className="size-8" />
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm leading-6 text-[var(--n-600)]">
          Tu avatar se usa en el header y queda asociado a tu sesión local en este
          navegador.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
          >
            <Camera className="size-4 text-[var(--accent)]" />
            Cambiar avatar
          </button>
          <button
            type="button"
            onClick={() => applyAvatar(null)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-strong)] transition hover:bg-[var(--accent-border)]"
          >
            <Trash2 className="size-4" />
            Quitar avatar
          </button>
        </div>
      </div>

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
