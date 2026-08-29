import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Formats a `date` column (YYYY-MM-DD) as "25 August 2026". */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  if (Number.isNaN(date.getTime())) return null;
  return DATE_FORMAT.format(date);
}

/**
 * The site is in the UK and the servers are on UTC, so a timestamp is read
 * against UK time rather than against whichever machine happens to render it.
 * Without this an entry made at half past midnight in the summer would be
 * shown an hour earlier, on the day before.
 */
const UK_TIME_ZONE = "Europe/London";

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: UK_TIME_ZONE,
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: UK_TIME_ZONE,
});

/** Formats a timestamp as "14:32". */
export function formatTime(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return TIME_FORMAT.format(date);
}

/** The calendar day a timestamp falls on here, as YYYY-MM-DD. */
export function ukDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const parts = new Map(DAY_FORMAT.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

/** Report numbers are displayed zero-padded: 1 -> "001". */
export function formatReportNumber(value: number) {
  return String(value).padStart(3, "0");
}
