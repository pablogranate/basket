// Browser side of basket-telemetry. The SDK is served same-origin by nginx at
// /_t/sdk.js; the stub queues calls made before it loads. In local dev there
// is no /_t/ proxy: the script 404s and window.bpt stays the stub, so every
// call is a no-op.

export const TELEMETRY_SDK_SRC = "/_t/sdk.js";

// The 1-line stub from the basket-telemetry README, verbatim.
export const TELEMETRY_STUB_SNIPPET =
  "(function(b){b.q=b.q||[];['track','captureError'].forEach(function(m){b[m]=b[m]||function(){b.q.push([m,[].slice.call(arguments)])}})})(window.bpt=window.bpt||{q:[]})";

// What an error boundary calls. Telemetry never adds a second error.
export function captureBoundaryError(
  error: unknown,
  extra: Record<string, unknown>,
): void {
  try {
    if (typeof window === "undefined") {
      return;
    }

    window.bpt?.captureError(error, extra);
  } catch {
    // Swallowed on purpose.
  }
}
