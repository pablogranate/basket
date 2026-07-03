"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { useResolvedTeamLogo } from "@/components/team-logo-resolution-context";
import { cn } from "@/lib/utils";

const teamLogoCache = new Map<string, string | null>();

function getTeamInitials(teamName: string) {
  return teamName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "BP";
}

export function ClientTeamLogoMark({
  teamName,
  competition,
  logoSrc,
  className,
  imageClassName,
  initialsClassName,
}: {
  teamName: string;
  competition?: string | null;
  // Pre-resolved crest path (string), explicit null (resolved → initials), or
  // undefined (unknown → resolve via context, else fetch). Passing a value here
  // skips both the context lookup and the network fetch.
  logoSrc?: string | null;
  className?: string;
  imageClassName?: string;
  initialsClassName?: string;
}) {
  const cacheKey = useMemo(
    () => `${teamName}::${competition ?? ""}`,
    [competition, teamName],
  );
  const contextLogo = useResolvedTeamLogo(cacheKey);

  // Resolution priority: explicit prop → server-built context map → fetch.
  const hasExplicit = logoSrc !== undefined;
  const preResolved: string | null | undefined = hasExplicit
    ? logoSrc
    : contextLogo.resolved
      ? contextLogo.src
      : undefined;
  const needsFetch = preResolved === undefined;

  const cachedLogoSrc = teamLogoCache.get(cacheKey);
  const [resolvedLogo, setResolvedLogo] = useState<{
    key: string;
    src: string | null;
  }>({
    key: cacheKey,
    src: cachedLogoSrc ?? null,
  });
  const fetchedLogoSrc =
    cachedLogoSrc !== undefined
      ? cachedLogoSrc
      : resolvedLogo.key === cacheKey
        ? resolvedLogo.src
        : null;
  const displaySrc = needsFetch ? fetchedLogoSrc : preResolved;

  useEffect(() => {
    // Skip the network entirely when the crest was resolved ahead of render
    // (explicit prop or server-built context map) or already cached.
    if (!needsFetch || cachedLogoSrc !== undefined) {
      return;
    }

    let ignore = false;

    fetch(
      `/api/team-logo?${new URLSearchParams({
        teamName,
        ...(competition ? { competition } : {}),
      }).toString()}`,
      {
        method: "GET",
        credentials: "same-origin",
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No se pudo resolver el escudo.");
        }

        const data = (await response.json()) as { src?: string | null };
        const resolvedSrc = data.src ?? null;

        teamLogoCache.set(cacheKey, resolvedSrc);

        if (!ignore) {
          setResolvedLogo({ key: cacheKey, src: resolvedSrc });
        }
      })
      .catch(() => {
        teamLogoCache.set(cacheKey, null);

        if (!ignore) {
          setResolvedLogo({ key: cacheKey, src: null });
        }
      });

    return () => {
      ignore = true;
    };
  }, [cacheKey, cachedLogoSrc, competition, needsFetch, teamName]);

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden border border-[var(--border)] bg-white shadow-sm transition-transform duration-200 delay-0 hover:z-10 hover:scale-[1.32] hover:delay-[900ms]",
        className,
      )}
    >
      {displaySrc ? (
        <Image
          src={displaySrc}
          alt={`Escudo de ${teamName}`}
          fill
          unoptimized
          sizes="48px"
          className={cn("object-contain p-1.5", imageClassName)}
        />
      ) : (
        <span
          className={cn(
            "text-xs font-black uppercase tracking-[0.2em] text-[var(--foreground)]",
            initialsClassName,
          )}
        >
          {getTeamInitials(teamName)}
        </span>
      )}
    </div>
  );
}
