"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/primitives/dialog";
import { Button, Field, Input } from "@/components/ui";

/** HU-018b (SDD 7.4): renombrar una comida (1 a 60 caracteres). */
export function RenameMealDialog({
  open,
  onOpenChange,
  currentName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 60 && trimmed !== currentName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onOpenChange(false);
            onConfirm(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>Renombrar comida</DialogTitle>
          </DialogHeader>
          <Field label="Nombre">
            <Input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              autoComplete="off"
              className="h-11"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={!valid}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
