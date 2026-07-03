export const PRODUCT_COPY = {
  appName: "BasquetPass",
  portalLabel: "Portal Operativo",
  releaseLabel: "Consola operativa v0.1.0",
  loginHero: {
    eyebrow: "Operación en vivo",
    titleLine1: "Basquet",
    titleLine2: "Pass",
    description:
      "Coordinación ejecutiva para transmisiones en vivo, gestión integral de talento y monitoreo del equipo técnico en tiempo real.",
  },
} as const;

export const BUSINESS_LABELS = {
  productionShort: "Produ",
  responsible: "Responsable",
  relatos: "Relatos",
} as const;

export const AI_COPY = {
  assistantIdentity: `Eres un asistente interno de ${PRODUCT_COPY.appName}.`,
  portalCaptureContext: `para el ${PRODUCT_COPY.portalLabel} de ${PRODUCT_COPY.appName}.`,
  globalGeminiHint:
    "Configura Gemini en Configuración. Si el admin ya cargó la clave global del Portal, la IA también quedará disponible para colaboradores.",
  globalGeminiCaptureHint:
    "Configura Gemini en Configuración. Si el admin ya cargó la clave global del Portal, la lectura de capturas también quedará disponible para colaboradores.",
} as const;

export const SECTION_COPY = {
  grid: {
    title: "Producción",
    description:
      "Organiza la jornada, asigna roles y supervisa la carga operativa del día.",
  },
  myDay: {
    title: "Mi jornada",
    description:
      "Revisa tus partidos del día, abre el grupo y reporta conexión, pago, incidencias y speedtest desde el celular.",
  },
  teams: {
    title: "Equipos",
    description:
      "Consulta ligas, sedes, responsables y cobertura activa de cada equipo.",
  },
  people: {
    title: "Personal",
    tableTitle: `Personal de ${PRODUCT_COPY.appName}`,
    description:
      "Gestión y coordinación de talento y equipos técnicos de producción.",
  },
  roles: {
    title: "Roles",
    description:
      "Administra categorías, orden y disponibilidad de los roles del sistema.",
  },
  settings: {
    title: "Configuración",
    description:
      "Ajusta tu perfil, la configuración de IA y algunas preferencias de interfaz para el portal.",
  },
} as const;
