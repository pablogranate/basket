"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

const LEAGUE_LOGO_BASE_PATH = "/LogosPNG/Logos%20Ligas%20500x500";

const LEAGUE_LOGO_MAP: Record<string, string> = {
  acb: "Liga Endesa.png",
  euroliga: "Euroliga.png",
  euroleague: "Euroliga.png",
  "liga argentina": "Liga Argentina.png",
  "liga chery": "Liga Chery.png",
  "liga chery chile": "Liga Chery.png",
  "liga endesa": "Liga Endesa.png",
  "liga federal": "Liga Federal.png",
  "liga femenina": "Liga Femenina.png",
  "liga nacional": "Liga Nacional.png",
  "liga proximo": "Liga Proximo.png",
  "lba serie a": "LBA SeriE A.png",
  lba: "LBA SeriE A.png",
  lbp: "LBP.png",
  lda: "LDA.png",
  lub: "LUB.png",
  "primera feb": "Primera FEB.png",
};

function normalizeLeague(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getLeagueInitials(league: string) {
  return (
    league
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "LG"
  );
}

function getLeagueLogoSrc(league: string) {
  const normalized = normalizeLeague(league);
  const fileName = LEAGUE_LOGO_MAP[normalized];

  return fileName ? `${LEAGUE_LOGO_BASE_PATH}/${encodeURIComponent(fileName)}` : null;
}

export function LeagueLogoMarkClient({
  league,
  className,
}: {
  league: string;
  className?: string;
}) {
  const src = getLeagueLogoSrc(league);

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-lg bg-transparent",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={`Logo de ${league}`}
          fill
          unoptimized
          sizes="80px"
          className="object-contain p-0.5"
        />
      ) : (
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
          {getLeagueInitials(league)}
        </span>
      )}
    </div>
  );
}
