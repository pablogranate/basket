import { describe, expect, it } from "vitest";

import {
  CIUDAD_COUNTRIES,
  composeCiudad,
  countryFlag,
  ciudadCountry,
  OTHER_CITY,
  readCiudadField,
  splitCiudad,
} from "@/lib/ciudad";

function fieldForm(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("readCiudadField", () => {
  it("reads a picked or typed city as \"Ciudad, País\"", () => {
    expect(readCiudadField(fieldForm({ pais: "AR", ciudad: "Córdoba" }))).toEqual({
      ok: true,
      ciudad: "Córdoba, Argentina",
    });
    expect(
      readCiudadField(fieldForm({ pais: "UY", ciudad: OTHER_CITY, otraCiudad: "Durazno" })),
    ).toEqual({ ok: true, ciudad: "Durazno, Uruguay" });
  });

  it("reads nothing picked as no city", () => {
    expect(readCiudadField(fieldForm({ pais: "AR", ciudad: "" }))).toEqual({
      ok: true,
      ciudad: null,
    });
  });

  it("refuses a pair the picker could not have posted", () => {
    expect(readCiudadField(fieldForm({ pais: "UY", ciudad: "Córdoba" }))).toEqual({ ok: false });
  });
});

describe("ciudadCountry", () => {
  it("names the country of a stored value", () => {
    expect(ciudadCountry("Madrid, España")?.code).toBe("ES");
    expect(ciudadCountry("Venado Tuerto, Argentina")?.code).toBe("AR");
  });

  it("gives nothing without a known country", () => {
    expect(ciudadCountry("Córdoba")).toBeNull();
    expect(ciudadCountry("Lima, Perú de Ficción")).toBeNull();
    expect(ciudadCountry(null)).toBeNull();
  });
});

// The ficha modal pre-fills the field from a stored Solicitud (basket#202).
describe("splitCiudad", () => {
  it("round-trips a listed city", () => {
    const composed = composeCiudad({ pais: "AR", ciudad: "Córdoba", otraCiudad: "" });
    expect(splitCiudad(composed)).toEqual({
      pais: "AR",
      ciudad: "Córdoba",
      otraCiudad: "",
    });
  });

  it("returns a city we don't list as Otra ciudad", () => {
    expect(splitCiudad("Villa Gesell, Argentina")).toEqual({
      pais: "AR",
      ciudad: OTHER_CITY,
      otraCiudad: "Villa Gesell",
    });
  });

  it("gives nothing for an unknown country or an empty value", () => {
    expect(splitCiudad("Lima, Perú de Ficción")).toBeNull();
    expect(splitCiudad("Rosario")).toBeNull();
    expect(splitCiudad(null)).toBeNull();
  });
});

describe("countryFlag", () => {
  it("maps an ISO code to its regional-indicator emoji", () => {
    expect(countryFlag("AR")).toBe("🇦🇷");
    expect(countryFlag("uy")).toBe("🇺🇾");
  });
});

describe("composeCiudad", () => {
  it("joins a listed city with its country name", () => {
    expect(
      composeCiudad({ pais: "AR", ciudad: "Córdoba", otraCiudad: "" }),
    ).toBe("Córdoba, Argentina");
  });

  it("accepts a typed city under the Otra option", () => {
    expect(
      composeCiudad({
        pais: "UY",
        ciudad: OTHER_CITY,
        otraCiudad: "  Durazno ",
      }),
    ).toBe("Durazno, Uruguay");
  });

  it("rejects a city that is not in the chosen country", () => {
    expect(
      composeCiudad({ pais: "UY", ciudad: "Córdoba", otraCiudad: "" }),
    ).toBeNull();
  });

  it("rejects an unknown country and an empty typed city", () => {
    expect(
      composeCiudad({ pais: "ZZ", ciudad: "X", otraCiudad: "" }),
    ).toBeNull();
    expect(
      composeCiudad({ pais: "AR", ciudad: OTHER_CITY, otraCiudad: "a" }),
    ).toBeNull();
  });

  it("keeps every catalog entry unique and non-empty", () => {
    const codes = CIUDAD_COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const country of CIUDAD_COUNTRIES) {
      expect(country.cities.length).toBeGreaterThan(0);
      expect(new Set(country.cities).size).toBe(country.cities.length);
    }
  });
});
