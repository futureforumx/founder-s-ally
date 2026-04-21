import { load } from "cheerio";
import { createClient } from "@supabase/supabase-js";

type SuspiciousFundRow = {
  id: string;
  firm_record_id: string;
  name: string;
  announcement_url: string | null;
  target_size_usd: number | null;
  final_size_usd: number | null;
  announced_date: string | null;
  close_date: string | null;
  status: string | null;
};

type RepairPatch = {
  announcedDate: string | null;
  closeDate: string | null;
  targetSizeUsd: number | null;
  finalSizeUsd: number | null;
  status: string | null;
  rawAmountText: string | null;
  sourceCurrency: "USD" | "EUR" | null;
};

function requiredEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function extractFundSection(text: string): string {
  const normalized = normalizeWhitespace(text);
  const matched =
    normalized.match(/\bFund\b([\s\S]{0,2500}?)(?:\bOther Information\b|\bLeadership\b|\bInvestment Strategy\b|\bAbout\b|$)/i)?.[1] ||
    normalized.match(/\bFund\b([\s\S]{0,2500})/i)?.[1] ||
    normalized;
  return normalizeWhitespace(matched);
}

function extractEventContext(text: string): string {
  const normalized = normalizeWhitespace(text);
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const strong = sentences.find((sentence) =>
    /\b(fund|vehicle)\b/i.test(sentence) &&
    /\b(closed|close|raised|raise|launched|launch|announced|announce|unveiled)\b/i.test(sentence) &&
    /(?:\$ ?\d|\b\d[\d,]*(?:\.\d+)?\s*(?:billion|million|thousand|bn|mn|b|m|k)?\s+(?:dollars?|euros?)\b|€\s?\d)/i.test(sentence),
  );
  if (strong) return strong;

  const prioritized = sentences.find((sentence) =>
    /\b(fund|vehicle)\b/i.test(sentence) &&
    /\b(closed|close|raised|raise|launched|launch|announced|announce|unveiled|target|raising)\b/i.test(sentence),
  );
  if (prioritized) return prioritized;

  const nearby = normalized.match(/[^.]{0,120}\b(Fund|Vehicle)\b[^.]{0,280}/i)?.[0];
  return normalizeWhitespace(nearby || normalized);
}

function parseMonthName(month: string): number | null {
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const index = months.indexOf(month.toLowerCase());
  return index === -1 ? null : index + 1;
}

function isoDate(year: number, month: number, day = 1): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseDateFromText(text: string): string | null {
  const full = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/i);
  if (full) {
    const month = parseMonthName(full[1]);
    return month ? isoDate(Number(full[3]), month, Number(full[2])) : null;
  }

  const monthYear = text.match(/\b(?:early|late|mid)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  if (monthYear) {
    const month = parseMonthName(monthYear[1]);
    return month ? isoDate(Number(monthYear[2]), month, 1) : null;
  }

  const slash = text.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (slash) return isoDate(Number(slash[2]), Number(slash[1]), 1);

  return null;
}

function normalizeAmount(value: number, suffix: string | null | undefined): number {
  const s = (suffix || "").toLowerCase();
  if (s === "b" || s === "bn" || s === "billion") return Math.round(value * 1_000_000_000);
  if (s === "m" || s === "mn" || s === "million") return Math.round(value * 1_000_000);
  if (s === "k" || s === "thousand") return Math.round(value * 1_000);
  return Math.round(value);
}

function parseAmountFromText(text: string): { amountUsd: number | null; rawAmountText: string | null; sourceCurrency: "USD" | "EUR" | null } {
  const patterns: Array<{ regex: RegExp; currency: "USD" | "EUR" }> = [
    { regex: /\$ ?(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|b|m|k)?/i, currency: "USD" },
    { regex: /\b(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|b|m|k)?\s+(?:us\s*)?dollars?\b/i, currency: "USD" },
    { regex: /\b(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|b|m|k)?\s+euros?\b/i, currency: "EUR" },
    { regex: /€\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|b|m|k)?/i, currency: "EUR" },
  ];

  for (const { regex, currency } of patterns) {
    const match = text.match(regex);
    if (!match) continue;
    const base = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const normalized = normalizeAmount(base, match[2]);
    if (!Number.isFinite(normalized) || normalized <= 0) continue;
    // Approximate EUR to USD for public size display consistency; keep the source currency in metadata.
    const amountUsd = currency === "EUR" ? Math.round(normalized * 1.08) : normalized;
    if (amountUsd < 1_000_000) continue;
    return { amountUsd, rawAmountText: match[0], sourceCurrency: currency };
  }

  return { amountUsd: null, rawAmountText: null, sourceCurrency: null };
}

function inferStatus(text: string, fallback: string | null): string | null {
  if (/\b(final close|closed Fund|closed at|closed with|close of Fund|fund closed)\b/i.test(text)) return "final_close";
  if (/\b(first close|first-closing)\b/i.test(text)) return "first_close";
  if (/\b(target(?:ing)?|still raising|raising)\b/i.test(text)) return "target";
  return fallback;
}

async function fetchRepairPatch(url: string): Promise<RepairPatch | null> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "VektaFreshCapitalRepair/1.0 (+https://vekta.app)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!response?.ok) return null;

  const html = await response.text().catch(() => "");
  if (!html) return null;

  const $ = load(html);
  const bodyText = normalizeWhitespace($("body").text());
  if (!bodyText) return null;

  const fundSection = extractFundSection(bodyText);
  const eventContext = extractEventContext(`${fundSection}. ${bodyText}`);
  const effectiveText = eventContext || fundSection || bodyText;
  const amount = parseAmountFromText(effectiveText);
  const fallbackAmount = amount.amountUsd == null ? parseAmountFromText(fundSection || bodyText) : amount;
  const { amountUsd, rawAmountText, sourceCurrency } = fallbackAmount;
  const date = parseDateFromText(effectiveText) || parseDateFromText(fundSection) || parseDateFromText(bodyText);
  const status = inferStatus(effectiveText, inferStatus(fundSection, null));
  const closed = status === "final_close" || status === "first_close";

  return {
    announcedDate: date,
    closeDate: closed ? date : null,
    targetSizeUsd: closed ? null : amountUsd,
    finalSizeUsd: closed ? amountUsd : null,
    status,
    rawAmountText,
    sourceCurrency,
  };
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const limit = Math.max(1, Number(process.env.VC_FUND_REPAIR_LIMIT || "100"));
  const dryRun = process.env.VC_FUND_DRY_RUN === "1";

  const { data, error } = await supabase
    .from("vc_funds")
    .select("id, firm_record_id, name, announcement_url, target_size_usd, final_size_usd, announced_date, close_date, status")
    .ilike("announcement_url", "https://www.everythingstartups.com/%")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error) throw new Error(`Failed to load vc_funds: ${error.message}`);

  const suspicious = ((data || []) as SuspiciousFundRow[]).filter((row) => {
    const representative = row.final_size_usd ?? row.target_size_usd ?? null;
    return (
      (!row.announced_date && !row.close_date) ||
      representative == null ||
      (representative != null && representative > 0 && representative < 1000)
    );
  }).slice(0, limit);

  let inspected = 0;
  let repaired = 0;
  let failed = 0;
  const touchedFirmIds = new Set<string>();

  for (const row of suspicious) {
    inspected += 1;
    if (!row.announcement_url) continue;

    const patch = await fetchRepairPatch(row.announcement_url).catch(() => null);
    if (!patch) {
      failed += 1;
      continue;
    }

    const existingSize = row.final_size_usd ?? row.target_size_usd ?? null;
    const betterDate = patch.announcedDate && (!row.announced_date || row.announced_date !== patch.announcedDate);
    const betterSize = patch.finalSizeUsd != null || patch.targetSizeUsd != null
      ? (existingSize == null || existingSize < 1000 || Math.abs((patch.finalSizeUsd ?? patch.targetSizeUsd ?? 0) - existingSize) > 1)
      : false;
    const betterStatus = patch.status && patch.status !== row.status;

    if (!betterDate && !betterSize && !betterStatus) continue;

    if (!dryRun) {
      const fundUpdate = {
        announced_date: patch.announcedDate ?? row.announced_date,
        close_date: patch.closeDate ?? row.close_date,
        target_size_usd: patch.targetSizeUsd ?? (patch.finalSizeUsd ? null : row.target_size_usd),
        final_size_usd: patch.finalSizeUsd ?? row.final_size_usd,
        status: patch.status ?? row.status,
        metadata: {
          repair_source: "everything_startups_detail_page",
          repaired_at: new Date().toISOString(),
          repaired_raw_amount_text: patch.rawAmountText,
          repaired_source_currency: patch.sourceCurrency,
        },
      };

      const { error: fundError } = await supabase.from("vc_funds").update(fundUpdate).eq("id", row.id);
      if (fundError) throw new Error(`Failed to update vc_funds ${row.id}: ${fundError.message}`);

      const candidateSize = patch.finalSizeUsd ?? patch.targetSizeUsd ?? null;
      const { error: candidateError } = await supabase
        .from("candidate_capital_events")
        .update({
          announced_date: patch.announcedDate ?? row.announced_date,
          size_amount: candidateSize,
          status: "promoted",
          latest_seen_at: new Date().toISOString(),
          metadata: {
            repair_source: "everything_startups_detail_page",
            repaired_at: new Date().toISOString(),
            repaired_raw_amount_text: patch.rawAmountText,
            repaired_source_currency: patch.sourceCurrency,
          },
        })
        .eq("canonical_vc_fund_id", row.id);
      if (candidateError) throw new Error(`Failed to update candidate_capital_events for ${row.id}: ${candidateError.message}`);

      const { error: mirrorError } = await supabase
        .from("fund_records")
        .update({
          open_date: patch.announcedDate ?? row.announced_date,
          close_date: patch.closeDate ?? row.close_date,
          target_size_usd: patch.targetSizeUsd ?? null,
          final_close_size_usd: patch.finalSizeUsd ?? null,
          size_usd: patch.finalSizeUsd ?? patch.targetSizeUsd ?? null,
          fund_status: patch.status === "final_close" ? "closed" : "active",
          canonical_freshness_synced_at: new Date().toISOString(),
        })
        .eq("canonical_vc_fund_id", row.id);
      if (mirrorError) throw new Error(`Failed to update fund_records for ${row.id}: ${mirrorError.message}`);
    }

    touchedFirmIds.add(row.firm_record_id);
    repaired += 1;
    console.log("[vc-fund:repair:everything-startups]", JSON.stringify({
      fundId: row.id,
      fundName: row.name,
      url: row.announcement_url,
      announcedDate: patch.announcedDate,
      closeDate: patch.closeDate,
      targetSizeUsd: patch.targetSizeUsd,
      finalSizeUsd: patch.finalSizeUsd,
      status: patch.status,
      dryRun,
    }));
  }

  if (!dryRun) {
    for (const firmId of touchedFirmIds) {
      await supabase.rpc("refresh_firm_capital_derived_fields", {
        p_firm_record_id: firmId,
        p_fresh_window_days: 365,
      });
    }
  }

  console.log("[vc-fund-sync:repair:everything-startups]", JSON.stringify({
    inspected,
    repaired,
    failed,
    touchedFirms: touchedFirmIds.size,
    dryRun,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
