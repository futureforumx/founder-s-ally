import type { User } from "@supabase/supabase-js";

/**
 * Details captured on the /register form. Persisted locally at signup so the
 * onboarding wizard can prefill the first name, last name, and email even before
 * the auth account carries that metadata.
 */
export interface RegistrationPrefill {
  firstName: string;
  lastName: string;
  email: string;
}

const STORAGE_KEY = "vekta.registration";

export function saveRegistrationPrefill(prefill: RegistrationPrefill): void {
  const clean: RegistrationPrefill = {
    firstName: prefill.firstName.trim(),
    lastName: prefill.lastName.trim(),
    email: prefill.email.trim().toLowerCase(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Best-effort; onboarding also falls back to auth metadata + the waitlist record.
  }
}

export function readRegistrationPrefill(): RegistrationPrefill | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegistrationPrefill>;
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : "",
      email: typeof parsed.email === "string" ? parsed.email : "",
    };
  } catch {
    return null;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Split a full name into first + last, treating everything after the first token as the last name. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Best-effort first/last name from the authenticated user's metadata, covering
 * email/password signups (first_name/last_name) and OAuth (given_name/family_name
 * or a single full_name / name field).
 */
export function deriveNamesFromUser(user: User | null | undefined): { firstName: string; lastName: string } {
  const md = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const firstName = str(md.first_name) || str(md.given_name);
  const lastName = str(md.last_name) || str(md.family_name);
  if (!firstName && !lastName) {
    const full = str(md.full_name) || str(md.name);
    if (full) return splitFullName(full);
  }
  return { firstName, lastName };
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
