"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  quickUpdateMatchFieldAction,
  upsertAssignmentAction,
} from "@/app/actions/matches";
import { type PersonFunctionKey, peopleAssignableTo } from "@/lib/functions";
import type { GridOwner } from "@/lib/types";
import { cn } from "@/lib/utils";

export type MatchCellEditor = {
  kind: "match";
  field:
    | "homeTeam"
    | "awayTeam"
    | "competition"
    | "productionMode"
    | "productionCode"
    | "commentaryPlan"
    | "transport"
    | "notes"
    | "kickoffTime";
  value: string;
  input: "text" | "time" | "select";
  options?: Array<{ value: string; label: string }>;
};

export type AssignmentCellEditor = {
  kind: "assignment";
  roleId: string;
  personId: string;
  confirmed: boolean;
  notes: string;
  functionKey: PersonFunctionKey | null;
};

export type GridCellEditor = MatchCellEditor | AssignmentCellEditor;

type GridTableCellEditorProps = {
  matchId: string;
  redirectTo: string;
  display: string;
  editor: GridCellEditor;
  people: GridOwner[];
  className?: string;
};

const editorFieldClassName =
  "h-8 w-full min-w-[7rem] rounded-lg border border-[var(--accent)] bg-[var(--surface)] px-2 text-sm font-medium text-[var(--foreground)] outline-none ring-2 ring-[var(--accent-border)]";

function PendingFieldset({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <fieldset
      disabled={pending}
      className={cn("min-w-0", pending && "animate-pulse opacity-60")}
    >
      {children}
    </fieldset>
  );
}

export function GridTableCellEditor({
  matchId,
  redirectTo,
  display,
  editor,
  people,
  className,
}: GridTableCellEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const cancelledRef = useRef(false);

  function cancelEditing() {
    cancelledRef.current = true;
    setIsEditing(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
      return;
    }

    if (event.key === "Enter") {
      cancelledRef.current = true;
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          cancelledRef.current = false;
          setIsEditing(true);
        }}
        title="Editar"
        className={cn(
          "block w-full cursor-pointer truncate rounded-md px-1.5 py-1 text-left text-sm transition hover:bg-[var(--n-100)]",
          className,
        )}
      >
        {display || "—"}
      </button>
    );
  }

  if (editor.kind === "assignment") {
    const assignablePeople = peopleAssignableTo(people, editor.functionKey);

    return (
      <form action={upsertAssignmentAction}>
        <PendingFieldset>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="roleId" value={editor.roleId} />
          <input type="hidden" name="notes" value={editor.notes} />
          <input
            type="hidden"
            name="confirmed"
            value={editor.confirmed ? "on" : ""}
          />
          <select
            name="personId"
            autoFocus
            defaultValue={editor.personId}
            onKeyDown={handleKeyDown}
            onBlur={cancelEditing}
            onChange={(event) => {
              const select = event.currentTarget;
              const confirmedInput = select.form?.elements.namedItem("confirmed");

              if (confirmedInput instanceof HTMLInputElement) {
                confirmedInput.value =
                  editor.confirmed && select.value === editor.personId
                    ? "on"
                    : "";
              }

              cancelledRef.current = true;
              select.form?.requestSubmit();
            }}
            className={editorFieldClassName}
          >
            <option value="">Sin asignar</option>
            {assignablePeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        </PendingFieldset>
      </form>
    );
  }

  if (editor.input === "select") {
    return (
      <form action={quickUpdateMatchFieldAction}>
        <PendingFieldset>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="field" value={editor.field} />
          <select
            name="value"
            autoFocus
            defaultValue={editor.value}
            onKeyDown={handleKeyDown}
            onBlur={cancelEditing}
            onChange={(event) => {
              cancelledRef.current = true;
              event.currentTarget.form?.requestSubmit();
            }}
            className={editorFieldClassName}
          >
            {(editor.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </PendingFieldset>
      </form>
    );
  }

  return (
    <form action={quickUpdateMatchFieldAction}>
      <PendingFieldset>
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input type="hidden" name="field" value={editor.field} />
        <input
          name="value"
          type={editor.input}
          autoFocus
          defaultValue={editor.value}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            if (cancelledRef.current) {
              return;
            }

            if (event.currentTarget.value === editor.value) {
              cancelEditing();
              return;
            }

            cancelledRef.current = true;
            event.currentTarget.form?.requestSubmit();
          }}
          className={editorFieldClassName}
        />
      </PendingFieldset>
    </form>
  );
}
