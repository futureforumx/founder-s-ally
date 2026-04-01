import type { AnalysisResult, CompanyData } from "@/components/company-profile/types";
import { getConnectedSensorIntegrations } from "@/components/connections/SensorSuiteGrid";

export type CompanyLinkedDataSourceRow = {
  id: string;
  section: string;
  label: string;
  detail: string;
  href: string | null;
  iconUrl: string | null;
};

export function normalizeHttpHref(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    if (/^https?:\/\//i.test(t)) return new URL(t).href;
    return new URL(`https://${t.replace(/^\/+/, "")}`).href;
  } catch {
    return null;
  }
}

/**
 * Reads the same persisted shapes as Settings → Company (profile) and Settings → Network (sensor suite),
 * plus deck / last-analysis hints from localStorage. (Logo is omitted — shown in the health header.)
 */
export function collectCompanyLinkedDataSources(): CompanyLinkedDataSourceRow[] {
  if (typeof window === "undefined") return [];
  const rows: CompanyLinkedDataSourceRow[] = [];

  let profile: Partial<CompanyData> | null = null;
  try {
    const raw = localStorage.getItem("company-profile");
    if (raw) profile = JSON.parse(raw) as Partial<CompanyData>;
  } catch {
    profile = null;
  }

  if (profile) {
    const websiteHref = normalizeHttpHref(profile.website);
    if (websiteHref && profile.website?.trim()) {
      rows.push({
        id: "profile-website",
        section: "Company profile",
        label: "Website",
        detail: profile.website.trim(),
        href: websiteHref,
        iconUrl: null,
      });
    }
    const li = normalizeHttpHref(profile.socialLinkedin);
    if (li && profile.socialLinkedin?.trim()) {
      rows.push({
        id: "profile-linkedin",
        section: "Company profile",
        label: "Company LinkedIn",
        detail: profile.socialLinkedin.trim(),
        href: li,
        iconUrl: "https://cdn.simpleicons.org/linkedin/0A66C2",
      });
    }
    const tw = normalizeHttpHref(profile.socialTwitter);
    if (tw && profile.socialTwitter?.trim()) {
      rows.push({
        id: "profile-twitter",
        section: "Company profile",
        label: "X / Twitter",
        detail: profile.socialTwitter.trim(),
        href: tw,
        iconUrl: "https://cdn.simpleicons.org/x/000000",
      });
    }
    const ig = normalizeHttpHref(profile.socialInstagram);
    if (ig && profile.socialInstagram?.trim()) {
      rows.push({
        id: "profile-instagram",
        section: "Company profile",
        label: "Instagram",
        detail: profile.socialInstagram.trim(),
        href: ig,
        iconUrl: "https://cdn.simpleicons.org/instagram/E4405F",
      });
    }
  }

  let hasDeckOnFile = false;
  try {
    const pending = sessionStorage.getItem("pending-deck-audit");
    if (pending && pending.trim().length > 80) hasDeckOnFile = true;
    if (!hasDeckOnFile) {
      const last = localStorage.getItem("company-last-analyzed-inputs");
      if (last) {
        const j = JSON.parse(last) as { hasDeck?: boolean };
        if (j?.hasDeck) hasDeckOnFile = true;
      }
    }
  } catch {
    /* ignore */
  }
  if (hasDeckOnFile) {
    rows.push({
      id: "pitch-deck",
      section: "Company profile",
      label: "Pitch deck",
      detail: "Deck content on file — used when you run company analysis",
      href: null,
      iconUrl: null,
    });
  }

  let analysis: Partial<AnalysisResult> | null = null;
  try {
    const ar = localStorage.getItem("company-analysis");
    if (ar) analysis = JSON.parse(ar) as Partial<AnalysisResult>;
  } catch {
    analysis = null;
  }
  const agentSources = analysis?.agentData?.sources;
  if (agentSources?.length) {
    const unique = [...new Set(agentSources.map((s) => String(s).trim()).filter(Boolean))];
    unique.forEach((src, i) => {
      rows.push({
        id: `analysis-source-${i}-${src.slice(0, 24)}`,
        section: "Last AI profile run",
        label: "Ingestion source",
        detail: src,
        href: null,
        iconUrl: null,
      });
    });
  }

  for (const int of getConnectedSensorIntegrations()) {
    rows.push({
      id: `workspace-${int.key}`,
      section: "Workspace connections",
      label: int.label,
      detail: "Marked connected in Settings → Network",
      href: null,
      iconUrl: int.iconUrl ?? null,
    });
  }

  return rows;
}

export const COMPANY_LINKED_DATA_SECTION_ORDER = [
  "Company profile",
  "Workspace connections",
  "Last AI profile run",
] as const;
