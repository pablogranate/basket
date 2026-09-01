export type ReportSeverity =
  | "Crítica"
  | "Alta"
  | "Media"
  | "Baja"
  | "Sin incidencia";

export type ReportRecord = {
  id_feed: string;
  id_bp: string;
  match_label: string;
  competition: string;
  league: string;
  event_date: string;
  event_time: string;
  venue: string;
  responsible_name: string;
  feed_detected: boolean;
  severity: ReportSeverity;
  problem: string;
  technical_notes: string;
  updated_relative: string;
  updated_at: string;
};

export type ReportActivity = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: "success" | "accent" | "warning";
};

export const REPORT_DIRECTORY: ReportRecord[] = [
  {
    id_feed: "#FD-88219",
    id_bp: "BP-2026-0312-01",
    match_label: "Boca Juniors vs Atenas de Córdoba",
    competition: "Liga Nacional • J24",
    league: "Liga Nacional",
    event_date: "12 mar 2026",
    event_time: "19:00",
    venue: "Luis Conde, Buenos Aires",
    responsible_name: "S. Jenkins",
    feed_detected: true,
    severity: "Crítica",
    problem: "Corte en la detección de feed y ticket de pago sin validar",
    technical_notes:
      "Se abrió cierre prioritario porque el partido terminó sin consolidar validación del feed principal ni confirmación administrativa del pago.",
    updated_relative: "Hace 12 min",
    updated_at: "12 Mar 2026, 22:14",
  },
  {
    id_feed: "#FD-88220",
    id_bp: "BP-2026-0312-02",
    match_label: "Real Madrid vs FC Barcelona",
    competition: "ACB • Final",
    league: "ACB",
    event_date: "12 mar 2026",
    event_time: "20:45",
    venue: "WiZink Center, Madrid",
    responsible_name: "M. Alonso",
    feed_detected: true,
    severity: "Alta",
    problem: "Seguimiento por desincronía de gráfica en cierre editorial",
    technical_notes:
      "La producción quedó estable al aire, pero el equipo mantiene abierta la validación final de overlays y continuidad del archivo master.",
    updated_relative: "Hace 32 min",
    updated_at: "12 Mar 2026, 21:54",
  },
  {
    id_feed: "#FD-88221",
    id_bp: "BP-2026-0312-03",
    match_label: "Chicago Bulls vs Miami Heat",
    competition: "NBA • Regular Season",
    league: "NBA",
    event_date: "11 mar 2026",
    event_time: "21:30",
    venue: "United Center, Chicago",
    responsible_name: "J. Santos",
    feed_detected: true,
    severity: "Sin incidencia",
    problem: "Sin desvíos relevantes en el cierre de la transmisión",
    technical_notes:
      "El reporte quedó cerrado sin hallazgos críticos. Archivo, highlights y validación de datos enviados correctamente.",
    updated_relative: "Hace 1 h",
    updated_at: "12 Mar 2026, 21:05",
  },
  {
    id_feed: "#FD-88225",
    id_bp: "BP-2026-0312-04",
    match_label: "Virtus Bologna vs Olimpia Milano",
    competition: "EuroLeague • Round 24",
    league: "EuroLeague",
    event_date: "11 mar 2026",
    event_time: "18:20",
    venue: "Segafredo Arena, Bologna",
    responsible_name: "System",
    feed_detected: true,
    severity: "Media",
    problem: "Cierre revisado con observaciones menores de archivo",
    technical_notes:
      "Se revisó la exportación final y quedó una observación de nomenclatura sin impacto operativo sobre la señal emitida.",
    updated_relative: "Hace 2 h",
    updated_at: "12 Mar 2026, 20:11",
  },
  {
    id_feed: "#FD-88229",
    id_bp: "BP-2026-0312-05",
    match_label: "Quimsa vs Instituto de Córdoba",
    competition: "Liga Nacional • J24",
    league: "Liga Nacional",
    event_date: "12 mar 2026",
    event_time: "21:10",
    venue: "Ciudad, Santiago del Estero",
    responsible_name: "R. Sosa",
    feed_detected: false,
    severity: "Alta",
    problem: "Control validó cierre parcial por inconsistencias de retorno",
    technical_notes:
      "La mesa técnica dejó el reporte abierto hasta consolidar el retorno de archivo y la evidencia de control local.",
    updated_relative: "Hace 18 min",
    updated_at: "12 Mar 2026, 22:08",
  },
  {
    id_feed: "#FD-88231",
    id_bp: "BP-2026-0312-06",
    match_label: "Bochas Sport Club vs River Plate",
    competition: "Liga Argentina • J18",
    league: "Liga Argentina",
    event_date: "12 mar 2026",
    event_time: "13:54",
    venue: "Bochas Sport Club, Colonia Caroya",
    responsible_name: "A. Juárez",
    feed_detected: false,
    severity: "Media",
    problem: "El cierre sigue abierto por documentación incompleta del off-tube",
    technical_notes:
      "Faltan validaciones del flujo remoto, datos de operación y confirmación de que el paquete técnico final fue entregado.",
    updated_relative: "Hace 48 min",
    updated_at: "12 Mar 2026, 21:23",
  },
];

export const REPORT_ACTIVITY_LOG: ReportActivity[] = [
  {
    id: "report-activity-1",
    title: "Reporte #FD-88221 completado",
    detail: "Julia Santos cerró el informe final sin incidencias críticas.",
    timestamp: "Hace 12 min",
    tone: "success",
  },
  {
    id: "report-activity-2",
    title: "Nuevo seguimiento para Boca vs Atenas",
    detail: "Se marcó prioridad crítica por validación de feed y pago pendiente.",
    timestamp: "Hace 35 min",
    tone: "accent",
  },
  {
    id: "report-activity-3",
    title: "Revisión en proceso: Real Madrid vs Barcelona",
    detail: "Marcos Alonso sigue ajustando el cierre editorial de gráfica.",
    timestamp: "Hace 1 h",
    tone: "warning",
  },
];
