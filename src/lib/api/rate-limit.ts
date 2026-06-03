import { RateLimiterMemory } from "rate-limiter-flexible";

export const GUEST_RATE_LIMIT_POINTS = 5;
export const GUEST_RATE_LIMIT_DURATION_SECONDS = 60;

const guestLimiter = new RateLimiterMemory({
  points: GUEST_RATE_LIMIT_POINTS,
  duration: GUEST_RATE_LIMIT_DURATION_SECONDS,
});

export type GuestRateLimitResult = {
  allowed: boolean;
  remainingPoints: number;
  msBeforeNext: number;
};

export async function consumeGuestRateLimit(
  key: string,
): Promise<GuestRateLimitResult> {
  try {
    const result = await guestLimiter.consume(key);
    return {
      allowed: true,
      remainingPoints: result.remainingPoints,
      msBeforeNext: result.msBeforeNext,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "msBeforeNext" in error &&
      typeof (error as { msBeforeNext: unknown }).msBeforeNext === "number"
    ) {
      const blocked = error as { msBeforeNext: number };
      return {
        allowed: false,
        remainingPoints: 0,
        msBeforeNext: blocked.msBeforeNext,
      };
    }

    console.error("[rate-limit] unexpected guest rate limiter error", error);
    return {
      allowed: false,
      remainingPoints: 0,
      msBeforeNext: GUEST_RATE_LIMIT_DURATION_SECONDS * 1000,
    };
  }
}
