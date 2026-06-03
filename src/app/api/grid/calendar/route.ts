import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth";
import { getGridCalendarData } from "@/lib/data/dashboard";
import { getMonthInputValue } from "@/lib/date";
import { parseGridSearchParams } from "@/lib/search-params";

function isMonthString(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

export async function GET(request: Request) {
  const user = await getUserContext();

  if (!user.userId) {
    return NextResponse.json(
      { error: "Debes iniciar sesión para consultar el calendario." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const filters = parseGridSearchParams(url.searchParams);
  const requestedMonth = url.searchParams.get("calendarMonth");
  const fallbackMonth =
    filters.view === "month" ? filters.date : filters.date.slice(0, 7);
  const month = isMonthString(requestedMonth)
    ? requestedMonth!
    : isMonthString(fallbackMonth)
      ? fallbackMonth
      : getMonthInputValue();

  const days = await getGridCalendarData(user, {
    month,
    q: filters.q,
    league: filters.league,
    mode: filters.mode,
    status: filters.status,
    owner: filters.owner,
    timezone: filters.timezone,
  });

  return NextResponse.json({
    month,
    days,
  });
}
