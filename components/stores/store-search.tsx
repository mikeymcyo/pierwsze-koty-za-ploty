"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * The search controls above the store list.
 *
 * A real GET form, so it works the moment the page paints and a tap on the
 * keyboard's Search key does the obvious thing. On top of that the text box
 * pushes the query into the URL as it is typed, which is what makes it feel
 * like the standalone locator did - the list is server-rendered, so the URL is
 * the state, and a result can be sent to somebody as a link.
 */
export function StoreSearch({
  rdcs,
  nightShiftCount,
}: {
  rdcs: string[];
  nightShiftCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [text, setText] = useState(params.get("q") ?? "");
  // The URL is the truth. Back, a shared link and Clear all land here.
  const external = params.get("q") ?? "";
  const previous = useRef(external);
  useEffect(() => {
    if (previous.current !== external) {
      previous.current = external;
      setText(external);
    }
  }, [external]);

  useEffect(() => {
    if (text === external) return;
    // Long enough that typing a store number is one request rather than four,
    // short enough that it still feels like it is keeping up.
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (text.trim()) next.set("q", text.trim());
      else next.delete("q");
      previous.current = text.trim();
      router.replace(`${pathname}?${next}`, { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
  }, [text, external, params, pathname, router]);

  const rdc = params.get("rdc") ?? "";
  const night = params.get("night") === "1";
  const filtered = Boolean(external || rdc || night);

  return (
    <form action={pathname} className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <Input
          name="q"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Store number, town or postcode"
          aria-label="Search stores"
          autoComplete="off"
          // A phone keyboard with digits ready: most searches are a number.
          inputMode="search"
          className="pl-11"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1 sm:max-w-56">
          <Select
            name="rdc"
            defaultValue={rdc}
            aria-label="Distribution centre"
            onChange={(event) => {
              const next = new URLSearchParams(params.toString());
              if (event.target.value) next.set("rdc", event.target.value);
              else next.delete("rdc");
              router.replace(`${pathname}?${next}`, { scroll: false });
            }}
          >
            <option value="">All RDCs</option>
            {rdcs.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink">
          <input
            type="checkbox"
            name="night"
            value="1"
            defaultChecked={night}
            className="size-4 accent-brand"
            onChange={(event) => {
              const next = new URLSearchParams(params.toString());
              if (event.target.checked) next.set("night", "1");
              else next.delete("night");
              router.replace(`${pathname}?${next}`, { scroll: false });
            }}
          />
          Night shift only
        </label>

        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setText("");
              previous.current = "";
              router.replace(pathname, { scroll: false });
            }}
          >
            <X aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-ink-subtle">
        Night shift is recorded for {nightShiftCount} stores the client has reviewed so far.
      </p>
    </form>
  );
}
