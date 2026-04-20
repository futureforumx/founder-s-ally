import { buildFundNormalizedKey, extractFundSequenceNumber, normalizeBrandCore, normalizeFirmName, normalizeFundName } from "./normalize";
import type { ExtractedFundAnnouncement, FirmRecordLookup } from "./types";
import { isLikelyVcFundVehicleHeadline } from "../../../scripts/funding-ingest/extract";

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
    const primaryNames = [firm.firm_name, firm.legal_name].filter(Boolean) as string[];
    const aliasNames = (firm.aliases || []).filter(Boolean) as string[];
    const firmNames = [...primaryNames, ...aliasNames];
    const exactPrimaryName = primaryNames.some((value) => normalizeFirmName(value) === firmName);
    const exactAliasName = aliasNames.some((value) => normalizeFirmName(value) === firmName);
    const brandCore = normalizeBrandCore(announcement.firmName);
    const exactBrandCore = brandCore && firmNames.some((value) => normalizeBrandCore(value) === brandCore);
    const exactHost = firmHost && websiteHost(firm.website_url) === firmHost;

    if (exactHost && (exactPrimaryName || exactAliasName)) {
      ranked.push({ firm, confidence: 0.99, rule: "host_and_name_exact" });
      continue;
    }

    if (exactHost) {
      ranked.push({ firm, confidence: 0.96, rule: "host_exact" });
      continue;
    }

    if (exactPrimaryName) {
      ranked.push({ firm, confidence: 0.95, rule: "primary_name_exact" });
      continue;
    }

    if (exactAliasName) {
      ranked.push({ firm, confidence: 0.88, rule: "alias_exact" });
      continue;
    }

    if (exactBrandCore) {
      ranked.push({ firm, confidence: 0.92, rule: "brand_core_exact" });
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
  if (isLikelyVcFundVehicleHeadline(announcement.sourceTitle || "", announcement.rawText || "")) {
    return false;
  }
  const text = [announcement.sourceTitle, announcement.rawText].filter(Boolean).join(" ").toLowerCase();
  return /\bseries [abcde]\b|\braised\b|\bfunding round\b|\blead investor\b|\bportfolio company\b/.test(text);
}

export function inferSequenceNumber(announcement: ExtractedFundAnnouncement): number | null {
  return extractFundSequenceNumber(announcement.fundName || announcement.fundLabel || announcement.sourceTitle || "");
}

export function normalizedFundLabel(announcement: ExtractedFundAnnouncement): string {
  return normalizeFundName(announcement.fundName || announcement.fundLabel || announcement.sourceTitle || "unnamed fund");
}
