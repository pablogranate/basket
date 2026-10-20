"use client";

import { ChevronDown, Folder } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

export type CompetitionTab = {
  label: string;
  color: string;
  count: number;
};

type DragOrigin = "row" | "folder";

type DragState = {
  label: string;
  origin: DragOrigin;
  source: HTMLElement;
  startX: number;
  startY: number;
  ghost: HTMLElement | null;
  target: HTMLElement | null;
};

const DRAG_THRESHOLD_PX = 6;
const DROP_HOT_CLASSES = ["ring-2", "ring-[var(--accent)]", "ring-offset-1"];

// A chip is dragged by pointer events (not HTML5 drag and drop) so it also
// works on touch. A press that never travels past the threshold stays a click.
function useChipDrag(onDrop: (label: string, origin: DragOrigin) => void) {
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    onDropRef.current = onDrop;
  });

  useEffect(() => {
    function setHot(element: HTMLElement | null, hot: boolean) {
      element?.classList[hot ? "add" : "remove"](...DROP_HOT_CLASSES);
    }

    function handleMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      if (!drag.ghost) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) {
          return;
        }
        const ghost = drag.source.cloneNode(true) as HTMLElement;
        ghost.style.cssText =
          "position:fixed;z-index:1000;pointer-events:none;transform:translate(-50%,-50%) rotate(-3deg);background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-lift);border-radius:var(--panel-radius);padding:0 12px;font-size:12px;font-weight:700;";
        document.body.appendChild(ghost);
        drag.ghost = ghost;
        drag.source.style.opacity = "0.3";
      }

      drag.ghost.style.left = `${event.clientX}px`;
      drag.ghost.style.top = `${event.clientY}px`;

      const wanted = drag.origin === "row" ? "archive" : "row";
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const target = under?.closest<HTMLElement>(`[data-fixtures-drop="${wanted}"]`) ?? null;
      if (target !== drag.target) {
        setHot(drag.target, false);
        setHot(target, true);
        drag.target = target;
      }
    }

    function handleUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag?.ghost) {
        return;
      }

      drag.ghost.remove();
      drag.source.style.opacity = "";
      setHot(drag.target, false);
      suppressClickRef.current = true;
      if (drag.target) {
        onDropRef.current(drag.label, drag.origin);
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLElement>, origin: DragOrigin) {
    if (event.button > 0) {
      return;
    }
    const source = (event.target as HTMLElement).closest<HTMLElement>("[data-fixtures-chip]");
    const label = source?.dataset.fixturesChip;
    if (!source || !label) {
      return;
    }
    suppressClickRef.current = false;
    dragRef.current = { label, origin, source, startX: event.clientX, startY: event.clientY, ghost: null, target: null };
  }

  function swallowClickAfterDrag(event: ReactMouseEvent) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.stopPropagation();
      event.preventDefault();
    }
  }

  return { startDrag, swallowClickAfterDrag };
}

function ChipLabel({ tab, muted }: { tab: CompetitionTab; muted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 py-1.5">
      <span className={cn("size-2 rounded-full", muted && "opacity-60 grayscale-[.6]")} style={{ background: tab.color }} />
      {tab.label}
      <span className="font-mono text-[11px] text-[var(--n-500)]">{tab.count}</span>
    </span>
  );
}

type DragHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: ReactMouseEvent) => void;
};

// The chip row and the folder sit in different toolbar rows but share one drag.
export function useCompetitionChipDrag({
  onArchive,
  onUnarchive,
}: {
  onArchive: (label: string) => void;
  onUnarchive: (label: string) => void;
}): { rowHandlers: DragHandlers; folderHandlers: DragHandlers } {
  const { startDrag, swallowClickAfterDrag } = useChipDrag((label, origin) =>
    origin === "row" ? onArchive(label) : onUnarchive(label),
  );

  return {
    rowHandlers: { onPointerDown: (event) => startDrag(event, "row"), onClickCapture: swallowClickAfterDrag },
    folderHandlers: { onPointerDown: (event) => startDrag(event, "folder"), onClickCapture: swallowClickAfterDrag },
  };
}

export function CompetitionChipRow({
  tabs,
  selected,
  allCount,
  onToggle,
  onClear,
  dragHandlers,
}: {
  tabs: CompetitionTab[];
  selected: ReadonlySet<string>;
  allCount: number;
  onToggle: (label: string) => void;
  onClear: () => void;
  dragHandlers: DragHandlers;
}) {
  return (
    <div data-fixtures-drop="row" className="rounded-[var(--panel-radius)] transition" {...dragHandlers}>
      <SegmentedControl
        size="sm"
        className="h-auto flex-wrap"
        items={[
          {
            key: "all",
            active: selected.size === 0,
            onClick: onClear,
            label: (
              <span className="inline-flex items-center gap-2 py-1.5">
                Todas
                <span className="font-mono text-[11px] text-[var(--n-500)]">{allCount}</span>
              </span>
            ),
          },
          ...tabs.map((tab) => ({
            key: tab.label,
            active: selected.has(tab.label),
            onClick: () => onToggle(tab.label),
            label: (
              <span data-fixtures-chip={tab.label} className="touch-none select-none">
                <ChipLabel tab={tab} />
              </span>
            ),
          })),
        ]}
      />
    </div>
  );
}

export function ArchivedCompetitionsFolder({
  tabs,
  selected,
  onToggle,
  onUnarchive,
  dragHandlers,
}: {
  tabs: CompetitionTab[];
  selected: ReadonlySet<string>;
  onToggle: (label: string) => void;
  onUnarchive: (label: string) => void;
  dragHandlers: DragHandlers;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        data-fixtures-drop="archive"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[var(--panel-radius)] border border-dashed px-3 text-xs font-bold transition",
          open
            ? "border-solid border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
            : "border-[var(--n-300)] text-[var(--muted)] hover:border-solid hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
        )}
      >
        <Folder className="size-4" />
        Terminadas
        <span className="font-mono text-[11px] font-normal text-[var(--n-500)]">{tabs.length}</span>
        <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="panel-surface absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
          <div className="flex items-baseline justify-between gap-3 border-b border-[var(--n-100)] px-4 py-2.5 text-sm font-semibold">
            Ligas terminadas
            <span className="text-xs font-normal text-[var(--n-500)]">Arrastrá a la fila para desarchivar</span>
          </div>
          {tabs.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-[var(--n-500)]">
              Arrastrá el chip de una liga terminada hasta esta carpeta.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1.5" {...dragHandlers}>
              {tabs.map((tab) => (
                <ArchivedRow
                  key={tab.label}
                  tab={tab}
                  active={selected.has(tab.label)}
                  onToggle={() => onToggle(tab.label)}
                  onUnarchive={() => onUnarchive(tab.label)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ArchivedRow({
  tab,
  active,
  onToggle,
  onUnarchive,
}: {
  tab: CompetitionTab;
  active: boolean;
  onToggle: () => void;
  onUnarchive: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-[calc(var(--panel-radius)-4px)] hover:bg-[var(--n-50)]">
      <button
        type="button"
        data-fixtures-chip={tab.label}
        onClick={onToggle}
        className={cn(
          "flex-1 touch-none select-none rounded-[calc(var(--panel-radius)-4px)] px-3 text-left text-xs font-bold",
          active ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]",
        )}
      >
        <ChipLabel tab={tab} muted={!active} />
      </button>
      <button
        type="button"
        onClick={onUnarchive}
        className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--n-500)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
      >
        Desarchivar
      </button>
    </li>
  );
}
