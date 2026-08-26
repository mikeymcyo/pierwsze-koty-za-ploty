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

/** Report numbers are displayed zero-padded: 1 -> "001". */
export function formatReportNumber(value: number) {
  return String(value).padStart(3, "0");
}
