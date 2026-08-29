/**
 * How this device shows SiteBoss.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a browser.
 *
 * These are device settings, not account settings. Somebody signs in on the
 * site iPad in bright sun and on their own phone in a cabin, and wants
 * different things from each; and a setting kept on the device needs no table,
 * no migration and no round trip before the first paint. They are written to
 * localStorage and read back by a script that runs before anything is drawn,
 * so the app never flashes the wrong theme.
 *
 * None of this reaches a PDF. An issued document is print - black on white,
 * fixed sizes - and lib/pdf/theme.ts shares nothing with the screen's tokens.
 */

export const PREFERENCE_STORAGE_KEY = "siteboss:preferences";

export const THEMES = ["dark", "light", "system"] as const;
export const TEXT_SIZES = ["small", "medium", "large"] as const;
export const TOUCH_SIZES = ["standard", "large"] as const;

export type Theme = (typeof THEMES)[number];
export type TextSize = (typeof TEXT_SIZES)[number];
export type TouchSize = (typeof TOUCH_SIZES)[number];

export type Preferences = {
  theme: Theme;
  text: TextSize;
  touch: TouchSize;
};

/**
 * What the application does when nobody has chosen anything.
 *
 * Exactly what it did before this screen existed: dark, normal type, normal
 * targets. A settings page is not an excuse to change the product's defaults.
 */
export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark",
  text: "medium",
  touch: "standard",
};

export const THEME_LABELS: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

export const TEXT_LABELS: Record<TextSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export const TOUCH_LABELS: Record<TouchSize, string> = {
  standard: "Standard",
  large: "Large",
};

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Preferences from whatever was stored, however wrong it is.
 *
 * Storage is shared with the user's own browser tools and survives every
 * version of this application, so anything in it is untrusted input: a value
 * that is not one of the options simply falls back to the default rather than
 * leaving the app in a state with no styles.
 */
export function parsePreferences(raw: string | null | undefined): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (typeof value !== "object" || value === null) return DEFAULT_PREFERENCES;
  const record = value as Record<string, unknown>;
  return {
    theme: oneOf(THEMES, record.theme, DEFAULT_PREFERENCES.theme),
    text: oneOf(TEXT_SIZES, record.text, DEFAULT_PREFERENCES.text),
    touch: oneOf(TOUCH_SIZES, record.touch, DEFAULT_PREFERENCES.touch),
  };
}

export function serialisePreferences(preferences: Preferences): string {
  return JSON.stringify(preferences);
}

/**
 * The attributes the stylesheet keys off.
 *
 * One place decides them, used by the script that runs before first paint and
 * by the settings screen, so a preview and a reload cannot disagree.
 */
export function preferenceAttributes(preferences: Preferences): Record<string, string> {
  return {
    "data-theme": preferences.theme,
    "data-text": preferences.text,
    "data-touch": preferences.touch,
  };
}

/**
 * The script that runs before anything is drawn.
 *
 * Inline and synchronous on purpose: a theme applied after hydration is a
 * white flash on a dark app, which on a phone at night is the difference
 * between a product and a prototype. Kept to one expression so it can be
 * inlined, and wrapped so a browser with storage disabled falls back to the
 * defaults instead of leaving the page unstyled.
 */
export function preferenceBootScript(): string {
  return `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
    PREFERENCE_STORAGE_KEY,
  )})||"{}")||{};var t=${JSON.stringify(THEMES)},x=${JSON.stringify(
    TEXT_SIZES,
  )},u=${JSON.stringify(TOUCH_SIZES)},e=document.documentElement;
e.setAttribute("data-theme",t.indexOf(p.theme)<0?"dark":p.theme);
e.setAttribute("data-text",x.indexOf(p.text)<0?"medium":p.text);
e.setAttribute("data-touch",u.indexOf(p.touch)<0?"standard":p.touch);}catch(_){}})();`;
}
