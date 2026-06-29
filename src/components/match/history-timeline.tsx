import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { History } from "lucide-react";

import { formatAuditEntry } from "@/lib/audit";
import type { AssignmentDetail, AuditEntry } from "@/lib/types";

export function HistoryTimeline({
  history,
  assignments,
  people,
}: {
  history: AuditEntry[];
  assignments: AssignmentDetail[];
  people: Map<string, string>;
}) {
  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-8">
      <div className="flex items-center gap-2">
        <History className="size-5 text-[var(--n-400)]" />
        <h3 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Actividad Reciente
        </h3>
      </div>

      <div className="panel-surface border border-[var(--border)] bg-[var(--surface)] p-5">
        {history.length ? (
          <div className="space-y-6 border-l border-[var(--border)] pl-6">
            {history.map((entry, index) => {
              const summary = formatAuditEntry(entry, { assignments, people });
              const primaryChange = summary.changes[0];

              return (
                <div key={entry.id} className="relative">
                  <div className="absolute -left-[31px] top-1 bg-[var(--surface)] p-1">
                    <div
                      className={
                        index === 0
                          ? "size-3 rounded-full bg-[var(--accent)] ring-4 ring-[rgba(227,27,35,0.16)]"
                          : "size-3 rounded-full bg-[var(--n-300)]"
                      }
                    />
                  </div>

                  <p className="text-sm leading-relaxed text-[var(--foreground)]">
                    <span className="font-semibold">
                      {entry.actor?.full_name ?? "Sistema"}
                    </span>{" "}
                    · {summary.headline}
                  </p>

                  {primaryChange ? (
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {primaryChange.label}: {primaryChange.before} → {primaryChange.after}
                    </p>
                  ) : null}

                  <p className="mt-1 text-xs font-medium text-[var(--n-500)]">
                    {formatDistanceToNowStrict(parseISO(entry.created_at), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="panel-surface border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">
            Todavía no hay eventos auditados para este partido.
          </div>
        )}
      </div>
    </section>
  );
}
