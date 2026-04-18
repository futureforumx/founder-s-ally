import { buildFundNormalizedKey, extractFundSequenceNumber, normalizeFirmName, normalizeFundName } from "./normalize";
import type { ExtractedFundAnnouncement, FirmRecordLookup } from "./types";

export interface FirmMatchResult {
  matchedFirm: FirmRecordLookup | null;
  confidence: number;
  rule: string;
}

export interface RankedFirmMatch {
  firm: FirmRecordLookup;
  confidence: number;
  rule: string;
}

function websiteHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeFirmName(value).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const token of Array.from(a)) {
    if (b.has(token)) intersect += 1;
  }
  return intersect / new Set([...Array.from(a), ...Array.from(b)]).size;
}

export function rankFirmMatches(
  announcement: ExtractedFundAnnouncement,
  firms: FirmRecordLookup[],
): RankedFirmMatch[] {
  const firmName = normalizeFirmName(announcement.firmName);
  const firmHost = websiteHost(announcement.firmWebsiteUrl || announcement.sourceUrl);
  const ranked: RankedFirmMatch[] = [];

  for (const firm of firms) {
    const firmNames = [firm.firm_name, firm.legal_name, ...(firm.aliases || [])].filter(Boolean) as string[];
    const exactName = firmNames.some((value) => normalizeFirmName(value) === firmName);
    const exactHost = firmHost && websiteHost(firm.website_url) === firmHost;

    if (exactHost && exactName) {
      ranked.push({ firm, confidence: 0.99, rule: "host_and_name_exact" });
      continue;
    }

    if (exactHost) {
      ranked.push({ firm, confidence: 0.96, rule: "host_exact" });
      continue;
    }

    if (exactName) {
      ranked.push({ firm, confidence: 0.94, rule: "name_exact" });
      continue;
    }

    const incomingTokens = tokenSet(announcement.firmName);
    const firmScores = firmNames.map((name) => jaccard(incomingTokens, tokenSet(name)));
    const score = Math.max(0, ...firmScores);
    if (score > 0) ranked.push({ firm, confidence: score, rule: "token_overlap" });
  }

  return ranked
    .sort((a, b) => b.confidence - a.confidence)
    .filter((entry, index, arr) => index === 0 || entry.firm.id !== arr[index - 1]?.firm.id);
}

export function matchFirmRecord(
  announcement: ExtractedFundAnnouncement,
  firms: FirmRecordLookup[],
): FirmMatchResult {
  const ranked = rankFirmMatches(announcement, firms);
  const best = ranked[0];
  if (!best || best.confidence < 0.72) {
    return { matchedFirm: null, confidence: best?.confidence ?? 0, rule: "no_confident_match" };
  }

  return { matchedFirm: best.firm, confidence: best.confidence, rule: best.rule };
}

export function buildAnnouncementFundKey(firmRecordId: string, announcement: ExtractedFundAnnouncement): string {
  const fundName = announcement.fundName || announcement.fundLabel || announcement.sourceTitle || "unnamed fund";
  return buildFundNormalizedKey({
    firmRecordId,
    fundName,
    vintageYear: announcement.vintageYear ?? null,
  });
}

export function looksLikeGeneralFundraisingAnnouncement(announcement: ExtractedFundAnnouncement): boolean {
  const text = [announcement.fundName, announcement.fundLabel, announcement.sourceTitle, announcement.rawText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasVehicleWords = /\bfund\b|\bvehicle\b|\bopportunity\b|\bgrowth\b|\bscout\b|\brolling\b/.test(text);
  const genericOnly =
    /\bfundraising\b|\braising capital\b|\bnew capital\b/.test(text) &&
    !hasVehicleWords;

  return genericOnly;
}

export function looksLikePortfolioFinancingNews(announcement: ExtractedFundAnnouncement): boolean {
  const text = [announcement.sourceTitle, announcement.rawText].filter(Boolean).join(" ").toLowerCase();
  return /\bseries [abcde]\b|\braised\b|\bfunding round\b|\blead investor\b|\bportfolio company\b/.test(text);
}

export function inferSequenceNumber(announcement: ExtractedFundAnnouncement): number | null {
  return extractFundSequenceNumber(announcement.fundName || announcement.fundLabel || announcement.sourceTitle || "");
}

export function normalizedFundLabel(announcement: ExtractedFundAnnouncement): string {
  return normalizeFundName(announcement.fundName || announcement.fundLabel || announcement.sourceTitle || "unnamed fund");
}
