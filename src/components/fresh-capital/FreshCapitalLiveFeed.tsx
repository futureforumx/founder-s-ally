import { useEffect, useMemo, useState } from "react";
import { useVcFundSyncFreshness } from "@/hooks/useVcFundSyncFreshness";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FreshCapitalInsightsTab } from "@/components/fresh-capital/FreshCapitalInsightsTab";
import { MeasuredThemePills } from "@/components/fresh-capital/MeasuredThemePills";
import { LatestFundingFeed } from "@/components/fresh-capital/latest-funding/LatestFundingFeed";
import { SourceOutletBadge } from "@/components/fresh-capital/SourceOutletBadge";
import { buildDedupedSectorChoices } from "@/lib/latestFundingFilters";
import { cn } from "@/lib/utils";
import {
  announcedDateForDisplay,
  announcementUrlForDisplay,
  effectiveFirmMarkHost,
  expandFreshCapitalRowsForDisplay,
  firstGuessedFirmWebsiteFromName,
  firmMarkCandidateUrls,
  formatFundSizeUsd,
  fundNameForDisplay,
  freshCapitalFirmAumUsd,
  freshCapitalFirmLocationLineForDisplay,
  freshCapitalFirmWebsiteLinkSource,
  geographyFocusForDisplay,
  normalizeGeoFocusDisplayChip,
  sectorFocusForDisplay,
  stageFocusForDisplay,
  type FreshCapitalFundRow,
  type FreshCapitalStageFilter,
  type HeatmapBucket,
} from "@/lib/freshCapitalPublic";
import { buildOutboundUrl } from "@/lib/outboundUrl";

/** Aligns live feed surfaces with `/access` (AccessRequestForm + “What happens next” card). */
const ACCESS_CARD = cn(
  "rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);

type Props = {
  id?: string;
  rows: FreshCapitalFundRow[];
  loading: boolean;
  /** True when the feed query failed for RPC/network reasons (not missing env / misconfiguration). */
  rpcFailed: boolean;
  misconfigured: boolean;
  /** Production build — copy for misconfiguration emphasizes deployment env. */
  isProductionBuild: boolean;
  stage: FreshCapitalStageFilter;
  onStageChange: (s: FreshCapitalStageFilter) => void;
  sector: string | null;
  sectorChoices: string[];
  onSectorChange: (s: string | null) => void;
  /** Sector heatmap buckets (same cohort as page footer heatmap). */
  insightsHeatmapBuckets: HeatmapBucket[];
};

/** `"Headline… | TechCrunch"` — split on last ` | ` so the headline can omit the outlet name in the UI. */
function splitAnnouncementTitleHeadAndSource(title: string): { head: string; sourceFromTitle: string | null } {
  const sep = " | ";
  const i = title.lastIndexOf(sep);
  if (i < 0) return { head: title, sourceFromTitle: null };
  const source = title.slice(i + sep.length).trim();
  const head = title.slice(0, i).trimEnd();
  return { head, sourceFromTitle: source || null };
}

/** Short label for the announcement link (e.g. `techcrunch.com` → `Techcrunch`). */
function prettySourceLabelFromUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const host = hostname.replace(/^www\./i, "");
    if (!host) return null;
    if (host === "tech.eu") return "Tech EU";
    if (host === "manda.be") return "MandA";
    const segments = host.split(".").filter(Boolean);
    const raw = segments[0];
    if (!raw) return null;
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  } catch {
    return null;
  }
}

function normalizeWebsiteUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function prettyWebsiteLabel(url: string | null | undefined): string | null {
  const normalized = normalizeWebsiteUrl(url);
  if (!normalized) return null;
  try {
    const host = new URL(normalized).hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Domain label next to firm meta — all lowercase on Fresh Capital. */
function firmWebsiteDisplayLabel(host: string): string {
  return host.trim().toLowerCase();
}

function FirmMetaRow({ row }: { row: FreshCapitalFundRow }) {
  const location = freshCapitalFirmLocationLineForDisplay(row);
  const hintedHost = effectiveFirmMarkHost(row);
  /** Same resolution order as favicon marks: RPC + hydrated `firm_records.website_url`, curated hints, then token-guess. */
  const websiteLinkSource =
    freshCapitalFirmWebsiteLinkSource(row) ||
    (hintedHost ? `https://${hintedHost}` : null) ||
    firstGuessedFirmWebsiteFromName(row.firm_name);
  const websiteUrl = normalizeWebsiteUrl(websiteLinkSource);
  const rawHost =
    prettyWebsiteLabel(websiteLinkSource) ?? (hintedHost ? hintedHost.replace(/^www\./i, "").toLowerCase() : null);
  const websiteDisplay = rawHost ? firmWebsiteDisplayLabel(rawHost) : null;
  const announcementUrl = announcementUrlForDisplay(row);
  const title = row.announcement_title?.trim() || "";
  const { sourceFromTitle } = splitAnnouncementTitleHeadAndSource(title);
  const hasArticle = Boolean(announcementUrl);
  const outletFromUrl = announcementUrl ? prettySourceLabelFromUrl(announcementUrl) : null;
  const showSourceBadge = hasArticle || Boolean(title);
  const aumText = formatFundSizeUsd(freshCapitalFirmAumUsd(row)) ?? "Undisclosed";
  const firmOutboundHref = buildOutboundUrl(websiteUrl, "firm_website", "fresh_funds", row.vc_fund_id);
  const articleOutboundHref = buildOutboundUrl(announcementUrl, "funding_article", "fresh_funds", row.vc_fund_id);

  const pieces = [
    location ? <span key="location">{location}</span> : null,
    firmOutboundHref && websiteDisplay ? (
      <a
        key="website"
        href={firmOutboundHref}
        target="_blank"
        rel="noopener"
        className="text-inherit underline-offset-2 hover:underline"
      >
        {websiteDisplay}
      </a>
    ) : null,
    <span key="aum" className="tabular-nums">
      AUM {aumText}
    </span>,
    showSourceBadge ? (
      <span key="source">
        <SourceOutletBadge
          hasArticle={hasArticle}
          outletLabel={hasArticle ? outletFromUrl ?? sourceFromTitle ?? null : null}
          href={articleOutboundHref}
          noLinkFallbackLabel={hasArticle ? null : sourceFromTitle ?? null}
        />
      </span>
    ) : null,
  ].filter(Boolean);

  if (pieces.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-[#b3b3b3]/90">
      {pieces.map((piece, index) => (
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? <span className="text-zinc-600">·</span> : null}
          {piece}
        </span>
      ))}
    </div>
  );
}

function FirmRowMark({ row }: { row: FreshCapitalFundRow }) {
  const candidates = useMemo(
    () => firmMarkCandidateUrls(row),
    [row.vc_fund_id, row.firm_logo_url, row.firm_domain, row.firm_name],
  );
  const [attempt, setAttempt] = useState(0);
  const letter = (row.firm_name?.trim().charAt(0) || "?").toUpperCase();
  const currentSrc = candidates[attempt] ?? null;

  const shouldRejectLoadedMark = (src: string | null, width: number, height: number): boolean => {
    if (!src) return false;
    const normalized = src.toLowerCase();
    const isProxyService = normalized.includes("google.com/s2/favicons") || normalized.includes("img.logo.dev/");
    const tooSmall = width < 24 || height < 24;
    if (tooSmall) return true;

    const aspectRatio = width / height;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return true;

    const implausibleLogoShape = aspectRatio > 6 || aspectRatio < 0.2;
    if (implausibleLogoShape) return true;

    if (!isProxyService) return false;

    // Proxy favicon services often return generic/globe placeholders at tiny or soft sizes.
    return width < 28 || height < 28;
  };

  useEffect(() => {
    setAttempt(0);
  }, [row.vc_fund_id, candidates]);

  if (attempt >= candidates.length) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border border-zinc-600/90 bg-zinc-900 text-[10px] font-semibold uppercase leading-none text-zinc-400"
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={currentSrc}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded-[3px] border border-zinc-600/80 bg-zinc-950 object-contain"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((i) => i + 1)}
      onLoad={(event) => {
        if (shouldRejectLoadedMark(currentSrc, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)) {
          setAttempt((i) => i + 1);
        }
      }}
    />
  );
}

function ThemePills({ row }: { row: FreshCapitalFundRow }) {
  const themes = sectorFocusForDisplay(row);
  return <MeasuredThemePills themes={themes} rowKey={row.vc_fund_id} />;
}

/** Stage focus column — compact chips (distinct from theme pills). */
function StageFocusChips({ stages }: { stages: string[] | null | undefined }) {
  const list = (stages ?? []).filter(Boolean).slice(0, 4);

  if (list.length === 0) {
    return <span className="text-sm text-[#b3b3b3]">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {list.map((stage) => (
        <span
          key={stage}
          title={stage}
          className="inline-flex max-w-full shrink-0 truncate rounded-full border border-zinc-600/75 bg-zinc-950/90 px-2 py-0.5 text-2xs font-medium tabular-nums text-[#c4c4c4] shadow-sm"
        >
          {stage}
        </span>
      ))}
    </div>
  );
}

/** Geo focus column — same chip treatment as {@link StageFocusChips}. */
function GeoFocusChips({ geos }: { geos: string[] | null | undefined }) {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const raw of geos ?? []) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (!t) continue;
    const chip = normalizeGeoFocusDisplayChip(t);
    if (!chip || seen.has(chip)) continue;
    seen.add(chip);
    labels.push(chip);
    if (labels.length >= 4) break;
  }

  if (labels.length === 0) {
    return <span className="text-sm text-[#b3b3b3]">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {labels.map((chip, i) => (
        <span
          key={`${chip}-${i}`}
          title={chip}
          className="inline-flex max-w-full shrink-0 truncate rounded-full border border-zinc-600/75 bg-zinc-950/90 px-2 py-0.5 text-2xs font-medium text-[#c4c4c4] shadow-sm"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

/** Format a UTC ISO timestamp as e.g. `Apr 21, 10:32 AM` in the viewer's local timezone. */
function formatSyncTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Dark analogue of CommunityView global tabs: `rounded-full border … bg-secondary/35 p-1`. */
const STAGE_SEGMENT_LIST = cn(
  "inline-flex w-max flex-nowrap items-center gap-1 rounded-full border border-zinc-700/60 bg-zinc-900/35 p-1 shadow-sm backdrop-blur-sm",
);

const STAGE_TABS: { id: FreshCapitalStageFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "growth", label: "Growth" },
];

/** Radix Select rejects empty string item values; map to public `null` sector filter. */
const SECTOR_SELECT_ALL = "__all_sectors__";

const SECTOR_SELECT_TRIGGER = cn(
  "h-[38px] min-w-[10.5rem] shrink-0 rounded-full border border-zinc-700/60 bg-zinc-900/35 px-3 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-[#eeeeee] shadow-sm backdrop-blur-sm ring-offset-black",
  "focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-2 focus:ring-offset-black data-[placeholder]:text-[#b3b3b3]",
);

const SECTOR_SELECT_CONTENT = "border-zinc-700 bg-zinc-950 text-[#eeeeee] shadow-lg";
const SECTOR_SELECT_ITEM =
  "text-[11px] font-medium uppercase tracking-[0.12em] focus:bg-white/[0.08] focus:text-[#eeeeee]";

const FEED_MAIN_TABS = [
  { id: "fresh_funds" as const, label: "Fresh funds" },
  { id: "latest_funding" as const, label: "Latest funding" },
  { id: "insights" as const, label: "Insights" },
];

const PRIMARY_SEGMENT_LIST = cn(
  "inline-flex w-max max-w-full flex-nowrap items-center gap-1 rounded-full border border-zinc-600/70 bg-zinc-950/50 p-1 shadow-sm backdrop-blur-sm",
);

export function FreshCapitalLiveFeed({
  id,
  rows,
  loading,
  rpcFailed,
  misconfigured,
  isProductionBuild,
  stage,
  onStageChange,
  sector,
  sectorChoices,
  onSectorChange,
  insightsHeatmapBuckets,
}: Props) {
  const displayRows = useMemo(() => expandFreshCapitalRowsForDisplay(rows), [rows]);
  const [mainTab, setMainTab] = useState<(typeof FEED_MAIN_TABS)[number]["id"]>("fresh_funds");
  const { data: freshnessData } = useVcFundSyncFreshness();
  const lastUpdatedLabel = freshnessData?.completedAt
    ? `New funds added daily · Last updated ${formatSyncTimestamp(freshnessData.completedAt)}`
    : "New funds added daily";
  const [latestFundingSectors, setLatestFundingSectors] = useState<string[]>([]);

  /** Latest funding tab: union VC + deal sectors, then cluster / dedupe for a shorter list. */
  const mergedLatestSectorChoices = useMemo(() => {
    const raw: string[] = [];
    for (const s of sectorChoices) {
      const t = s?.trim();
      if (t) raw.push(t);
    }
    for (const s of latestFundingSectors) {
      const t = s?.trim();
      if (t) raw.push(t);
    }
    return buildDedupedSectorChoices(raw);
  }, [sectorChoices, latestFundingSectors]);

  return (
    <section id={id} className="border-b border-zinc-800 bg-black font-spaceGrotesk">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <div className={cn("mb-5", PRIMARY_SEGMENT_LIST)} role="tablist" aria-label="Feed view">
          {FEED_MAIN_TABS.map((tab) => {
            const isActive = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setMainTab(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] transition-all sm:px-5",
                  isActive
                    ? "bg-[#1a1a1a] text-[#eeeeee] shadow-sm ring-1 ring-zinc-500/55"
                    : "text-[#b3b3b3] hover:bg-white/[0.06] hover:text-[#eeeeee]",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {mainTab === "fresh_funds" && (
          <>
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wider text-primary">Live intelligence</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#eeeeee]">Live fund feed</h2>
                {/* Freshness indicator — pulse dot + status line, sits between heading and description */}
                <div className="mt-2 flex items-center gap-2" aria-label={lastUpdatedLabel}>
                  <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs text-zinc-500">{lastUpdatedLabel}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#b3b3b3] sm:text-base">
                  Recent raises, sorted for signal—updated as new funds hit the wire.
                </p>
              </div>
            </div>

            <div className={cn("overflow-hidden", ACCESS_CARD)}>
              {loading ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-[#b3b3b3]">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              Loading latest funds…
            </div>
          ) : misconfigured ? (
            <div className="px-6 py-16 text-center text-sm text-[#b3b3b3]">
              <p className="font-medium text-[#eeeeee]">Configuration required</p>
              {isProductionBuild ? (
                <p className="mt-2 leading-relaxed">
                  This deployment is missing the public funding data connection. The host must set{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_SUPABASE_URL
                  </code>{" "}
                  and{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_SUPABASE_PUBLISHABLE_KEY
                  </code>{" "}
                  for this site. This is a <span className="font-medium text-[#eeeeee]">setup issue</span>, not a user or filter
                  problem.
                </p>
              ) : (
                <p className="mt-2 leading-relaxed">
                  Set{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_SUPABASE_URL
                  </code>{" "}
                  and{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_SUPABASE_PUBLISHABLE_KEY
                  </code>{" "}
                  to load live funds. For local-only sample rows, set{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_FRESH_CAPITAL_DEMO=true
                  </code>{" "}
                  in{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    .env.local
                  </code>
                  .
                </p>
              )}
            </div>
          ) : rpcFailed ? (
            <div className="px-6 py-16 text-center text-sm text-[#b3b3b3]">
              <p className="font-medium text-[#eeeeee]">Couldn’t load live data</p>
              <p className="mt-2 leading-relaxed">
                The page is configured, but the funding feed did not load (network error, database timeout, or missing RPC after
                deploy). Try again in a moment or refresh. This is <span className="font-medium text-[#eeeeee]">not</span> the same
                as “no funds match your filters.”
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-[#b3b3b3]">
              <p className="font-medium text-[#eeeeee]">No matching announcements</p>
              <p className="mt-2 leading-relaxed">
                The feed loaded successfully; there are no rows for this stage/sector/time window. Switch to{" "}
                <button
                  type="button"
                  className="font-medium text-[#eeeeee] underline-offset-2 hover:underline"
                  onClick={() => setMainTab("latest_funding")}
                >
                  Latest funding
                </button>{" "}
                to change stage or sector filters.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[1.05fr_0.95fr_0.7fr_0.75fr_0.8fr_0.8fr_1.15fr] gap-3 border-b border-zinc-800 bg-[#0a0a0a] px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-[#b3b3b3] md:grid">
                <span>Firm</span>
                <span>Fund</span>
                <span className="text-right">Size</span>
                <span>Announced</span>
                <span>Stage Focus</span>
                <span>Geo Focus</span>
                <span>Themes</span>
              </div>
              <ul className="divide-y divide-zinc-800">
                {displayRows.map((row) => {
                  const size = formatFundSizeUsd(row.final_size_usd ?? row.target_size_usd ?? null) ?? "Undisclosed";
                  const fundDisplay = fundNameForDisplay(row);

                  return (
                    <li key={row.vc_fund_id} className="px-4 py-4 md:px-0 md:py-0">
                      <div className="hidden md:block">
                        <div className="grid grid-cols-[1.05fr_0.95fr_0.7fr_0.75fr_0.8fr_0.8fr_1.15fr] items-start gap-3 px-4 py-3.5">
                          <span className="inline-flex min-w-0 items-start gap-2 pt-px">
                            <span className="mt-0.5 shrink-0">
                              <FirmRowMark row={row} />
                            </span>
                            <span className="min-w-0 break-words font-medium leading-snug text-[#eeeeee]">{row.firm_name}</span>
                          </span>
                          <span className="min-w-0">
                            <span title={fundDisplay} className="block break-words text-sm leading-snug text-[#b3b3b3]">
                              {fundDisplay}
                            </span>
                          </span>
                          <span className="text-right text-sm tabular-nums text-[#b3b3b3]">{size}</span>
                          <span className="text-sm text-[#b3b3b3]">{announcedDateForDisplay(row)}</span>
                          <StageFocusChips stages={stageFocusForDisplay(row)} />
                          <GeoFocusChips geos={geographyFocusForDisplay(row)} />
                          <ThemePills row={row} />
                        </div>
                        <div className="border-t border-zinc-800 px-4 pb-3.5 pt-2">
                          <FirmMetaRow row={row} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 md:hidden">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="inline-flex min-w-0 max-w-full flex-1 items-start gap-2 pt-px">
                            <span className="mt-0.5 shrink-0">
                              <FirmRowMark row={row} />
                            </span>
                            <span className="min-w-0 break-words font-medium leading-snug text-[#eeeeee]">{row.firm_name}</span>
                          </span>
                          <span className="text-2xs tabular-nums text-[#b3b3b3]">{announcedDateForDisplay(row)}</span>
                        </div>
                        <div className="min-w-0 text-sm text-[#b3b3b3]">
                          <span title={fundDisplay} className="block break-words leading-snug">
                            {fundDisplay}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-[#b3b3b3]">
                          {size ? <span className="tabular-nums">{size}</span> : <span>—</span>}
                          <span className="text-zinc-600">·</span>
                          <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="shrink-0 text-2xs font-medium uppercase tracking-wide text-zinc-500">
                              Stage
                            </span>
                            <StageFocusChips stages={stageFocusForDisplay(row)} />
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="shrink-0 text-2xs font-medium uppercase tracking-wide text-zinc-500">
                              Geo
                            </span>
                            <GeoFocusChips geos={geographyFocusForDisplay(row)} />
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-[#b3b3b3]">
                          <span>Themes:</span>
                          <ThemePills row={row} />
                        </div>
                        <FirmMetaRow row={row} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
            </div>
          </>
        )}

        {mainTab === "latest_funding" && (
          <>
            <div className="mb-5 flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
              <div className="min-h-[38px] min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <div className={STAGE_SEGMENT_LIST} role="tablist" aria-label="Stage focus">
                  {STAGE_TABS.map((t) => {
                    const isActive = stage === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onStageChange(t.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all",
                          isActive
                            ? "bg-[#141414] text-[#eeeeee] shadow-sm ring-1 ring-zinc-600/60"
                            : "text-[#b3b3b3] hover:bg-white/[0.06] hover:text-[#eeeeee]",
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="shrink-0">
                {(() => {
                  const choices = mergedLatestSectorChoices;
                  return (
                    <Select
                      value={sector ?? SECTOR_SELECT_ALL}
                      onValueChange={(v) => onSectorChange(v === SECTOR_SELECT_ALL ? null : v)}
                      disabled={misconfigured}
                    >
                      <SelectTrigger
                        className={SECTOR_SELECT_TRIGGER}
                        aria-label="Filter funds by sector"
                      >
                        <SelectValue placeholder="Sector" />
                      </SelectTrigger>
                      <SelectContent
                        className={SECTOR_SELECT_CONTENT}
                        position="popper"
                        side="bottom"
                        sideOffset={6}
                        align="start"
                        avoidCollisions={false}
                      >
                        <SelectItem className={SECTOR_SELECT_ITEM} value={SECTOR_SELECT_ALL}>
                          All sectors
                        </SelectItem>
                        {choices.map((s) => (
                          <SelectItem className={SECTOR_SELECT_ITEM} key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wider text-primary">Live intelligence</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#eeeeee]">Latest funding</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#b3b3b3] sm:text-base">
                  Recent company raises and deal headlines—sorted for scan speed.
                </p>
              </div>
            </div>

            <LatestFundingFeed
              stage={stage}
              sector={sector}
              onAvailableSectors={setLatestFundingSectors}
            />
          </>
        )}

        {mainTab === "insights" && <FreshCapitalInsightsTab buckets={insightsHeatmapBuckets} />}
      </div>
    </section>
  );
}
