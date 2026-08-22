import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useVcFundSyncFreshness } from "@/hooks/useVcFundSyncFreshness";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  Facebook,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Lock,
  Newspaper,
  Star,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FreshCapitalInsightsTab } from "@/components/fresh-capital/FreshCapitalInsightsTab";
import { LatestFundingFeed } from "@/components/fresh-capital/latest-funding/LatestFundingFeed";
import { LatestFundingFilterBar } from "@/components/fresh-capital/latest-funding/LatestFundingFilterBar";
import { TagGroup } from "@/components/ui/TagGroup";
import { cn } from "@/lib/utils";
import {
  announcedDateForDisplay,
  announcementUrlForDisplay,
  effectiveFirmMarkHost,
  expandFreshCapitalRowsForDisplay,
  firstGuessedFirmWebsiteFromName,
  firmMarkCandidateUrls,
  formatFundSizeUsd,
  formatFundWatchSourceLabel,
  fundNameForDisplay,
  freshCapitalFirmAumUsd,
  freshCapitalFirmLocationLineForDisplay,
  freshCapitalFirmWebsiteLinkSource,
  geographyFocusForDisplay,
  canonicalGeoTagsForDisplay,
  sectorFocusForDisplay,
  stageFocusForDisplay,
  type FreshCapitalFundRow,
  type FreshCapitalStageFilter,
  type HeatmapBucket,
} from "@/lib/freshCapitalPublic";
import { formatRoundKind, parseCustomAmountInput, type LatestFundingAmountPreset, type LatestFundingDateSort } from "@/lib/latestFundingFilters";
import {
  applyFundWatchTableFilters,
  buildFundWatchSectorChoices,
  buildFundWatchStageChoices,
  fundWatchFiltersAreDefault,
} from "@/lib/fundWatchFilters";
import { isValidOutboundUrl } from "@/lib/outboundUrl";
import { EXTERNAL_SOURCE_LINK_ATTRS, formatOutboundUrl } from "@/lib/utils/formatOutboundUrl";
import { submitInvestorWaitlistSignup } from "@/lib/investorWaitlistEdge";
import { toast } from "@/hooks/use-toast";
import { trackFreshCapitalGatedPreviewInteraction, trackFreshCapitalJoinVekta } from "@/lib/freshCapitalAnalytics";

/** Aligns live feed surfaces with `/access` (AccessRequestForm + “What happens next” card). */
const ACCESS_CARD = cn(
  "rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);

const FUND_WATCH_COLS = cn(
  "w-full min-w-[64rem]",
  "grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)_minmax(5.75rem,0.55fr)_minmax(5.75rem,0.55fr)_minmax(6.5rem,0.65fr)_minmax(7.25rem,0.9fr)_minmax(5.5rem,0.6fr)]",
);

const FUND_WATCH_DESKTOP_GRID = cn("grid h-14 items-center gap-x-3 px-4 pr-10", FUND_WATCH_COLS);

const FUND_WATCH_DESKTOP_HEADER_GRID = cn("grid items-center gap-x-3 px-4 py-2 pr-10", FUND_WATCH_COLS);

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
  /** Opens Fund Watch or Latest Funding when a public path alias is configured. */
  initialMainTab?: "fresh_funds" | "latest_funding";
  onNotifyClick: () => void;
  onUnlockClick?: () => void;
};

function normalizeWebsiteUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function firmWebsiteHref(row: FreshCapitalFundRow): string | null {
  const hintedHost = effectiveFirmMarkHost(row);
  const websiteLinkSource =
    freshCapitalFirmWebsiteLinkSource(row) ||
    (hintedHost ? `https://${hintedHost}` : null) ||
    firstGuessedFirmWebsiteFromName(row.firm_name);
  const websiteUrl = normalizeWebsiteUrl(websiteLinkSource);
  if (!websiteUrl || !isValidOutboundUrl(websiteUrl)) return null;
  return formatOutboundUrl(websiteUrl, "fresh_funds");
}

function firmWebsiteHost(row: FreshCapitalFundRow): string | null {
  const hintedHost = effectiveFirmMarkHost(row);
  const websiteLinkSource =
    freshCapitalFirmWebsiteLinkSource(row) ||
    (hintedHost ? `https://${hintedHost}` : null) ||
    firstGuessedFirmWebsiteFromName(row.firm_name);
  const websiteUrl = normalizeWebsiteUrl(websiteLinkSource);
  if (websiteUrl) {
    try {
      return new URL(websiteUrl).hostname.replace(/^www\./i, "").toLowerCase() || null;
    } catch {
      /* fall through */
    }
  }
  return hintedHost ? hintedHost.replace(/^www\./i, "").toLowerCase() : null;
}

function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function previewTenth(seed: string, salt: number, min: number, steps: number): string {
  return (min + (hashSeed(`${seed}:${salt}`) % steps) / 10).toFixed(1);
}

const PREVIEW_PARTNERS = [
  { name: "Brad Cordovano", title: "Managing Partner" },
  { name: "Alex Rivera", title: "General Partner" },
  { name: "Jordan Hale", title: "Partner" },
  { name: "Morgan Chen", title: "General Partner" },
] as const;

type PreviewPartner = {
  name: string;
  title: string;
  email: string;
  initials: string;
};

function partnerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return letters.join("") || "P";
}

function previewPartners(row: FreshCapitalFundRow): PreviewPartner[] {
  const seed = row.firm_record_id || row.firm_name;
  const start = hashSeed(seed) % PREVIEW_PARTNERS.length;
  const host = firmWebsiteHost(row) || "firm.com";
  return [0, 1].map((offset) => {
    const partner = PREVIEW_PARTNERS[(start + offset) % PREVIEW_PARTNERS.length]!;
    const initial = partner.name.trim().charAt(0).toLowerCase() || "p";
    return {
      name: partner.name,
      title: partner.title,
      email: `${initial}***@${host}`,
      initials: partnerInitials(partner.name),
    };
  });
}

function firmRawWebsiteUrl(row: FreshCapitalFundRow): string | null {
  const hintedHost = effectiveFirmMarkHost(row);
  const websiteLinkSource =
    hintedHost && !row.firm_website_url?.trim()
      ? firstGuessedFirmWebsiteFromName(row.firm_name) ?? freshCapitalFirmWebsiteLinkSource(row)
      : freshCapitalFirmWebsiteLinkSource(row);
  return normalizeWebsiteUrl(websiteLinkSource);
}

function FirmMetaRow({ row }: { row: FreshCapitalFundRow }) {
  const location = freshCapitalFirmLocationLineForDisplay(row);
  const aumText = formatFirmAumDisplay(row);
  const pieces = [
    location ? <span key="location">{location}</span> : null,
    aumText ? (
      <span key="aum" className="tabular-nums">
        AUM {aumText}
      </span>
    ) : null,
  ].filter(Boolean);

  if (pieces.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-x-1.5 overflow-hidden whitespace-nowrap text-xs text-zinc-400">
      {pieces.map((piece, index) => (
        <span key={index} className="inline-flex min-w-0 items-center gap-1.5">
          {index > 0 ? <span className="text-zinc-700">·</span> : null}
          {piece}
        </span>
      ))}
    </div>
  );
}

function FirmIdentity({ row }: { row: FreshCapitalFundRow }) {
  return (
    <span className="flex min-w-0 w-full items-center gap-2.5 overflow-hidden">
      <FirmRowMark row={row} />
      <span className="flex min-w-0 flex-col justify-center gap-0.5 overflow-hidden">
        <span className="min-w-0 truncate font-medium leading-tight text-white">{row.firm_name}</span>
        <FirmMetaRow row={row} />
      </span>
    </span>
  );
}

type FirmSocialLink = {
  id: string;
  url: string;
  label: string;
  icon: LucideIcon;
  hoverColor?: string;
};

function firmSocialLinks(row: FreshCapitalFundRow): FirmSocialLink[] {
  const candidates: Array<Omit<FirmSocialLink, "url"> & { url: string | null }> = [
    { id: "website", url: firmRawWebsiteUrl(row), label: "Website", icon: Globe },
    {
      id: "linkedin",
      url: row.firm_linkedin_url?.trim() || null,
      label: "LinkedIn",
      icon: Linkedin,
      hoverColor: "hover:text-[#0A66C2] hover:border-[#0A66C2]/40",
    },
    {
      id: "twitter",
      url: row.firm_x_url?.trim() || null,
      label: "Twitter / X",
      icon: Twitter,
      hoverColor: "hover:text-white hover:border-white/40",
    },
    {
      id: "crunchbase",
      url: row.firm_crunchbase_url?.trim() || null,
      label: "Crunchbase",
      icon: Building2,
      hoverColor: "hover:text-blue-400 hover:border-blue-400/40",
    },
    {
      id: "github",
      url: row.firm_github_url?.trim() || null,
      label: "GitHub",
      icon: Github,
      hoverColor: "hover:text-white hover:border-white/40",
    },
    {
      id: "youtube",
      url: row.firm_youtube_url?.trim() || null,
      label: "YouTube",
      icon: Youtube,
      hoverColor: "hover:text-[#FF0000] hover:border-[#FF0000]/40",
    },
    {
      id: "instagram",
      url: row.firm_instagram_url?.trim() || null,
      label: "Instagram",
      icon: Instagram,
      hoverColor: "hover:text-pink-400 hover:border-pink-400/40",
    },
    {
      id: "facebook",
      url: row.firm_facebook_url?.trim() || null,
      label: "Facebook",
      icon: Facebook,
      hoverColor: "hover:text-[#1877F2] hover:border-[#1877F2]/40",
    },
    {
      id: "medium",
      url: row.firm_medium_url?.trim() || null,
      label: "Medium",
      icon: Newspaper,
      hoverColor: "hover:text-zinc-100 hover:border-zinc-500/40",
    },
    {
      id: "substack",
      url: row.firm_substack_url?.trim() || null,
      label: "Substack",
      icon: Newspaper,
      hoverColor: "hover:text-orange-400 hover:border-orange-400/40",
    },
  ];

  const seen = new Set<string>();
  const links: FirmSocialLink[] = [];
  for (const candidate of candidates) {
    const url = normalizeWebsiteUrl(candidate.url);
    if (!url || !isValidOutboundUrl(url) || seen.has(url)) continue;
    seen.add(url);
    links.push({ ...candidate, url });
  }
  return links;
}

function TeaserMeter({ percent, className }: { percent: number; className: string }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className={cn("h-full rounded-full", className)}
        style={{ width: `${Math.max(8, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

function GatedIntelligenceTile({
  title,
  onUnlock,
  children,
}: {
  title: string;
  onUnlock: () => void;
  children: ReactNode;
}) {
  const unlock = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    trackFreshCapitalJoinVekta({ cta_location: "fund_watch_row_expand" });
    onUnlock();
  };

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 transition-all duration-200 hover:border-zinc-700"
      onClick={unlock}
    >
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</div>
      <div className="pointer-events-none select-none opacity-60 blur-[5px] transition-all duration-300 group-hover:opacity-75 group-hover:blur-[3.5px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[1px] transition-colors duration-200 group-hover:bg-zinc-950/25">
        <button
          type="button"
          onClick={unlock}
          className="flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/90 px-3.5 py-2 text-xs font-medium text-zinc-100 shadow-xl transition-all duration-200 hover:scale-[1.02] hover:border-primary/50 hover:bg-zinc-800 active:scale-[0.98] group-hover:scale-[1.02]"
        >
          <Lock className="h-3.5 w-3.5 text-primary" />
          <span>UNLOCK IN VEKTA</span>
        </button>
      </div>
    </div>
  );
}

function FundWatchExpandPanel({ row, onUnlock }: { row: FreshCapitalFundRow; onUnlock: () => void }) {
  const href = firmWebsiteHref(row);
  const host = firmWebsiteHost(row);
  const partners = previewPartners(row);
  const socialLinks = firmSocialLinks(row);
  const founderRating = previewTenth(row.firm_name, 1, 4.6, 4);
  const reputation = previewTenth(row.firm_name, 2, 8.8, 9);
  const valueAdd = previewTenth(row.firm_name, 3, 8.7, 9);
  const filledStars = Math.round(Number(founderRating));
  const reputationPct = Number(reputation) * 10;
  const valueAddPct = Number(valueAdd) * 10;

  const source = fundWatchSource(row);

  const unlockFull = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    trackFreshCapitalJoinVekta({ cta_location: "fund_watch_row_expand" });
    onUnlock();
  };

  return (
    <div className="border-t border-zinc-800/60 bg-zinc-950/40 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 transition-all duration-200 hover:border-zinc-700">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Website & Socials</div>
          {href && host ? (
            <a
              href={href}
              {...EXTERNAL_SOURCE_LINK_ATTRS}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex min-w-0 items-center gap-0.5 text-sm text-zinc-200 transition-colors hover:text-white"
            >
              <span className="truncate">{host}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </a>
          ) : (
            <p className="text-sm text-zinc-500">—</p>
          )}
          {socialLinks.length > 0 ? (
            <TooltipProvider delayDuration={200}>
              <div className="mt-3 flex flex-row flex-wrap items-center gap-2">
                {socialLinks.map((link) => {
                  const outbound = formatOutboundUrl(link.url, "fresh_funds");
                  return (
                    <Tooltip key={link.id}>
                      <TooltipTrigger asChild>
                        <a
                          href={outbound}
                          {...EXTERNAL_SOURCE_LINK_ATTRS}
                          aria-label={link.label}
                          onClick={(event) => event.stopPropagation()}
                          className={cn(
                            "inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-all duration-200 hover:scale-105 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            link.hoverColor,
                          )}
                        >
                          <link.icon className="h-3.5 w-3.5" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="border-zinc-800 bg-zinc-900 text-xs text-zinc-100">
                        {link.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          ) : null}
        </div>

        <GatedIntelligenceTile title="Founder Ratings" onUnlock={onUnlock}>
          <div className="space-y-2.5 text-xs text-zinc-300">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span>Founder Rating</span>
                <span className="inline-flex items-center gap-1 font-medium tabular-nums text-white">
                  <span className="inline-flex">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-3 w-3",
                          i < filledStars ? "fill-amber-400 text-amber-400" : "fill-zinc-700 text-zinc-700",
                        )}
                      />
                    ))}
                  </span>
                  {founderRating} / 5.0
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span>Reputation</span>
                <span className="font-medium tabular-nums text-white">{reputation} / 10</span>
              </div>
              <TeaserMeter percent={reputationPct} className="bg-primary" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span>Responsiveness</span>
                <span className="font-medium text-white">Fast (&lt; 24 hrs)</span>
              </div>
              <TeaserMeter percent={82} className="bg-emerald-500" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span>Value-Add</span>
                <span className="font-medium tabular-nums text-white">{valueAdd} / 10</span>
              </div>
              <TeaserMeter percent={valueAddPct} className="bg-primary" />
            </div>
          </div>
        </GatedIntelligenceTile>

        <GatedIntelligenceTile title="Partners & Contact" onUnlock={onUnlock}>
          <div className="space-y-3">
            {partners.map((partner) => (
              <div key={partner.name} className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[10px] font-medium text-zinc-400">
                  {partner.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white">{partner.name}</p>
                  <p className="truncate text-[10px] text-zinc-500">{partner.title}</p>
                </div>
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {partner.email}
                </span>
              </div>
            ))}
          </div>
        </GatedIntelligenceTile>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {source.href ? (
          <a
            href={source.href}
            {...EXTERNAL_SOURCE_LINK_ATTRS}
            title={source.label}
            aria-label={source.label === "Source" ? "View source" : `View source on ${source.label}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-500 hover:text-white"
          >
            View source
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={unlockFull}
          className="rounded-full bg-primary px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_0_24px_hsl(var(--primary)/0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_0_32px_hsl(var(--primary)/0.55)]"
        >
          Unlock full profile
        </Button>
      </div>
    </div>
  );
}

function formatFirmAumDisplay(row: FreshCapitalFundRow): string | null {
  const aumUsd = freshCapitalFirmAumUsd(row);
  if (aumUsd == null || aumUsd <= 0) return null;
  return formatFundSizeUsd(aumUsd);
}

function fundWatchSource(row: FreshCapitalFundRow): { href: string | null; label: string } {
  const announcementUrl = announcementUrlForDisplay(row);
  const title = row.announcement_title?.trim() || "";
  const href =
    announcementUrl && isValidOutboundUrl(announcementUrl)
      ? formatOutboundUrl(announcementUrl, "fresh_funds")
      : null;
  return { href, label: formatFundWatchSourceLabel(announcementUrl, title) };
}

function geoFocusLabels(row: FreshCapitalFundRow): string[] {
  return canonicalGeoTagsForDisplay(
    (geographyFocusForDisplay(row) ?? []).flatMap((chip) => expandGeoChip(chip)),
  );
}

function uniqueTags(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of values) {
    const t = raw.trim();
    if (!t || t === "—") continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }
  return tags;
}

function stageFocusTags(row: FreshCapitalFundRow): string[] {
  return uniqueTags(stageFocusForDisplay(row).map((stage) => formatRoundKind(stage)));
}

function sectorFocusTags(row: FreshCapitalFundRow): string[] {
  return uniqueTags(sectorFocusForDisplay(row));
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
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-900 text-[10px] font-semibold uppercase leading-none text-zinc-400"
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
      width={24}
      height={24}
      className="h-6 w-6 shrink-0 rounded-md bg-zinc-950 object-contain"
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

function expandGeoChip(chip: string): string[] {
  if (chip.toLowerCase() === "north america") return ["U.S.", "Canada"];
  return [chip];
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

const FEED_MAIN_TABS = [
  { id: "fresh_funds" as const, label: "Fund Watch" },
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
  insightsHeatmapBuckets,
  initialMainTab = "fresh_funds",
  onNotifyClick,
  onUnlockClick,
}: Props) {
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifySubmitting, setNotifySubmitting] = useState(false);
  const [notifySubmitted, setNotifySubmitted] = useState(false);
  const [notifyFirstName, setNotifyFirstName] = useState("");
  const [notifyLastName, setNotifyLastName] = useState("");
  const [notifyCompany, setNotifyCompany] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyErrors, setNotifyErrors] = useState<Record<string, string>>({});

  const displayRows = useMemo(() => expandFreshCapitalRowsForDisplay(rows), [rows]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [amountPreset, setAmountPreset] = useState<LatestFundingAmountPreset>("all");
  const [customMinInput, setCustomMinInput] = useState("");
  const [customMaxInput, setCustomMaxInput] = useState("");
  const [dateSort, setDateSort] = useState<LatestFundingDateSort>("newest");
  const customMinUsd = useMemo(() => parseCustomAmountInput(customMinInput), [customMinInput]);
  const customMaxUsd = useMemo(() => parseCustomAmountInput(customMaxInput), [customMaxInput]);
  const filtersAreDefault = fundWatchFiltersAreDefault({
    query: searchQuery,
    sectors: selectedSectors,
    rounds: selectedStages,
    amountPreset,
    dateSort,
  });
  const fundWatchSectorChoices = useMemo(() => buildFundWatchSectorChoices(displayRows), [displayRows]);
  const stageChoices = useMemo(() => buildFundWatchStageChoices(displayRows), [displayRows]);
  const filteredRows = useMemo(
    () =>
      applyFundWatchTableFilters(displayRows, {
        query: searchQuery,
        sectors: selectedSectors,
        rounds: selectedStages,
        amountPreset,
        customMinUsd,
        customMaxUsd,
        dateSort,
      }),
    [displayRows, searchQuery, selectedSectors, selectedStages, amountPreset, customMinUsd, customMaxUsd, dateSort],
  );
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedSectors([]);
    setSelectedStages([]);
    setAmountPreset("all");
    setCustomMinInput("");
    setCustomMaxInput("");
    setDateSort("newest");
  };
  const [mainTab, setMainTab] = useState<(typeof FEED_MAIN_TABS)[number]["id"]>(initialMainTab);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setMainTab(initialMainTab);
  }, [initialMainTab]);
  const { data: freshnessData } = useVcFundSyncFreshness();
  const lastUpdatedLabel = freshnessData?.completedAt
    ? `New funds added daily · Last updated ${formatSyncTimestamp(freshnessData.completedAt)}`
    : "New funds added daily";

  const resetNotifyForm = () => {
    setNotifySubmitted(false);
    setNotifySubmitting(false);
    setNotifyErrors({});
    setNotifyFirstName("");
    setNotifyLastName("");
    setNotifyCompany("");
    setNotifyEmail("");
  };

  const validateNotify = (): boolean => {
    const next: Record<string, string> = {};
    if (!notifyFirstName.trim()) next.firstName = "First name is required.";
    if (!notifyLastName.trim()) next.lastName = "Last name is required.";
    if (!notifyCompany.trim()) next.company = "Company is required.";
    const email = notifyEmail.trim();
    if (!email) next.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email.";
    setNotifyErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitNotify = async () => {
    if (!validateNotify()) return;
    setNotifySubmitting(true);
    try {
      const res = await submitInvestorWaitlistSignup({
        firstName: notifyFirstName.trim(),
        lastName: notifyLastName.trim(),
        firm: notifyCompany.trim(),
        email: notifyEmail.trim().toLowerCase(),
        signupContext: "fundraising_page",
      });
      if (res.ok === false) {
        console.warn("[FreshCapital] notify waitlist failed", res.message);
        toast({ variant: "destructive", title: "Couldn’t submit", description: res.message });
        return;
      }
      setNotifySubmitted(true);
    } catch (error) {
      console.error("[FreshCapital] notify waitlist failed", error);
      toast({
        variant: "destructive",
        title: "Couldn’t submit",
        description: "Please try again in a moment.",
      });
    } finally {
      setNotifySubmitting(false);
    }
  };

  return (
    <section id={id} className="border-b border-zinc-800 bg-black font-spaceGrotesk">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className={PRIMARY_SEGMENT_LIST} role="tablist" aria-label="Feed view">
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

          <Dialog
            open={notifyOpen}
            onOpenChange={(next) => {
              setNotifyOpen(next);
              if (!next) resetNotifyForm();
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (onNotifyClick) {
                  onNotifyClick();
                  return;
                }
                setNotifyOpen(true);
              }}
              className="rounded-full border-zinc-600/70 bg-zinc-950/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#eeeeee] hover:bg-white/[0.06]"
            >
              Notify me
            </Button>
            <DialogContent className="border-zinc-700 bg-[#0a0a0a] text-[#eeeeee]">
              {notifySubmitted ? (
                <div className="py-4 text-center">
                  <DialogHeader>
                    <DialogTitle className="text-[#eeeeee]">You did it.</DialogTitle>
                    <DialogDescription className="text-[#b3b3b3]">
                      We'll keep you in the loop with the latest fundraising activity.
                    </DialogDescription>
                  </DialogHeader>
                </div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-[#eeeeee]">Notify me of funding activity</DialogTitle>
                    <DialogDescription className="text-[#b3b3b3]">
                      Enter your details and get notified about new funds and successful rounds.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mt-2 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-[0.12em] text-[#b3b3b3]">First name</label>
                        <Input
                          value={notifyFirstName}
                          onChange={(e) => {
                            setNotifyFirstName(e.target.value);
                            if (notifyErrors.firstName) setNotifyErrors((prev) => ({ ...prev, firstName: "" }));
                          }}
                          placeholder="Jane"
                          className="border-zinc-700 bg-zinc-950 text-[#eeeeee]"
                        />
                        {notifyErrors.firstName ? <p className="text-xs text-red-400">{notifyErrors.firstName}</p> : null}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-[0.12em] text-[#b3b3b3]">Last name</label>
                        <Input
                          value={notifyLastName}
                          onChange={(e) => {
                            setNotifyLastName(e.target.value);
                            if (notifyErrors.lastName) setNotifyErrors((prev) => ({ ...prev, lastName: "" }));
                          }}
                          placeholder="Doe"
                          className="border-zinc-700 bg-zinc-950 text-[#eeeeee]"
                        />
                        {notifyErrors.lastName ? <p className="text-xs text-red-400">{notifyErrors.lastName}</p> : null}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] uppercase tracking-[0.12em] text-[#b3b3b3]">Company</label>
                      <Input
                        value={notifyCompany}
                        onChange={(e) => {
                          setNotifyCompany(e.target.value);
                          if (notifyErrors.company) setNotifyErrors((prev) => ({ ...prev, company: "" }));
                        }}
                        placeholder="Your company"
                        className="border-zinc-700 bg-zinc-950 text-[#eeeeee]"
                      />
                      {notifyErrors.company ? <p className="text-xs text-red-400">{notifyErrors.company}</p> : null}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] uppercase tracking-[0.12em] text-[#b3b3b3]">Email</label>
                      <Input
                        value={notifyEmail}
                        onChange={(e) => {
                          setNotifyEmail(e.target.value);
                          if (notifyErrors.email) setNotifyErrors((prev) => ({ ...prev, email: "" }));
                        }}
                        placeholder="jane@company.com"
                        type="email"
                        className="border-zinc-700 bg-zinc-950 text-[#eeeeee]"
                      />
                      {notifyErrors.email ? <p className="text-xs text-red-400">{notifyErrors.email}</p> : null}
                    </div>

                    <div className="pt-1">
                      <Button
                        type="button"
                        onClick={submitNotify}
                        disabled={notifySubmitting}
                        className="w-full rounded-full bg-[#eeeeee] text-black hover:bg-white"
                      >
                        {notifySubmitting ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting...
                          </span>
                        ) : (
                          "Join notify list"
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
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
              </div>
            </div>

            <div className={cn("overflow-x-auto", ACCESS_CARD)}>
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
                      for this site. This is a <span className="font-medium text-[#eeeeee]">setup issue</span>, not a user or
                      filter problem.
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
                    The page is configured, but the funding feed did not load (network error, database timeout, or missing RPC
                    after deploy). Try again in a moment or refresh. This is{" "}
                    <span className="font-medium text-[#eeeeee]">not</span> the same as “no funds match your filters.”
                  </p>
                </div>
              ) : (
                <>
                  <LatestFundingFilterBar
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    searchPlaceholder="Search firm, fund..."
                    searchAriaLabel="Search firm or fund"
                    sectorLabel="Sector"
                    roundLabel="Stage"
                    groupAriaLabel="Filter fund watch"
                    sectorChoices={fundWatchSectorChoices}
                    selectedSectors={selectedSectors}
                    onSectorsChange={setSelectedSectors}
                    roundChoices={stageChoices}
                    selectedRounds={selectedStages}
                    onRoundsChange={setSelectedStages}
                    amountPreset={amountPreset}
                    onAmountPresetChange={setAmountPreset}
                    customMinInput={customMinInput}
                    customMaxInput={customMaxInput}
                    onCustomMinInputChange={setCustomMinInput}
                    onCustomMaxInputChange={setCustomMaxInput}
                    customMinUsd={customMinUsd}
                    customMaxUsd={customMaxUsd}
                    dateSort={dateSort}
                    onDateSortChange={setDateSort}
                    filtersAreDefault={filtersAreDefault}
                    onReset={resetFilters}
                  />
                  {filteredRows.length === 0 ? (
                    <div className="px-6 py-16 text-center text-sm text-[#b3b3b3]">
                      <p className="font-medium text-[#eeeeee]">No matching announcements</p>
                      <p className="mt-2 leading-relaxed">
                        {filtersAreDefault ? (
                          <>
                            The feed loaded successfully; there are no rows for this time window. Switch to{" "}
                            <button
                              type="button"
                              className="font-medium text-[#eeeeee] underline-offset-2 hover:underline"
                              onClick={() => setMainTab("latest_funding")}
                            >
                              Latest funding
                            </button>{" "}
                            to browse company raises.
                          </>
                        ) : (
                          <>No funds match these filters. Reset to see the full feed.</>
                        )}
                      </p>
                    </div>
                  ) : (
                    <>
              <div className={cn("border-b border-zinc-800/60 bg-[#0a0a0a] text-2xs font-semibold uppercase tracking-wide text-zinc-500", FUND_WATCH_DESKTOP_HEADER_GRID)}>
                <span className="min-w-0">Firm</span>
                <span className="min-w-0">Fund</span>
                <span>Size</span>
                <span>Announced</span>
                <span className="min-w-0">Stage</span>
                <span className="min-w-0">Focus</span>
                <span className="min-w-0">Geo</span>
              </div>
              <ul>
                {filteredRows.map((row) => {
                  const size = formatFundSizeUsd(row.final_size_usd ?? row.target_size_usd ?? null) ?? "Undisclosed";
                  const fundDisplay = fundNameForDisplay(row);
                  const expanded = expandedId === row.vc_fund_id;

                  const toggleExpanded = () => {
                    setExpandedId((current) => {
                      const next = current === row.vc_fund_id ? null : row.vc_fund_id;
                      if (next) trackFreshCapitalGatedPreviewInteraction("fund_watch_row_expand");
                      return next;
                    });
                  };

                  const onRowClick = (event: { target: EventTarget | null }) => {
                    const target = event.target as HTMLElement | null;
                    if (target?.closest("a,button")) return;
                    toggleExpanded();
                  };

                  return (
                    <li key={row.vc_fund_id} className="border-b border-zinc-800/60 last:border-b-0">
                      <div
                        onClick={onRowClick}
                        className="relative cursor-pointer transition-colors hover:bg-zinc-900/40"
                      >
                        <div className={FUND_WATCH_DESKTOP_GRID}>
                          <span className="min-w-0 overflow-hidden">
                            <FirmIdentity row={row} />
                          </span>
                          <span title={fundDisplay} className="min-w-0 truncate text-xs font-medium text-zinc-400">
                            {fundDisplay || "—"}
                          </span>
                          <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-white">{size}</span>
                          <span className="whitespace-nowrap text-xs text-zinc-400">{announcedDateForDisplay(row) || "—"}</span>
                          <span className="min-w-0 overflow-hidden">
                            <TagGroup items={stageFocusTags(row)} maxVisible={1} variant="stage" />
                          </span>
                          <span className="min-w-0 overflow-hidden">
                            <TagGroup items={sectorFocusTags(row)} maxVisible={1} variant="focus" />
                          </span>
                          <span className="min-w-0 overflow-hidden">
                            <TagGroup items={geoFocusLabels(row)} maxVisible={1} variant="geo" />
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} details for ${row.firm_name}`}
                          onClick={toggleExpanded}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-200"
                        >
                          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                        </button>
                      </div>
                      {expanded ? (
                        <FundWatchExpandPanel row={row} onUnlock={onUnlockClick ?? onNotifyClick} />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {mainTab === "latest_funding" && (
          <>
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wider text-primary">Live intelligence</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#eeeeee]">Latest funding</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#b3b3b3] sm:text-base">
                  Recent company raises and deal headlines—sorted for scan speed.
                </p>
              </div>
            </div>

            <LatestFundingFeed stage="all" sector={null} />
          </>
        )}

        {mainTab === "insights" && <FreshCapitalInsightsTab buckets={insightsHeatmapBuckets} />}
      </div>
    </section>
  );
}
