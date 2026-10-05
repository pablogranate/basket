"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { GRID_DISPLAY_COOKIE } from "@/lib/search-params";

const DISPLAY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
// Tailwind's `sm` breakpoint: below it the table never fits and the
// Tarjetas/Grilla toggle is hidden.
const PHONE_QUERY = "(width < 40rem)";

// The table view used to ship the whole card stack as a `sm:hidden` fallback,
// ~230 kB of HTML every desktop downloaded and never saw (#137). Phones only
// reach the table through a shared `display=table` link or a cookie set in
// landscape, so they pay one replace to the cards view instead. The cookie is
// per device, so pinning it to cards here touches only this phone.
export function GridPhoneCardsRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!window.matchMedia(PHONE_QUERY).matches) return;

    document.cookie = `${GRID_DISPLAY_COOKIE}=cards; path=/; max-age=${DISPLAY_COOKIE_MAX_AGE}; samesite=lax`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("display", "cards");
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  return (
    <p className="py-10 text-center text-sm text-n-600 sm:hidden">
      Cargando tarjetas…
    </p>
  );
}
