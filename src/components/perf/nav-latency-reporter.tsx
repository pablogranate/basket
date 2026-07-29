"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useRef } from "react";

// Measures the thing users actually complain about: how long a click takes to
// become new content.
//
// Lab LCP does not capture it on /grid. The LCP element is the section header
// paragraph — static shell copy — and the match list streams in behind a Suspense
// skeleton, so the skeleton satisfies LCP and the later swap to real content is
// invisible to the metric. A page can hold a 666ms LCP while every date step
// feels slow.
//
// Reporting is opt-in per browser: set `basket.perf` in localStorage to enable.
// Shipping these to a collector would need an ingest endpoint, which this round
// deliberately does not add, so the numbers stay local to whoever is measuring.
const OPT_IN_STORAGE_KEY = "basket.perf";

// Vitals worth naming. INP is the interaction counterpart to the navigation
// timing below; the rest are logged for context, not as goals.
const REPORTED_VITALS = new Set(["INP", "LCP", "CLS", "TTFB", "FCP"]);

function isOptedIn() {
  try {
    return window.localStorage.getItem(OPT_IN_STORAGE_KEY) !== null;
  } catch {
    // Private-mode Safari throws on localStorage access.
    return false;
  }
}

function findNavigationTarget(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) {
    return null;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }

  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return null;
  }

  if (anchor.target && anchor.target !== "_self") {
    return null;
  }

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) {
    return null;
  }

  const from = `${window.location.pathname}${window.location.search}`;
  const to = `${url.pathname}${url.search}`;
  return from === to ? null : to;
}

export function NavLatencyReporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pending = useRef<{ to: string; startedAt: number } | null>(null);

  useReportWebVitals((metric) => {
    if (!isOptedIn() || !REPORTED_VITALS.has(metric.name)) {
      return;
    }

    console.info(
      `[perf] ${metric.name} ${Math.round(metric.value)}${metric.name === "CLS" ? "" : "ms"}`,
      { rating: metric.rating, path: window.location.pathname },
    );
  });

  useEffect(() => {
    if (!isOptedIn()) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const to = findNavigationTarget(event);
      if (to) {
        pending.current = { to, startedAt: performance.now() };
      }
    }

    // Capture phase: the timer has to start before the router handles the click.
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // Fires after the new route has committed, which is the moment the user sees
  // content rather than the moment the request went out.
  useEffect(() => {
    const inFlight = pending.current;
    if (!inFlight) {
      return;
    }

    pending.current = null;
    const query = searchParams.toString();
    const arrived = query ? `${pathname}?${query}` : pathname;

    console.info(
      `[perf] navigation ${Math.round(performance.now() - inFlight.startedAt)}ms`,
      { to: arrived, requested: inFlight.to },
    );
  }, [pathname, searchParams]);

  return null;
}
