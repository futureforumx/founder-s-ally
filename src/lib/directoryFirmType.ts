/** Directory firm-type filter IDs (URL-safe slugs). */
export const DIRECTORY_FIRM_TYPE_FILTER_IDS = [
  "vc",
  "family_office",
  "cvc",
  "angel_group",
  "accelerator",
  "pe",
  "venture_studio",
  "fund_of_funds",
  "other",
] as const;

export type DirectoryFirmTypeFilterId = (typeof DIRECTORY_FIRM_TYPE_FILTER_IDS)[number];

export const DIRECTORY_FIRM_TYPE_FILTERS: readonly {
  id: DirectoryFirmTypeFilterId;
  label: string;
}[] = [
  { id: "vc", label: "Venture Capital" },
  { id: "family_office", label: "Family Office" },
  { id: "cvc", label: "Corporate Venture Capital" },
  { id: "angel_group", label: "Angel Group / Syndicate" },
  { id: "accelerator", label: "Accelerator / Incubator" },
  { id: "pe", label: "Private Equity" },
  { id: "venture_studio", label: "Venture Studio" },
  { id: "fund_of_funds", label: "Fund of Funds" },
  { id: "other", label: "Other" },
] as const;

const FILTER_LABEL_BY_ID: Record<DirectoryFirmTypeFilterId, string> = Object.fromEntries(
  DIRECTORY_FIRM_TYPE_FILTERS.map((item) => [item.id, item.label]),
) as Record<DirectoryFirmTypeFilterId, string>;

/**
 * Canonical `firm_records.firm_type` / resolver keys that satisfy each filter.
 * `INSTITUTIONAL` is the import default for traditional VC firms, so it maps to Venture Capital.
 * `FUND_OF_FUNDS` is a directory key (Postgres `entity_type`), not a Prisma `FirmType`.
 */
export const DIRECTORY_FIRM_TYPE_FILTER_KEYS: Record<DirectoryFirmTypeFilterId, readonly string[]> = {
  vc: ["VC", "INSTITUTIONAL", "MICRO_VC", "MICRO_FUND", "SOLO_GP"],
  family_office: ["FAMILY_OFFICE"],
  cvc: ["CVC"],
  angel_group: ["ANGEL_NETWORK"],
  accelerator: ["ACCELERATOR"],
  pe: ["PE"],
  venture_studio: ["VENTURE_STUDIO"],
  fund_of_funds: ["FUND_OF_FUNDS"],
  other: ["OTHER", "PUBLIC"],
};

const FILTER_ID_BY_KEY: Record<string, DirectoryFirmTypeFilterId> = (() => {
  const out: Record<string, DirectoryFirmTypeFilterId> = {};
  for (const [id, keys] of Object.entries(DIRECTORY_FIRM_TYPE_FILTER_KEYS) as Array<
    [DirectoryFirmTypeFilterId, readonly string[]]
  >) {
    for (const key of keys) out[key] = id;
  }
  return out;
})();

/** Short uppercase pills for directory cards when the badge is showing firm classification. */
const DIRECTORY_FIRM_TYPE_BADGE_LABELS: Record<string, string> = {
  VC: "VC FIRM",
  INSTITUTIONAL: "VC FIRM",
  FAMILY_OFFICE: "FAMILY OFFICE",
  CVC: "CVC",
  ANGEL_NETWORK: "ANGEL GROUP",
  ACCELERATOR: "ACCELERATOR",
  PE: "PRIVATE EQUITY",
  VENTURE_STUDIO: "VENTURE STUDIO",
  FUND_OF_FUNDS: "FUND OF FUNDS",
  MICRO_VC: "MICRO VC",
  MICRO_FUND: "MICRO FUND",
  SOLO_GP: "SOLO GP",
  PUBLIC: "PUBLIC",
  OTHER: "OTHER",
};

const STORED_FIRM_TYPE_ALIASES: Record<string, string> = {
  VC: "VC",
  VENTURE_CAPITAL: "VC",
  VC_FIRM: "VC",
  INSTITUTIONAL: "INSTITUTIONAL",
  CVC: "CVC",
  CORPORATE: "CVC",
  CORPORATE_CVC: "CVC",
  CORPORATE_VENTURE_CAPITAL: "CVC",
  FAMILY_OFFICE: "FAMILY_OFFICE",
  ANGEL: "ANGEL_NETWORK",
  ANGEL_NETWORK: "ANGEL_NETWORK",
  ANGEL_GROUP: "ANGEL_NETWORK",
  SYNDICATE: "ANGEL_NETWORK",
  ANGEL_GROUP_SYNDICATE: "ANGEL_NETWORK",
  ACCELERATOR: "ACCELERATOR",
  INCUBATOR: "ACCELERATOR",
  ACCELERATOR_INCUBATOR: "ACCELERATOR",
  ACCELERATOR_STUDIO: "ACCELERATOR",
  PE: "PE",
  PRIVATE_EQUITY: "PE",
  VENTURE_STUDIO: "VENTURE_STUDIO",
  STUDIO: "VENTURE_STUDIO",
  FUND_OF_FUNDS: "FUND_OF_FUNDS",
  FOF: "FUND_OF_FUNDS",
  OTHER: "OTHER",
  PUBLIC: "PUBLIC",
  MICRO_VC: "MICRO_VC",
  MICRO: "MICRO_VC",
  MICRO_FUND: "MICRO_FUND",
  SOLO_GP: "SOLO_GP",
  INDIVIDUAL: "INDIVIDUAL",
};

function normalizeStoredFirmTypeToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[()]/g, "")
    .replace(/[/\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function isDirectoryFirmTypeFilterId(value: string): value is DirectoryFirmTypeFilterId {
  return (DIRECTORY_FIRM_TYPE_FILTER_IDS as readonly string[]).includes(value);
}

/** Collapse messy `firm_type` strings into a canonical directory key. */
export function canonicalizeDirectoryFirmTypeKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const token = normalizeStoredFirmTypeToken(String(raw));
  if (!token) return null;
  return STORED_FIRM_TYPE_ALIASES[token] ?? (token.includes("_") ? token : null);
}

/** Map `firm_records.entity_type` (Postgres enum labels) → directory firm-type keys. */
export function mapEntityTypeToDirectoryFirmTypeKey(entityType: string | null | undefined): string | null {
  const e = String(entityType ?? "").trim();
  if (!e) return null;
  switch (e) {
    case "Corporate (CVC)":
      return "CVC";
    case "Family Office":
      return "FAMILY_OFFICE";
    case "Angel":
      return "ANGEL_NETWORK";
    case "Solo GP":
      return "SOLO_GP";
    case "Micro":
      return "MICRO_VC";
    case "Accelerator / Studio":
      return "ACCELERATOR";
    case "Syndicate":
      return "ANGEL_NETWORK";
    case "Fund of Funds":
      return "FUND_OF_FUNDS";
    case "Institutional":
      return "INSTITUTIONAL";
    default:
      return canonicalizeDirectoryFirmTypeKey(e);
  }
}

export function directoryFirmTypeFilterIdForKey(key: string | null | undefined): DirectoryFirmTypeFilterId | null {
  const canon = canonicalizeDirectoryFirmTypeKey(key);
  if (!canon) return null;
  return FILTER_ID_BY_KEY[canon] ?? null;
}

export function directoryFirmTypeMatchesFilters(
  firmTypeKey: string | null | undefined,
  selected: readonly DirectoryFirmTypeFilterId[],
): boolean {
  if (!selected.length) return true;
  const id = directoryFirmTypeFilterIdForKey(firmTypeKey);
  return id != null && selected.includes(id);
}

export function directoryFirmTypeBadgeLabel(key: string | null | undefined): string {
  const canon = canonicalizeDirectoryFirmTypeKey(key) ?? "INSTITUTIONAL";
  return DIRECTORY_FIRM_TYPE_BADGE_LABELS[canon] ?? canon.replace(/_/g, " ");
}

export function directoryFirmTypeFilterLabel(id: DirectoryFirmTypeFilterId): string {
  return FILTER_LABEL_BY_ID[id];
}

export function directoryFirmTypeTriggerLabel(selected: readonly DirectoryFirmTypeFilterId[]): string {
  if (selected.length === 0) return "Firm type";
  if (selected.length === 1) return directoryFirmTypeFilterLabel(selected[0]);
  return `Firm type · ${selected.length}`;
}

const FIRM_TYPE_SEARCH_PARAM = "firmType";

export function parseDirectoryFirmTypeSearchParam(raw: string | null | undefined): DirectoryFirmTypeFilterId[] {
  if (!raw?.trim()) return [];
  const seen = new Set<DirectoryFirmTypeFilterId>();
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (isDirectoryFirmTypeFilterId(id)) seen.add(id);
  }
  return DIRECTORY_FIRM_TYPE_FILTER_IDS.filter((id) => seen.has(id));
}

export function serializeDirectoryFirmTypeSearchParam(
  selected: readonly DirectoryFirmTypeFilterId[],
): string | null {
  const ordered = DIRECTORY_FIRM_TYPE_FILTER_IDS.filter((id) => selected.includes(id));
  return ordered.length ? ordered.join(",") : null;
}

export function readDirectoryFirmTypeSearchParam(params: URLSearchParams): DirectoryFirmTypeFilterId[] {
  return parseDirectoryFirmTypeSearchParam(params.get(FIRM_TYPE_SEARCH_PARAM));
}

export function writeDirectoryFirmTypeSearchParam(
  params: URLSearchParams,
  selected: readonly DirectoryFirmTypeFilterId[],
): void {
  const serialized = serializeDirectoryFirmTypeSearchParam(selected);
  if (serialized) params.set(FIRM_TYPE_SEARCH_PARAM, serialized);
  else params.delete(FIRM_TYPE_SEARCH_PARAM);
}

export function sameDirectoryFirmTypeSelection(
  a: readonly DirectoryFirmTypeFilterId[],
  b: readonly DirectoryFirmTypeFilterId[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}
