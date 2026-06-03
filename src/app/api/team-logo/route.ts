import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { getTeamLogoPath } from "@/lib/team-logos";

export const GET = withAuth({}, async (request) => {
  const url = new URL(request.url);
  const teamName = url.searchParams.get("teamName")?.trim();
  const competition = url.searchParams.get("competition")?.trim() ?? null;

  if (!teamName) {
    return NextResponse.json(
      { error: "El nombre del equipo es obligatorio." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    src: getTeamLogoPath({ teamName, competition }),
  });
});
