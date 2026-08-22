/** Match funding-feed lead names to VC directory firms (and aliases). */

export type MatchedVcFirm = {
  id: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

export type VcFirmMatchSource = {
  id: string;
  name: string;
  aliases?: string[] | null;
  logo_url?: string | null;
  website_url?: string | null;
};

const normalizeFirmName = (name: string | null | undefined) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

const getAliasKeys = (normalizedName: string) => {
  const keys = [normalizedName];
  if (normalizedName.includes("andreessenhorowitz")) keys.push("a16z");
  if (normalizedName === "a16z") keys.push("andreessenhorowitz");
  return keys;
};

/** Match seed labels like "Andreessen Horowitz" to directory names like "Andreessen Horowitz (a16z)". */
export function firmDisplayMatchKeys(displayName: string): string[] {
  const variants = new Set<string>();
  const addVariant = (s: string) => {
    const t = s.trim();
    if (!t) return;
    variants.add(t);
    const noParen = t.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (noParen && noParen !== t) variants.add(noParen);
  };
  addVariant(displayName);
  const keys = new Set<string>();
  for (const v of variants) {
    const n = normalizeFirmName(v);
    for (const k of getAliasKeys(n)) keys.add(k);
  }
  return [...keys];
}

export function buildVcFirmMatchIndex(firms: VcFirmMatchSource[]): Map<string, MatchedVcFirm> {
  const m = new Map<string, MatchedVcFirm>();
  const add = (key: string, firm: MatchedVcFirm) => {
    if (!m.has(key)) m.set(key, firm);
  };
  for (const firm of firms) {
    if (!firm?.id || !firm.name?.trim()) continue;
    const matched: MatchedVcFirm = {
      id: firm.id,
      logoUrl: firm.logo_url?.trim() || null,
      websiteUrl: firm.website_url?.trim() || null,
    };
    for (const key of firmDisplayMatchKeys(firm.name)) add(key, matched);
    for (const alias of firm.aliases ?? []) {
      for (const key of firmDisplayMatchKeys(alias)) add(key, matched);
    }
  }
  return m;
}

export function resolveMatchedVcFirm(
  leadName: string,
  index: Map<string, MatchedVcFirm>,
): MatchedVcFirm | null {
  for (const key of firmDisplayMatchKeys(leadName)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}
