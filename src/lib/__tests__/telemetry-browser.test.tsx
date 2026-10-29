import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ERROR_FALLBACK_COPY, ErrorFallback } from "@/components/errors/error-fallback";
import { captureBoundaryError, TELEMETRY_STUB_SNIPPET } from "@/lib/telemetry-browser";

type FakeWindow = { bpt?: Record<string, unknown> & { q?: unknown[] } };

function withWindow(fake: FakeWindow) {
  vi.stubGlobal("window", fake);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("captureBoundaryError", () => {
  it("passes the error and its extra to window.bpt.captureError", () => {
    const captureError = vi.fn();
    withWindow({ bpt: { captureError } });
    const error = new Error("render failed");

    captureBoundaryError(error, { boundary: "root", digest: "123" });

    expect(captureError).toHaveBeenCalledWith(error, { boundary: "root", digest: "123" });
  });

  it("does nothing without the SDK and never throws, even if the SDK does", () => {
    withWindow({});
    expect(() => captureBoundaryError(new Error("x"), {})).not.toThrow();

    withWindow({
      bpt: {
        captureError: () => {
          throw new Error("sdk broke");
        },
      },
    });
    expect(() => captureBoundaryError(new Error("x"), {})).not.toThrow();
  });
});

describe("the SDK stub", () => {
  it("queues calls made before the SDK loads", () => {
    const fake: FakeWindow = {};
    new Function("window", TELEMETRY_STUB_SNIPPET)(fake);

    const bpt = fake.bpt as { track: (...args: unknown[]) => void; q: unknown[] };
    bpt.track("match_created", { staff_count: 2 });

    expect(bpt.q).toEqual([["track", ["match_created", { staff_count: 2 }]]]);
  });
});

describe("ErrorFallback", () => {
  it("renders the Spanish fallback with a retry button", () => {
    const html = renderToStaticMarkup(<ErrorFallback onRetry={() => {}} />);

    expect(html).toContain('role="alert"');
    expect(html).toContain(ERROR_FALLBACK_COPY.title);
    expect(html).toContain(ERROR_FALLBACK_COPY.retry);
  });
});
