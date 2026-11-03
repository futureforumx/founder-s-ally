import type { MarketEntityType, MarketDataProvider } from "./types";

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV ends inside an open quoted field.");
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = (rows.shift() ?? []).map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header)) throw new Error("CSV must have a header row with non-empty column names.");
  return rows.filter((values) => values.some((value) => value.trim())).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export async function parseImportFile(file: File): Promise<Record<string, unknown>[]> {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsv(text);
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.records)) return parsed.records;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;
  throw new Error("JSON import must be an array or contain a records/data array.");
}

export function buildStagingRequest(args: { provider: MarketDataProvider; entityType: MarketEntityType; licenseScope: string; records: Record<string, unknown>[]; dryRun: boolean; usageExpiresAt?: string | null }) {
  return { provider: args.provider, entity_type: args.entityType, license_scope: args.licenseScope.trim(), dry_run: args.dryRun, records: args.records, usage_expires_at: args.usageExpiresAt || null };
}
