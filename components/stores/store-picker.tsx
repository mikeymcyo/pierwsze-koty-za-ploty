"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { MapPin, Search, X } from "lucide-react";

import { findStores } from "@/app/(app)/stores/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResolvedStore } from "@/lib/stores/directory";

/**
 * Choosing the place a project is at, from inside the project form.
 *
 * It searches on the server rather than filtering a list in the browser: the
 * directory is 150 KB and there is no reason for a phone on site to carry it.
 *
 * The selection is two hidden fields, so it submits with everything else and
 * an unselected store submits nothing - a project without a store is still a
 * perfectly ordinary project, which is how every project created before this
 * existed keeps working.
 *
 * Selecting a store fills in the client, address and postcode, but only where
 * those are empty. Somebody who has already written an address meant it, and a
 * picker that quietly replaced it would be the kind of thing you only notice
 * after the report has gone out.
 */
export function StorePicker({
  initial,
  clientLabel = "the client, site address and postcode",
}: {
  initial: ResolvedStore | null;
  clientLabel?: string;
}) {
  const [selected, setSelected] = useState<ResolvedStore | null>(initial);
  const [text, setText] = useState("");
  const [results, setResults] = useState<ResolvedStore[]>([]);
  const [filled, setFilled] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const latest = useRef(0);

  useEffect(() => {
    const query = text.trim();
    const handle = setTimeout(() => {
      const ticket = ++latest.current;
      if (!query) {
        setResults([]);
        return;
      }
      startTransition(async () => {
        const found = await findStores(query);
        // A slow answer to an old query must not replace a fast answer to a
        // newer one.
        if (ticket === latest.current) setResults(found);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [text]);

  function choose(store: ResolvedStore) {
    setSelected(store);
    setText("");
    setResults([]);
    setFilled(fillEmptyFields(store));
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-muted p-4">
      <input type="hidden" name="location_directory" value={selected?.directoryId ?? ""} />
      <input type="hidden" name="location_code" value={selected?.code ?? ""} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Store or location
          </p>
          {selected ? (
            <>
              <p className="mt-1 font-semibold text-ink">
                {selected.client} {selected.displayName}
              </p>
              <p className="font-mono text-sm tabular-nums text-ink-muted">
                Store {selected.displayCode}
                {selected.rdc ? ` · RDC ${selected.rdc}` : ""}
              </p>
              {selected.address ? (
                <p className="mt-1 text-sm text-ink-muted">{selected.address}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              Optional. Link this project to a store to fill in {clientLabel} and to find it
              again from the Store locator.
            </p>
          )}
        </div>
        {selected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(null);
              setFilled([]);
            }}
          >
            <X aria-hidden />
            Remove
          </Button>
        ) : null}
      </div>

      {filled.length > 0 ? (
        <p className="text-sm text-ink-muted">
          Filled in from the store: {filled.join(", ")}. Anything you had already written was
          left alone.
        </p>
      ) : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={selected ? "Search for a different store" : "Store number, town or postcode"}
          aria-label="Search the store directory"
          aria-controls={listId}
          autoComplete="off"
          className="pl-11"
        />
      </div>

      {text.trim() ? (
        <ul id={listId} className="flex flex-col gap-2">
          {results.map((store) => (
            <li key={`${store.directoryId}-${store.code}`}>
              <button
                type="button"
                onClick={() => choose(store)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:border-line-strong"
              >
                <span className="shrink-0 rounded-lg bg-surface-muted px-2 py-1 font-mono text-xs font-semibold tabular-nums text-ink">
                  {store.displayCode}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{store.displayName}</span>
                  <span className="block truncate text-sm text-ink-muted">
                    {store.address ?? "No address recorded"}
                  </span>
                </span>
                <MapPin className="size-4 shrink-0 text-ink-subtle" aria-hidden />
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="text-sm text-ink-muted">
              {pending ? "Searching…" : "No stores match that search."}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Fills the project fields a store knows about, where they are still empty.
 *
 * Reaches into the form's own inputs rather than lifting their state up: the
 * form is uncontrolled by design - every field is a plain input with a
 * defaultValue - and making it controlled just so a picker could prefill three
 * boxes would be a larger change than the feature deserves.
 */
function fillEmptyFields(store: ResolvedStore): string[] {
  const form = document.querySelector("form");
  if (!form) return [];
  const filled: string[] = [];
  const set = (name: string, value: string | null, label: string) => {
    const field = form.elements.namedItem(name);
    if (!value || !(field instanceof HTMLInputElement)) return;
    if (field.value.trim()) return;
    field.value = value;
    filled.push(label);
  };
  set("client", store.client, "client");
  set("site_address", store.address, "site address");
  set("postcode", store.postcode, "postcode");
  return filled;
}
