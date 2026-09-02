// Country → city catalog for the self-signup form. The applicant picks a
// country first, then one of its cities; "Otra" lets them type a city we did
// not list so nobody is locked out. The persisted `ciudad` is composed as
// "Ciudad, País" so the email, the solicitudes table and the decision panel
// keep rendering one string.
export const OTHER_CITY = "__otra__";

export type AccessRequestCountry = {
  code: string;
  name: string;
  cities: readonly string[];
};

export const ACCESS_REQUEST_COUNTRIES: readonly AccessRequestCountry[] = [
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

export function findAccessRequestCountry(code: string) {
  return ACCESS_REQUEST_COUNTRIES.find((country) => country.code === code) ?? null;
}

// Turns what the field posts (country code + listed city or a typed one)
// into the single `ciudad` string that persists. Returns null when the pair
// is not something the form could have produced.
export function composeAccessRequestCiudad({
  pais,
  ciudad,
  otraCiudad,
}: {
  pais: string;
  ciudad: string;
  otraCiudad: string;
}) {
  const country = findAccessRequestCountry(pais);

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
