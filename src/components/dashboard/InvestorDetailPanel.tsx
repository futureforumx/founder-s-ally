import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLatestMyVcRating } from "@/hooks/useLatestMyVcRating";
import { formatMyReviewRateButton } from "@/lib/reviewRateButtonDisplay";
import { cn, safeLower, safeTrim } from "@/lib/utils";
import { resolveInvestorHeroStageFocus } from "@/lib/stageUtils";
import { ReviewSubmissionModal } from "@/components/investor-match/ReviewSubmissionModal";
import { motion, AnimatePresence } from "framer-motion";
import { X, BookmarkPlus, CheckCircle2, Star, MapPin, DollarSign, Users, Briefcase } from "lucide-react";
import { ActivityDashboard } from "./investor-detail/ActivityDashboard";
import { Badge } from "@/components/ui/badge";
import { FirmLogo } from "@/components/ui/firm-logo";
import { InvestorActivity } from "./investor-detail/InvestorActivity";
import { ThesisTabContent } from "./investor-detail/ThesisTabContent";
import { MatchScoreDropdown } from "./investor-detail/InvestorAIInsight";
import { InvestorPartnersTab } from "./investor-detail/InvestorPartnersTab";
import { ConnectionsTab } from "./investor-detail/ConnectionsTab";
import { FeedbackTab } from "./investor-detail/FeedbackTab";
import { PortfolioTab } from "./investor-detail/PortfolioTab";
import { INVESTOR_TABS, type InvestorTab, type InvestorEntry } from "./investor-detail/types";
import { useInvestorEnrich, type EnrichResult } from "@/hooks/useInvestorEnrich";
import { ScoreTilesRow, type TileId } from "./investor-detail/ScoreTilesRow";
import {
  useInvestorProfile,
  useInvestorProfileByName,
  type InvestorPartner,
  type InvestorProfile,
} from "@/hooks/useInvestorProfile";
import { useFirmRecordXUrlSupplement } from "@/hooks/useFirmRecordXUrlSupplement";
import { looksLikeFirmRecordsUuid } from "@/lib/pickFirmXUrl";
import { isMeaninglessDisplayLocation } from "@/lib/locationLineQuality";
import { resolveFirmContactEmailByWebsiteUrl } from "@/lib/firmContactEmailOverrides";
import { getPartnersForFirm, type PartnerPerson } from "./investor-detail/types";
import { Skeleton } from "@/components/ui/skeleton";
import type { VCFirm, VCPerson } from "@/hooks/useVCDirectory";
import { supabase } from "@/integrations/supabase/client";
import { useUserCredits } from "@/hooks/useContactReveal";
import { useInvestorMapping } from "@/hooks/useInvestorMapping";
import { sanitizePersonTitle } from "@/lib/sanitizePersonTitle";
import { investorHeadshotNeedsOffloadedMirror, isBlockedExternalAvatarUrl } from "@/lib/investorAvatarUrl";
import { curatedFirmHqLineForDirectoryName, firmAumDisplayForInvestorPanel } from "@/lib/freshCapitalPublic";
import { resolveElevatorPitchForDisplay } from "@/lib/firmElevatorPitch";
import { clampElevatorPitch } from "@/lib/clampElevatorPitch";
import {
  isFirmStrategyClassification,
  STRATEGY_CLASSIFICATION_DEFINITIONS,
  STRATEGY_CLASSIFICATION_LABELS,
  formatStrategyClassificationLabel,
} from "@/lib/firmStrategyClassifications";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveFirmDisplayLocation } from "@/lib/formatCanonicalHqLine";
import { allOfficeLinesFromLocationsJson, pickHqLineFromLocationsJson } from "@/lib/firmLocationsJson";

interface CompanyContext {
  name?: string;
  sector?: string;
  stage?: string;
  model?: string;
  description?: string;
}

type WebsiteTeamPerson = {
  id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  profile_image_url: string | null;
  bio: string | null;
  location: string | null;
  source_page_url: string;
};

interface InvestorDetailPanelProps {
  investor: InvestorEntry | null;
  companyName?: string;
  companyData?: CompanyContext | null;
  onClose: () => void;
  vcFirm?: VCFirm | null;
  vcPartners?: VCPerson[];
  onSelectPerson?: (person: VCPerson) => void;
  onCloseVCFirm?: () => void;
  initialTab?: InvestorTab;
  /** Canonical `vc_firms.id` for ratings (e.g. deep link from Settings → Activity). */
  vcDirectoryFirmIdHint?: string | null;
  /** `vc_people.id` when opening a partner-level review from Activity. */
  reviewPersonIdHint?: string | null;
  /** When a person modal is layered on top, hide this panel's backdrop to avoid double-darkening. */
  hideBackdrop?: boolean;
  /** After panel opens with an investor, open the review modal once (deep link). */
  openReviewModalOnMount?: boolean;
  onReviewBootstrapConsumed?: () => void;
}

export type { InvestorEntry };

function firstNonEmpty(...values: unknown[]): string | null {
  for (const v of values) {
    const t = safeTrim(v);
    if (t.length > 0) return t;
  }
  return null;
}

/**
 * Map key for merging live / directory / website team rows onto one card.
 * Strips interior single-letter tokens (e.g. middle initials) so "Kelci M. Horan" and "Kelci Horan"
 * share one entry and website headshots attach to the DB partner row.
 */
function partnerTabDedupeKey(name: string): string {
  const words = safeTrim(name).toLowerCase().split(/\s+/).filter(Boolean);
  const n = words.length;
  const kept = words.filter((w, i) => {
    if (i === 0 || i === n - 1) return true;
    return !(w.length === 1 || /^[a-z]\.$/i.test(w));
  });
  return kept.join("").replace(/[^a-z0-9]/g, "");
}

/**
 * Merge avatar fields when combining DB + website crawl rows.
 * Preferring primary-only let a stale LinkedIn/CDN URL from DB win and discard mirrored R2 URLs from
 * the website row — the Investors tab then showed initials after `<img onError>`.
 * Order: secondary (website) first, then primary, deduped — UI still chains via `investorAvatarUrlCandidates`.
 */
function mergedPartnerPortraitFields(
  primary: VCPerson,
  secondary: VCPerson,
): {
  avatar_url: string | null;
  profile_image_url: string | null;
  _extra_avatar_urls?: string[];
} {
  const ordered = [
    secondary.avatar_url,
    secondary.profile_image_url,
    primary.avatar_url,
    primary.profile_image_url,
  ];
  const chain: string[] = [];
  for (const u of ordered) {
    const t = safeTrim(u);
    if (!t || isBlockedExternalAvatarUrl(t)) continue;
    if (!chain.includes(t)) chain.push(t);
  }
  const extra = chain.slice(2);
  return {
    avatar_url: chain[0] ?? null,
    profile_image_url: chain[1] ?? null,
    ...(extra.length ? { _extra_avatar_urls: extra } : {}),
  };
}

function normalizeInvestorNameKey(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

const FIRM_HQ_LOCATION_OVERRIDES: Record<string, string> = {
  "137ventures": "San Francisco, CA",
  "500global": "San Francisco, CA",
};

function resolveFirmHqLocationOverride(...nameCandidates: Array<string | null | undefined>): string | null {
  for (const candidate of nameCandidates) {
    const key = normalizeInvestorNameKey(safeTrim(candidate));
    if (!key) continue;
    const hit = FIRM_HQ_LOCATION_OVERRIDES[key];
    if (hit) return hit;
  }
  return null;
}

/** Same alias expansion as CommunityView `getAliasKeys` — keep card label ↔ DB `firm_name` in sync. */
function firmNameAliasKeySet(normalized: string): Set<string> {
  const out = new Set<string>([normalized]);
  if (normalized.includes("andreessenhorowitz")) out.add("a16z");
  if (normalized === "a16z") out.add("andreessenhorowitz");
  return out;
}

/**
 * When `firm_records.firm_name` differs from the directory card label (e.g. "Andreessen Horowitz" vs "a16z"),
 * we still treat the live row as the same firm so HQ/location from DB applies. If the live row is clearly
 * another firm, skip it and use the directory entry's `location` instead.
 */
function liveFirmRowMatchesDirectorySelection(
  liveFirmName: string | null | undefined,
  directoryDisplayName: string | null | undefined,
): boolean {
  const a = normalizeInvestorNameKey(safeTrim(liveFirmName));
  const b = normalizeInvestorNameKey(safeTrim(directoryDisplayName));
  if (!a || !b) return false;
  if (a === b) return true;
  const keysA = firmNameAliasKeySet(a);
  const keysB = firmNameAliasKeySet(b);
  for (const ka of keysA) {
    if (keysB.has(ka)) return true;
  }
  // e.g. "luxcapital" vs "luxcapitalmanagement" — same brand, different legal suffix in DB
  if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function formatUsdCheckRangeLine(min: number | null, max: number | null): string {
  const fmt = (amount: number) =>
    amount >= 1_000_000
      ? `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`
      : amount >= 1_000
        ? `$${(amount / 1_000).toFixed(0)}K`
        : `$${amount}`;
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (min != null) return fmt(min);
  if (max != null) return fmt(max);
  return "";
}

/** Prefer Supabase `firm_records` + relations over `investor-enrich` (Exa/Gemini) when the row is rich enough. */
function enrichResultFromDbInvestorProfile(
  profile: InvestorProfile | null,
  directoryDisplayName: string,
): EnrichResult | null {
  if (!profile || profile.source !== "live") return null;
  if (!liveFirmRowMatchesDirectorySelection(profile.firm_name, directoryDisplayName)) return null;

  const dealNames = (profile.deals ?? []).map((d) => safeTrim(d.company_name)).filter(Boolean);
  const legacy = (profile.recent_deals ?? []).map((s) => safeTrim(s)).filter(Boolean);
  const recentDeals = [...new Set([...dealNames, ...legacy])].slice(0, 12);

  const thesis = (profile.thesis_verticals ?? []).map((s) => safeTrim(s)).filter(Boolean);
  const desc = safeTrim(profile.description) || safeTrim(profile.sentiment_detail);
  const checkLine = formatUsdCheckRangeLine(profile.min_check_size, profile.max_check_size);
  const geography =
    resolveFirmDisplayLocation({
      hq_city: profile.hq_city,
      hq_state: profile.hq_state,
      hq_country: profile.hq_country,
      legacyLocation: profile.location,
    }) ?? "";

  const hasSubstance =
    recentDeals.length > 0 ||
    thesis.length > 0 ||
    desc.length > 40 ||
    checkLine.length > 0 ||
    safeTrim(profile.preferred_stage).length > 0;

  if (!hasSubstance) return null;

  return {
    profile: {
      firmName: profile.firm_name,
      logoUrl: profile.logo_url ?? "",
      recentDeals,
      currentThesis: thesis.slice(0, 12).join(", "),
      stage: safeTrim(profile.preferred_stage) || "",
      geography,
      typicalCheckSize: checkLine,
      confidenceScore: 0.95,
      source: "local_db",
      lastVerified: safeTrim(profile.last_enriched_at) || new Date().toISOString(),
    },
    tier: 3,
  };
}

/**
 * `firm_records.firm_name` sometimes stores a short brand (e.g. "a16z"). For the investor modal title,
 * prefer `legal_name`, then a longer directory/card label when it still refers to the same firm.
 */
const RECORD_FIRM_NAME_SHORTHAND = new Set([
  "a16z",
  "gv",
  "usv",
  "yc",
  "nea",
]);

const OFFICIAL_FIRM_NAME_BY_SHORTHAND: Record<string, string> = {
  a16z: "Andreessen Horowitz",
  gv: "Google Ventures",
  usv: "Union Square Ventures",
  yc: "Y Combinator",
  nea: "New Enterprise Associates",
};

function resolveOfficialHeroFirmName(args: {
  live: InvestorProfile | null | undefined;
  supplemental: InvestorProfile | null | undefined;
  investorName: string | null | undefined;
  vcFirmName: string | null | undefined;
  effectiveName: string | null | undefined;
}): string {
  const liveRow = args.live?.source === "live" ? args.live : null;
  const record = liveRow ?? args.supplemental ?? null;
  const legal = safeTrim(record?.legal_name);
  if (legal) return legal;
  const recordFirm = safeTrim(record?.firm_name ?? "");
  const fromContext = safeTrim(firstNonEmpty(args.investorName, args.vcFirmName, args.effectiveName) ?? "");
  if (
    recordFirm &&
    fromContext &&
    liveFirmRowMatchesDirectorySelection(recordFirm, fromContext) &&
    RECORD_FIRM_NAME_SHORTHAND.has(recordFirm.toLowerCase()) &&
    (fromContext.includes(" ") || fromContext.length >= recordFirm.length + 8)
  ) {
    return fromContext;
  }
  const resolved = firstNonEmpty(recordFirm, fromContext, safeTrim(args.effectiveName ?? ""), "") ?? "";
  const shorthandKey = safeTrim(resolved).toLowerCase();
  return OFFICIAL_FIRM_NAME_BY_SHORTHAND[shorthandKey] ?? resolved;
}

function investorPartnerToVCPerson(
  p: InvestorPartner,
  firmId: string,
  firmName?: string | null,
  firmWebsiteUrl?: string | null,
  firmLogoUrl?: string | null,
): VCPerson {
  const fullName = String(p.full_name ?? "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    id: p.id,
    full_name: fullName,
    title: sanitizePersonTitle(p.title, fullName),
    firm_id: firmId,
    primary_firm_name: firmName ?? null,
    first_name: p.first_name ?? parts[0] ?? null,
    last_name: p.last_name ?? (parts.length > 1 ? parts.slice(1).join(" ") : null),
    is_active: p.is_active,
    profile_image_url: p.profile_image_url ?? p.avatar_url ?? null,
    avatar_url: p.avatar_url ?? p.profile_image_url ?? null,
    email: p.email ?? null,
    linkedin_url: p.linkedin_url ?? null,
    x_url: p.x_url ?? null,
    website_url: p.website_url ?? null,
    // Firm display fields used by PersonProfileModal when firm prop is unavailable
    _firm_website_url: firmWebsiteUrl ?? null,
    _firm_logo_url: firmLogoUrl ?? null,
    stage_focus: p.stage_focus ?? null,
    sector_focus: p.sector_focus ?? null,
    personal_thesis_tags: p.personal_thesis_tags ?? [],
    background_summary: p.background_summary ?? null,
    education_summary: (p as InvestorPartner & { education_summary?: string | null }).education_summary ?? null,
    bio: p.bio ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    country: p.country ?? null,
  } as VCPerson;
}

function partnerPersonToVCPerson(p: PartnerPerson, firmId: string): VCPerson {
  const fullName = String(p.full_name ?? "").trim();
  return {
    id: p.id,
    full_name: fullName,
    title: sanitizePersonTitle(p.title, fullName),
    firm_id: firmId,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    is_active: p.is_active ?? true,
    profile_image_url: p.profile_image_url ?? null,
    avatar_url: p.avatar_url ?? null,
    email: p.email ?? null,
    linkedin_url: p.linkedin_url ?? null,
    x_url: p.x_url ?? null,
    website_url: p.website_url ?? null,
    bio: p.bio ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    country: p.country ?? null,
  } as VCPerson;
}

function websiteTeamPersonToVCPerson(
  p: WebsiteTeamPerson,
  firmId: string,
  firmName?: string | null,
  firmWebsiteUrl?: string | null,
  firmLogoUrl?: string | null,
): VCPerson {
  const fullName = String(p.full_name ?? "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    id: p.id,
    full_name: fullName,
    title: sanitizePersonTitle(p.title, fullName),
    firm_id: firmId,
    primary_firm_name: firmName ?? null,
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
    is_active: true,
    profile_image_url: p.profile_image_url ?? null,
    avatar_url: p.profile_image_url ?? null,
    email: p.email ?? null,
    linkedin_url: p.linkedin_url ?? null,
    x_url: p.x_url ?? null,
    website_url: p.website_url ?? p.source_page_url ?? null,
    _firm_website_url: firmWebsiteUrl ?? null,
    _firm_logo_url: firmLogoUrl ?? null,
    bio: p.bio ?? null,
    city: p.location ?? null,
  } as VCPerson;
}

function mergePartnerPerson(primary: VCPerson, secondary: VCPerson): VCPerson {
  const portraits = mergedPartnerPortraitFields(primary, secondary);
  return {
    ...secondary,
    ...primary,
    id: primary.id || secondary.id,
    firm_id: primary.firm_id || secondary.firm_id,
    full_name: primary.full_name || secondary.full_name,
    first_name: primary.first_name ?? secondary.first_name ?? null,
    last_name: primary.last_name ?? secondary.last_name ?? null,
    title: primary.title ?? secondary.title ?? null,
    role: primary.role ?? secondary.role ?? null,
    avatar_url: portraits.avatar_url,
    profile_image_url: portraits.profile_image_url,
    ...(portraits._extra_avatar_urls ? { _extra_avatar_urls: portraits._extra_avatar_urls } : {}),
    email: primary.email ?? secondary.email ?? null,
    linkedin_url: primary.linkedin_url ?? secondary.linkedin_url ?? null,
    x_url: primary.x_url ?? secondary.x_url ?? null,
    website_url: primary.website_url ?? secondary.website_url ?? null,
    bio: primary.bio ?? secondary.bio ?? null,
    city: primary.city ?? secondary.city ?? null,
    state: primary.state ?? secondary.state ?? null,
    country: primary.country ?? secondary.country ?? null,
    primary_firm_name: primary.primary_firm_name ?? secondary.primary_firm_name ?? null,
    _firm_website_url: (primary as VCPerson & { _firm_website_url?: string | null })._firm_website_url
      ?? (secondary as VCPerson & { _firm_website_url?: string | null })._firm_website_url
      ?? null,
    _firm_logo_url: (primary as VCPerson & { _firm_logo_url?: string | null })._firm_logo_url
      ?? (secondary as VCPerson & { _firm_logo_url?: string | null })._firm_logo_url
      ?? null,
  } as VCPerson;
}

export function InvestorDetailPanel({
  investor,
  companyName,
  companyData,
  onClose,
  vcFirm,
  vcPartners = [],
  onSelectPerson,
  onCloseVCFirm,
  initialTab,
  hideBackdrop = false,
  vcDirectoryFirmIdHint,
  reviewPersonIdHint,
  openReviewModalOnMount,
  onReviewBootstrapConsumed,
}: InvestorDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<InvestorTab>(initialTab || "Updates");
  const [activeScoreTile, setActiveScoreTile] = useState<TileId | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ratingRefresh, setRatingRefresh] = useState(0);
  /** Shown in header until `useLatestMyVcRating` returns the saved row (or if refetch never succeeds). */
  const [optimisticHeaderRating, setOptimisticHeaderRating] = useState<unknown>(null);
  const bootstrapReviewOpenedRef = useRef(false);

  // Reset tab when initialTab or investor changes
  useEffect(() => {
    setActiveTab(initialTab || "Updates");
  }, [initialTab, investor?.name]);

  useEffect(() => {
    if (!investor) bootstrapReviewOpenedRef.current = false;
  }, [investor]);

  useEffect(() => {
    setActiveScoreTile(null);
    setOptimisticHeaderRating(null);
  }, [investor?.name, vcFirm?.id]);

  const { session, user: authUser } = useAuth();
  const { enrich, cache: enrichCache } = useInvestorEnrich();
  const [enrichedData, setEnrichedData] = useState<EnrichResult | null>(null);
  const [resolvedFirmId, setResolvedFirmId] = useState<string | null>(null);
  const [websitePartners, setWebsitePartners] = useState<WebsiteTeamPerson[]>([]);
  const { data: userCredits } = useUserCredits();
  const isAdmin = userCredits?.tier === "admin";

  // ── Investor mapping — determines which review form to show ──
  const investorName = investor?.name || vcFirm?.name || null;
  const { isMapped: investorIsMappedToProfile, mappingRecordId } = useInvestorMapping(investorName);

  const explicitVcDirId =
    typeof vcDirectoryFirmIdHint === "string" && vcDirectoryFirmIdHint.trim()
      ? vcDirectoryFirmIdHint.trim()
      : null;
  const vcDirectoryFirmId = explicitVcDirId ?? vcFirm?.id ?? null;
  const firmRecordIdFromVcDirectoryQuery = useQuery<string | null>({
    queryKey: ["firm-record-id-from-vc-directory", vcDirectoryFirmId],
    enabled: Boolean(vcDirectoryFirmId),
    staleTime: 60_000,
    queryFn: async () => {
      const prismaId = safeTrim(vcDirectoryFirmId);
      if (!prismaId) return null;
      const { data, error } = await supabase
        .from("firm_records")
        .select("id")
        .eq("prisma_firm_id", prismaId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data as { id: string } | null)?.id ?? null;
    },
  });
  const firmRecordIdFromVcDirectory = firmRecordIdFromVcDirectoryQuery.data ?? null;
  const investorDbIdFromEntry =
    typeof investor?.investorDatabaseId === "string" && investor.investorDatabaseId.trim()
      ? investor.investorDatabaseId.trim()
      : null;
  const investorDbFirmRecordsId =
    investorDbIdFromEntry && looksLikeFirmRecordsUuid(investorDbIdFromEntry)
      ? investorDbIdFromEntry
      : null;
  const preferredLiveFirmRecordId = investorDbFirmRecordsId ?? firmRecordIdFromVcDirectory ?? null;

  // ── Live data hook ──
  const queryClient = useQueryClient();
  const liveByIdQuery = useInvestorProfile(preferredLiveFirmRecordId);
  const liveByNameQuery = useInvestorProfileByName(
    preferredLiveFirmRecordId ? null : (investor?.name || vcFirm?.name || null)
  );
  const liveQuery = preferredLiveFirmRecordId ? liveByIdQuery : liveByNameQuery;
  const liveProfile = liveQuery.data;
  const liveLoading = liveQuery.isLoading;
  const fallbackFirmInvestorsQuery = useQuery<VCPerson[]>({
    queryKey: ["fallback-firm-investors-by-name", safeLower(investor?.name || vcFirm?.name || "")],
    enabled: Boolean(investor?.name || vcFirm?.name),
    staleTime: 60_000,
    queryFn: async () => {
      const targetName = safeTrim(investor?.name || vcFirm?.name);
      if (!targetName) return [];
      const { data: exactFirms, error: exactError } = await supabase
        .from("firm_records")
        .select("id, firm_name, website_url, logo_url")
        .is("deleted_at", null)
        .ilike("firm_name", targetName)
        .limit(8);
      if (exactError) return [];
      const firms = exactFirms?.length
        ? exactFirms
        : (
            await supabase
              .from("firm_records")
              .select("id, firm_name, website_url, logo_url")
              .is("deleted_at", null)
              .ilike("firm_name", `%${targetName}%`)
              .limit(8)
          ).data ?? [];
      if (!firms.length) return [];
      const matchedFirm = firms.find((f) => liveFirmRowMatchesDirectorySelection(f.firm_name, targetName)) ?? firms[0];
      if (!matchedFirm?.id) return [];
      const { data: rows, error: rowError } = await supabase
        .from("firm_investors")
        .select("id, full_name, first_name, last_name, title, is_active, profile_image_url, avatar_url, email, linkedin_url, x_url, website_url, bio, city, state, country")
        .eq("firm_id", matchedFirm.id)
        .is("deleted_at", null)
        .order("full_name");
      if (rowError || !rows?.length) return [];
      return rows
        .filter((row) => safeTrim(row.full_name))
        .map((row) =>
          investorPartnerToVCPerson(
            {
              ...(row as InvestorPartner),
              full_name: safeTrim(row.full_name),
            },
            matchedFirm.id,
            heroName || matchedFirm.firm_name,
            (matchedFirm.website_url as string | null) ?? null,
            (matchedFirm.logo_url as string | null) ?? null,
          ),
        );
    },
  });

  // Synthesize an investor entry from vcFirm when opened directly from omnibox
  const effectiveInvestor: InvestorEntry | null = useMemo(() => {
    if (investor) {
      return {
        ...investor,
        logo_url: firstNonEmpty(investor.logo_url, vcFirm?.logo_url),
        websiteUrl: firstNonEmpty(investor.websiteUrl, vcFirm?.website_url),
      };
    }
    if (!vcFirm) return null;
    return {
      name: vcFirm.name,
      sector: vcFirm.sectors?.filter(Boolean).slice(0, 2).join(", ") || "Generalist",
      stage: (() => { const s = vcFirm.stages?.filter(Boolean); return s?.length ? (s.length === 1 ? s[0] : `${s[0]} – ${s[s.length - 1]}`) : "Multi-stage"; })(),
      description: vcFirm.description || `${vcFirm.name} is an active investment firm.`,
      location: "",
      model: vcFirm.sweet_spot || vcFirm.aum || "",
      initial: vcFirm.name.charAt(0).toUpperCase(),
      matchReason: null,
      category: "investor" as const,
      logo_url: vcFirm.logo_url || null,
      websiteUrl: vcFirm.website_url ?? null,
    };
  }, [investor, vcFirm]);
  const displayName = safeTrim(effectiveInvestor?.name);
  const firmWebsiteUrl = firstNonEmpty(
    liveProfile?.website_url,
    effectiveInvestor?.websiteUrl,
    vcFirm?.website_url,
  );
  /** Live row may lag or have empty string; keep search/grid logo from entry or VC directory. */
  const heroLogo = firstNonEmpty(
    liveProfile?.logo_url,
    effectiveInvestor?.logo_url,
    vcFirm?.logo_url,
  );

  useEffect(() => {
    if (!openReviewModalOnMount || !effectiveInvestor) return;
    if (bootstrapReviewOpenedRef.current) return;
    bootstrapReviewOpenedRef.current = true;
    setReviewOpen(true);
    onReviewBootstrapConsumed?.();
  }, [openReviewModalOnMount, effectiveInvestor, onReviewBootstrapConsumed]);

  useEffect(() => {
    let cancelled = false;
    if (!firmWebsiteUrl) {
      setWebsitePartners([]);
      return;
    }

    // DB already has a solid team — skip HTML crawl + `/api/firm-website-team` on every open.
    if (liveLoading) return;
    if ((liveProfile?.partners?.length ?? 0) >= 3) {
      setWebsitePartners([]);
      return;
    }

    const fetchWebsiteTeam = async (forceRefresh: boolean) => {
      const res = await fetch("/api/firm-website-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: firmWebsiteUrl, forceRefresh }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        people?: WebsiteTeamPerson[];
        teamMemberEstimate?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return {
        people: Array.isArray(data.people) ? data.people : [],
        teamMemberEstimate:
          typeof data.teamMemberEstimate === "number" && Number.isFinite(data.teamMemberEstimate)
            ? data.teamMemberEstimate
            : 0,
      };
    };

    fetchWebsiteTeam(false)
      .then(async (initial) => {
        const undercountedCache =
          initial.people.length <= 2 &&
          initial.teamMemberEstimate >= 4;
        if (!undercountedCache) return initial.people;
        const refreshed = await fetchWebsiteTeam(true);
        return refreshed.people.length >= initial.people.length ? refreshed.people : initial.people;
      })
      .then((people) => {
        if (!cancelled) setWebsitePartners(people);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[InvestorDetailPanel] firm website team lookup failed:", error);
          setWebsitePartners([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [firmWebsiteUrl, liveLoading, liveProfile?.partners?.length]);

  const matchScore = effectiveInvestor?.matchReason ? 92 : Math.floor(Math.random() * 30) + 55;

  /** `liveProfile.id` is only a Supabase `firm_records` row when `source === "live"`. JSON fallback uses MDM domain ids — do not let those override an explicit DB id from Matches. */
  const databaseFirmId =
    liveProfile?.source === "live"
      ? liveProfile.id
      : (investorDbIdFromEntry && looksLikeFirmRecordsUuid(investorDbIdFromEntry)
          ? investorDbIdFromEntry
          : null) ??
        resolvedFirmId ??
        firmRecordIdFromVcDirectory ??
        null;

  /** When name-resolve fell back to JSON, fetch `firm_records` + `firm_recent_deals` via `databaseFirmId`. */
  const firmRecordsUuidForSupplemental =
    liveProfile?.source === "live" ? null : databaseFirmId;
  const supplementalFirmQuery = useInvestorProfile(firmRecordsUuidForSupplemental);
  const dealSizeProfile =
    liveProfile?.source === "live" ? liveProfile : supplementalFirmQuery.data ?? null;

  const heroName = useMemo(
    () =>
      resolveOfficialHeroFirmName({
        live: liveProfile,
        supplemental: dealSizeProfile,
        investorName: investor?.name,
        vcFirmName: vcFirm?.name,
        effectiveName: effectiveInvestor?.name,
      }),
    [liveProfile, dealSizeProfile, investor?.name, vcFirm?.name, effectiveInvestor?.name],
  );

  const resolvedLiveFirmDisplayName = heroName || null;

  const firmRecordXSupplement = useFirmRecordXUrlSupplement(liveProfile ?? undefined, vcFirm ?? undefined, databaseFirmId);
  const effectiveFirmXUrl = useMemo(
    () =>
      safeTrim(liveProfile?.x_url) ||
      safeTrim(vcFirm?.x_url) ||
      safeTrim(firmRecordXSupplement.data) ||
      null,
    [liveProfile?.x_url, vcFirm?.x_url, firmRecordXSupplement.data],
  );
  const resolvedLiveFirmId = useMemo(
    () => (liveProfile?.source === "live" ? liveProfile.id : databaseFirmId ?? null),
    [liveProfile?.source, liveProfile?.id, databaseFirmId],
  );
  /**
   * `vc_ratings.vc_firm_id` must be a directory `vc_firms.id`.
   * When the matched `vcFirm` object is missing (alias / sync edge cases), fall back to the
   * investor card’s UUID (`investorDatabaseId` / `_firmId`) — usually the same directory id.
   */
  const reviewVcFirmId = useMemo(() => {
    const ex = safeTrim(explicitVcDirId);
    if (ex) return ex;
    const vid = safeTrim(vcFirm?.id);
    if (vid) return vid;
    const inv = safeTrim(investor?.investorDatabaseId);
    if (inv && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inv)) return inv;
    return null;
  }, [explicitVcDirId, vcFirm?.id, investor?.investorDatabaseId]);
  const reviewVcPersonId =
    typeof reviewPersonIdHint === "string" && reviewPersonIdHint.trim()
      ? reviewPersonIdHint.trim()
      : null;
  const ratingUserId = authUser?.id ?? session?.user?.id;
  const ratingFirmLabel = safeTrim(heroName || displayName) || null;
  const {
    starRatings: myFirmRatingJson,
    createdAt: myFirmRatingCreatedAt,
    loading: myFirmRatingLoading,
  } = useLatestMyVcRating(
    ratingUserId,
    reviewVcFirmId,
    reviewVcPersonId,
    ratingRefresh,
    ratingFirmLabel,
  );

  useEffect(() => {
    if (myFirmRatingJson != null && !myFirmRatingLoading) setOptimisticHeaderRating(null);
  }, [myFirmRatingJson, myFirmRatingLoading]);

  const headerRatingJson = optimisticHeaderRating ?? myFirmRatingJson;
  const myFirmRateDisplay = useMemo(
    () => formatMyReviewRateButton(headerRatingJson),
    [headerRatingJson],
  );
  const mergedPartners = useMemo((): VCPerson[] => {
    const firmKey = databaseFirmId ?? explicitVcDirId ?? vcFirm?.id ?? "";
    const byName = new Map<string, VCPerson>();

    // 1. DB people load first as the authoritative base
    for (const p of liveProfile?.partners ?? []) {
      const key = partnerTabDedupeKey(p.full_name);
      const incoming = investorPartnerToVCPerson(
        p,
        firmKey || p.id,
        heroName || liveProfile?.firm_name,
        liveProfile?.website_url,
        liveProfile?.logo_url,
      );
      byName.set(key, byName.has(key) ? mergePartnerPerson(byName.get(key)!, incoming) : incoming);
    }
    for (const p of vcPartners) {
      const k = partnerTabDedupeKey(p.full_name);
      byName.set(k, byName.has(k) ? mergePartnerPerson(byName.get(k)!, p) : p);
    }

    // 2. If name-resolved live query missed people, pull direct firm_investors by firm name.
    for (const p of fallbackFirmInvestorsQuery.data ?? []) {
      const k = partnerTabDedupeKey(p.full_name);
      byName.set(k, byName.has(k) ? mergePartnerPerson(byName.get(k)!, p) : p);
    }

    // 3. Static partner fallback if still empty
    if (byName.size === 0 && effectiveInvestor?.name) {
      for (const p of getPartnersForFirm(String(effectiveInvestor.name ?? ""))) {
        const k = partnerTabDedupeKey(p.full_name);
        const incoming = partnerPersonToVCPerson(p, firmKey || vcFirm?.id || p.id);
        byName.set(k, byName.has(k) ? mergePartnerPerson(byName.get(k)!, incoming) : incoming);
      }
    }

    // 4. Website people ENRICH existing records or ADD new ones — never filter
    for (const p of websitePartners) {
      const normalized = websiteTeamPersonToVCPerson(
        p,
        firmKey || p.id,
        heroName || liveProfile?.firm_name || effectiveInvestor?.name || vcFirm?.name || null,
        firmWebsiteUrl,
        heroLogo,
      );
      const key = partnerTabDedupeKey(normalized.full_name);
      if (byName.has(key)) {
        // DB person wins for most fields; website fills in missing ones (e.g. profile_image_url)
        byName.set(key, mergePartnerPerson(byName.get(key)!, normalized));
      } else {
        byName.set(key, normalized);
      }
    }

    const SENIORITY_ORDER: Record<string, number> = {
      managing_partner: 0, c_suite: 0, general_partner: 1, partner: 2,
      venture_partner: 3, principal: 4, associate: 5, analyst: 6, scout: 7, other: 8,
    };
    function seniorityRank(p: VCPerson): number {
      const s = safeTrim(p.seniority ?? p.investor_type).toLowerCase().replace(/\s+/g, "_");
      return SENIORITY_ORDER[s] ?? 9;
    }
    const ORG_NAME_RE = /\b(capital|ventures?|fund|funds|management|investments|holdings|advisors|advisory|partnership|associates?|technologies|labs|innovation|foundation|trust)\b/i;
    function looksLikeOrgName(name: string): boolean {
      const n = safeTrim(name);
      if (ORG_NAME_RE.test(n)) return true;
      const words = n.split(/\s+/).filter(Boolean);
      // Single-word entries are probably not people
      if (words.length < 2) return true;
      // More than 5 words is probably a sentence fragment, not a name
      if (words.length > 5) return true;
      return false;
    }
    return Array.from(byName.values())
      .filter((p) => {
        const name = safeTrim(p.full_name);
        if (!name) return false;
        // Keep people even when upstream `is_active` flags are stale; only drop obvious org labels.
        return !looksLikeOrgName(name);
      })
      .sort((a, b) => seniorityRank(a) - seniorityRank(b) || a.full_name.localeCompare(b.full_name));
  }, [
    websitePartners,
    liveProfile?.partners,
    liveProfile?.firm_name,
    heroName,
    liveProfile?.website_url,
    liveProfile?.logo_url,
    liveProfile?.id,
    vcPartners,
    fallbackFirmInvestorsQuery.data,
    databaseFirmId,
    explicitVcDirId,
    vcFirm?.id,
    vcFirm?.name,
    effectiveInvestor?.name,
    firmWebsiteUrl,
    heroLogo,
  ]);

  const headshotMirrorFirmIdRef = useRef<string | null>(null);

  useEffect(() => {
    const firmId = databaseFirmId;
    if (!firmId || !looksLikeFirmRecordsUuid(firmId)) return;
    if (mergedPartners.length === 0) return;
    if (headshotMirrorFirmIdRef.current === firmId) return;
    const dbPartners = liveProfile?.partners ?? [];
    if (dbPartners.length > 0 && !dbPartners.some((p) => investorHeadshotNeedsOffloadedMirror(p))) {
      headshotMirrorFirmIdRef.current = firmId;
      return;
    }
    headshotMirrorFirmIdRef.current = firmId;

    void (async () => {
      try {
        const res = await fetch("/api/mirror-firm-investor-headshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firmRecordId: firmId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          mirrored?: number;
          configured?: boolean;
        };
        if (res.ok && data.configured !== false && (data.mirrored ?? 0) > 0) {
          await queryClient.invalidateQueries({ queryKey: ["investor-profile", firmId] });
          const n = investor?.name ?? vcFirm?.name;
          if (n) {
            await queryClient.invalidateQueries({ queryKey: ["investor-profile-name", safeLower(n)] });
          }
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, [databaseFirmId, mergedPartners.length, liveProfile?.partners, queryClient, investor?.name, vcFirm?.name]);

  const pitchEnsureFirmIdRef = useRef<string | null>(null);

  useEffect(() => {
    const firmId = databaseFirmId;
    if (!firmId || !looksLikeFirmRecordsUuid(firmId)) return;
    if (liveLoading || !liveProfile || liveProfile.source !== "live") return;
    if (safeTrim(liveProfile.elevator_pitch).length >= 15) {
      pitchEnsureFirmIdRef.current = firmId;
      return;
    }
    if (pitchEnsureFirmIdRef.current === firmId) return;
    pitchEnsureFirmIdRef.current = firmId;

    void (async () => {
      try {
        const res = await fetch("/api/ensure-firm-elevator-pitch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firmRecordId: firmId }),
        });
        const data = (await res.json().catch(() => ({}))) as { updated?: boolean };
        if (res.ok && data.updated) {
          await queryClient.invalidateQueries({ queryKey: ["investor-profile", firmId] });
          const n = investor?.name ?? vcFirm?.name;
          if (n) {
            await queryClient.invalidateQueries({ queryKey: ["investor-profile-name", safeLower(n)] });
          }
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, [
    databaseFirmId,
    liveLoading,
    liveProfile?.source,
    liveProfile?.id,
    liveProfile?.elevator_pitch,
    queryClient,
    investor?.name,
    vcFirm?.name,
  ]);

  const partnerNamesLower = useMemo(
    () => new Set(mergedPartners.map((p) => safeTrim(p.full_name).toLowerCase())),
    [mergedPartners]
  );

  useEffect(() => {
    if (!displayName) {
      setEnrichedData(null);
      return;
    }

    const expectLiveRow = Boolean(
      preferredLiveFirmRecordId || firmRecordIdFromVcDirectory || investor?.name || vcFirm?.name,
    );
    if (!liveLoading) {
      const fromDb = enrichResultFromDbInvestorProfile(liveProfile ?? null, displayName);
      if (fromDb) {
        setEnrichedData(fromDb);
        return;
      }
    } else if (expectLiveRow) {
      setEnrichedData(null);
      return;
    }

    const key = displayName.toLowerCase();
    if (enrichCache[key]) {
      setEnrichedData(enrichCache[key]);
      return;
    }
    let cancelled = false;
    enrich(displayName).then((result) => {
      if (!cancelled) setEnrichedData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [
    displayName,
    enrich,
    enrichCache,
    firmRecordIdFromVcDirectory,
    investor?.name,
    liveLoading,
    liveProfile,
    preferredLiveFirmRecordId,
    vcFirm?.name,
  ]);

  // Track 'viewed' interaction for collaborative filtering
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!displayName || !session?.user?.id) return;
    // Only track once per panel open (avoid re-tracking on re-renders)
    if (viewedRef.current === displayName) return;
    viewedRef.current = displayName;

    (async () => {
      // Use live profile ID if available, else resolve by name
      let firmId =
        (liveProfile?.source === "live" ? liveProfile.id : null) ??
        databaseFirmId ??
        firmRecordIdFromVcDirectory;
      if (!firmId) {
        const { data: firms } = await supabase
          .from("firm_records")
          .select("id")
          .ilike("firm_name", displayName)
          .is("deleted_at", null)
          .limit(1);
        firmId = firms?.[0]?.id;
      }
      if (!firmId) {
        const { data: firms } = await supabase
          .from("firm_records")
          .select("id")
          .ilike("firm_name", `%${displayName}%`)
          .is("deleted_at", null)
          .limit(1);
        firmId = firms?.[0]?.id;
      }
      if (!firmId) return;
      setResolvedFirmId(firmId);

      // Upsert a 'viewed' interaction (idempotent per founder+firm+action)
      await supabase
        .from("founder_vc_interactions")
        .upsert(
          { founder_id: session.user.id, firm_id: firmId, action_type: "viewed" },
          { onConflict: "founder_id,firm_id,action_type" }
        );
    })();
  }, [databaseFirmId, displayName, firmRecordIdFromVcDirectory, liveProfile?.id, liveProfile?.source, session?.user?.id]);

  // Reset viewed ref when panel closes
  useEffect(() => {
    if (!effectiveInvestor) viewedRef.current = null;
  }, [effectiveInvestor]);

  const investorContext = useMemo(() => {
    if (!effectiveInvestor) return null;
    const ep = enrichedData?.profile;
    return {
      name: effectiveInvestor.name,
      description: effectiveInvestor.description,
      stage: ep?.stage || effectiveInvestor.stage,
      sector: effectiveInvestor.sector,
      checkSize: ep?.typicalCheckSize || effectiveInvestor.model,
      recentDeals: ep?.recentDeals?.join(", ") || "",
      currentThesis: ep?.currentThesis || "",
      geography: ep?.geography || "",
      source: ep?.source || "",
    };
  }, [effectiveInvestor, enrichedData]);

  // Prefer live profile HQ when the row matches this panel; if DB HQ/location is still empty, keep the
  // Suggested/Trending card line (`effectiveInvestor.location`) so rails and modal stay consistent.
  /** Connect tab: HQ from matched `firm_records` (live or supplemental `dealSizeProfile`), then enrich/geo. */
  const connectLocationFromRecords = useMemo(() => {
    const directoryName = investor?.name ?? vcFirm?.name ?? null;
    const directorySeed =
      safeTrim(effectiveInvestor?.location).length > 0
        ? safeTrim(effectiveInvestor?.location)
        : null;

    const enrichGeo = safeTrim(enrichedData?.profile?.geography);

    const rawLive = liveProfile?.source === "live" ? liveProfile : null;
    const matchedLive =
      Boolean(rawLive) &&
      Boolean(directoryName) &&
      liveFirmRowMatchesDirectorySelection(rawLive.firm_name, directoryName);
    const profile = matchedLive ? rawLive : null;
    const locationsHintLive = profile ? pickHqLineFromLocationsJson(profile.locations) : null;

    const liveResolved = profile
      ? resolveFirmDisplayLocation({
          hq_city: profile.hq_city,
          hq_state: profile.hq_state,
          hq_country: profile.hq_country,
          legacyLocation: profile.location,
        })
      : null;

    const deal = dealSizeProfile;
    const matchedDeal =
      Boolean(deal) &&
      Boolean(directoryName) &&
      liveFirmRowMatchesDirectorySelection(deal.firm_name, directoryName);
    const locationsHintDeal = matchedDeal && deal ? pickHqLineFromLocationsJson(deal.locations) : null;
    const dealResolved = matchedDeal
      ? resolveFirmDisplayLocation({
          hq_city: deal.hq_city,
          hq_state: deal.hq_state,
          hq_country: deal.hq_country,
          legacyLocation: deal.location,
        })
      : null;

    if (matchedLive && profile) {
      return firstNonEmpty(
        liveResolved,
        locationsHintLive,
        profile.address,
        directorySeed,
        enrichGeo,
        matchedDeal ? dealResolved : null,
        matchedDeal ? locationsHintDeal : null,
        matchedDeal && deal ? deal.address : null,
      );
    }

    if (matchedDeal && deal) {
      return firstNonEmpty(dealResolved, locationsHintDeal, deal.address, directorySeed, enrichGeo);
    }

    // Name mismatch or no live row yet: never show another firm's HQ over the grid/rail seed line.
    if (directorySeed) return directorySeed;
    return firstNonEmpty(enrichGeo);
  }, [
    liveProfile,
    dealSizeProfile,
    investor?.name,
    vcFirm?.name,
    effectiveInvestor?.location,
    enrichedData?.profile?.geography,
    liveProfile?.hq_city,
    liveProfile?.hq_state,
    liveProfile?.hq_country,
    liveProfile?.location,
    liveProfile?.address,
    liveProfile?.firm_name,
    liveProfile?.locations,
    dealSizeProfile?.firm_name,
    dealSizeProfile?.hq_city,
    dealSizeProfile?.hq_state,
    dealSizeProfile?.hq_country,
    dealSizeProfile?.location,
    dealSizeProfile?.address,
    dealSizeProfile?.locations,
  ]);

  const [websiteHqLine, setWebsiteHqLine] = useState<string | null>(null);

  useEffect(() => {
    setWebsiteHqLine(null);
  }, [firmWebsiteUrl, connectLocationFromRecords]);

  useEffect(() => {
    const site = safeTrim(firmWebsiteUrl);
    if (!site) return;
    const dbLine = safeTrim(connectLocationFromRecords);
    if (dbLine && !isMeaninglessDisplayLocation(dbLine)) return;

    let cancelled = false;
    (async () => {
      try {
        let firmRecordId: string | undefined;
        for (const id of [
          databaseFirmId,
          liveProfile?.source === "live" ? liveProfile.id : null,
          firmRecordIdFromVcDirectory,
        ]) {
          if (id && looksLikeFirmRecordsUuid(String(id))) {
            firmRecordId = String(id);
            break;
          }
        }

        const res = await fetch("/api/firm-website-hq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firmWebsiteUrl: site, ...(firmRecordId ? { firmRecordId } : {}) }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          hqLine?: string | null;
          persisted?: boolean;
        };
        const line = safeTrim(data?.hqLine);
        if (!cancelled && line) setWebsiteHqLine(line);
        if (!cancelled && data.persisted) {
          if (databaseFirmId) {
            await queryClient.invalidateQueries({ queryKey: ["investor-profile", databaseFirmId] });
          }
          const n = investor?.name ?? vcFirm?.name;
          if (n) {
            await queryClient.invalidateQueries({ queryKey: ["investor-profile-name", safeLower(n)] });
          }
          await queryClient.invalidateQueries({ queryKey: ["investor-directory"] });
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    firmWebsiteUrl,
    connectLocationFromRecords,
    databaseFirmId,
    firmRecordIdFromVcDirectory,
    liveProfile?.source,
    liveProfile?.id,
    queryClient,
    investor?.name,
    vcFirm?.name,
  ]);

  const connectLocation = useMemo(() => {
    const dbLine = safeTrim(connectLocationFromRecords);
    if (dbLine && !isMeaninglessDisplayLocation(dbLine)) return dbLine;
    const fallback = firstNonEmpty(websiteHqLine, dbLine);
    if (fallback && !isMeaninglessDisplayLocation(fallback)) return fallback;
    const freshCapitalAligned = curatedFirmHqLineForDirectoryName(
      heroName,
      investor?.name,
      vcFirm?.name,
      effectiveInvestor?.name,
      liveProfile?.firm_name,
      dealSizeProfile?.firm_name,
    );
    if (freshCapitalAligned) return freshCapitalAligned;
    return resolveFirmHqLocationOverride(
      heroName,
      investor?.name,
      vcFirm?.name,
      effectiveInvestor?.name,
      liveProfile?.firm_name,
      dealSizeProfile?.firm_name,
    );
  }, [
    connectLocationFromRecords,
    websiteHqLine,
    heroName,
    investor?.name,
    vcFirm?.name,
    effectiveInvestor?.name,
    liveProfile?.firm_name,
    dealSizeProfile?.firm_name,
  ]);

  const locationsForTooltip = useMemo(() => {
    const dir = investor?.name ?? vcFirm?.name ?? null;
    const rawLive = liveProfile?.source === "live" ? liveProfile : null;
    const matchedLiveRow =
      Boolean(rawLive) &&
      Boolean(dir) &&
      liveFirmRowMatchesDirectorySelection(rawLive.firm_name, dir);
    if (matchedLiveRow) return rawLive!.locations;
    const deal = dealSizeProfile;
    const matchedDealRow =
      Boolean(deal) &&
      Boolean(dir) &&
      liveFirmRowMatchesDirectorySelection(deal.firm_name, dir);
    if (matchedDealRow) return deal!.locations;
    return null;
  }, [liveProfile, dealSizeProfile, investor?.name, vcFirm?.name]);

  const locationDetailTitle = useMemo(() => {
    const all = allOfficeLinesFromLocationsJson(locationsForTooltip);
    if (all.length > 1) return all.join("\n");
    if (all.length === 1) return all[0];
    return connectLocation ?? undefined;
  }, [locationsForTooltip, connectLocation]);

  const heroFirmNameForAum = firstNonEmpty(liveProfile?.firm_name, vcFirm?.name, effectiveInvestor?.name);
  const heroAumDisplay = useMemo(
    () => firmAumDisplayForInvestorPanel(heroFirmNameForAum, firstNonEmpty(liveProfile?.aum, vcFirm?.aum)),
    [heroFirmNameForAum, liveProfile?.aum, vcFirm?.aum],
  );
  const heroInvestmentsTotal =
    typeof dealSizeProfile?.deals?.length === "number"
      ? dealSizeProfile.deals.length
      : typeof enrichedData?.profile?.recentDeals?.length === "number"
        ? enrichedData.profile.recentDeals.length
        : null;

  const connectWebsiteUrl =
    safeTrim(liveProfile?.website_url) ||
    safeTrim(vcFirm?.website_url) ||
    safeTrim(effectiveInvestor?.websiteUrl) ||
    null;
  const connectEmailFromRecord =
    (liveProfile?.source === "live" && safeTrim(liveProfile.email) ? safeTrim(liveProfile.email) : null) ||
    resolveFirmContactEmailByWebsiteUrl(connectWebsiteUrl);
  const connectLinkedInUrl =
    liveProfile?.source === "live" && safeTrim(liveProfile.linkedin_url)
      ? safeTrim(liveProfile.linkedin_url)
      : null;
  const connectXUrl = effectiveFirmXUrl;
  const connectFacebookUrl =
    liveProfile?.source === "live" && safeTrim(liveProfile.facebook_url)
      ? safeTrim(liveProfile.facebook_url)
      : null;
  const connectInstagramUrl =
    liveProfile?.source === "live" && safeTrim(liveProfile.instagram_url)
      ? safeTrim(liveProfile.instagram_url)
      : null;
  const connectYoutubeUrl =
    liveProfile?.source === "live" && safeTrim(liveProfile.youtube_url)
      ? safeTrim(liveProfile.youtube_url)
      : null;
  const connectCrunchbaseUrl = firstNonEmpty(
    dealSizeProfile?.crunchbase_url,
    liveProfile?.crunchbase_url,
  );

  /**
   * Prefer the same list the Investors tab shows (`mergedPartners`) so the number matches the UI.
   * When that list is still empty, fall back to `firm_records.total_headcount`.
   */
  const { heroHeadcount, heroHeadcountFromWebsite } = useMemo(() => {
    const rawDb = dealSizeProfile?.total_headcount;
    const dbHeadcount =
      typeof rawDb === "number" && Number.isFinite(rawDb) && rawDb > 0 ? rawDb : null;
    const mergedCount = mergedPartners.length;
    const heroHeadcount = mergedCount > 0 ? mergedCount : dbHeadcount;
    const heroHeadcountFromWebsite =
      dbHeadcount == null ? mergedCount > 0 : mergedCount > (dbHeadcount ?? 0);
    return { heroHeadcount, heroHeadcountFromWebsite };
  }, [dealSizeProfile?.total_headcount, mergedPartners]);
  const heroDataSource: "live" | "verified" = liveProfile?.source === "live" ? "live" : enrichedData ? "live" : "verified";
  const heroLastSynced = liveProfile?.last_enriched_at
    ? new Date(liveProfile.last_enriched_at)
    : enrichedData?.profile?.lastVerified
      ? new Date(enrichedData.profile.lastVerified)
      : null;
  const heroSectorFocus =
    liveProfile?.firm_type ??
    liveProfile?.lead_or_follow ??
    vcFirm?.sectors?.join(", ") ??
    effectiveInvestor?.sector ??
    "-";
  const heroStageFocus = useMemo(
    () =>
      resolveInvestorHeroStageFocus({
        preferredStage: liveProfile?.preferred_stage,
        directoryStages: vcFirm?.stages ?? null,
        deals: dealSizeProfile?.deals ?? null,
        fallbackStage: effectiveInvestor?.stage ?? null,
      }),
    [
      liveProfile?.preferred_stage,
      vcFirm?.stages,
      dealSizeProfile?.deals,
      effectiveInvestor?.stage,
    ],
  );

  const heroElevatorPitch = useMemo(() => {
    if (liveProfile?.source === "live") {
      const fromDb = resolveElevatorPitchForDisplay({
        elevator_pitch: liveProfile.elevator_pitch,
        description: liveProfile.description,
        sentiment_detail: liveProfile.sentiment_detail,
        firm_name: liveProfile.firm_name,
        thesis_verticals: liveProfile.thesis_verticals,
        stage_focus: liveProfile.stage_focus,
        preferred_stage: liveProfile.preferred_stage,
        hq_city: liveProfile.hq_city,
        hq_state: liveProfile.hq_state,
        hq_country: liveProfile.hq_country,
        entity_type: null,
        min_check_size: liveProfile.min_check_size,
        max_check_size: liveProfile.max_check_size,
      });
      if (fromDb) return fromDb;
    }
    const fallback = safeTrim(effectiveInvestor?.description);
    return fallback ? clampElevatorPitch(fallback) : null;
  }, [
    liveProfile?.source,
    liveProfile?.elevator_pitch,
    liveProfile?.description,
    liveProfile?.sentiment_detail,
    liveProfile?.firm_name,
    liveProfile?.thesis_verticals,
    liveProfile?.stage_focus,
    liveProfile?.preferred_stage,
    liveProfile?.hq_city,
    liveProfile?.hq_state,
    liveProfile?.hq_country,
    liveProfile?.firm_type,
    liveProfile?.min_check_size,
    liveProfile?.max_check_size,
    effectiveInvestor?.description,
  ]);

  const metaFacts = [
    { label: "AUM", value: heroAumDisplay ?? "—" },
    { label: "Sweet Spot", value: vcFirm?.sweet_spot || effectiveInvestor?.model || "$1M–$10M" },
    {
      label: "Team",
      value: heroHeadcount
        ? `${heroHeadcountFromWebsite ? "~" : ""}${heroHeadcount} people`
        : "—",
    },
  ];

  const handleClose = () => {
    onClose();
    onCloseVCFirm?.();
  };

  return (
    <AnimatePresence>
      {effectiveInvestor && (
        <>
          <motion.div
            key="investor-backdrop"
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: hideBackdrop ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ pointerEvents: hideBackdrop ? "none" : "auto" }}
            onClick={handleClose}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="investor-modal"
              className="pointer-events-auto max-w-6xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[85vh] flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* Header */}
              <div className="shrink-0 border-b border-border/40 relative overflow-hidden">
                {/* Mesh gradient substrate — gives glass tiles something to bleed through */}
                <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
                  <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-violet-500/[0.07] blur-3xl" />
                  <div className="absolute -top-8 left-1/3 w-56 h-56 rounded-full bg-sky-500/[0.07] blur-3xl" />
                  <div className="absolute -top-8 right-0 w-64 h-64 rounded-full bg-emerald-500/[0.06] blur-3xl" />
                </div>
                {/* Identity + Scores + Actions row */}
                <div className="relative z-10 flex items-start gap-6 px-8 pt-6 pb-3">

                  {/* Left: Identity block */}
                  <div className="flex min-w-0 flex-[1_1_0%] items-start gap-3.5">
                    {liveLoading ? (
                      <Skeleton className="h-[86px] w-[86px] rounded-2xl shrink-0" />
                    ) : (
                      <FirmLogo
                        firmName={heroName}
                        logoUrl={heroLogo}
                        websiteUrl={connectWebsiteUrl}
                        size="lg"
                        className="h-[86px] w-[86px] rounded-2xl shrink-0 ring-1 ring-border/20"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      {liveLoading ? (
                        <>
                          <Skeleton className="h-[26px] w-44 rounded mb-1.5" />
                          <Skeleton className="h-3.5 w-60 rounded mb-3" />
                          <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-3.5 w-[88px] rounded" />
                            <Skeleton className="h-3.5 w-[72px] rounded" />
                            <Skeleton className="h-3.5 w-[76px] rounded" />
                            <Skeleton className="h-3.5 w-[104px] rounded" />
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Name + verified */}
                          <div className="flex items-center gap-1.5 mb-1">
                            <h2 className="text-[21px] font-semibold tracking-[-0.4px] text-foreground truncate leading-tight">
                              {heroName}
                            </h2>
                            <CheckCircle2 className="h-[15px] w-[15px] shrink-0 text-accent fill-accent/15 mb-0.5" />
                          </div>

                          {/* Elevator pitch (≤200 chars; persisted on `firm_records.elevator_pitch` when generated) */}
                          {heroElevatorPitch && (
                            <p
                              className="text-[12px] text-muted-foreground/60 leading-snug mb-2.5 max-w-xl line-clamp-3"
                              title={heroElevatorPitch}
                            >
                              {heroElevatorPitch}
                            </p>
                          )}

                          {/* Meta — one row; hairline dividers + padding read cleaner than middots */}
                          <div
                            className={cn(
                              "flex min-w-0 flex-nowrap items-center gap-0 overflow-hidden text-[10px] leading-snug text-foreground/70 sm:text-[11px]",
                              !heroElevatorPitch && "mt-2",
                            )}
                          >
                            <div
                              role="group"
                              className="flex min-w-0 min-h-[1.125rem] max-w-[48%] items-center gap-1.5 overflow-hidden pr-2"
                              aria-label={`Location: ${connectLocation ?? "unknown"}`}
                            >
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span
                                className="min-w-0 truncate font-medium text-foreground/85"
                                title={locationDetailTitle}
                              >
                                {connectLocation ?? "—"}
                              </span>
                            </div>
                            <span
                              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-border/50 pl-3"
                              title="Assets under management"
                              aria-label={`AUM: ${heroAumDisplay ?? "unknown"}`}
                            >
                              <DollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="font-medium text-foreground/80">{heroAumDisplay ?? "—"}</span>
                            </span>
                            <span
                              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-border/50 pl-3"
                              title={
                                heroHeadcountFromWebsite
                                  ? "Matches the Investors list (directory + firm website)"
                                  : "Team headcount"
                              }
                              aria-label={`Headcount: ${heroHeadcount != null ? String(heroHeadcount) : "unknown"}`}
                            >
                              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="font-medium text-foreground/80">
                                {heroHeadcount != null
                                  ? `${heroHeadcountFromWebsite ? "~" : ""}${heroHeadcount}`
                                  : "—"}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab("Portfolio");
                              }}
                              title="Open Portfolio tab — total tracked investments (recent deals)"
                              aria-label={
                                heroInvestmentsTotal != null
                                  ? `Open Portfolio: ${heroInvestmentsTotal} total investments`
                                  : "Open Portfolio: total investments"
                              }
                              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-border/50 pl-3 text-left transition-colors [-webkit-tap-highlight-color:transparent] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                            >
                              <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="font-medium text-foreground/80 tabular-nums underline-offset-2 decoration-border/60 hover:underline">
                                {heroInvestmentsTotal != null ? heroInvestmentsTotal : "—"}
                              </span>
                            </button>
                          </div>

                          {(() => {
                            const strategies = liveProfile?.strategy_classifications ?? [];
                            if (strategies.length === 0) return null;
                            return (
                              <TooltipProvider delayDuration={200}>
                                <div className="flex flex-wrap gap-1.5 mt-2.5 max-w-lg">
                                  {strategies.map((key) => {
                                    const label = isFirmStrategyClassification(key)
                                      ? STRATEGY_CLASSIFICATION_LABELS[key]
                                      : formatStrategyClassificationLabel(key);
                                    const definition = isFirmStrategyClassification(key)
                                      ? STRATEGY_CLASSIFICATION_DEFINITIONS[key]
                                      : "Strategy classification.";
                                    return (
                                      <Tooltip key={key}>
                                        <TooltipTrigger asChild>
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] font-medium px-2 py-0 h-5 border-border/60 text-foreground/80 cursor-default"
                                          >
                                            {label}
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-sm text-xs leading-snug">
                                          {definition}
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                </div>
                              </TooltipProvider>
                            );
                          })()}

                        </>
                      )}
                    </div>
                  </div>

                  {/* Middle: Score strip */}
                  <div className="min-w-0 flex-[0_1_420px]">
                    <ScoreTilesRow
                      matchScore={matchScore}
                      firmName={heroName}
                      companyContext={companyData}
                      investorContext={investorContext}
                      activeTileId={activeScoreTile}
                      onActiveTileChange={setActiveScoreTile}
                      showBreakdown={false}
                    />
                  </div>

                  {/* Right: Actions + data provenance */}
                  <div className="flex w-[230px] shrink-0 flex-col items-end gap-2.5">
                    <div className="flex items-center gap-1.5">
                      {/* Rate */}
                      {myFirmRateDisplay ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReviewOpen(true);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-xl px-3 py-[9px] text-[13px] font-semibold leading-none transition-colors",
                            myFirmRateDisplay.className,
                          )}
                          aria-label={`Your rating: ${myFirmRateDisplay.label}. ${myFirmRateDisplay.ariaDetail}. Click to view or edit your review.`}
                        >
                          <Star className="h-3.5 w-3.5 shrink-0 fill-current" />
                          {myFirmRateDisplay.label}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setReviewOpen(true); }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-warning/35 bg-warning/10 px-3 py-[9px] text-[13px] font-medium text-foreground hover:bg-warning/15 transition-colors"
                          aria-label="Rate this firm"
                        >
                          <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning animate-pulse [animation-duration:2.6s] [animation-timing-function:ease-in-out]" />
                          Rate
                        </button>
                      )}
                      {/* Track — primary */}
                      <button className="inline-flex items-center gap-1.5 rounded-xl bg-foreground text-background px-4 py-[9px] text-[13px] font-semibold hover:bg-foreground/90 transition-colors shadow-sm">
                        <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
                        Track
                      </button>
                      {/* Close */}
                      <button
                        onClick={handleClose}
                        className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-secondary/60 transition-colors ml-0.5"
                      >
                        <X className="h-[14px] w-[14px]" />
                      </button>
                    </div>
                    <div className="w-full space-y-1 text-right">
                      <p className="text-[10px] text-muted-foreground/90 truncate">
                        <span className="font-medium text-foreground/75">Sector:</span>{" "}
                        {heroSectorFocus}
                      </p>
                      <p className="text-[10px] text-muted-foreground/90 truncate">
                        <span className="font-medium text-foreground/75">Stage:</span>{" "}
                        {heroStageFocus}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 px-8 pb-2">
                  <ScoreTilesRow
                    matchScore={matchScore}
                    firmName={heroName}
                    companyContext={companyData}
                    investorContext={investorContext}
                    activeTileId={activeScoreTile}
                    onActiveTileChange={setActiveScoreTile}
                    showTiles={false}
                  />
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-8 py-6 space-y-5">
                  {/* Tabs */}
                  <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/35 p-1 shadow-sm backdrop-blur-sm">
                    {INVESTOR_TABS.map((tab) => {
                      const isActive = activeTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all duration-200 ${
                            isActive
                              ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                              : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
                          }`}
                        >
                          {tab}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab Content */}
                  <AnimatePresence mode="wait">
                    {activeTab === "Updates" && (
                      <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-5">
                        <InvestorActivity
                          firmName={effectiveInvestor.name}
                          firmId={databaseFirmId ?? explicitVcDirId ?? vcFirm?.id ?? undefined}
                          xUrl={effectiveFirmXUrl}
                          firmLogoUrl={heroLogo}
                          firmWebsiteUrl={firmWebsiteUrl}
                        />
                      </motion.div>
                    )}

                    {activeTab === "Activity" && (
                      <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <ActivityDashboard
                          firmName={effectiveInvestor.name}
                          firmDisplayName={resolvedLiveFirmDisplayName ?? effectiveInvestor.name}
                          firmRecordsId={resolvedLiveFirmId ?? databaseFirmId ?? firmRecordIdFromVcDirectory}
                          databaseFirmRecordId={databaseFirmId ?? firmRecordIdFromVcDirectory}
                          vcDirectoryFirmId={vcDirectoryFirmId}
                          companySector={companyData?.sector || undefined}
                          deals={dealSizeProfile?.deals ?? undefined}
                          fallbackAum={firmAumDisplayForInvestorPanel(
                            heroFirmNameForAum,
                            firstNonEmpty(dealSizeProfile?.aum, vcFirm?.aum, liveProfile?.aum),
                          )}
                          fallbackIsActivelyDeploying={dealSizeProfile?.is_actively_deploying ?? null}
                          fallbackRecentDeals={dealSizeProfile?.recent_deals ?? null}
                        />
                      </motion.div>
                    )}

                    {activeTab === "Investment Thesis" && (
                      <ThesisTabContent
                        vcFirm={vcFirm}
                        effectiveInvestor={effectiveInvestor}
                        companyData={companyData}
                        enrichedData={enrichedData}
                        displayName={displayName}
                        minCheckUsd={dealSizeProfile?.min_check_size ?? null}
                        maxCheckUsd={dealSizeProfile?.max_check_size ?? null}
                        firmDeals={dealSizeProfile?.deals ?? null}
                        dealSizePartners={dealSizeProfile?.partners ?? null}
                        typicalCheckHint={enrichedData?.profile?.typicalCheckSize ?? null}
                        directorySweetSpot={vcFirm?.sweet_spot ?? null}
                        firmRecordsId={
                          // firm_records.id (UUID) is the FK for fund_records.firm_id
                          (liveProfile?.source === "live" ? liveProfile.id : null) ?? null
                        }
                        firmDisplayName={
                          liveProfile?.firm_name ?? vcFirm?.name ?? null
                        }
                        isActivelyDeploying={dealSizeProfile?.is_actively_deploying ?? null}
                        firmAum={firmAumDisplayForInvestorPanel(
                          heroFirmNameForAum,
                          firstNonEmpty(dealSizeProfile?.aum, vcFirm?.aum, liveProfile?.aum),
                        )}
                        firmWebsiteUrl={connectWebsiteUrl ?? null}
                      />
                    
                    )}

                    {activeTab === "Portfolio" && (
                      <motion.div key="portfolio" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-5">
                        <PortfolioTab
                          companySector={companyData?.sector || effectiveInvestor.sector}
                          firmDeals={dealSizeProfile?.deals ?? undefined}
                          portfolioLoading={(liveLoading && !liveProfile) || supplementalFirmQuery.isLoading}
                          leadPartnerName={liveProfile?.lead_partner}
                          partnerNamesLower={partnerNamesLower}
                          firmRecordsId={resolvedLiveFirmId}
                          vcDirectoryFirmId={vcDirectoryFirmId}
                          firmDisplayName={resolvedLiveFirmDisplayName ?? effectiveInvestor.name}
                          onInvestorClick={(name) => {
                            const match = mergedPartners.find(
                              (p) => p.full_name.toLowerCase() === name.toLowerCase()
                            );
                            if (match && onSelectPerson) onSelectPerson(match);
                          }}
                        />
                      </motion.div>
                    )}

                    {activeTab === "Investors" && (
                      <motion.div key="partners" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <InvestorPartnersTab
                          firmName={effectiveInvestor.name}
                          firmWebsiteUrl={liveProfile?.website_url ?? vcFirm?.website_url ?? null}
                          firmLogoUrl={heroLogo}
                          partners={mergedPartners}
                          onSelectPerson={onSelectPerson}
                        />
                      </motion.div>
                    )}

                    {activeTab === "Feedback" && (
                      <motion.div key="feedback" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <FeedbackTab
                          investorName={effectiveInvestor.name}
                          vcFirmId={reviewVcFirmId}
                          userId={session?.user?.id}
                          onLogInteraction={() => setReviewOpen(true)}
                          onEditReview={() => setReviewOpen(true)}
                        />
                      </motion.div>
                    )}

                    {activeTab === "Connect" && (
                      <motion.div key="connections" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <ConnectionsTab
                          investorName={effectiveInvestor.name}
                          currentUserId={session?.user?.id}
                          investorId={databaseFirmId || null}
                          isAdmin={isAdmin}
                          location={connectLocation || null}
                          email={connectEmailFromRecord || undefined}
                          linkedinUrl={connectLinkedInUrl || undefined}
                          xUrl={connectXUrl || undefined}
                          facebookUrl={connectFacebookUrl || undefined}
                          instagramUrl={connectInstagramUrl || undefined}
                          youtubeUrl={connectYoutubeUrl || undefined}
                          websiteUrl={connectWebsiteUrl || undefined}
                          crunchbaseUrl={connectCrunchbaseUrl || undefined}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
      <ReviewSubmissionModal
        key="review-modal"
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onReviewSaved={(sr) => {
          setOptimisticHeaderRating(sr);
          setRatingRefresh((n) => n + 1);
        }}
        firmName={heroName}
        firmLogoUrl={heroLogo}
        firmWebsiteUrl={
          liveProfile?.website_url ?? vcFirm?.website_url ?? investor?.websiteUrl ?? null
        }
        vcFirmId={reviewVcFirmId}
        personId={reviewVcPersonId ?? ""}
        investorIsMappedToProfile={investorIsMappedToProfile}
        mappingRecordId={mappingRecordId}
        initialStarRatings={headerRatingJson}
        initialCreatedAt={myFirmRatingCreatedAt}
      />
    </AnimatePresence>
  );
}
