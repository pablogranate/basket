"use client";

import { Check, Pencil } from "lucide-react";

import { useTeamsEdit } from "@/components/teams/teams-edit-context";
import { Button } from "@/components/ui/button";

export function TeamsEditToggle() {
  const { editing, setEditing } = useTeamsEdit();

  return (
    <Button
      type="button"
      variant={editing ? "primary" : "secondary"}
      aria-pressed={editing}
      onClick={() => setEditing(!editing)}
      className="gap-2"
    >
      {editing ? <Check className="size-4" /> : <Pencil className="size-4" />}
      {editing ? "Listo" : "Editar"}
    </Button>
  );
}
