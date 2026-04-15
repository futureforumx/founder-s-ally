import { useMemo, useCallback, startTransition, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLatestMyVcRating } from "@/hooks/useLatestMyVcRating";
import { formatMyReviewRateButton } from "@/lib/reviewRateButtonDisplay";
import { cn, safeTrim } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  X, ArrowLeft, MapPin, Mail, Globe, Linkedin, Twitter,
  BookOpen, ExternalLink, Sparkles, Target, ChevronRight, Star, AlertTriangle,
} from "lucide-react";
import { ReviewSubmissionModal } from "@/components/investor-match/ReviewSubmissionModal";
import { useInvestorMapping } from "@/hooks/useInvestorMapping";
import { Badge } from "@/components/ui/badge";
import { FirmFavicon } from "@/components/ui/firm-favicon";
import { InvestorPersonAvatar } from "@/components/ui/investor-person-avatar";
import { investorAvatarUrlCandidates, investorPrimaryAvatarUrl } from "@/lib/investorAvatarUrl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { VCPerson, VCFirm, VCPersonInvestment } from "@/hooks/useVCDirectory";
import { sanitizeText } from "@/lib/sanitizeText";
import { sanitizePersonTitle } from "@/lib/sanitizePersonTitle";
import { generateInvestorBio } from "@/lib/generateFallbacks";
import { isPlausibleLocationLine } from "@/lib/locationLineQuality";
import { supabase } from "@/integrations/supabase/client";
import { splitBackgroundSummaryPortfolio } from "@/lib/investorBackgroundPortfolio";

const FIRM_INVESTOR_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WebsiteDerivedPersonProfile = {
  headshotUrl: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  profileUrl: string | null;
  sectorFocus: string[];
  portfolioCompanies: string[];
};

type FirmInvestorSnapshot = {
  email: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  bio: string | null;
  background_summary: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  avatar_url: string | null;
  profile_image_url: string | null;
  /** Synced from Prisma person intel → `firm_investors` (see `intel:funding:sync-supabase`). */
  funding_intel_activity_score?: number | null;
  funding_intel_momentum_score?: number | null;
  funding_intel_pace_label?: string | null;
  funding_intel_summary?: string | null;
  funding_intel_focus_json?: Record<string, unknown> | null;
  funding_intel_recent_investments_json?: unknown[] | null;
  funding_intel_updated_at?: string | null;
};

function formatFundingIntelPaceLabel(raw: string | null | undefined): string {
  const u = safeTrim(raw).toLowerCase();
  if (u === "accelerating") return "Accelerating vs prior window";
  if (u === "steady") return "Steady vs prior window";
  if (u === "slowing") return "Cooling vs prior window";
  if (u === "insufficient_data") return "Not enough history for pace";
  return safeTrim(raw) || "—";
}

/** When bio + narrative are only a short line (e.g. title stub), still run person-website-profile. */
function isThinInvestorNarrative(
  mergedBg: string | null | undefined,
  personBg: string | null | undefined,
  bio: string | null | undefined,
): boolean {
  const narrative =
    splitBackgroundSummaryPortfolio(safeTrim(mergedBg)).narrative ||
    splitBackgroundSummaryPortfolio(safeTrim(personBg)).narrative ||
    "";
  const combined = `${safeTrim(narrative)}\n${safeTrim(bio)}`.trim();
  if (combined.length >= 90) return false;
  return combined.split(/\s+/).filter(Boolean).length < 14;
}

function parseEducationItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const row = entry as Record<string, unknown>;
        const degree = safeTrim(row.degree);
        const institution =
          safeTrim(row.institution) ||
          safeTrim(row.school) ||
          safeTrim(row.university) ||
          safeTrim(row.college);
        const field = safeTrim(row.field_of_study) || safeTrim(row.field);
        const year = safeTrim(row.end_year) || safeTrim(row.year);
        return [degree, institution, field, year].filter(Boolean).join(", ");
      })
      .map((x) => safeTrim(x))
      .filter(Boolean);
    return Array.from(new Set(out));
  }

  const raw = safeTrim(value);
  if (!raw) return [];
  const parts = raw
    .split(/\s*\n+\s*|\s*;\s*|\s*\|\s*/g)
    .map((x) => safeTrim(x))
    .filter(Boolean);
  return Array.from(new Set(parts.length ? parts : [raw]));
}

interface PersonProfileModalProps {
  person: VCPerson | null;
  firm: VCFirm | null;
  onClose: () => void;
  onNavigateToFirm: (firmId: string) => void;
}

const PROCEED_WITH_CAUTION_NAMES = new Set(["jenn kranz guillen"]);

function isLeadOrSponsoredDeal(leadOrFollow: string | null | undefined): boolean {
  const t = safeTrim(leadOrFollow);
  if (!t) return false;
  const u = t.toUpperCase().replace(/[\s-]+/g, "_");
  if (u === "FOLLOW" || u === "FOLLOW_ONLY" || u.includes("FOLLOW_ONLY") || u === "PARTICIPANT") return false;
  return u.includes("LEAD") || u.includes("SPONSOR") || u.includes("CO_LEAD") || u.includes("COLEAD");
}

function domainFromSourceUrl(sourceUrl: string | null | undefined): string | null {
  const s = safeTrim(sourceUrl);
  if (!s) return null;
  try {
    const host = new URL(s).hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Normalize person URL fields to a safe http(s) href, or null if missing/invalid. */
function personSocialHref(raw: string | null | undefined): string | null {
  const s = safeTrim(raw);
  if (!s) return null;
  let href = s;
  if (!/^https?:\/\//i.test(s)) {
    href = s.startsWith("//") ? `https:${s}` : `https://${s.replace(/^\/+/, "")}`;
  }
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function isLikelyPersonWebsiteHref(raw: string | null | undefined): boolean {
  const href = personSocialHref(raw);
  if (!href) return false;
  const lower = href.toLowerCase();
  if (/linkedin\.com|x\.com|twitter\.com/.test(lower)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|avif|pdf)(\?|$)/.test(lower)) return false;
  if (/\/wp-content\/uploads\//.test(lower)) return false;
  return true;
}

function investmentSortMs(date: string | null | undefined): number {
  const d = safeTrim(date);
  if (!d) return 0;
  const t = Date.parse(d);
  return Number.isNaN(t) ? 0 : t;
}

function ledOrSponsoredInvestments(person: VCPerson): VCPersonInvestment[] {
  const raw = person.recent_investments;
  if (!raw?.length) return [];
  return [...raw]
    .filter((inv) => isLeadOrSponsoredDeal(inv.lead_or_follow))
    .sort((a, b) => investmentSortMs(b.date) - investmentSortMs(a.date));
}

/* ── Deal row logo (favicon when we have a URL host; else initial) ── */
function DealLogo({ domain, name }: { domain: string | null; name: string }) {
  const d = safeTrim(domain) || null;
  const baseSrc = d
    ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=128`
    : null;
  const [src, setSrc] = useState<string | null>(baseSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setSrc(baseSrc);
  }, [baseSrc]);

  if (!d || failed || !src) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-xs font-bold text-muted-foreground">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-8 w-8 shrink-0 rounded-lg border border-border bg-background object-contain p-1"
      onError={() => {
        if (src.includes("gstatic")) {
          setSrc(`https://www.google.com/s2/favicons?domain=${d}&sz=128`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

export function PersonProfileModal({ person, firm, onClose, onNavigateToFirm }: PersonProfileModalProps) {
  const { session, user: authUser } = useAuth();
  const queryClient = useQueryClient();
  const [firmInvestorSnap, setFirmInvestorSnap] = useState<FirmInvestorSnapshot | null>(null);
  /** Avoid showing directory/website-merge `person` avatars before `firm_investors` row resolves (UUID person ids). */
  const [firmInvestorRowFetched, setFirmInvestorRowFetched] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ratingRefresh, setRatingRefresh] = useState(0);
  const [optimisticPersonRating, setOptimisticPersonRating] = useState<unknown>(null);
  const [websiteProfile, setWebsiteProfile] = useState<WebsiteDerivedPersonProfile | null>(null);
  const [dbEducationSummary, setDbEducationSummary] = useState<string | null>(null);
  const [dbEducationItems, setDbEducationItems] = useState<string[]>([]);
  const handleClose = useCallback(() => {
    window.requestAnimationFrame(() => {
      startTransition(() => {
        onClose();
      });
    });
  }, [onClose]);

  const reviewFirmDisplayName =
    safeTrim(firm?.name) ||
    safeTrim(person?.primary_firm_name) ||
    safeTrim(person?.affiliations?.find((a) => a.is_primary)?.firm_name) ||
    safeTrim(person?.affiliations?.[0]?.firm_name) ||
    "";
  const reviewVcFirmId = firm?.id ?? person?.firm_id ?? null;

  const mergedFromDb = useMemo(() => {
    if (!person) return null;
    const snap = firmInvestorSnap;
    return {
      email: safeTrim(snap?.email) || safeTrim(person.email) || null,
      linkedin_url: safeTrim(snap?.linkedin_url) || safeTrim(person.linkedin_url) || null,
      x_url: safeTrim(snap?.x_url) || safeTrim(person.x_url) || null,
      website_url: safeTrim(snap?.website_url) || safeTrim(person.website_url) || null,
      bio: safeTrim(snap?.bio) || safeTrim(person.bio) || null,
      background_summary: safeTrim(snap?.background_summary) || safeTrim(person.background_summary) || null,
      city: safeTrim(snap?.city) || safeTrim(person.city) || null,
      state: safeTrim(snap?.state) || safeTrim(person.state) || null,
      country: safeTrim(snap?.country) || safeTrim(person.country) || null,
      avatar_url: safeTrim(snap?.avatar_url) || safeTrim(person.avatar_url) || null,
      profile_image_url: safeTrim(snap?.profile_image_url) || safeTrim(person.profile_image_url) || null,
    };
  }, [person, firmInvestorSnap]);
  const resolvedFirmWebsiteUrl = useMemo(
    () =>
      safeTrim(firm?.website_url) ||
      safeTrim((person as VCPerson & { _firm_website_url?: string | null } | null)?._firm_website_url) ||
      null,
    [firm?.website_url, person],
  );

  useEffect(() => {
    setWebsiteProfile(null);
    setOptimisticPersonRating(null);
    setDbEducationSummary(null);
    setDbEducationItems([]);
    setFirmInvestorSnap(null);
    setFirmInvestorRowFetched(false);
  }, [person?.id, firm?.id]);

  useEffect(() => {
    if (!person?.id || !FIRM_INVESTOR_UUID_RE.test(person.id)) {
      setFirmInvestorRowFetched(true);
      return;
    }
    const firmId = safeTrim(person.firm_id);
    if (!firmId || !FIRM_INVESTOR_UUID_RE.test(firmId)) {
      setFirmInvestorRowFetched(true);
      return;
    }

    setFirmInvestorRowFetched(false);
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("firm_investors")
          .select(
            [
              "email, linkedin_url, x_url, website_url, bio, background_summary, city, state, country, avatar_url, profile_image_url",
              ",funding_intel_activity_score,funding_intel_momentum_score,funding_intel_pace_label",
              ",funding_intel_summary,funding_intel_focus_json,funding_intel_recent_investments_json,funding_intel_updated_at",
            ].join(""),
          )
          .eq("id", person.id)
          .eq("firm_id", firmId)
          .is("deleted_at", null)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setFirmInvestorSnap(null);
          return;
        }
        setFirmInvestorSnap(data as FirmInvestorSnapshot);
      } catch {
        if (!cancelled) setFirmInvestorSnap(null);
      } finally {
        if (!cancelled) setFirmInvestorRowFetched(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [person?.id, person?.firm_id]);

  useEffect(() => {
    if (!person) {
      setDbEducationSummary(null);
      setDbEducationItems([]);
      return;
    }
    const hasStructuredEducation = Array.isArray(person.education)
      && person.education.some((e) => {
        const degree = safeTrim(e?.degree);
        const institution = safeTrim(e?.institution);
        return Boolean(degree || institution);
      });
    const hasSummaryEducation =
      safeTrim((person as VCPerson & { education_summary?: string | null }).education_summary).length > 0;
    if (hasStructuredEducation || hasSummaryEducation) {
      setDbEducationSummary(null);
      setDbEducationItems([]);
      return;
    }

    const fullName = safeTrim(person.full_name);
    const firmId = safeTrim(person.firm_id);
    if (!fullName || !firmId) {
      setDbEducationSummary(null);
      setDbEducationItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const personId = safeTrim(person.id);
        let summary = "";
        let parsedItems: string[] = [];

        // First try vc_people (many person profiles are keyed there, not firm_investors).
        if (personId) {
          const { data: fromVcPeople } = await supabase
            .from("vc_people")
            .select("education, education_summary")
            .eq("id", personId)
            .is("deleted_at", null)
            .maybeSingle();
          const vcEdu = fromVcPeople as
            | { education?: unknown; education_summary?: string | null }
            | null;
          parsedItems = parseEducationItems(vcEdu?.education);
          if (parsedItems.length === 0) {
            parsedItems = parseEducationItems(vcEdu?.education_summary);
          }
          if (!summary) {
            summary = safeTrim(vcEdu?.education_summary ?? null);
          }
        }

        // Prefer direct row-id lookup: avoids misses from name variants.
        if (!summary && personId) {
          const { data: byId } = await supabase
            .from("firm_investors")
            .select("education, education_summary")
            .eq("id", personId)
            .eq("firm_id", firmId)
            .is("deleted_at", null)
            .maybeSingle();
          const row = byId as { education?: unknown; education_summary?: string | null } | null;
          const rowItems = parseEducationItems(row?.education);
          if (parsedItems.length === 0 && rowItems.length > 0) parsedItems = rowItems;
          if (!summary) summary = safeTrim(row?.education_summary ?? null);
        }

        // Fallback for non-firm_investors ids or stale mappings.
        if (!summary && parsedItems.length === 0) {
          const { data: byName } = await supabase
            .from("firm_investors")
            .select("education, education_summary, full_name")
            .eq("firm_id", firmId)
            .ilike("full_name", `%${fullName}%`)
            .is("deleted_at", null)
            .limit(5);
          const rows = Array.isArray(byName) ? byName : [];
          const nameItems = rows.flatMap((row) =>
            parseEducationItems((row as { education?: unknown }).education),
          );
          if (nameItems.length > 0) parsedItems = Array.from(new Set(nameItems));
          if (!summary) {
            summary = safeTrim(
              rows
                .map((row) => safeTrim((row as { education_summary?: string | null }).education_summary ?? null))
                .find(Boolean) ?? null,
            );
          }
        }

        if (!cancelled) {
          setDbEducationItems(parsedItems);
          setDbEducationSummary(summary || null);
        }
      } catch {
        if (!cancelled) {
          setDbEducationSummary(null);
          setDbEducationItems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [person]);

  useEffect(() => {
    if (!person) {
      setWebsiteProfile(null);
      return;
    }

    const fullName = safeTrim(person.full_name) || null;
    const title =
      sanitizePersonTitle(person.title, person.full_name) ||
      sanitizePersonTitle(person.role, person.full_name) ||
      null;
    const hasStoredAvatar = Boolean(
      investorPrimaryAvatarUrl({
        avatar_url: mergedFromDb?.avatar_url ?? person.avatar_url,
        profile_image_url: mergedFromDb?.profile_image_url ?? person.profile_image_url,
      }),
    );
    const needsRichNarrative = isThinInvestorNarrative(
      mergedFromDb?.background_summary,
      person.background_summary,
      mergedFromDb?.bio ?? person.bio,
    );
    const needsWebsiteEnrichment = Boolean(
      resolvedFirmWebsiteUrl &&
      (
        !hasStoredAvatar ||
        needsRichNarrative ||
        !safeTrim(mergedFromDb?.email) ||
        !safeTrim(mergedFromDb?.linkedin_url) ||
        !safeTrim(mergedFromDb?.x_url) ||
        !safeTrim(mergedFromDb?.bio) ||
        !safeTrim(mergedFromDb?.background_summary) ||
        !(
          safeTrim(mergedFromDb?.city) ||
          safeTrim(mergedFromDb?.state) ||
          safeTrim(mergedFromDb?.country)
        )
      ),
    );

    if (!needsWebsiteEnrichment || !resolvedFirmWebsiteUrl || !fullName) {
      setWebsiteProfile(null);
      return;
    }

    let cancelled = false;
    async function fetchWebsiteProfile() {
      try {
        const res = await fetch("/api/person-website-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firmWebsiteUrl: resolvedFirmWebsiteUrl,
            fullName,
            title,
            firmInvestorId: person.id,
            // Use cache + DB cooldown so repeat opens are fast; server still persists to `firm_investors`.
            forceRefresh: false,
          }),
        });
        if (!res.ok) throw new Error(`Profile lookup failed (${res.status})`);
        const data = (await res.json()) as WebsiteDerivedPersonProfile;
        if (!cancelled) {
          setWebsiteProfile(data);
          const fid = safeTrim(person.firm_id);
          if (fid && FIRM_INVESTOR_UUID_RE.test(fid)) {
            void queryClient.invalidateQueries({ queryKey: ["investor-profile", fid] });
          }
          const n = safeTrim(firm?.name) || safeTrim(person.primary_firm_name);
          if (n) void queryClient.invalidateQueries({ queryKey: ["investor-profile-name", n.toLowerCase()] });
        }
      } catch {
        if (!cancelled) setWebsiteProfile(null);
      }
    }

    fetchWebsiteProfile();
    return () => {
      cancelled = true;
    };
  }, [
    person,
    person?.avatar_url,
    person?.background_summary,
    person?.bio,
    person?.city,
    person?.country,
    person?.email,
    person?.full_name,
    person?.linkedin_url,
    person?.profile_image_url,
    person?.raw_location,
    person?.role,
    person?.state,
    person?.title,
    person?.x_url,
    resolvedFirmWebsiteUrl,
    mergedFromDb,
    firm?.name,
    person?.firm_id,
    queryClient,
  ]);

  const {
    starRatings: myPersonRatingJson,
    loading: myPersonRatingLoading,
  } = useLatestMyVcRating(
    authUser?.id ?? session?.user?.id,
    reviewVcFirmId,
    person?.id ?? null,
    ratingRefresh,
    reviewFirmDisplayName || null,
  );

  useEffect(() => {
    if (myPersonRatingJson != null && !myPersonRatingLoading) setOptimisticPersonRating(null);
  }, [myPersonRatingJson, myPersonRatingLoading]);

  const personHeaderRatingJson = optimisticPersonRating ?? myPersonRatingJson;
  const myPersonRateDisplay = useMemo(
    () => formatMyReviewRateButton(personHeaderRatingJson),
    [personHeaderRatingJson],
  );

  const {
    isMapped: investorIsMappedToProfile,
    mappingRecordId,
  } = useInvestorMapping(reviewFirmDisplayName || null);

  const investorTitle = useMemo(() => {
    const byTitle = sanitizePersonTitle(person?.title, person?.full_name);
    if (byTitle) return byTitle;
    const byRole = sanitizePersonTitle(person?.role, person?.full_name);
    if (byRole) return byRole;
    return sanitizePersonTitle(websiteProfile?.title, person?.full_name) || null;
  }, [person?.full_name, person?.title, person?.role, websiteProfile?.title]);

  const displayLocation = useMemo(() => {
    if (!person) return null;
    const raw = safeTrim(person.raw_location);
    if (isPlausibleLocationLine(raw)) return raw;
    const parts = [
      mergedFromDb?.city ?? person.city,
      mergedFromDb?.state ?? person.state,
      mergedFromDb?.country ?? person.country,
    ].filter((p): p is string => Boolean(safeTrim(p)));
    if (parts.length) return parts.join(", ");
    const websiteLocation = safeTrim(websiteProfile?.location);
    return isPlausibleLocationLine(websiteLocation) ? websiteLocation : null;
  }, [mergedFromDb?.city, mergedFromDb?.country, mergedFromDb?.state, person, websiteProfile?.location]);
  const showProceedWithCaution = useMemo(() => {
    const normalizedName = safeTrim(person?.full_name).toLowerCase();
    return PROCEED_WITH_CAUTION_NAMES.has(normalizedName);
  }, [person?.full_name]);

  const backgroundText = useMemo(() => {
    if (!person) return null;
    const narrative =
      splitBackgroundSummaryPortfolio(mergedFromDb?.background_summary).narrative ||
      splitBackgroundSummaryPortfolio(person.background_summary).narrative;
    return (
      sanitizeText(narrative) ||
      sanitizeText(websiteProfile?.bio) ||
      sanitizeText(mergedFromDb?.bio) ||
      sanitizeText(person.bio) ||
      generateInvestorBio({
        full_name: person.full_name,
        first_name: person.first_name,
        last_name: person.last_name,
        title: investorTitle,
        firm_name: firm?.name || person.primary_firm_name || null,
        personal_thesis_tags: person.personal_thesis_tags,
        stage_focus: person.stage_focus,
        city: mergedFromDb?.city ?? person.city,
        state: mergedFromDb?.state ?? person.state,
        country: mergedFromDb?.country ?? person.country,
      }) ||
      null
    );
  }, [firm?.name, investorTitle, mergedFromDb, person, websiteProfile?.bio]);

  const resolvedEmail = useMemo(
    () =>
      safeTrim(mergedFromDb?.email) ||
      safeTrim(person?.email) ||
      safeTrim(websiteProfile?.email) ||
      null,
    [mergedFromDb?.email, person?.email, websiteProfile?.email],
  );

  const ledDeals = useMemo(() => (person ? ledOrSponsoredInvestments(person) : []), [person]);

  const stageFocusTags = useMemo(() => person?.stage_focus?.filter((s) => safeTrim(s)) ?? [], [person?.stage_focus]);
  const sectorFocusTags = useMemo(
    () => {
      const explicit = person?.sector_focus?.filter((s) => safeTrim(s)) ?? [];
      return explicit.length > 0 ? explicit : websiteProfile?.sectorFocus?.filter((s) => safeTrim(s)) ?? [];
    },
    [person?.sector_focus, websiteProfile?.sectorFocus],
  );
  const qualityTags = useMemo(() => {
    if (!person) return [];
    const q = person.investment_criteria_qualities?.filter((s) => safeTrim(s)) ?? [];
    if (q.length) return q;
    return person.personal_qualities?.filter((s) => safeTrim(s)) ?? [];
  }, [person]);

  const publishedInsights = useMemo(() => {
    const list = person?.published_content?.filter((c) => safeTrim(c.title)) ?? [];
    return [...list].sort((a, b) => {
      const ta = a.published_at ? Date.parse(a.published_at) : 0;
      const tb = b.published_at ? Date.parse(b.published_at) : 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
  }, [person?.published_content]);

  const educationItems = useMemo(() => {
    if (!person) return [] as string[];
    const fromStructured = parseEducationItems(person.education);
    if (fromStructured.length > 0) return fromStructured;

    if (dbEducationItems.length > 0) return dbEducationItems;

    const summary =
      safeTrim((person as VCPerson & { education_summary?: string | null }).education_summary) ||
      safeTrim(dbEducationSummary);
    if (!summary) return [] as string[];
    const parts = parseEducationItems(summary);
    return parts.length ? parts : [summary];
  }, [person, dbEducationItems, dbEducationSummary]);

  const hasPersonalFocus =
    stageFocusTags.length > 0 || sectorFocusTags.length > 0 || qualityTags.length > 0;

  /**
   * Modal header: when we have a `firm_investors` snapshot, use **only** that row for raster URLs so a
   * stale/wrong `person` image from directory ↔ website merge cannot sit ahead of the correct email row.
   * Otherwise fall back to merged props; append person-website-profile headshot last.
   */
  const headerAvatarImageUrls = useMemo(() => {
    if (!person) return [];
    const snap = firmInvestorSnap;
    const expectFirmInvestorRow =
      FIRM_INVESTOR_UUID_RE.test(person.id) && FIRM_INVESTOR_UUID_RE.test(safeTrim(person.firm_id));
    const fromSnap = snap
      ? investorAvatarUrlCandidates({
          avatar_url: snap.avatar_url,
          profile_image_url: snap.profile_image_url,
        })
      : [];
    const fromPerson = investorAvatarUrlCandidates({
      avatar_url: mergedFromDb?.avatar_url ?? person.avatar_url,
      profile_image_url: mergedFromDb?.profile_image_url ?? person.profile_image_url,
    });
    const base =
      expectFirmInvestorRow && !firmInvestorRowFetched
        ? []
        : fromSnap.length > 0
          ? fromSnap
          : fromPerson;
    const web = safeTrim(websiteProfile?.headshotUrl);
    if (!web || base.includes(web)) return base;
    return [...base, web];
  }, [
    firmInvestorSnap,
    firmInvestorRowFetched,
    mergedFromDb?.avatar_url,
    mergedFromDb?.profile_image_url,
    person,
    person?.avatar_url,
    person?.firm_id,
    person?.id,
    person?.profile_image_url,
    websiteProfile?.headshotUrl,
  ]);

  const displayPortfolioCompanies = useMemo(() => {
    const fromDb = [
      ...splitBackgroundSummaryPortfolio(mergedFromDb?.background_summary).companies,
      ...splitBackgroundSummaryPortfolio(person?.background_summary).companies,
    ];
    const fromWeb = websiteProfile?.portfolioCompanies?.filter((company) => safeTrim(company)) ?? [];
    return Array.from(new Set([...fromDb, ...fromWeb].map((c) => safeTrim(c)).filter(Boolean)));
  }, [mergedFromDb?.background_summary, person?.background_summary, websiteProfile?.portfolioCompanies]);

  const socialLinks = useMemo(() => {
    if (!person) return [];
    const items: { key: string; href: string; icon: LucideIcon; label: string; hoverClass: string }[] = [];
    const linkedin = personSocialHref(
      mergedFromDb?.linkedin_url || person.linkedin_url || websiteProfile?.linkedinUrl,
    );
    if (linkedin) {
      items.push({
        key: "linkedin",
        href: linkedin,
        icon: Linkedin,
        label: "LinkedIn",
        hoverClass: "hover:border-[#0A66C2]/40 hover:text-[#0A66C2]",
      });
    }
    const x = personSocialHref(mergedFromDb?.x_url || person.x_url || websiteProfile?.xUrl);
    if (x) {
      items.push({
        key: "x",
        href: x,
        icon: Twitter,
        label: "X",
        hoverClass: "hover:border-foreground/40 hover:text-foreground",
      });
    }
    const websiteRaw =
      safeTrim(mergedFromDb?.website_url) ||
      safeTrim(person.website_url) ||
      safeTrim((person as VCPerson & { personal_website_url?: string | null }).personal_website_url) ||
      safeTrim(websiteProfile?.profileUrl) ||
      safeTrim(websiteProfile?.websiteUrl) ||
      null;
    const website = isLikelyPersonWebsiteHref(websiteRaw) ? personSocialHref(websiteRaw) : null;
    if (website) {
      items.push({
        key: "website",
        href: website,
        icon: Globe,
        label: "Website",
        hoverClass: "hover:border-accent/40 hover:text-accent",
      });
    }
    return items;
  }, [
    person,
    mergedFromDb?.linkedin_url,
    mergedFromDb?.website_url,
    mergedFromDb?.x_url,
    websiteProfile?.linkedinUrl,
    websiteProfile?.profileUrl,
    websiteProfile?.websiteUrl,
    websiteProfile?.xUrl,
  ]);

  return (
    <AnimatePresence>
      {person && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto max-w-4xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[85vh] flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* Top bar */}
              <div className="px-8 pt-5 pb-0 flex items-center justify-between shrink-0">
                {firm && (
                  <button
                    onClick={() => onNavigateToFirm(firm.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to {firm.name}
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary/60 transition-colors ml-auto"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                {/* ── Hero Header ── */}
                <div className="flex gap-5 items-start mb-6 pb-6 border-b border-border">
                  <InvestorPersonAvatar
                    imageUrls={headerAvatarImageUrls}
                    initials={safeTrim(person.full_name).charAt(0) || null}
                    size="md"
                    loading="eager"
                    fetchPriority="high"
                    className="h-20 w-20 rounded-2xl border-2 border-border shadow-sm shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl font-bold text-foreground">{person.full_name}</h2>
                      {displayLocation ? (
                        <span className="text-sm text-muted-foreground font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" /> {displayLocation}
                        </span>
                      ) : null}
                    </div>
                    {showProceedWithCaution ? (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Proceed with caution
                      </div>
                    ) : null}
                    {investorTitle && !firm && (
                      <p className="mt-1 text-sm font-medium text-muted-foreground">{investorTitle}</p>
                    )}
                    {firm ? (
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
                        {investorTitle ? (
                          <>
                            <span className="shrink-0">{investorTitle}</span>
                            <span className="shrink-0 text-muted-foreground/75">at</span>
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onNavigateToFirm(firm.id)}
                          className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <FirmFavicon websiteUrl={firm.website_url} logoUrl={firm.logo_url} name={firm.name} />
                          <span className="truncate">{firm.name}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* ── Quick-Contact Bar ── */}
                <div className="flex flex-wrap gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setReviewOpen(true)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                      myPersonRateDisplay
                        ? myPersonRateDisplay.className
                        : "border-2 border-warning/30 text-warning hover:bg-warning/5",
                    )}
                    aria-label={
                      myPersonRateDisplay
                        ? `Your rating: ${myPersonRateDisplay.label}. ${myPersonRateDisplay.ariaDetail}. Click to update.`
                        : "Rate this investor"
                    }
                  >
                    <Star className="h-4 w-4 shrink-0" /> {myPersonRateDisplay?.label ?? "Rate"}
                  </button>
                  {resolvedEmail ? (
                    <a
                      href={`mailto:${resolvedEmail}`}
                      className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-xl text-sm font-semibold hover:bg-foreground/90 transition-colors"
                    >
                      <Mail className="w-4 h-4" /> {resolvedEmail}
                    </a>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex items-center gap-2 bg-muted text-muted-foreground px-4 py-2 rounded-xl text-sm font-semibold opacity-60">
                            <Mail className="w-4 h-4" /> Email Unavailable
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>No email on file for this investor.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {socialLinks.map(({ key, href, icon: Icon, label, hoverClass }) => (
                    <a
                      key={key}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={label}
                      aria-label={label}
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all duration-200 hover:scale-105",
                        hoverClass,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>

                {firmInvestorSnap &&
                (firmInvestorSnap.funding_intel_activity_score != null ||
                  safeTrim(firmInvestorSnap.funding_intel_summary)) ? (
                  <div className="mb-6 rounded-2xl border border-border bg-secondary/25 p-4">
                    <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Funding intel (90d, news-attributed)
                    </h4>
                    <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                      {firmInvestorSnap.funding_intel_activity_score != null ? (
                        <span className="font-semibold tabular-nums text-foreground">
                          Activity{" "}
                          <span className="text-accent">{Math.round(firmInvestorSnap.funding_intel_activity_score)}</span>
                          /100
                        </span>
                      ) : null}
                      {firmInvestorSnap.funding_intel_momentum_score != null ? (
                        <span className="font-semibold tabular-nums text-foreground">
                          Momentum{" "}
                          <span className="text-accent">{Math.round(firmInvestorSnap.funding_intel_momentum_score)}</span>
                          /100
                        </span>
                      ) : null}
                      {firmInvestorSnap.funding_intel_pace_label ? (
                        <Badge variant="outline" className="text-[10px] font-medium">
                          {formatFundingIntelPaceLabel(firmInvestorSnap.funding_intel_pace_label)}
                        </Badge>
                      ) : null}
                    </div>
                    {safeTrim(firmInvestorSnap.funding_intel_summary) ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">{firmInvestorSnap.funding_intel_summary}</p>
                    ) : null}
                    {Array.isArray(firmInvestorSnap.funding_intel_focus_json?.recent_focus) &&
                    (firmInvestorSnap.funding_intel_focus_json?.recent_focus as string[]).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(firmInvestorSnap.funding_intel_focus_json!.recent_focus as string[]).map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px]">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray(firmInvestorSnap.funding_intel_recent_investments_json) &&
                    firmInvestorSnap.funding_intel_recent_investments_json.length > 0 ? (
                      <ul className="mt-3 space-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                        {firmInvestorSnap.funding_intel_recent_investments_json.slice(0, 6).map((row, idx) => {
                          const r = row as { company_name?: string; sector?: string | null };
                          const cn = safeTrim(r.company_name) || "Company";
                          const sec = safeTrim(r.sector);
                          return (
                            <li key={`${cn}-${idx}`} className="flex justify-between gap-2">
                              <span className="truncate font-medium text-foreground/90">{cn}</span>
                              {sec ? <span className="shrink-0 text-muted-foreground/80">{sec}</span> : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {safeTrim(firmInvestorSnap.funding_intel_updated_at) ? (
                      <p className="mt-2 text-[9px] text-muted-foreground/70">
                        Updated {firmInvestorSnap.funding_intel_updated_at!.slice(0, 10)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* ── 2-Column Bento Body ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column (2 cols) */}
                  <div className="lg:col-span-2 space-y-6">
                    {backgroundText ? (
                      <div>
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                          Background
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{backgroundText}</p>
                      </div>
                    ) : null}

                    {ledDeals.length > 0 ? (
                      <div>
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                          Led or sponsored deals
                        </h4>
                        <div className="space-y-0 overflow-hidden rounded-xl border border-border">
                          {ledDeals.map((inv, i) => {
                            const host = domainFromSourceUrl(inv.source_url);
                            const subline =
                              host ||
                              [inv.sector, inv.date].filter(Boolean).join(" · ") ||
                              "Verified lead / sponsor";
                            const roundLabel = safeTrim(inv.stage) || "—";
                            const key = `${inv.company_name}-${inv.date ?? i}-${i}`;
                            const rowClass = `flex items-center gap-3 px-4 py-3 transition-colors group ${
                              inv.source_url ? "cursor-pointer hover:bg-secondary/40" : "cursor-default"
                            } ${i < ledDeals.length - 1 ? "border-b border-border" : ""}`;

                            return inv.source_url ? (
                              <a
                                key={key}
                                href={inv.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={rowClass}
                              >
                                <DealLogo domain={host} name={inv.company_name} />
                                <div className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-foreground">{inv.company_name}</span>
                                  <span className="text-[10px] text-muted-foreground">{subline}</span>
                                </div>
                                <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                                  {roundLabel}
                                </Badge>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                              </a>
                            ) : (
                              <div key={key} className={rowClass}>
                                <DealLogo domain={host} name={inv.company_name} />
                                <div className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-foreground">{inv.company_name}</span>
                                  <span className="text-[10px] text-muted-foreground">{subline}</span>
                                </div>
                                <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                                  {roundLabel}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : displayPortfolioCompanies.length > 0 ? (
                      <div>
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                          Website portfolio
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {displayPortfolioCompanies.map((company) => (
                            <Badge key={company} variant="secondary" className="px-2.5 py-1 text-[11px]">
                              {company}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Right Column (1 col) */}
                  <div className="lg:col-span-1 space-y-6">
                    {hasPersonalFocus ? (
                      <div className="rounded-2xl border border-border bg-secondary/30 p-5">
                        <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Personal focus
                        </h4>

                        {stageFocusTags.length > 0 ? (
                          <div className="mb-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Stage
                            </span>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {stageFocusTags.map((s) => (
                                <span
                                  key={s}
                                  className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {sectorFocusTags.length > 0 ? (
                          <div className="mb-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Sector
                            </span>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {sectorFocusTags.map((s) => (
                                <span
                                  key={s}
                                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {qualityTags.length > 0 ? (
                          <div>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Qualities
                            </span>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {qualityTags.map((q) => (
                                <span
                                  key={q}
                                  className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                                >
                                  <Sparkles className="h-2.5 w-2.5" /> {q}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-border p-5">
                      <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Latest insights
                      </h4>

                      {educationItems.length > 0 ? (
                        <div className="mb-4 rounded-xl border border-border/70 bg-secondary/25 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Education
                          </p>
                          <div className="mt-2 space-y-1.5">
                            {educationItems.map((item, i) => (
                              <p key={`${item}-${i}`} className="text-xs text-foreground">
                                {item}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {publishedInsights.length > 0 ? (
                        <div className="space-y-3">
                          {publishedInsights.map((item, i) => {
                            const isTweet = item.content_type === "TWEET";
                            const Icon = isTweet ? Twitter : BookOpen;
                            const metaBits = [item.source_name, item.published_at].filter(Boolean);
                            const meta = metaBits.join(" · ");
                            const inner = (
                              <>
                                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                                <div className="min-w-0">
                                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p>
                                  {meta ? (
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">{meta}</p>
                                  ) : null}
                                </div>
                              </>
                            );
                            return item.source_url ? (
                              <a
                                key={`${item.title}-${i}`}
                                href={item.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-start gap-2.5"
                              >
                                {inner}
                              </a>
                            ) : (
                              <div key={`${item.title}-${i}`} className="flex items-start gap-2.5">
                                {inner}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">
                          No recent public publications on file.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <ReviewSubmissionModal
            open={reviewOpen}
            onClose={() => setReviewOpen(false)}
            onReviewSaved={(sr) => {
              setOptimisticPersonRating(sr);
              setRatingRefresh((n) => n + 1);
            }}
            firmName={reviewFirmDisplayName || safeTrim(firm?.name) || "this firm"}
            firmLogoUrl={firm?.logo_url ?? null}
            firmWebsiteUrl={firm?.website_url ?? null}
            vcFirmId={reviewVcFirmId}
            personId={person?.id ?? ""}
            personName={person?.full_name}
            investorIsMappedToProfile={investorIsMappedToProfile}
            mappingRecordId={mappingRecordId}
          />
        </>
      )}
    </AnimatePresence>
  );
}
