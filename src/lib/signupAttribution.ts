/**
 * First-touch signup attribution.
 *
 * Captures the external referrer domain + UTM params the very first time a
 * visitor lands, and persists them in localStorage so the data survives
 * client-side navigation and the OAuth round-trip (offsite → /auth/callback).
 * `waitlistSignup()` merges {@link getSignupAttribution} into the signup
 * metadata so the admin waitlist can show where each applicant came from.
 */

const STORAGE_KEY = "vekta_signup_attribution_v1";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

/** Hosts we consider "our own" — a referrer on these is internal navigation, not a real source. */
const INTERNAL_HOST_SUFFIXES = ["vekta.so", "tryvekta.com", "localhost"];

export interface SignupAttribution {
  referrer_url?: string;
  referrer_domain?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  landing_path?: string;
  landing_at?: string;
}

function normalizeHost(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

function isInternalHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return INTERNAL_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

/** External referrer (domain + url), or null when direct/internal/unparseable. */
function readExternalReferrer(): { referrer_url: string; referrer_domain: string } | null {
  if (typeof document === "undefined") return null;
  const raw = document.referrer?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (isInternalHost(url.hostname)) return null;
    return { referrer_url: raw, referrer_domain: normalizeHost(url.hostname) };
  } catch {
    return null;
  }
}

function readUtmParams(): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) out[key] = value.slice(0, 200);
  }
  return out;
}

function buildCurrentAttribution(): SignupAttribution {
  const attribution: SignupAttribution = {};
  const referrer = readExternalReferrer();
  if (referrer) {
    attribution.referrer_url = referrer.referrer_url.slice(0, 500);
    attribution.referrer_domain = referrer.referrer_domain;
  }
  Object.assign(attribution, readUtmParams());
  if (typeof window !== "undefined") {
    attribution.landing_path = window.location.pathname;
    attribution.landing_at = new Date().toISOString();
  }
  return attribution;
}

function hasMeaningfulAttribution(attribution: SignupAttribution): boolean {
  return Boolean(
    attribution.referrer_domain ||
      attribution.utm_source ||
      attribution.utm_medium ||
      attribution.utm_campaign,
  );
}

function readStored(): SignupAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupAttribution;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(attribution: SignupAttribution): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    /* storage unavailable (private mode, quota) — degrade gracefully */
  }
}

/**
 * Record first-touch attribution. Call once on initial app load.
 * Only persists the first landing that carries a real referrer/UTM so we keep
 * the original acquisition source rather than a later internal page view.
 */
export function captureLandingAttribution(): void {
  if (typeof window === "undefined") return;
  const existing = readStored();
  if (existing && hasMeaningfulAttribution(existing)) return;

  const current = buildCurrentAttribution();
  if (existing && !hasMeaningfulAttribution(current)) {
    // Keep the earliest landing_path we saw; don't clobber with a blank hit.
    return;
  }
  writeStored({ ...existing, ...current });
}

/**
 * Attribution to merge into signup metadata. Prefers the stored first-touch
 * snapshot, falling back to whatever the current page can see.
 */
export function getSignupAttribution(): SignupAttribution {
  const stored = readStored();
  const current = buildCurrentAttribution();
  const merged: SignupAttribution = { ...current, ...stored };

  // A stored first-touch referrer/UTM should win over the current (likely
  // internal) page, but keep current values when the stored snapshot lacked them.
  if (!merged.referrer_domain && current.referrer_domain) {
    merged.referrer_url = current.referrer_url;
    merged.referrer_domain = current.referrer_domain;
  }

  // Drop empty keys so we never write blank strings into metadata.
  return Object.fromEntries(
    Object.entries(merged).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as SignupAttribution;
}
