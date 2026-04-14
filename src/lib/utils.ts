import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** DB/JSON often returns numbers; `x?.trim()` still calls `.trim()` on non-nullish values and throws. */
export function safeTrim(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function safeLower(v: unknown): string {
  return safeTrim(v).toLowerCase();
}
