import { canonicalDomain } from "./domain.js";

export type FirmRow = { id: string; firm_name: string };
export type AliasRow = { firm_id: string; alias_value: string; alias_type: string };

export type CanonicalFirmRecord = {
  id: string;
  firm_name: string;
  legal_name?: string | null;
  aliases?: string[] | null;
  alternate_names?: string[] | null;
  domain?: string | null;
  website_url?: string | null;
};

function pushAlias(out: AliasRow[], firmId: string, raw: string | null | undefined, aliasType: string) {
  const value = raw?.trim();
  if (!value) return;
  out.push({ firm_id: firmId, alias_value: value, alias_type: aliasType });
}

/** Flatten directory aliases so linking can use firm_records without vc_firm_aliases. */
export function aliasesFromFirmRecord(row: CanonicalFirmRecord): AliasRow[] {
  const out: AliasRow[] = [];
  pushAlias(out, row.id, row.legal_name, "LEGAL_NAME");
  for (const a of row.aliases ?? []) pushAlias(out, row.id, a, "ALIAS");
  for (const a of row.alternate_names ?? []) pushAlias(out, row.id, a, "ALIAS");
  const host = canonicalDomain(row.domain) ?? canonicalDomain(row.website_url);
  if (host) out.push({ firm_id: row.id, alias_value: host, alias_type: "WEBSITE_DOMAIN" });
  return out;
}
