import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLatestMyVcRating } from "@/hooks/useLatestMyVcRating";
import { formatMyReviewRateButton } from "@/lib/reviewRateButtonDisplay";
import { cn } from "@/lib/utils";
import { ReviewSubmissionModal } from "@/components/investor-match/ReviewSubmissionModal";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Zap, BookmarkPlus, CheckCircle2,
  ArrowUpRight, Landmark, Target, MapPin, Users, Star,
} from "lucide-react";
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
import { useInvestorProfile, useInvestorProfileByName, type InvestorPartner } from "@/hooks/useInvestorProfile";
import { useFirmRecordXUrlSupplement } from "@/hooks/useFirmRecordXUrlSupplement";
import { looksLikeFirmRecordsUuid } from "@/lib/pickFirmXUrl";
import { getPartnersForFirm, type PartnerPerson } from "./investor-detail/types";
import { Skeleton } from "@/components/ui/skeleton";
import type { VCFirm, VCPerson } from "@/hooks/useVCDirectory";
import { supabase } from "@/integrations/supabase/client";
import { useUserCredits } from "@/hooks/useContactReveal";
import { useInvestorMapping } from "@/hooks/useInvestorMapping";
import {
  isFirmStrategyClassification,
  STRATEGY_CLASSIFICATION_DEFINITIONS,
  STRATEGY_CLASSIFICATION_LABELS,
  formatStrategyClassificationLabel,
} from "@/lib/firmStrategyClassifications";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  /** After panel opens with an investor, open the review modal once (deep link). */
  openReviewModalOnMount?: boolean;
  onReviewBootstrapConsumed?: () => void;
}

export type { InvestorEntry };

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t.length > 0) return t;
  }
  return null;
}

function investorPartnerToVCPerson(
  p: InvestorPartner,
  firmId: string,
  firmName?: string | null,
  firmWebsiteUrl?: string | null,
  firmLogoUrl?: string | null,
): VCPerson {
  const parts = p.full_name.trim().split(/\s+/).filter(Boolean);
  return {
    id: p.id,
    full_name: p.full_name,
    title: p.title,
    firm_id: firmId,
    primary_firm_name: firmName ?? null,
    first_name: p.first_name ?? parts[0] ?? null,
    last_name: p.last_name ?? (parts.length > 1 ? parts.slice(1).join(" ") : null),
    is_active: p.is_active,
    avatar_url: p.avatar_url ?? null,
    profile_image_url: p.avatar_url ?? null,
    email: p.email ?? null,
    linkedin_url: p.linkedin_url ?? null,
    x_url: p.x_url ?? null,
    website_url: p.website_url ?? null,
    // Firm display fields used by PersonProfileModal when firm prop is unavailable
    _firm_website_url: firmWebsiteUrl ?? null,
    _firm_logo_url: firmLogoUrl ?? null,
    bio: p.bio ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    country: p.country ?? null,
  } as VCPerson;
}

function partnerPersonToVCPerson(p: PartnerPerson, firmId: string): VCPerson {
  return {
    id: p.id,
    full_name: p.full_name,
    title: p.title ?? null,
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
  const parts = p.full_name.trim().split(/\s+/).filter(Boolean);
  return {
    id: p.id,
    full_name: p.full_name,
    title: p.title,
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
    profile_image_url: primary.profile_image_url ?? secondary.profile_image_url ?? null,
    avatar_url: primary.avatar_url ?? secondary.avatar_url ?? null,
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
  vcDirectoryFirmIdHint,
  reviewPersonIdHint,
  openReviewModalOnMount,
  onReviewBootstrapConsumed,
}: InvestorDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<InvestorTab>(initialTab || "Updates");
  const [activeScoreTile, setActiveScoreTile] = useState<TileId | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ratingRefresh, setRatingRefresh] = useState(0);
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
  }, [investor?.name, vcFirm?.id]);

  const { session } = useAuth();
  const { enrich, cache: enrichCache } = useInvestorEnrich();
  const [enrichedData, setEnrichedData] = useState<EnrichResult | null>(null);
  const [resolvedFirmId, setResolvedFirmId] = useState<string | null>(null);
  const [websitePartners, setWebsitePartners] = useState<WebsiteTeamPerson[]>([]);
  const { data: userCredits } = useUserCredits();
  const isAdmin = userCredits?.tier === "admin";

  // ── Investor mapping — determines which review form to show ──
  const investorName = investor?.name || vcFirm?.name || null;
  const { isMapped: investorIsMappedToProfile, mappingRecordId } = useInvestorMapping(investorName);

  // ── Live data hook ──
  const liveQuery = useInvestorProfileByName(
    investor?.name || vcFirm?.name || null
  );
  const liveProfile = liveQuery.data;
  const liveLoading = liveQuery.isLoading;

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
      stage: vcFirm.stages?.filter(Boolean).join(", ") || "Multi-stage",
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
  const firmWebsiteUrl = firstNonEmpty(
    liveProfile?.website_url,
    effectiveInvestor?.websiteUrl,
    vcFirm?.website_url,
  );
  const heroName = liveProfile?.firm_name ?? effectiveInvestor?.name ?? "";
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

    fetch("/api/firm-website-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteUrl: firmWebsiteUrl }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { people?: WebsiteTeamPerson[]; error?: string };
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return Array.isArray(data.people) ? data.people : [];
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
  }, [firmWebsiteUrl]);

  const matchScore = effectiveInvestor?.matchReason ? 92 : Math.floor(Math.random() * 30) + 55;

  const displayName = effectiveInvestor?.name || "";
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
      if (!vcDirectoryFirmId?.trim()) return null;
      const { data, error } = await supabase
        .from("firm_records")
        .select("id")
        .eq("prisma_firm_id", vcDirectoryFirmId.trim())
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

  const firmRecordXSupplement = useFirmRecordXUrlSupplement(liveProfile ?? undefined, vcFirm ?? undefined, databaseFirmId);
  const effectiveFirmXUrl = useMemo(
    () =>
      liveProfile?.x_url?.trim() ||
      vcFirm?.x_url?.trim() ||
      firmRecordXSupplement.data?.trim() ||
      null,
    [liveProfile?.x_url, vcFirm?.x_url, firmRecordXSupplement.data],
  );
  const resolvedLiveFirmId = useMemo(
    () => (liveProfile?.source === "live" ? liveProfile.id : databaseFirmId ?? null),
    [liveProfile?.source, liveProfile?.id, databaseFirmId],
  );
  const resolvedLiveFirmDisplayName = dealSizeProfile?.firm_name ?? liveProfile?.firm_name ?? effectiveInvestor?.name ?? null;

  const reviewVcFirmId =
    explicitVcDirId ??
    databaseFirmId ??
    vcFirm?.id ??
    (liveProfile?.source === "json-fallback" ? liveProfile?.id ?? null : null) ??
    null;
  const reviewVcPersonId =
    typeof reviewPersonIdHint === "string" && reviewPersonIdHint.trim()
      ? reviewPersonIdHint.trim()
      : null;
  const { starRatings: myFirmRatingJson, createdAt: myFirmRatingCreatedAt } = useLatestMyVcRating(
    session?.user?.id,
    reviewVcFirmId,
    reviewVcPersonId,
    ratingRefresh,
    displayName,
  );
  const myFirmRateDisplay = useMemo(
    () => formatMyReviewRateButton(myFirmRatingJson),
    [myFirmRatingJson],
  );

  const mergedPartners = useMemo((): VCPerson[] => {
    const firmKey = databaseFirmId ?? explicitVcDirId ?? vcFirm?.id ?? "";
    const byName = new Map<string, VCPerson>();

    // 1. DB people load first as the authoritative base
    for (const p of liveProfile?.partners ?? []) {
      const key = p.full_name.toLowerCase().trim();
      const incoming = investorPartnerToVCPerson(
        p,
        firmKey || p.id,
        liveProfile?.firm_name,
        liveProfile?.website_url,
        liveProfile?.logo_url,
      );
      byName.set(key, byName.has(key) ? mergePartnerPerson(byName.get(key)!, incoming) : incoming);
    }
    for (const p of vcPartners) {
      const k = p.full_name.toLowerCase().trim();
      byName.set(k, byName.has(k) ? mergePartnerPerson(byName.get(k)!, p) : p);
    }

    // 2. Static partner fallback if still empty
    if (byName.size === 0 && effectiveInvestor?.name) {
      for (const p of getPartnersForFirm(effectiveInvestor.name)) {
        const k = p.full_name.toLowerCase().trim();
        const incoming = partnerPersonToVCPerson(p, firmKey || vcFirm?.id || p.id);
        byName.set(k, byName.has(k) ? mergePartnerPerson(byName.get(k)!, incoming) : incoming);
      }
    }

    // 3. Website people ENRICH existing records or ADD new ones — never filter
    for (const p of websitePartners) {
      const normalized = websiteTeamPersonToVCPerson(
        p,
        firmKey || p.id,
        liveProfile?.firm_name ?? effectiveInvestor?.name ?? vcFirm?.name ?? null,
        firmWebsiteUrl,
        heroLogo,
      );
      const key = normalized.full_name.toLowerCase().trim();
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
      const s = (p.seniority ?? p.investor_type ?? "").toLowerCase().replace(/\s+/g, "_");
      return SENIORITY_ORDER[s] ?? 9;
    }
    const ORG_NAME_RE = /\b(capital|ventures?|fund|funds|management|investments|holdings|advisors|advisory|partnership|associates?|technologies|labs|innovation|foundation|trust)\b/i;
    function looksLikeOrgName(name: string): boolean {
      if (ORG_NAME_RE.test(name)) return true;
      const words = name.trim().split(/\s+/);
      // Single-word entries are probably not people
      if (words.length < 2) return true;
      // More than 5 words is probably a sentence fragment, not a name
      if (words.length > 5) return true;
      return false;
    }
    return Array.from(byName.values())
      .filter((p) => p.is_active !== false && !looksLikeOrgName(p.full_name))
      .sort((a, b) => seniorityRank(a) - seniorityRank(b) || a.full_name.localeCompare(b.full_name));
  }, [
    websitePartners,
    liveProfile?.partners,
    liveProfile?.firm_name,
    liveProfile?.website_url,
    liveProfile?.logo_url,
    liveProfile?.id,
    vcPartners,
    databaseFirmId,
    explicitVcDirId,
    vcFirm?.id,
    vcFirm?.name,
    effectiveInvestor?.name,
    firmWebsiteUrl,
    heroLogo,
  ]);

  const partnerNamesLower = useMemo(
    () => new Set(mergedPartners.map((p) => p.full_name.toLowerCase().trim())),
    [mergedPartners]
  );

  useEffect(() => {
    if (!displayName) { setEnrichedData(null); return; }
    const key = displayName.toLowerCase().trim();
    if (enrichCache[key]) { setEnrichedData(enrichCache[key]); return; }
    let cancelled = false;
    enrich(displayName).then(result => { if (!cancelled) setEnrichedData(result); });
    return () => { cancelled = true; };
  }, [displayName]);

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
          .ilike("firm_name", displayName.trim())
          .is("deleted_at", null)
          .limit(1);
        firmId = firms?.[0]?.id;
      }
      if (!firmId) {
        const { data: firms } = await supabase
          .from("firm_records")
          .select("id")
          .ilike("firm_name", `%${displayName.trim()}%`)
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

  // Prefer live profile data, fallback to vcFirm/effectiveInvestor
  const heroInitial = heroName.charAt(0).toUpperCase() || "?";
  const heroAum = liveProfile?.aum ?? vcFirm?.aum ?? "$85B";
  const heroLocation = liveProfile?.location ?? effectiveInvestor?.location ?? null;
  /** Connect tab: full mailing/HQ line from `firm_records` when `location` is empty. */
  const connectLocation = useMemo(() => {
    if (liveProfile?.source === "live") {
      const loc = liveProfile.location?.trim();
      if (loc) return loc;
      const addr = liveProfile.address?.trim();
      if (addr) return addr;
      const parts = [liveProfile.hq_city, liveProfile.hq_state, liveProfile.hq_country]
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
    return effectiveInvestor?.location?.trim() || null;
  }, [liveProfile, effectiveInvestor?.location]);

  const connectEmailFromRecord =
    liveProfile?.source === "live" && liveProfile.email?.trim()
      ? liveProfile.email.trim()
      : null;
  const connectLinkedInUrl =
    liveProfile?.source === "live" && liveProfile.linkedin_url?.trim()
      ? liveProfile.linkedin_url.trim()
      : null;
  const connectXUrl = effectiveFirmXUrl;
  const connectWebsiteUrl =
    liveProfile?.website_url?.trim() ||
    vcFirm?.website_url?.trim() ||
    effectiveInvestor?.websiteUrl?.trim() ||
    null;

  // Prefer firm's actual headcount from DB; fall back to null (don't show DB row count)
  const heroHeadcount = liveProfile?.total_headcount ?? null;
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
  const heroStageFocus =
    liveProfile?.preferred_stage ??
    vcFirm?.stages?.join(", ") ??
    effectiveInvestor?.stage ??
    "-";

  const heroTagline = (liveProfile?.description ?? effectiveInvestor?.description ?? "").split(".")[0].trim() || null;

  const metaFacts = [
    { label: "AUM", value: heroAum },
    { label: "Sweet Spot", value: vcFirm?.sweet_spot || effectiveInvestor?.model || "$1M–$10M" },
    { label: "Team", value: heroHeadcount ? `${heroHeadcount} people` : "—" },
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
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
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
                          <div className="flex gap-3">
                            <Skeleton className="h-3.5 w-14 rounded" />
                            <Skeleton className="h-3.5 w-10 rounded" />
                            <Skeleton className="h-3.5 w-20 rounded" />
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

                          {/* Tagline */}
                          {heroTagline && (
                            <p className="text-[12px] text-muted-foreground/60 leading-snug mb-2.5 truncate max-w-sm">
                              {heroTagline}
                            </p>
                          )}

                          {/* Meta — inline dots, no pill background */}
                          <div className={cn("flex items-center gap-2 text-[11.5px]", !heroTagline && "mt-2")}>
                            {heroAum && (
                              <span className="flex items-center gap-1 text-foreground/70">
                                <Landmark className="w-[11px] h-[11px] opacity-40 shrink-0" />
                                <span className="font-medium">{heroAum}</span>
                              </span>
                            )}
                            {heroAum && (heroHeadcount != null || heroLocation) && (
                              <span className="text-border/50 select-none">·</span>
                            )}
                            {heroHeadcount != null && (
                              <span className="flex items-center gap-1 text-foreground/70">
                                <Users className="w-[11px] h-[11px] opacity-40 shrink-0" />
                                <span className="font-medium">{heroHeadcount} people</span>
                              </span>
                            )}
                            {heroHeadcount != null && heroLocation && (
                              <span className="text-border/50 select-none">·</span>
                            )}
                            {heroLocation && (
                              <span className="flex items-center gap-1 text-foreground/70">
                                <MapPin className="w-[11px] h-[11px] opacity-40 shrink-0" />
                                <span className="font-medium">{heroLocation}</span>
                              </span>
                            )}
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
                          onClick={(e) => { e.stopPropagation(); setReviewOpen(true); }}
                          className="inline-flex items-center gap-1 rounded-xl border border-border/50 bg-transparent px-2.5 py-[9px] leading-none transition-colors hover:bg-secondary/40"
                          aria-label={`Your rating: ${myFirmRateDisplay.label}. ${myFirmRateDisplay.ariaDetail}. Click to view your review.`}
                        >
                          <Star className={cn("h-3 w-3 shrink-0 fill-current animate-pulse", myFirmRateDisplay.colorClass)} />
                          <span className={cn("text-[13px] font-bold animate-pulse", myFirmRateDisplay.colorClass)}>{myFirmRateDisplay.label}</span>
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
                        />
                      </motion.div>
                    )}

                    {activeTab === "Activity" && (
                      <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <ActivityDashboard
                          firmName={effectiveInvestor.name}
                          firmDisplayName={resolvedLiveFirmDisplayName ?? effectiveInvestor.name}
                          firmRecordsId={resolvedLiveFirmId}
                          vcDirectoryFirmId={vcDirectoryFirmId}
                          companySector={companyData?.sector || undefined}
                          deals={dealSizeProfile?.deals ?? undefined}
                          fallbackAum={dealSizeProfile?.aum ?? vcFirm?.aum ?? null}
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
                        firmAum={dealSizeProfile?.aum ?? vcFirm?.aum ?? null}
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
                          firmId={databaseFirmId ?? explicitVcDirId ?? vcFirm?.id ?? ""}
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
                          websiteUrl={connectWebsiteUrl || undefined}
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
        onClose={() => {
          setReviewOpen(false);
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
        initialStarRatings={myFirmRatingJson}
        initialCreatedAt={myFirmRatingCreatedAt}
      />
    </AnimatePresence>
  );
}
