/**
 * Prepare and merge CB Insights review queues for VEKTA APP CSV data.
 *
 * Usage:
 *   npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts prepare
 *   npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts prepare --limit 100
 *   npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts merge
 *   npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts merge --review-dir ./data/cb-insights
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

type CsvRow = Record<string, string>;
type CsvFile = { headers: string[]; rows: CsvRow[] };
type ScraperStatus = { status: string; timestamp: string };
type Summary = Record<string, string | number | boolean | null>;

const DEFAULT_INVESTORS_PATH = join(process.cwd(), "Investors-Grid view (4).csv");
const DEFAULT_FIRMS_PATH = join(process.cwd(), "Firms-Grid view.csv");
const DEFAULT_OUT_DIR = join(process.cwd(), "data", "cb-insights");
const DEFAULT_REVIEW_DIR = DEFAULT_OUT_DIR;
const DEFAULT_SCRAPER_RESULTS_PATH = join(
  process.cwd(),
  "scripts",
  "cb-insights-scraper",
  "scraper-results.json",
);

const INVESTOR_REVIEW_FILE = "investor-review-queue.csv";
const FIRM_REVIEW_FILE = "firm-review-queue.csv";
const PREPARE_SUMMARY_FILE = "prepare-summary.json";
const MERGE_SUMMARY_FILE = "merge-summary.json";

const COMMON_REVIEW_HEADERS = [
  "Source Key",
  "Source File",
  "Source Row Number",
  "Entity Type",
  "Name",
  "Firm",
  "Search Query",
  "Website",
  "Domain",
  "LinkedIn",
  "X / Twitter",
  "Location",
  "Missing Fields",
  "Prior Scraper Status",
  "Prior Scraper Timestamp",
];

const INVESTOR_REVIEW_HEADERS = [
  ...COMMON_REVIEW_HEADERS,
  "Current Title",
  "Current Bio",
  "Current Stage",
  "Current Sectors",
  "Current Geography",
  "Current Personal Website",
  "CB Insights URL",
  "CB Insights Match Status",
  "CB Insights Match Confidence",
  "CB Insights Notes",
  "CB Insights Title",
  "CB Insights Bio",
  "CB Insights Location",
  "CB Insights LinkedIn",
  "CB Insights Firm",
  "CB Insights Last Reviewed",
];

const FIRM_REVIEW_HEADERS = [
  ...COMMON_REVIEW_HEADERS,
  "Current Type",
  "Current About",
  "Current Stages",
  "Current Sectors",
  "Current HQ",
  "Current Founded",
  "Current Headcount",
  "Current AUM",
  "CB Insights URL",
  "CB Insights Match Status",
  "CB Insights Match Confidence",
  "CB Insights Notes",
  "CB Insights Description",
  "CB Insights Website",
  "CB Insights Founded",
  "CB Insights Headcount",
  "CB Insights AUM",
  "CB Insights HQ",
  "CB Insights Type",
  "CB Insights Stages",
  "CB Insights Sectors",
  "CB Insights LinkedIn",
  "CB Insights X",
  "CB Insights Last Reviewed",
];

const INVESTOR_CB_COLUMNS = [
  "CB Insights URL",
  "CB Insights Match Status",
  "CB Insights Match Confidence",
  "CB Insights Notes",
  "CB Insights Title",
  "CB Insights Bio",
  "CB Insights Location",
  "CB Insights LinkedIn",
  "CB Insights Firm",
  "CB Insights Last Reviewed",
];

const FIRM_CB_COLUMNS = [
  "CB Insights URL",
  "CB Insights Match Status",
  "CB Insights Match Confidence",
  "CB Insights Notes",
  "CB Insights Description",
  "CB Insights Website",
  "CB Insights Founded",
  "CB Insights Headcount",
  "CB Insights AUM",
  "CB Insights HQ",
  "CB Insights Type",
  "CB Insights Stages",
  "CB Insights Sectors",
  "CB Insights LinkedIn",
  "CB Insights X",
  "CB Insights Last Reviewed",
];

function printHelp(): void {
  console.log(`
CB Insights Enrichment Workflow

Commands:
  prepare   Build editable review queues from investor and firm CSVs
  merge     Merge reviewed queues back into app-ready CSV outputs

Options:
  --investors <path>     Investor CSV path
  --firms <path>         Firm CSV path
  --out-dir <path>       Output directory (default: ./data/cb-insights)
  --review-dir <path>    Reviewed queue directory for merge (default: ./data/cb-insights)
  --limit <n>            Limit queue rows per entity type during prepare
  --help                 Show this help

Examples:
  npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts prepare
  npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts prepare --limit 200
  npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts merge
`);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const [flag, inlineValue] = token.split("=", 2);
    if (inlineValue !== undefined) {
      parsed[flag] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[flag] = true;
      continue;
    }

    parsed[flag] = next;
    index += 1;
  }
  return parsed;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(current);
      current = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(current);
      current = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows;
}

function readCsv(path: string): CsvFile {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(raw);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((header) => header.trim());
  const records = rows.slice(1).map((cells) => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
  return { headers, rows: records };
}

function escapeCsvValue(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function writeCsv(path: string, headers: string[], rows: CsvRow[]): void {
  const lines = [headers.map(escapeCsvValue).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","));
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bventures?\b|\bcapital\b|\bpartners?\b|\bmanagement\b|\bfund\b|\bvc\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isMissing(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = normalizeWhitespace(value).toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "none" ||
    normalized === "unknown" ||
    normalized === "undetermined" ||
    normalized === "-" ||
    normalized === "$0.00m" ||
    normalized === "(delete)"
  );
}

function extractDomain(raw: string | undefined): string {
  if (!raw || isMissing(raw)) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function getFirst(row: CsvRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (!isMissing(value)) return value;
  }
  return "";
}

function joinParts(parts: Array<string | undefined>): string {
  return parts
    .map((part) => normalizeWhitespace(part ?? ""))
    .filter(Boolean)
    .join(" ");
}

function ensureHeaders(headers: string[], additions: string[]): string[] {
  const next = [...headers];
  for (const addition of additions) {
    if (!next.includes(addition)) next.push(addition);
  }
  return next;
}

function hasConcreteReviewValue(column: string, value: string | undefined): boolean {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) return false;
  if (column === "CB Insights Match Status" && normalized.toLowerCase() === "pending") {
    return false;
  }
  return !isMissing(normalized);
}

function setIfBlank(row: CsvRow, key: string, value: string): boolean {
  if (isMissing(value) || !isMissing(row[key])) return false;
  row[key] = value;
  return true;
}

function loadScraperStatuses(path: string): Map<string, ScraperStatus> {
  const statuses = new Map<string, ScraperStatus>();
  if (!existsSync(path)) return statuses;

  const raw = JSON.parse(readFileSync(path, "utf8")) as Array<Record<string, unknown>>;
  for (const entry of raw) {
    const type = typeof entry.type === "string" ? entry.type : "";
    const name = typeof entry.name === "string" ? entry.name : "";
    const status = typeof entry.status === "string" ? entry.status : "";
    const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";
    if (!type || !name || !status) continue;
    const key = `${type}:${normalizeName(name)}`;
    const previous = statuses.get(key);
    if (!previous || previous.timestamp < timestamp) {
      statuses.set(key, { status, timestamp });
    }
  }

  return statuses;
}

function buildFirmLookup(rows: CsvRow[]): Map<string, CsvRow> {
  const lookup = new Map<string, CsvRow>();
  for (const row of rows) {
    const name = getFirst(row, ["Firm Name", "Name"]);
    if (!name) continue;
    lookup.set(normalizeName(name), row);
  }
  return lookup;
}

function buildInvestorMissingFields(row: CsvRow, firmWebsite: string): string[] {
  const checks: Array<[string, string]> = [
    ["Title", getFirst(row, ["Title"])],
    ["Bio", getFirst(row, ["Bio"])],
    ["Location", getFirst(row, ["Location"])],
    ["LinkedIn", getFirst(row, ["LinkedIn"])],
    ["Firm Website", firmWebsite],
  ];
  return checks.filter(([, value]) => isMissing(value)).map(([label]) => label);
}

function buildFirmMissingFields(row: CsvRow): string[] {
  const checks: Array<[string, string]> = [
    ["About", getFirst(row, ["About", "Description"])],
    ["Website", getFirst(row, ["Website"])],
    ["Founded", getFirst(row, ["Founded"])],
    ["Headcount", getFirst(row, ["Headcount"])],
    ["AUM", getFirst(row, ["AUM"])],
    ["Stages", getFirst(row, ["Stages"])],
    ["Sectors", getFirst(row, ["Sectors (Representative)", "Sectors"])],
    ["HQ", getFirst(row, ["HQ Locations", "Location"])],
    ["LinkedIn", getFirst(row, ["LinkedIn"])],
  ];
  return checks.filter(([, value]) => isMissing(value)).map(([label]) => label);
}

function createInvestorReviewRows(
  investorFile: string,
  investorRows: CsvRow[],
  firmLookup: Map<string, CsvRow>,
  statuses: Map<string, ScraperStatus>,
  limit: number | null,
): CsvRow[] {
  const reviewRows: CsvRow[] = [];
  const sourceFile = basename(investorFile);

  for (let index = 0; index < investorRows.length; index += 1) {
    const row = investorRows[index];
    const investorName = getFirst(row, ["Investor Name", "Name", "Full Name"]);
    if (!investorName) continue;

    const firmName = getFirst(row, ["Firm Name (from Firm)", "Firm", "Primary Firm Name"]);
    const firmRow = firmLookup.get(normalizeName(firmName));
    const firmWebsite = getFirst(firmRow ?? {}, ["Website", "Website URL"]);
    const linkedin = getFirst(row, ["LinkedIn"]);
    const twitter = getFirst(row, ["X / Twitter", "X", "Twitter"]);
    const location = getFirst(row, ["Location"]);
    const missingFields = buildInvestorMissingFields(row, firmWebsite);
    if (missingFields.length === 0) continue;

    const status = statuses.get(`investor:${normalizeName(investorName)}`);
    const rowNumber = `${index + 2}`;
    reviewRows.push({
      "Source Key": `${sourceFile}#${rowNumber}`,
      "Source File": sourceFile,
      "Source Row Number": rowNumber,
      "Entity Type": "investor",
      Name: investorName,
      Firm: firmName,
      "Search Query": joinParts([investorName, firmName]),
      Website: firmWebsite,
      Domain: extractDomain(firmWebsite),
      LinkedIn: linkedin,
      "X / Twitter": twitter,
      Location: location,
      "Missing Fields": missingFields.join(", "),
      "Prior Scraper Status": status?.status ?? "",
      "Prior Scraper Timestamp": status?.timestamp ?? "",
      "Current Title": getFirst(row, ["Title"]),
      "Current Bio": getFirst(row, ["Bio"]),
      "Current Stage": getFirst(row, ["Stage"]),
      "Current Sectors": getFirst(row, ["Sectors"]),
      "Current Geography": getFirst(row, ["Geography"]),
      "Current Personal Website": getFirst(row, ["Personal Website / Bio"]),
      "CB Insights URL": "",
      "CB Insights Match Status": "pending",
      "CB Insights Match Confidence": "",
      "CB Insights Notes": "",
      "CB Insights Title": "",
      "CB Insights Bio": "",
      "CB Insights Location": "",
      "CB Insights LinkedIn": "",
      "CB Insights Firm": "",
      "CB Insights Last Reviewed": "",
    });

    if (limit && reviewRows.length >= limit) break;
  }

  return reviewRows;
}

function createFirmReviewRows(
  firmFile: string,
  firmRows: CsvRow[],
  statuses: Map<string, ScraperStatus>,
  limit: number | null,
): CsvRow[] {
  const reviewRows: CsvRow[] = [];
  const sourceFile = basename(firmFile);

  for (let index = 0; index < firmRows.length; index += 1) {
    const row = firmRows[index];
    const firmName = getFirst(row, ["Firm Name", "Name"]);
    if (!firmName) continue;

    const website = getFirst(row, ["Website", "Website URL"]);
    const missingFields = buildFirmMissingFields(row);
    if (missingFields.length === 0) continue;

    const status = statuses.get(`firm:${normalizeName(firmName)}`);
    const rowNumber = `${index + 2}`;
    reviewRows.push({
      "Source Key": `${sourceFile}#${rowNumber}`,
      "Source File": sourceFile,
      "Source Row Number": rowNumber,
      "Entity Type": "firm",
      Name: firmName,
      Firm: firmName,
      "Search Query": joinParts([firmName, extractDomain(website)]),
      Website: website,
      Domain: extractDomain(website),
      LinkedIn: getFirst(row, ["LinkedIn"]),
      "X / Twitter": getFirst(row, ["X", "X / Twitter", "Twitter"]),
      Location: getFirst(row, ["HQ Locations", "Location"]),
      "Missing Fields": missingFields.join(", "),
      "Prior Scraper Status": status?.status ?? "",
      "Prior Scraper Timestamp": status?.timestamp ?? "",
      "Current Type": getFirst(row, ["Type"]),
      "Current About": getFirst(row, ["About", "Description"]),
      "Current Stages": getFirst(row, ["Stages"]),
      "Current Sectors": getFirst(row, ["Sectors (Representative)", "Sectors"]),
      "Current HQ": getFirst(row, ["HQ Locations", "Location"]),
      "Current Founded": getFirst(row, ["Founded"]),
      "Current Headcount": getFirst(row, ["Headcount"]),
      "Current AUM": getFirst(row, ["AUM"]),
      "CB Insights URL": "",
      "CB Insights Match Status": "pending",
      "CB Insights Match Confidence": "",
      "CB Insights Notes": "",
      "CB Insights Description": "",
      "CB Insights Website": "",
      "CB Insights Founded": "",
      "CB Insights Headcount": "",
      "CB Insights AUM": "",
      "CB Insights HQ": "",
      "CB Insights Type": "",
      "CB Insights Stages": "",
      "CB Insights Sectors": "",
      "CB Insights LinkedIn": "",
      "CB Insights X": "",
      "CB Insights Last Reviewed": "",
    });

    if (limit && reviewRows.length >= limit) break;
  }

  return reviewRows;
}

function hasCompletedReview(row: CsvRow, columns: string[]): boolean {
  const status = row["CB Insights Match Status"] ?? "";
  if (hasConcreteReviewValue("CB Insights Match Status", status)) return true;
  return columns.some((column) => hasConcreteReviewValue(column, row[column]));
}

function updateReviewColumns(targetRow: CsvRow, reviewRow: CsvRow, columns: string[]): number {
  let updates = 0;
  for (const column of columns) {
    const reviewValue = reviewRow[column] ?? "";
    if (!hasConcreteReviewValue(column, reviewValue)) continue;
    if (targetRow[column] === reviewValue) continue;
    targetRow[column] = reviewValue;
    updates += 1;
  }
  return updates;
}

function mergeInvestors(
  investorsPath: string,
  reviewPath: string,
  outDir: string,
): Summary {
  const { headers, rows } = readCsv(investorsPath);
  const review = readCsv(reviewPath);
  const nextHeaders = ensureHeaders(headers, INVESTOR_CB_COLUMNS);
  let reviewRowsApplied = 0;
  let cbFieldUpdates = 0;
  let promotedBaseFields = 0;

  for (const reviewRow of review.rows) {
    if (!hasCompletedReview(reviewRow, INVESTOR_CB_COLUMNS)) continue;
    const rowNumber = Number.parseInt(reviewRow["Source Row Number"] ?? "", 10);
    if (!Number.isFinite(rowNumber)) continue;
    const targetRow = rows[rowNumber - 2];
    if (!targetRow) continue;

    cbFieldUpdates += updateReviewColumns(targetRow, reviewRow, INVESTOR_CB_COLUMNS);
    if (!targetRow["CB Insights Last Reviewed"]) {
      targetRow["CB Insights Last Reviewed"] = reviewRow["CB Insights Last Reviewed"] || new Date().toISOString().slice(0, 10);
    }

    if (setIfBlank(targetRow, "Title", reviewRow["CB Insights Title"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Bio", reviewRow["CB Insights Bio"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Location", reviewRow["CB Insights Location"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "LinkedIn", reviewRow["CB Insights LinkedIn"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Firm", reviewRow["CB Insights Firm"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Firm Name (from Firm)", reviewRow["CB Insights Firm"] ?? "")) promotedBaseFields += 1;

    reviewRowsApplied += 1;
  }

  const outPath = join(outDir, `${basename(investorsPath, ".csv")}.cb-insights.csv`);
  writeCsv(outPath, nextHeaders, rows);

  return {
    entity: "investors",
    review_path: reviewPath,
    source_path: investorsPath,
    output_path: outPath,
    source_rows: rows.length,
    review_rows: review.rows.length,
    review_rows_applied: reviewRowsApplied,
    cb_field_updates: cbFieldUpdates,
    promoted_base_fields: promotedBaseFields,
  };
}

function mergeFirms(
  firmsPath: string,
  reviewPath: string,
  outDir: string,
): Summary {
  const { headers, rows } = readCsv(firmsPath);
  const review = readCsv(reviewPath);
  const nextHeaders = ensureHeaders(headers, FIRM_CB_COLUMNS);
  let reviewRowsApplied = 0;
  let cbFieldUpdates = 0;
  let promotedBaseFields = 0;

  for (const reviewRow of review.rows) {
    if (!hasCompletedReview(reviewRow, FIRM_CB_COLUMNS)) continue;
    const rowNumber = Number.parseInt(reviewRow["Source Row Number"] ?? "", 10);
    if (!Number.isFinite(rowNumber)) continue;
    const targetRow = rows[rowNumber - 2];
    if (!targetRow) continue;

    cbFieldUpdates += updateReviewColumns(targetRow, reviewRow, FIRM_CB_COLUMNS);
    if (!targetRow["CB Insights Last Reviewed"]) {
      targetRow["CB Insights Last Reviewed"] = reviewRow["CB Insights Last Reviewed"] || new Date().toISOString().slice(0, 10);
    }

    if (setIfBlank(targetRow, "About", reviewRow["CB Insights Description"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Website", reviewRow["CB Insights Website"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Founded", reviewRow["CB Insights Founded"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Headcount", reviewRow["CB Insights Headcount"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "AUM", reviewRow["CB Insights AUM"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "HQ Locations", reviewRow["CB Insights HQ"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Type", reviewRow["CB Insights Type"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Stages", reviewRow["CB Insights Stages"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "Sectors (Representative)", reviewRow["CB Insights Sectors"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "LinkedIn", reviewRow["CB Insights LinkedIn"] ?? "")) promotedBaseFields += 1;
    if (setIfBlank(targetRow, "X", reviewRow["CB Insights X"] ?? "")) promotedBaseFields += 1;

    reviewRowsApplied += 1;
  }

  const outPath = join(outDir, `${basename(firmsPath, ".csv")}.cb-insights.csv`);
  writeCsv(outPath, nextHeaders, rows);

  return {
    entity: "firms",
    review_path: reviewPath,
    source_path: firmsPath,
    output_path: outPath,
    source_rows: rows.length,
    review_rows: review.rows.length,
    review_rows_applied: reviewRowsApplied,
    cb_field_updates: cbFieldUpdates,
    promoted_base_fields: promotedBaseFields,
  };
}

function getRequiredPath(path: string, label: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  return resolved;
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2).filter((token) => !token.startsWith("--"));
  const flags = parseArgs(process.argv.slice(2));

  if (!command || flags["--help"]) {
    printHelp();
    return;
  }

  if (command !== "prepare" && command !== "merge") {
    throw new Error(`Unknown command: ${command}`);
  }

  const investorsPath = getRequiredPath(
    String(flags["--investors"] || DEFAULT_INVESTORS_PATH),
    "Investor CSV",
  );
  const firmsPath = getRequiredPath(
    String(flags["--firms"] || DEFAULT_FIRMS_PATH),
    "Firm CSV",
  );

  if (command === "prepare") {
    const outDir = resolve(String(flags["--out-dir"] || DEFAULT_OUT_DIR));
    const limit = flags["--limit"] ? Number.parseInt(String(flags["--limit"]), 10) : null;
    const statuses = loadScraperStatuses(DEFAULT_SCRAPER_RESULTS_PATH);
    const investors = readCsv(investorsPath);
    const firms = readCsv(firmsPath);
    const firmLookup = buildFirmLookup(firms.rows);

    const investorReviewRows = createInvestorReviewRows(
      investorsPath,
      investors.rows,
      firmLookup,
      statuses,
      Number.isFinite(limit ?? NaN) ? limit : null,
    );
    const firmReviewRows = createFirmReviewRows(
      firmsPath,
      firms.rows,
      statuses,
      Number.isFinite(limit ?? NaN) ? limit : null,
    );

    mkdirSync(outDir, { recursive: true });
    const investorReviewPath = join(outDir, INVESTOR_REVIEW_FILE);
    const firmReviewPath = join(outDir, FIRM_REVIEW_FILE);
    writeCsv(investorReviewPath, INVESTOR_REVIEW_HEADERS, investorReviewRows);
    writeCsv(firmReviewPath, FIRM_REVIEW_HEADERS, firmReviewRows);

    const summary = {
      generated_at: new Date().toISOString(),
      investors_source_path: investorsPath,
      firms_source_path: firmsPath,
      investor_review_path: investorReviewPath,
      firm_review_path: firmReviewPath,
      investor_review_rows: investorReviewRows.length,
      firm_review_rows: firmReviewRows.length,
      investor_source_rows: investors.rows.length,
      firm_source_rows: firms.rows.length,
      limit: limit ?? null,
      used_scraper_history: existsSync(DEFAULT_SCRAPER_RESULTS_PATH),
    };
    writeJson(join(outDir, PREPARE_SUMMARY_FILE), summary);

    console.log(`Prepared ${investorReviewRows.length} investor review rows -> ${investorReviewPath}`);
    console.log(`Prepared ${firmReviewRows.length} firm review rows -> ${firmReviewPath}`);
    console.log(`Summary -> ${join(outDir, PREPARE_SUMMARY_FILE)}`);
    return;
  }

  const reviewDir = resolve(String(flags["--review-dir"] || DEFAULT_REVIEW_DIR));
  const outDir = resolve(String(flags["--out-dir"] || join(reviewDir, "merged")));
  const investorReviewPath = getRequiredPath(join(reviewDir, INVESTOR_REVIEW_FILE), "Investor review CSV");
  const firmReviewPath = getRequiredPath(join(reviewDir, FIRM_REVIEW_FILE), "Firm review CSV");

  mkdirSync(outDir, { recursive: true });
  const investorSummary = mergeInvestors(investorsPath, investorReviewPath, outDir);
  const firmSummary = mergeFirms(firmsPath, firmReviewPath, outDir);
  const summary = {
    merged_at: new Date().toISOString(),
    outputs_dir: outDir,
    results: [investorSummary, firmSummary],
  };
  writeJson(join(outDir, MERGE_SUMMARY_FILE), summary);

  console.log(`Merged investor review queue -> ${String(investorSummary.output_path)}`);
  console.log(`Merged firm review queue -> ${String(firmSummary.output_path)}`);
  console.log(`Summary -> ${join(outDir, MERGE_SUMMARY_FILE)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
