// A Ciudad is stored as one "Ciudad, País" string, on a Solicitud and on a
// ficha alike. This module owns that format: the country → city catalog the
// picker offers (CiudadFieldClient), reading what the picker posts, and
// reading a stored value back. "Otra" lets someone type a city we did not list
// so nobody is locked out.
export const OTHER_CITY = "__otra__";

export type Country = {
  code: string;
  name: string;
  cities: readonly string[];
};

export const CIUDAD_COUNTRIES: readonly Country[] = [
  {
    code: "AR",
    name: "Argentina",
    cities: [
      "Buenos Aires",
      "Bahía Blanca",
      "Catamarca",
      "Comodoro Rivadavia",
      "Concordia",
      "Córdoba",
      "Corrientes",
      "Formosa",
      "Junín",
      "La Plata",
      "La Rioja",
      "Mar del Plata",
      "Mendoza",
      "Neuquén",
      "Paraná",
      "Posadas",
      "Rafaela",
      "Resistencia",
      "Río Cuarto",
      "Río Gallegos",
      "Rosario",
      "Salta",
      "San Juan",
      "San Luis",
      "San Miguel de Tucumán",
      "San Nicolás",
      "San Salvador de Jujuy",
      "Santa Fe",
      "Santa Rosa",
      "Santiago del Estero",
      "Trelew",
      "Ushuaia",
      "Viedma",
    ],
  },
  {
    code: "UY",
    name: "Uruguay",
    cities: [
      "Montevideo",
      "Canelones",
      "Ciudad de la Costa",
      "Colonia del Sacramento",
      "Maldonado",
      "Paysandú",
      "Punta del Este",
      "Rivera",
      "Salto",
      "Tacuarembó",
    ],
  },
  {
    code: "CL",
    name: "Chile",
    cities: [
      "Santiago",
      "Antofagasta",
      "Concepción",
      "La Serena",
      "Puerto Montt",
      "Rancagua",
      "Talca",
      "Temuco",
      "Valdivia",
      "Valparaíso",
      "Viña del Mar",
    ],
  },
  {
    code: "PY",
    name: "Paraguay",
    cities: [
      "Asunción",
      "Ciudad del Este",
      "Encarnación",
      "Luque",
      "San Lorenzo",
    ],
  },
  {
    code: "BO",
    name: "Bolivia",
    cities: ["La Paz", "Cochabamba", "El Alto", "Santa Cruz de la Sierra", "Sucre"],
  },
  {
    code: "BR",
    name: "Brasil",
    cities: [
      "São Paulo",
      "Belo Horizonte",
      "Brasília",
      "Curitiba",
      "Florianópolis",
      "Fortaleza",
      "Porto Alegre",
      "Recife",
      "Rio de Janeiro",
      "Salvador",
    ],
  },
  {
    code: "PE",
    name: "Perú",
    cities: ["Lima", "Arequipa", "Chiclayo", "Cusco", "Piura", "Trujillo"],
  },
  {
    code: "CO",
    name: "Colombia",
    cities: [
      "Bogotá",
      "Barranquilla",
      "Bucaramanga",
      "Cali",
      "Cartagena",
      "Medellín",
      "Pereira",
    ],
  },
  {
    code: "EC",
    name: "Ecuador",
    cities: ["Quito", "Cuenca", "Guayaquil", "Manta"],
  },
  {
    code: "VE",
    name: "Venezuela",
    cities: ["Caracas", "Barquisimeto", "Maracaibo", "Maracay", "Valencia"],
  },
  {
    code: "MX",
    name: "México",
    cities: [
      "Ciudad de México",
      "Guadalajara",
      "León",
      "Monterrey",
      "Puebla",
      "Querétaro",
      "Tijuana",
    ],
  },
  {
    code: "ES",
    name: "España",
    cities: [
      "Madrid",
      "Barcelona",
      "Bilbao",
      "Málaga",
      "Sevilla",
      "Valencia",
      "Zaragoza",
    ],
  },
  {
    code: "US",
    name: "Estados Unidos",
    cities: ["Miami", "Houston", "Los Ángeles", "Nueva York", "Orlando"],
  },
];

// Regional-indicator pair: "AR" → 🇦🇷. Emoji flags need no assets and render
// inside a native <option>, where an <img> would not.
export function countryFlag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65));
}

export function findCountry(code: string) {
  return CIUDAD_COUNTRIES.find((country) => country.code === code) ?? null;
}

// Turns what the field posts (country code + listed city or a typed one)
// into the single `ciudad` string that persists. Returns null when the pair
// is not something the form could have produced.
export function composeCiudad({
  pais,
  ciudad,
  otraCiudad,
}: {
  pais: string;
  ciudad: string;
  otraCiudad: string;
}) {
  const country = findCountry(pais);

  if (!country) {
    return null;
  }

  const city = ciudad === OTHER_CITY ? otraCiudad.trim() : ciudad.trim();

  if (ciudad !== OTHER_CITY && !country.cities.includes(city)) {
    return null;
  }

  if (city.length < 2 || city.length > 80) {
    return null;
  }

  return `${city}, ${country.name}`;
}

// What a submitted CiudadFieldClient holds: `ciudad` is null when nothing was
// picked (the optional field), and the result is invalid when the posted pair
// is not one the picker could have produced.
export function readCiudadField(
  formData: FormData,
): { ok: true; ciudad: string | null } | { ok: false } {
  const ciudad = String(formData.get("ciudad") ?? "").trim();

  if (!ciudad) {
    return { ok: true, ciudad: null };
  }

  const composed = composeCiudad({
    pais: String(formData.get("pais") ?? "").trim(),
    ciudad,
    otraCiudad: String(formData.get("otraCiudad") ?? "").trim(),
  });

  return composed ? { ok: true, ciudad: composed } : { ok: false };
}

function splitStored(value: string | null | undefined) {
  const separator = value?.lastIndexOf(", ") ?? -1;

  if (!value || separator < 0) {
    return null;
  }

  const city = value.slice(0, separator).trim();
  const countryName = value.slice(separator + 2).trim();
  const country = CIUDAD_COUNTRIES.find((entry) => entry.name === countryName);

  return country && city ? { city, country } : null;
}

// The country a stored "Ciudad, País" names; null when it names none we know.
export function ciudadCountry(value: string | null | undefined) {
  return splitStored(value)?.country ?? null;
}

// The inverse of composeCiudad, to pre-fill the field from a stored
// "Ciudad, País". A city we don't list comes back as "Otra ciudad"; anything
// that doesn't name a known country comes back as null.
export function splitCiudad(value: string | null | undefined) {
  const stored = splitStored(value);

  if (!stored) {
    return null;
  }

  const { city, country } = stored;

  return country.cities.includes(city)
    ? { pais: country.code, ciudad: city, otraCiudad: "" }
    : { pais: country.code, ciudad: OTHER_CITY, otraCiudad: city };
}
