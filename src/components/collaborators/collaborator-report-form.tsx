"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Camera,
  ChevronDown,
  CheckCircle2,
  Circle,
  CircleEllipsis,
  Clock3,
  ImageIcon,
  Images,
  Layers3,
  Loader2,
  MapPin,
  MonitorPlay,
  Palette,
  ReceiptText,
  Save,
  SendHorizontal,
  ShieldAlert,
  SquarePen,
  Type,
  Upload,
  Wifi,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { CollaboratorAssignmentItem } from "@/lib/data/collaborators";
import { cn } from "@/lib/utils";

type IssueKey = "internet" | "img" | "ocr" | "overlays" | "grafica";
type ToggleValue = "si" | "no";
type IncidentLevel = "sin" | "baja" | "alta" | "critica";
type TechnicalCaptureKind = "speedtest" | "ping" | "gpu";
type ReadingState = "idle" | "loading" | "error" | "done";
type SignalOption = "BP" | "BP / IMG";
type CaptureSource = "camera" | "gallery";

type DraftState = {
  incidentLevel: IncidentLevel;
  paid: ToggleValue;
  feedDetected: ToggleValue;
  problems: Record<IssueKey, boolean>;
  signalLabel: SignalOption;
  aptoLineal: ToggleValue;
  testTime: string;
  testCheck: ToggleValue;
  startCheck: ToggleValue;
  graphicsCheck: ToggleValue;
  speedtestValue: string;
  pingValue: string;
  gpuValue: string;
  technicalObservations: string;
  buildingObservations: string;
  generalObservations: string;
  otherObservation: string;
  stObservation: string;
  clubObservation: string;
  speedtestAttachmentName: string | null;
  pingAttachmentName: string | null;
  gpuAttachmentName: string | null;
  updatedAt: string;
};

const ISSUE_OPTIONS: Array<{
  key: IssueKey;
  label: string;
  icon: typeof Wifi;
}> = [
  { key: "internet", label: "Internet", icon: Wifi },
  { key: "img", label: "IMG", icon: ImageIcon },
  { key: "ocr", label: "OCR", icon: Type },
  { key: "overlays", label: "GES", icon: Layers3 },
  { key: "grafica", label: "Gráfica", icon: Palette },
];

const DEFAULT_PROBLEMS: Record<IssueKey, boolean> = {
  internet: false,
  img: false,
  ocr: false,
  overlays: false,
  grafica: false,
};

const YES_NO_OPTIONS: Array<{ label: string; value: ToggleValue }> = [
  { label: "SI", value: "si" },
  { label: "NO", value: "no" },
];

const SIGNAL_OPTIONS: SignalOption[] = ["BP", "BP / IMG"];

const REPORT_ICON_BUBBLE_BASE =
  "inline-flex items-center justify-center rounded-full border border-[#ece6df] bg-[#faf7f3] shadow-[0_4px_12px_rgba(43,30,17,0.06)]";
const REPORT_FIELD_LABEL_CLASS =
  "text-[13px] font-semibold tracking-[-0.01em] text-[var(--n-600)]";
const MAX_CAPTURE_BYTES = 1024 * 1024;
const JPEG_QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
const SCALE_STEPS = [1, 0.92, 0.84, 0.76, 0.68, 0.6];

const INCIDENT_LEVEL_OPTIONS: Array<{
  value: IncidentLevel;
  label: string;
  icon: typeof CheckCircle2;
  activeClassName: string;
  activeIconClassName: string;
}> = [
  {
    value: "sin",
    label: "Sin",
    icon: CheckCircle2,
    activeClassName: "border-[#bfe4ca] bg-[#eefaf2] text-[#1b7d43]",
    activeIconClassName: "border-[#1b7d43] bg-[#1b7d43] text-white",
  },
  {
    value: "baja",
    label: "Baja",
    icon: Circle,
    activeClassName: "border-[#d7dee8] bg-[#f4f7fa] text-[#70819b]",
    activeIconClassName: "border-[#70819b] bg-[#70819b] text-white",
  },
  {
    value: "alta",
    label: "Alta",
    icon: AlertTriangle,
    activeClassName: "border-[#f0c4ce] bg-[#fff0f3] text-[#cf2246]",
    activeIconClassName: "border-[#cf2246] bg-[#cf2246] text-white",
  },
  {
    value: "critica",
    label: "Crítica",
    icon: ShieldAlert,
    activeClassName: "border-[#e1cdf4] bg-[#fbf2ff] text-[#a12ad6]",
    activeIconClassName: "border-[#a12ad6] bg-[#a12ad6] text-white",
  },
];

function getDraftKey(assignmentId: string) {
  return `basket-production.collaborator-report.${assignmentId}`;
}

function normalizeSignalLabel(value: string | null | undefined): SignalOption {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, " ");

  if (normalized === "BP/IMG" || normalized === "BP / IMG") {
    return "BP / IMG";
  }

  return "BP";
}

function buildDefaultDraft(): DraftState {
  return {
    incidentLevel: "sin",
    paid: "si",
    feedDetected: "si",
    problems: DEFAULT_PROBLEMS,
    signalLabel: "BP",
    aptoLineal: "si",
    testTime: "",
    testCheck: "no",
    startCheck: "no",
    graphicsCheck: "no",
    speedtestValue: "",
    pingValue: "",
    gpuValue: "",
    technicalObservations: "",
    buildingObservations: "",
    generalObservations: "",
    otherObservation: "",
    stObservation: "",
    clubObservation: "",
    speedtestAttachmentName: null,
    pingAttachmentName: null,
    gpuAttachmentName: null,
    updatedAt: new Date().toISOString(),
  };
}

function getCaptureDisplayName(kind: TechnicalCaptureKind) {
  if (kind === "speedtest") {
    return "Speed Test.jpg";
  }

  if (kind === "ping") {
    return "Ping.jpg";
  }

  return "GPU.jpg";
}

async function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();

      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("No pudimos abrir la imagen."));
      nextImage.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToJpegBlob(
  image: HTMLImageElement,
  scale: number,
  quality: number,
) {
  const canvas = document.createElement("canvas");
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("No pudimos preparar la imagen.");
  }

  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No pudimos convertir la imagen."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function normalizeCaptureFile(file: File, kind: TechnicalCaptureKind) {
  const image = await loadImageFromFile(file);
  let smallestBlob: Blob | null = null;

  for (const scale of SCALE_STEPS) {
    for (const quality of JPEG_QUALITY_STEPS) {
      const blob = await canvasToJpegBlob(image, scale, quality);

      if (!smallestBlob || blob.size < smallestBlob.size) {
        smallestBlob = blob;
      }

      if (blob.size <= MAX_CAPTURE_BYTES) {
        return new File([blob], getCaptureDisplayName(kind), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }
  }

  return new File([smallestBlob ?? file], getCaptureDisplayName(kind), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function parseSavedDraft(raw: string | null): DraftState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DraftState> & { notes?: string };
    return {
      ...buildDefaultDraft(),
      ...parsed,
      signalLabel: normalizeSignalLabel(parsed.signalLabel),
      generalObservations:
        parsed.generalObservations ?? parsed.notes ?? "",
      problems: {
        ...DEFAULT_PROBLEMS,
        ...(parsed.problems ?? {}),
      },
    };
  } catch {
    return null;
  }
}

function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className={REPORT_FIELD_LABEL_CLASS}>
        {label}
      </p>
      <div
        className={cn(
          "grid gap-2 rounded-[var(--panel-radius)] bg-[var(--background-soft)] p-1",
          options.length >= 3 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {options.map((option) => (
          (() => {
            const optionValue = String(option.value).toLowerCase();
            const isPositive = optionValue === "si";
            const isNegative = optionValue === "no";

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={cn(
                  "flex h-full w-full items-center justify-center rounded-[calc(var(--panel-radius)-4px)] px-3 py-2 text-center text-sm font-bold uppercase leading-none tracking-[0.12em] transition",
                  value === option.value
                    ? isPositive
                      ? "bg-[var(--surface)] text-[#1b7d43] shadow-sm"
                      : isNegative
                        ? "bg-[var(--surface)] text-[#cf2246] shadow-sm"
                        : "bg-[var(--surface)] text-[var(--accent)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]",
                )}
              >
                {option.label}
              </button>
            );
          })()
        ))}
      </div>
    </div>
  );
}

function IncidentLevelSelector({
  value,
  onChange,
}: {
  value: IncidentLevel;
  onChange: (value: IncidentLevel) => void;
}) {
  return (
    <div className="space-y-2">
      <p className={REPORT_FIELD_LABEL_CLASS}>
        Tipo de incidencia
      </p>
      <div className="grid grid-cols-4 gap-2">
        {INCIDENT_LEVEL_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-[86px] min-w-0 flex-col items-center justify-center gap-2 rounded-[var(--panel-radius)] border px-1.5 py-3 text-center transition",
                active
                  ? option.activeClassName
                  : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[#d7d0ca] hover:bg-[var(--n-50)]",
              )}
            >
              <span
                className={cn(
                  REPORT_ICON_BUBBLE_BASE,
                  "size-9",
                  active
                    ? option.activeIconClassName
                    : "text-[var(--muted)]",
                )}
              >
                <Icon className="size-[18px]" />
              </span>
              <span className="truncate text-[13px] font-black leading-none">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BinaryStateButton({
  label,
  icon: Icon,
  active,
  onToggle,
}: {
  label: string;
  icon: typeof ReceiptText;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className={REPORT_FIELD_LABEL_CLASS}>
        {label}
      </p>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-[62px] w-full items-center gap-3 rounded-[var(--panel-radius)] border px-4 text-left transition",
          active
            ? "border-[#d5ebdd] bg-[#f3fcf6] text-[#1b7d43]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[#d7d0ca]",
        )}
      >
        <span
          className={cn(
            REPORT_ICON_BUBBLE_BASE,
            "size-9",
            active ? "border-[#d5ebdd] bg-[#faf7f3] text-[#1b7d43]" : "text-[var(--muted)]",
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-black uppercase tracking-[0.12em]">
          {active ? "SI" : "NO"}
        </span>
      </button>
    </div>
  );
}

function SelectStateField({
  label,
  icon: Icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: typeof MonitorPlay;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <span className={cn("block", REPORT_FIELD_LABEL_CLASS)}>
        {label}
      </span>
      <label className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-[62px] w-full appearance-none rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] pl-16 pr-11 text-left text-sm font-black uppercase tracking-[0.12em] text-[#6b5d5f] outline-none transition hover:border-[#d7d0ca] focus:border-[var(--accent)]"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span
          className={cn(
            REPORT_ICON_BUBBLE_BASE,
            "pointer-events-none absolute left-4 top-1/2 size-9 shrink-0 -translate-y-1/2 text-[#6b5d5f]",
          )}
        >
          <Icon className="size-4" />
        </span>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 shrink-0 -translate-y-1/2 text-[var(--n-500)]" />
      </label>
    </div>
  );
}

function ObservationFlagToggle({
  label,
  icon: Icon,
  active,
  onToggle,
}: {
  label: string;
  icon: typeof CircleEllipsis;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex min-h-[92px] min-w-0 flex-col items-center justify-between rounded-[var(--panel-radius)] border px-3 py-3.5 text-center transition sm:min-h-[84px] sm:items-start sm:px-3.5 sm:py-4 sm:text-left",
        active
          ? "border-[#f3cfd8] bg-[#fff5f7]"
          : "border-[var(--border)] bg-[var(--background-soft)] hover:border-[#ead2d8]",
      )}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--n-400)] sm:text-[11px] sm:tracking-[0.2em]">
        {label}
      </span>
      <span
        className={cn(
          REPORT_ICON_BUBBLE_BASE,
          "size-8 text-xs font-black transition sm:size-9 sm:self-end",
          active
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "text-[var(--n-400)]",
        )}
      >
        {active ? <X className="size-4" /> : <Icon className="size-4" />}
      </span>
    </button>
  );
}

export function CollaboratorReportForm({
  assignment,
  showMatchSummary = true,
}: {
  assignment: CollaboratorAssignmentItem;
  showMatchSummary?: boolean;
}) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const hasHydratedRef = useRef(false);
  const router = useRouter();
  const [capturePickerKind, setCapturePickerKind] =
    useState<TechnicalCaptureKind | null>(null);
  const [draft, setDraft] = useState<DraftState>(() => {
    if (typeof window === "undefined") {
      return buildDefaultDraft();
    }

    return (
      parseSavedDraft(window.localStorage.getItem(getDraftKey(assignment.assignmentId))) ??
      buildDefaultDraft()
    );
  });
  const [captureState, setCaptureState] = useState<
    Record<TechnicalCaptureKind, { state: ReadingState; message: string }>
  >({
    speedtest: { state: "idle", message: "" },
    ping: { state: "idle", message: "" },
    gpu: { state: "idle", message: "" },
  });
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [saveTone, setSaveTone] = useState<"neutral" | "success" | "error">(
    "neutral",
  );
  const [isSending, setIsSending] = useState(false);
  const draftKey = useMemo(() => getDraftKey(assignment.assignmentId), [assignment.assignmentId]);
  const latestDraftRef = useRef(draft);

  const persistDraft = useCallback(
    (
      value: DraftState,
      message?: string,
      tone: "success" | "error" = "success",
    ) => {
      if (typeof window === "undefined") {
        return;
      }

      const payload = {
        ...value,
        updatedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(draftKey, JSON.stringify(payload));

      if (message) {
        setSaveMessage(message);
        setSaveTone(tone);
      }
    },
    [draftKey],
  );

  const updateDraft = (updater: (previous: DraftState) => DraftState) => {
    setDraft((previous) => updater(previous));
  };

  const saveDraft = () => {
    persistDraft(latestDraftRef.current, "Borrador guardado en este dispositivo.");
  };

  const handleSendDraft = async () => {
    if (isSending) {
      return;
    }

    persistDraft(latestDraftRef.current);
    setIsSending(true);
    setSaveMessage("Enviando reporte...");
    setSaveTone("neutral");

    try {
      const response = await fetch("/api/collaborator-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignmentId: assignment.assignmentId,
          matchId: assignment.matchId,
          draft: latestDraftRef.current,
        }),
      });

      const payload = (await response.json()) as
        | { ok: true; message?: string }
        | { error?: string };

      if (!response.ok || !("ok" in payload)) {
        setSaveMessage(
          "error" in payload && payload.error
            ? payload.error
            : "No pudimos enviar el reporte en este momento.",
        );
        setSaveTone("error");
        return;
      }

      persistDraft(
        latestDraftRef.current,
        payload.message ?? "Reporte enviado y jornada actualizada.",
        "success",
      );
      router.refresh();
    } catch {
      setSaveMessage("No pudimos enviar el reporte en este momento.");
      setSaveTone("error");
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    latestDraftRef.current = draft;

    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      persistDraft(draft, "Cambios guardados automáticamente.");
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [draft, persistDraft]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      persistDraft(latestDraftRef.current);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      persistDraft(latestDraftRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [persistDraft]);

  const handleUploadCapture = async (
    kind: TechnicalCaptureKind,
    file: File,
  ) => {
    try {
      const normalizedFile = await normalizeCaptureFile(file, kind);
      const formData = new FormData();
      formData.append("image", normalizedFile);
      formData.append("kind", kind);

      setCaptureState((previous) => ({
        ...previous,
        [kind]: {
          state: "loading",
          message: "Leyendo captura con IA...",
        },
      }));
      updateDraft((previous) => ({
        ...previous,
        speedtestAttachmentName:
          kind === "speedtest"
            ? normalizedFile.name
            : previous.speedtestAttachmentName,
        pingAttachmentName:
          kind === "ping" ? normalizedFile.name : previous.pingAttachmentName,
        gpuAttachmentName:
          kind === "gpu" ? normalizedFile.name : previous.gpuAttachmentName,
      }));

      const response = await fetch("/api/ai/metric-capture", {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      let payload:
        | { value: string | null; note?: string | null }
        | { error?: string }
        | null = null;

      try {
        payload = responseText
          ? ((JSON.parse(responseText) as
              | { value: string | null; note?: string | null }
              | { error?: string }))
          : null;
      } catch {
        payload = null;
      }

      if (!response.ok || !payload || !("value" in payload)) {
        setCaptureState((previous) => ({
          ...previous,
          [kind]: {
            state: "error",
            message:
              payload && "error" in payload
                ? (payload.error ?? "No pudimos leer la captura.")
                : "No pudimos leer la captura. Intenta de nuevo.",
          },
        }));
        return;
      }

      updateDraft((previous) => ({
        ...previous,
        speedtestValue:
          kind === "speedtest" ? (payload.value ?? "") : previous.speedtestValue,
        pingValue: kind === "ping" ? (payload.value ?? "") : previous.pingValue,
        gpuValue: kind === "gpu" ? (payload.value ?? "") : previous.gpuValue,
      }));
      setCaptureState((previous) => ({
        ...previous,
        [kind]: {
          state: "done",
          message: payload.value
            ? "Lectura lista. Puedes ajustarla manualmente si hace falta."
            : "No se pudo leer. Completa el valor manualmente.",
        },
      }));
    } catch {
      setCaptureState((previous) => ({
        ...previous,
        [kind]: {
          state: "error",
          message: "No pudimos procesar la captura en este momento.",
        },
      }));
    }
  };

  const openCapturePicker = (kind: TechnicalCaptureKind) => {
    setCapturePickerKind(kind);
  };

  const triggerCaptureSource = (source: CaptureSource) => {
    if (!capturePickerKind) {
      return;
    }

    if (source === "camera") {
      cameraInputRef.current?.click();
      return;
    }

    galleryInputRef.current?.click();
  };

  const handlePickedCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const kind = capturePickerKind;

    event.currentTarget.value = "";

    if (!file || !kind) {
      return;
    }

    setCapturePickerKind(null);
    await handleUploadCapture(kind, file);
  };

  return (
    <div className="space-y-5">
      {showMatchSummary ? (
        <Card className="space-y-5 p-5">
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--n-400)]">
              Parte móvil
            </p>
            <h3 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
              Reportar novedades
            </h3>
            <p className="text-sm text-[var(--n-600)]">
              Carga rápida para {assignment.homeTeam} vs {assignment.awayTeam}. Puedes
              guardar borrador local o enviar el reporte definitivo desde aquí.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
                <CalendarDays className="size-4 text-[var(--accent)]" />
                Fecha
              </div>
              <p className="mt-2 text-sm font-semibold">{assignment.dateLabel}</p>
            </div>
            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
                <Clock3 className="size-4 text-[var(--accent)]" />
                Hora
              </div>
              <p className="mt-2 text-sm font-semibold">{assignment.timeLabel}</p>
            </div>
            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
                <MapPin className="size-4 text-[var(--accent)]" />
                Sede
              </div>
              <p className="mt-2 text-sm font-semibold">
                {assignment.venue ?? "Por definir"}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-5 p-5">
        <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
          Estado general
        </h4>

        <IncidentLevelSelector
          value={draft.incidentLevel}
          onChange={(value) =>
            updateDraft((previous) => ({ ...previous, incidentLevel: value }))
          }
        />

        <div className="grid grid-cols-2 gap-3">
          <BinaryStateButton
            label="Pago"
            icon={ReceiptText}
            active={draft.paid === "si"}
            onToggle={() =>
              updateDraft((previous) => ({
                ...previous,
                paid: previous.paid === "si" ? "no" : "si",
              }))
            }
          />
          <BinaryStateButton
            label="Feed detectó"
            icon={MonitorPlay}
            active={draft.feedDetected === "si"}
            onToggle={() =>
              updateDraft((previous) => ({
                ...previous,
                feedDetected: previous.feedDetected === "si" ? "no" : "si",
              }))
            }
          />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
          Contexto del partido
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <SelectStateField
            label="Señal"
            icon={MonitorPlay}
            value={draft.signalLabel}
            options={SIGNAL_OPTIONS}
            onChange={(value) =>
              updateDraft((previous) => ({
                ...previous,
                signalLabel: normalizeSignalLabel(value),
              }))
            }
          />
          <BinaryStateButton
            label="Apto lineal"
            icon={CheckCircle2}
            active={draft.aptoLineal === "si"}
            onToggle={() =>
              updateDraft((previous) => ({
                ...previous,
                aptoLineal: previous.aptoLineal === "si" ? "no" : "si",
              }))
            }
          />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
          Pruebas de salida
        </h4>
        <div className="grid gap-4">
          <label className="space-y-2">
            <span className={cn("block", REPORT_FIELD_LABEL_CLASS)}>
              Hora
            </span>
            <input
              type="time"
              value={draft.testTime}
              onChange={(event) =>
                updateDraft((previous) => ({ ...previous, testTime: event.target.value }))
              }
              className="h-12 w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--surface)]"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
          <SegmentedToggle
            label="Prueba"
            value={draft.testCheck}
            onChange={(value) =>
              updateDraft((previous) => ({ ...previous, testCheck: value }))
            }
            options={YES_NO_OPTIONS}
          />
          <SegmentedToggle
            label="Inicio"
            value={draft.startCheck}
            onChange={(value) =>
              updateDraft((previous) => ({ ...previous, startCheck: value }))
            }
            options={YES_NO_OPTIONS}
          />
          <SegmentedToggle
            label="Gráfica"
            value={draft.graphicsCheck}
            onChange={(value) =>
              updateDraft((previous) => ({ ...previous, graphicsCheck: value }))
            }
            options={YES_NO_OPTIONS}
          />
          </div>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
          Problemas detectados
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {ISSUE_OPTIONS.map((issue) => {
            const Icon = issue.icon;
            const active = draft.problems[issue.key];

            return (
              <button
                key={issue.key}
                type="button"
                onClick={() =>
                  updateDraft((previous) => ({
                    ...previous,
                    problems: {
                      ...previous.problems,
                      [issue.key]: !previous.problems[issue.key],
                    },
                  }))
                }
                className={cn(
                  "flex items-center gap-3 rounded-[var(--panel-radius)] border px-4 py-3 text-left transition",
                  active
                    ? "border-[#f3c8d2] bg-[#fff5f7] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[#ead2d8]",
                )}
              >
                <span
                  className={cn(
                    REPORT_ICON_BUBBLE_BASE,
                    active
                      ? "size-9 border-[#f3cfd8] bg-[#fff1f3] text-[var(--accent)]"
                      : "size-9 text-[var(--n-400)]",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-bold uppercase tracking-[0.12em]">
                  {issue.key === "internet" ? (
                    <>
                      <span className="sm:hidden">Red</span>
                      <span className="hidden sm:inline">{issue.label}</span>
                    </>
                  ) : (
                    issue.label
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <div className="space-y-1">
          <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
            Bloque técnico
          </h4>
          <p className="text-sm text-[var(--n-600)]">
            Sube la foto, la IA lo lee; si no, escríbelo.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-x-2 gap-y-3">
          <div className="min-w-0 space-y-2">
            <p className="text-center text-[13px] font-semibold tracking-[-0.01em] text-[var(--n-600)]">
              Speed Test
            </p>
            <button
              type="button"
              onClick={() => openCapturePicker("speedtest")}
              aria-label="Subir captura de speedtest"
              className="flex w-full min-w-0 flex-col items-center justify-center gap-3 rounded-[var(--panel-radius)] border border-dashed border-[var(--border)] bg-[var(--background-soft)] px-2 py-3 text-center transition hover:border-[var(--accent)] hover:bg-[var(--surface)]"
            >
              <div className="flex min-w-0 flex-col items-center gap-2">
                <span
                  className={cn(
                    REPORT_ICON_BUBBLE_BASE,
                    "size-10",
                    draft.speedtestAttachmentName ? "text-[#1faa52]" : "text-[#8a6a43]",
                  )}
                >
                  {draft.speedtestAttachmentName ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <Upload className="size-5" />
                  )}
                </span>
              </div>
              {captureState.speedtest.state === "loading" ? (
                <Loader2 className="size-4 animate-spin text-[var(--accent)]" />
              ) : null}
            </button>
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-center text-[13px] font-semibold tracking-[-0.01em] text-[var(--n-600)]">
              Ping
            </p>
            <button
              type="button"
              onClick={() => openCapturePicker("ping")}
              aria-label="Subir captura de ping"
              className="flex w-full min-w-0 flex-col items-center justify-center gap-3 rounded-[var(--panel-radius)] border border-dashed border-[var(--border)] bg-[var(--background-soft)] px-2 py-3 text-center transition hover:border-[var(--accent)] hover:bg-[var(--surface)]"
            >
              <div className="flex min-w-0 flex-col items-center gap-2">
                <span
                  className={cn(
                    REPORT_ICON_BUBBLE_BASE,
                    "size-10",
                    draft.pingAttachmentName ? "text-[#1faa52]" : "text-[#8a6a43]",
                  )}
                >
                  {draft.pingAttachmentName ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <Upload className="size-5" />
                  )}
                </span>
              </div>
              {captureState.ping.state === "loading" ? (
                <Loader2 className="size-4 animate-spin text-[var(--accent)]" />
              ) : null}
            </button>
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-center text-[13px] font-semibold tracking-[-0.01em] text-[var(--n-600)]">
              GPU
            </p>
            <button
              type="button"
              onClick={() => openCapturePicker("gpu")}
              aria-label="Subir captura de GPU"
              className="flex w-full min-w-0 flex-col items-center justify-center gap-3 rounded-[var(--panel-radius)] border border-dashed border-[var(--border)] bg-[var(--background-soft)] px-2 py-3 text-center transition hover:border-[var(--accent)] hover:bg-[var(--surface)]"
            >
              <div className="flex min-w-0 flex-col items-center gap-2">
                <span
                  className={cn(
                    REPORT_ICON_BUBBLE_BASE,
                    "size-10",
                    draft.gpuAttachmentName ? "text-[#1faa52]" : "text-[#8a6a43]",
                  )}
                >
                  {draft.gpuAttachmentName ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <Upload className="size-5" />
                  )}
                </span>
              </div>
              {captureState.gpu.state === "loading" ? (
                <Loader2 className="size-4 animate-spin text-[var(--accent)]" />
              ) : null}
            </button>
          </div>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => void handlePickedCapture(event)}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handlePickedCapture(event)}
        />

        <div className="grid gap-3">
          <section className="grid grid-cols-3 gap-x-2 gap-y-3">
            <div className="min-w-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-3 py-3">
              <p className="text-sm font-bold">{draft.speedtestValue || "?"}</p>
              {captureState.speedtest.message ? (
                <p
                  className={cn(
                    "mt-2 break-words text-[10px] leading-tight",
                    captureState.speedtest.state === "error"
                      ? "text-[#aa2945]"
                      : "text-[var(--n-600)]",
                  )}
                >
                  {captureState.speedtest.message}
                </p>
              ) : null}
            </div>
            <div className="min-w-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-3 py-3">
              <p className="text-sm font-bold">{draft.pingValue || "?"}</p>
              {captureState.ping.message ? (
                <p
                  className={cn(
                    "mt-2 break-words text-[10px] leading-tight",
                    captureState.ping.state === "error"
                      ? "text-[#aa2945]"
                      : "text-[var(--n-600)]",
                  )}
                >
                  {captureState.ping.message}
                </p>
              ) : null}
            </div>
            <div className="min-w-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-3 py-3">
              <p className="text-sm font-bold">{draft.gpuValue || "?"}</p>
              {captureState.gpu.message ? (
                <p
                  className={cn(
                    "mt-2 break-words text-[10px] leading-tight",
                    captureState.gpu.state === "error"
                      ? "text-[#aa2945]"
                      : "text-[var(--n-600)]",
                  )}
                >
                  {captureState.gpu.message}
                </p>
              ) : null}
            </div>
          </section>

          <section className="grid grid-cols-3 gap-x-2 gap-y-3">
            <input
              type="text"
              value={draft.speedtestValue}
              onChange={(event) =>
                updateDraft((previous) => ({
                  ...previous,
                  speedtestValue: event.target.value,
                }))
              }
              placeholder="22.1"
              className="h-11 min-w-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-3 text-sm font-medium text-[var(--foreground)] outline-none transition placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:bg-[var(--surface)]"
            />
            <input
              type="text"
              value={draft.pingValue}
              onChange={(event) =>
                updateDraft((previous) => ({
                  ...previous,
                  pingValue: event.target.value,
                }))
              }
              placeholder="60 ms"
              className="h-11 min-w-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-3 text-sm font-medium text-[var(--foreground)] outline-none transition placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:bg-[var(--surface)]"
            />
            <input
              type="text"
              value={draft.gpuValue}
              onChange={(event) =>
                updateDraft((previous) => ({
                  ...previous,
                  gpuValue: event.target.value,
                }))
              }
              placeholder="40%"
              className="h-11 min-w-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-3 text-sm font-medium text-[var(--foreground)] outline-none transition placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:bg-[var(--surface)]"
            />
          </section>
        </div>
      </Card>

      {capturePickerKind ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(28,13,16,0.26)] p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-[calc(var(--panel-radius)+4px)] bg-white p-5 shadow-[0_24px_60px_rgba(28,13,16,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-black tracking-tight text-[var(--foreground)]">
                  Subir {capturePickerKind === "speedtest"
                    ? "Speed Test"
                    : capturePickerKind === "ping"
                      ? "Ping"
                      : "GPU"}
                </h4>
                <p className="mt-1 text-sm text-[var(--n-600)]">
                  Elige si quieres tomar una foto ahora o subirla desde la galería.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCapturePickerKind(null)}
                className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--n-50)] text-[var(--n-400)] transition hover:bg-[var(--n-100)] hover:text-[var(--n-700)]"
                aria-label="Cerrar selector de captura"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => triggerCaptureSource("camera")}
                className="flex items-center gap-3 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                <span className={cn(REPORT_ICON_BUBBLE_BASE, "size-10 text-[var(--accent)]")}>
                  <Camera className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-[var(--foreground)]">
                    Tomar foto
                  </span>
                  <span className="block text-xs text-[var(--n-600)]">
                    Abre la cámara del celular.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => triggerCaptureSource("gallery")}
                className="flex items-center gap-3 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                <span className={cn(REPORT_ICON_BUBBLE_BASE, "size-10 text-[var(--n-600)]")}>
                  <Images className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-[var(--foreground)]">
                    Subir desde galería
                  </span>
                  <span className="block text-xs text-[var(--n-600)]">
                    El archivo se convierte a JPG y se comprime antes de leerlo.
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Card className="space-y-5 p-5">
        <div className="space-y-1">
          <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
            Observaciones
          </h4>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <p className={REPORT_FIELD_LABEL_CLASS}>
              Observaciones técnicas
            </p>
            <Textarea
              placeholder="Ej. Se cayó la cámara 1 en dos momentos y la VM tardó en responder."
              value={draft.technicalObservations}
              onChange={(event) =>
                updateDraft((previous) => ({
                  ...previous,
                  technicalObservations: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <p className={REPORT_FIELD_LABEL_CLASS}>
              Observaciones edilicias
            </p>
            <Textarea
              placeholder="Ej. El responsable no tenía PC ni router 4G disponible."
              value={draft.buildingObservations}
              onChange={(event) =>
                updateDraft((previous) => ({
                  ...previous,
                  buildingObservations: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <p className={REPORT_FIELD_LABEL_CLASS}>
              Observaciones generales
            </p>
            <Textarea
              placeholder="Ej. El realizador dio señal faltando una hora para el inicio."
              value={draft.generalObservations}
              onChange={(event) =>
                updateDraft((previous) => ({
                  ...previous,
                  generalObservations: event.target.value,
                }))
              }
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
          Otras novedades
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <ObservationFlagToggle
            label="OTRO"
            icon={CircleEllipsis}
            active={Boolean(draft.otherObservation.trim())}
            onToggle={() =>
              updateDraft((previous) => ({
                ...previous,
                otherObservation: previous.otherObservation.trim() ? "" : "X",
              }))
            }
          />
          <ObservationFlagToggle
            label="ST"
            icon={ShieldAlert}
            active={Boolean(draft.stObservation.trim())}
            onToggle={() =>
              updateDraft((previous) => ({
                ...previous,
                stObservation: previous.stObservation.trim() ? "" : "X",
              }))
            }
          />
          <ObservationFlagToggle
            label="CLUB"
            icon={Building2}
            active={Boolean(draft.clubObservation.trim())}
            onToggle={() =>
              updateDraft((previous) => ({
                ...previous,
                clubObservation: previous.clubObservation.trim() ? "" : "X",
              }))
            }
          />
        </div>
      </Card>

      <div className="grid gap-3 rounded-[var(--panel-radius)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-lift)]">
        <div className="flex items-center gap-2 text-sm text-[var(--n-600)]">
          {isSending ? (
            <Loader2 className="size-4 animate-spin text-[var(--accent)]" />
          ) : saveTone === "error" ? (
            <AlertTriangle className="size-4 text-[var(--accent)]" />
          ) : saveMessage ? (
            <Save className="size-4 text-[#238b57]" />
          ) : (
            <ReceiptText className="size-4 text-[var(--accent)]" />
          )}
          <span>
            {saveMessage ||
              "Guarda un borrador local o envía el reporte definitivo."}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={saveDraft}
            className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-[var(--panel-radius)] border border-[var(--accent)] bg-[var(--accent)] px-2 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(227,27,35,0.22)] transition hover:border-[var(--accent-strong)] hover:bg-[var(--accent-strong)]"
          >
            <Save className="mr-2 size-4" />
            Guardar
          </button>
          <Link href={`/mi-jornada/${assignment.matchId}/reportar`} className="block min-w-0">
            <span className="inline-flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-[var(--panel-radius)] border border-[#f0d27a] bg-[#f3c332] px-2 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(243,195,50,0.2)] transition hover:border-[#e3b71f] hover:bg-[#e3b71f]">
              <SquarePen className="size-4" />
              Editar
            </span>
          </Link>
          <Button
            className="h-12 px-2 bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(227,27,35,0.22)] hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-80"
            onClick={handleSendDraft}
            disabled={isSending}
          >
            {isSending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <SendHorizontal className="mr-2 size-4" />
            )}
            {isSending ? "Enviando" : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
