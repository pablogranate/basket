import { describe, expect, it } from "vitest";

import {
  buildClubLogoSrc,
  isImageDataUrl,
  parseImageDataUrl,
} from "@/lib/club-logo";

describe("parseImageDataUrl", () => {
  it("decodes a base64 image data URL", () => {
    const parsed = parseImageDataUrl("data:image/PNG;base64,aGVsbG8=");

    expect(parsed?.contentType).toBe("image/png");
    expect(parsed?.bytes.toString()).toBe("hello");
  });

  it("rejects anything that is not an image data URL", () => {
    expect(parseImageDataUrl("/api/club-logo?club=x&v=1")).toBeNull();
    expect(parseImageDataUrl("data:text/html;base64,aGVsbG8=")).toBeNull();
    expect(isImageDataUrl("https://example.com/logo.png")).toBe(false);
  });
});

describe("buildClubLogoSrc", () => {
  it("builds a versioned URL only when the club has a logo", () => {
    expect(buildClubLogoSrc("abc", "1234-99")).toBe(
      "/api/club-logo?club=abc&v=1234-99",
    );
    expect(buildClubLogoSrc("abc", null)).toBeNull();
  });
});
