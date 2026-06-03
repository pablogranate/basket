import { afterEach, describe, expect, it, vi } from "vitest";

import { getUserContext } from "@/lib/auth";
import { getGridCalendarData } from "@/lib/data/dashboard";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

vi.mock("@/lib/data/dashboard", () => ({
  getGridCalendarData: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);
const mockedGetGridCalendarData = vi.mocked(getGridCalendarData);

function buildRequest() {
  return new Request(
    "https://portal.basket-app.test/api/grid/calendar?calendarMonth=2026-06",
  );
}

describe("api/grid/calendar GET auth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    const { GET } = await import("../route");

    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
    expect(mockedGetGridCalendarData).not.toHaveBeenCalled();
  });

  it("returns calendar data for an authenticated session", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "editor" }));
    mockedGetGridCalendarData.mockResolvedValue([]);
    const { GET } = await import("../route");

    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(mockedGetGridCalendarData).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.month).toBe("2026-06");
    expect(Array.isArray(body.days)).toBe(true);
  });
});
