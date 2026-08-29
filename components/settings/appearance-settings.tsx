"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Check } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  PREFERENCE_STORAGE_KEY,
  TEXT_LABELS,
  TEXT_SIZES,
  THEMES,
  THEME_LABELS,
  TOUCH_LABELS,
  TOUCH_SIZES,
  parsePreferences,
  preferenceAttributes,
  serialisePreferences,
  type Preferences,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * How this device shows SiteBoss.
 *
 * Applied the moment it is chosen rather than behind a Save button: the whole
 * point of a text size is seeing what it looks like, and there is nothing here
 * that could be half-changed. It is written to this device's storage, so the
 * site iPad in bright sun and somebody's own phone in a cabin can be set
 * differently without either affecting the other.
 *
 * Nothing here reaches an issued PDF. That is print, with its own fixed sizes
 * and colours.
 */
/**
 * Storage read as what it is: state that lives outside React.
 *
 * The server has no localStorage, so it renders the defaults and the browser
 * corrects on its first paint - which is invisible, because the boot script
 * already applied the real appearance before any of this ran.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab on the same device changing it counts too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(PREFERENCE_STORAGE_KEY);
  } catch {
    // Storage can be off. The defaults are already applied.
    return null;
  }
}

/** Nothing stored, which parses to the defaults. */
function serverSnapshot(): string | null {
  return null;
}

export function AppearanceSettings() {
  const raw = useSyncExternalStore(subscribe, readStored, serverSnapshot);
  const preferences = useMemo<Preferences>(() => parsePreferences(raw), [raw]);

  function update(next: Preferences) {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(preferenceAttributes(next))) {
      root.setAttribute(name, value);
    }
    try {
      window.localStorage.setItem(PREFERENCE_STORAGE_KEY, serialisePreferences(next));
    } catch {
      // A device with storage disabled keeps the choice for this visit only.
    }
    // Writing does not fire `storage` in the document that wrote it.
    for (const listener of [...listeners]) listener();
  }

  return (
    <div className="flex flex-col gap-6">
      <Choice
        legend="Appearance"
        hint="System follows whatever this device is set to."
        options={THEMES}
        labels={THEME_LABELS}
        value={preferences.theme}
        onChange={(theme) => update({ ...preferences, theme })}
      />

      <Choice
        legend="Text size"
        hint="Changes the whole app. Issued PDFs are unaffected."
        options={TEXT_SIZES}
        labels={TEXT_LABELS}
        value={preferences.text}
        onChange={(text) => update({ ...preferences, text })}
      />

      <Choice
        legend="Touch size"
        hint="Large makes buttons, fields and rows taller, for gloves."
        options={TOUCH_SIZES}
        labels={TOUCH_LABELS}
        value={preferences.touch}
        onChange={(touch) => update({ ...preferences, touch })}
      />

      <p className="text-sm text-ink-muted">
        These are saved on this device, so the site tablet and your own phone can be set up
        differently.
      </p>
    </div>
  );
}

/** One row of choices. A segmented control rather than a dropdown: on a phone
 *  the options are worth seeing, and there are never more than three. */
function Choice<T extends string>({
  legend,
  hint,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  hint: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-ink">{legend}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>
        </div>
        <div role="radiogroup" aria-label={legend} className="grid grid-cols-3 gap-2">
          {options.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(option)}
                className={cn(
                  "flex min-h-(--ui-control-min) items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors",
                  selected
                    ? "border-brand bg-brand-soft text-ink"
                    : "border-line-strong bg-surface text-ink-muted hover:border-brand/40 hover:text-ink",
                )}
              >
                {selected ? <Check className="size-4 text-brand-ink" aria-hidden /> : null}
                {labels[option]}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
