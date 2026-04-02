// ─── Shared utilities used across all adapters ───────────────────────────────

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

export function extractDomain(raw: string): string | undefined {
  try {
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeLinkedinCompanyUrl(raw: string): string {
  const clean = raw.trim().replace(/\/$/, "").toLowerCase();
  const match = clean.match(/linkedin\.com\/company\/([^/?]+)/);
  if (match) return `https://www.linkedin.com/company/${match[1]}`;
  if (clean.startsWith("http")) return clean;
  return `https://www.linkedin.com/company/${clean}`;
}

export function inferCompanyStatus(
  raw?: string
): import("@founder-intel/types").CompanyStatus {
  if (!raw) return "unknown";
  const s = raw.toLowerCase();
  if (s.includes("acqui")) return "acquired";
  if (s.includes("public") || s.includes("ipo")) return "ipo";
  if (s.includes("inactive") || s.includes("defunct") || s.includes("closed"))
    return "defunct";
  if (s.includes("active")) return "active";
  return "active"; // YC "Active" is the default
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function inferStageProxy(hit: any): import("@founder-intel/types").StageProxy {
  const batch: string = hit.batch ?? "";
  const status: string = (hit.status ?? "").toLowerCase();

  if (status === "public") return "public";
  if (status === "acquired") return "growth";

  // YC batch implies seed-stage around that time
  const year = parseInt(batch.replace(/[^0-9]/g, ""), 10);
  const currentYear = new Date().getFullYear();
  if (!isNaN(year)) {
    const age = currentYear - year;
    if (age <= 1) return "seed";
    if (age <= 3) return "series_a";
    if (age <= 6) return "series_b_plus";
    return "growth";
  }
  return "unknown";
}

// ─── Adapter registry ─────────────────────────────────────────────────────────

import type { IAdapter } from "./base/adapter.interface";
import { YcCompaniesAdapter } from "./yc/yc-companies.adapter";
import { FoundersListAdapter } from "./founders-list/founders-list.adapter";
import { ProductHuntAdapter } from "./product-hunt/product-hunt.adapter";
import { BetaListAdapter } from "./betalist/betalist.adapter";
import { CoFoundersLabAdapter } from "./cofounders-lab/cofounders-lab.adapter";

export function buildAdapterRegistry(): Map<string, IAdapter> {
  const adapters: IAdapter[] = [
    new YcCompaniesAdapter(),
    new FoundersListAdapter(),
    new ProductHuntAdapter(),
    new BetaListAdapter(),
    new CoFoundersLabAdapter(),
  ];

  const registry = new Map<string, IAdapter>();
  for (const adapter of adapters) {
    registry.set(adapter.name, adapter);
  }
  return registry;
}

export type { IAdapter };
