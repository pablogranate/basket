import { describe, expect, it } from "vitest";

import {
  ACCESS_REQUEST_COUNTRIES,
  composeAccessRequestCiudad,
  countryFlag,
  OTHER_CITY,
} from "@/lib/access-requests/locations";

describe("countryFlag", () => {
  it("maps an ISO code to its regional-indicator emoji", () => {
    expect(countryFlag("AR")).toBe("🇦🇷");
    expect(countryFlag("uy")).toBe("🇺🇾");
  });
});

describe("composeAccessRequestCiudad", () => {
  it("joins a listed city with its country name", () => {
    expect(
      composeAccessRequestCiudad({ pais: "AR", ciudad: "Córdoba", otraCiudad: "" }),
    ).toBe("Córdoba, Argentina");
  });

  it("accepts a typed city under the Otra option", () => {
    expect(
      composeAccessRequestCiudad({
        pais: "UY",
        ciudad: OTHER_CITY,
        otraCiudad: "  Durazno ",
      }),
    ).toBe("Durazno, Uruguay");
  });

  it("rejects a city that is not in the chosen country", () => {
    expect(
      composeAccessRequestCiudad({ pais: "UY", ciudad: "Córdoba", otraCiudad: "" }),
    ).toBeNull();
  });

  it("rejects an unknown country and an empty typed city", () => {
    expect(
      composeAccessRequestCiudad({ pais: "ZZ", ciudad: "X", otraCiudad: "" }),
    ).toBeNull();
    expect(
      composeAccessRequestCiudad({ pais: "AR", ciudad: OTHER_CITY, otraCiudad: "a" }),
    ).toBeNull();
  });

  it("keeps every catalog entry unique and non-empty", () => {
    const codes = ACCESS_REQUEST_COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const country of ACCESS_REQUEST_COUNTRIES) {
      expect(country.cities.length).toBeGreaterThan(0);
      expect(new Set(country.cities).size).toBe(country.cities.length);
    }
  });
});
