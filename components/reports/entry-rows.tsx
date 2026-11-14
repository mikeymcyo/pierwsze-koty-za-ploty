"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlantEntry, WorkforceEntry } from "@/types/database";

/**
 * Workforce and plant are repeatable rows submitted as parallel same-named
 * fields, which the server action zips back together by index. Inputs stay
 * uncontrolled - React only owns which rows exist, never what is typed in them,
 * so a gloved thumb hitting "Add" never costs a half-typed word.
 */

type Row = { key: string };

function useRows(initialCount: number) {
  const prefix = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: Math.max(initialCount, 1) }, (_, index) => ({
      key: `${prefix}-${index}`,
    })),
  );
  const [nextKey, setNextKey] = useState(Math.max(initialCount, 1));

  const add = () => {
    setRows((current) => [...current, { key: `${prefix}-${nextKey}` }]);
    setNextKey((value) => value + 1);
  };

  // Always leave one row standing, so there is something to type into.
  const remove = (key: string) =>
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== key)));

  return { rows, add, remove, canRemove: rows.length > 1 };
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 self-end text-ink-muted hover:text-danger"
    >
      <Trash2 aria-hidden />
    </Button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="secondary" size="lg" onClick={onClick} className="self-start">
      <Plus aria-hidden />
      {children}
    </Button>
  );
}

export function WorkforceRows({ entries }: { entries: WorkforceEntry[] }) {
  const { rows, add, remove, canRemove } = useRows(entries.length);

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row, index) => {
        const entry = entries[index];
        return (
          <div key={row.key} className="flex items-end gap-2">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[2fr_1.5fr_5rem]">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${row.key}-company`}>Company</Label>
                <Input
                  id={`${row.key}-company`}
                  name="workforce_company_name"
                  defaultValue={entry?.company_name ?? ""}
                  placeholder="Groundworks Ltd"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${row.key}-trade`}>Trade</Label>
                <Input
                  id={`${row.key}-trade`}
                  name="workforce_trade"
                  defaultValue={entry?.trade ?? ""}
                  placeholder="Groundworkers"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${row.key}-operatives`}>No.</Label>
                <Input
                  id={`${row.key}-operatives`}
                  name="workforce_operatives"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  defaultValue={entry?.operatives ?? 1}
                />
              </div>
            </div>
            {canRemove ? (
              <RemoveButton onClick={() => remove(row.key)} label={`Remove workforce row ${index + 1}`} />
            ) : null}
          </div>
        );
      })}

      <AddButton onClick={add}>Add company</AddButton>
    </div>
  );
}

export function PlantRows({ entries }: { entries: PlantEntry[] }) {
  const { rows, add, remove, canRemove } = useRows(entries.length);

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row, index) => {
        const entry = entries[index];
        return (
          <div key={row.key} className="flex items-end gap-2">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_5rem]">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${row.key}-description`}>Plant or equipment</Label>
                <Input
                  id={`${row.key}-description`}
                  name="plant_description"
                  defaultValue={entry?.description ?? ""}
                  placeholder="13t excavator"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${row.key}-quantity`}>Qty</Label>
                <Input
                  id={`${row.key}-quantity`}
                  name="plant_quantity"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  defaultValue={entry?.quantity ?? 1}
                />
              </div>
            </div>
            {canRemove ? (
              <RemoveButton onClick={() => remove(row.key)} label={`Remove plant row ${index + 1}`} />
            ) : null}
          </div>
        );
      })}

      <AddButton onClick={add}>Add plant</AddButton>
    </div>
  );
}
