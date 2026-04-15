import { formatStageForDisplay, collapseStagesToRange } from "@/lib/stageUtils";

function safeTrim(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Split comma / semicolon separated lists from a single DB string. */
export function parseOperatorListString(raw: string | null | undefined): string[] {
  const s = safeTrim(raw);
  if (!s || s === "—") return [];
  return s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function dedupeCaseInsensitiveStrings(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const t = safeTrim(v);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Title-case a short label for footer display (not all-caps pills). */
export function titleCaseShortLabel(s: string, maxLen = 48): string {
  const t = safeTrim(s);
  if (!t) return "";
  const words = t.split(/\s+/).filter(Boolean);
  const cased = words
    .map((w) => {
      if (/^[A-Z0-9]{2,}$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
  return cased.length > maxLen ? `${cased.slice(0, maxLen - 1).trimEnd()}…` : cased;
}

/**
 * Builds the middle segment of the operator card footer (before location):
 * preferred: primary sector(s) · stage
 * fallback: expertise · current or prior company
 * avoids repeating the same token twice (case-insensitive).
 */
export function buildOperatorFooterMidDot(entry: {
  sector: string;
  stage: string;
  location: string;
  _sectors?: string[] | null;
  _operatorExpertise?: string[] | null;
  _operatorPriorCompanies?: string[] | null;
  _operatorCurrentCompany?: string | null;
}): string | null {
  const sectorFromArray = dedupeCaseInsensitiveStrings(entry._sectors ?? []);
  const sectorFromString =
    sectorFromArray.length > 0 ? sectorFromArray : parseOperatorListString(entry.sector);
  const primarySectors = dedupeCaseInsensitiveStrings(sectorFromString).slice(0, 2);

  const stageRaw = safeTrim(entry.stage);
  let stageCollapsed: string | null = null;
  if (stageRaw && stageRaw !== "—") {
    if (stageRaw.includes(",")) {
      const stParts = stageRaw.split(",").map((s) => s.trim()).filter(Boolean);
      stageCollapsed = collapseStagesToRange(stParts) ?? formatStageForDisplay(stageRaw);
    } else {
      stageCollapsed = formatStageForDisplay(stageRaw);
    }
  }

  const expertise = dedupeCaseInsensitiveStrings(entry._operatorExpertise ?? []).slice(0, 2);
  const currentCo = safeTrim(entry._operatorCurrentCompany);
  const priors = dedupeCaseInsensitiveStrings(entry._operatorPriorCompanies ?? []);
  const priorNotCurrent =
    priors.find((p) => !currentCo || p.toLowerCase() !== currentCo.toLowerCase()) ?? null;
  const companyFallback = currentCo || priorNotCurrent || priors[0] || null;

  const sectorLabel =
    primarySectors.length > 0 ? primarySectors.map((s) => titleCaseShortLabel(s, 32)).join(" · ") : null;

  const used = new Set<string>();
  const pushUsed = (s: string | null | undefined) => {
    const t = safeTrim(s);
    if (!t) return;
    used.add(t.toLowerCase());
  };

  const parts: string[] = [];
  if (sectorLabel) {
    parts.push(sectorLabel);
    primarySectors.forEach((s) => pushUsed(s));
  }
  if (stageCollapsed) {
    const st = titleCaseShortLabel(stageCollapsed, 40);
    if (!used.has(st.toLowerCase())) {
      parts.push(st);
      pushUsed(st);
    }
  }

  if (parts.length > 0) return parts.join(" · ");

  const exLabel = expertise.map((e) => titleCaseShortLabel(e, 28)).filter(Boolean).join(" · ");
  if (exLabel) parts.push(exLabel);
  if (companyFallback) {
    const co = titleCaseShortLabel(companyFallback, 36);
    if (!used.has(co.toLowerCase())) parts.push(co);
  }
  if (parts.length > 0) return parts.join(" · ");

  return null;
}
