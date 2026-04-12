import { useMemo, useCallback, startTransition, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLatestMyVcRating } from "@/hooks/useLatestMyVcRating";
import { formatMyReviewRateButton } from "@/lib/reviewRateButtonDisplay";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  X, ArrowLeft, MapPin, Mail, Globe, Linkedin, Twitter,
  BookOpen, ExternalLink, Sparkles, Target, ChevronRight, Star,
} from "lucide-react";
import { ReviewSubmissionModal } from "@/components/investor-match/ReviewSubmissionModal";
import { useInvestorMapping } from "@/hooks/useInvestorMapping";
import { Badge } from "@/components/ui/badge";
import { FirmFavicon } from "@/components/ui/firm-favicon";
import { InvestorPersonAvatar, investorPersonImageCandidates } from "@/components/ui/investor-person-avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { VCPerson, VCFirm, VCPersonInvestment } from "@/hooks/useVCDirectory";
import { sanitizeText } from "@/lib/sanitizeText";

type WebsiteDerivedPersonProfile = {
  headshotUrl: string | null;
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
};

interface PersonProfileModalProps {
  person: VCPerson | null;
  firm: VCFirm | null;
  onClose: () => void;
  onNavigateToFirm: (firmId: string) => void;
}

function isLeadOrSponsoredDeal(leadOrFollow: string | null | undefined): boolean {
  if (!leadOrFollow?.trim()) return false;
  const u = leadOrFollow.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (u === "FOLLOW" || u === "FOLLOW_ONLY" || u.includes("FOLLOW_ONLY") || u === "PARTICIPANT") return false;
  return u.includes("LEAD") || u.includes("SPONSOR") || u.includes("CO_LEAD") || u.includes("COLEAD");
}

function domainFromSourceUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl?.trim()) return null;
  try {
    const host = new URL(sourceUrl.trim()).hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Normalize person URL fields to a safe http(s) href, or null if missing/invalid. */
function personSocialHref(raw: string | null | undefined): string | null {
  const s = raw?.trim();
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

function investmentSortMs(date: string | null | undefined): number {
  if (!date?.trim()) return 0;
  const t = Date.parse(date);
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
  const d = domain?.trim() || null;
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
  const { session } = useAuth();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ratingRefresh, setRatingRefresh] = useState(0);
  const [websiteProfile, setWebsiteProfile] = useState<WebsiteDerivedPersonProfile | null>(null);
  const handleClose = useCallback(() => {
    window.requestAnimationFrame(() => {
      startTransition(() => {
        onClose();
      });
    });
  }, [onClose]);

  const reviewFirmDisplayName =
    firm?.name?.trim() ||
    person?.primary_firm_name?.trim() ||
    person?.affiliations?.find((a) => a.is_primary)?.firm_name?.trim() ||
    person?.affiliations?.[0]?.firm_name?.trim() ||
    "";
  const reviewVcFirmId = firm?.id ?? person?.firm_id ?? null;

  useEffect(() => {
    setWebsiteProfile(null);
  }, [person?.id, firm?.id]);

  useEffect(() => {
    const firmWebsiteUrl = firm?.website_url?.trim() || null;
    const fullName = person?.full_name?.trim() || null;
    const title = person?.title?.trim() || person?.role?.trim() || null;
    const needsWebsiteEnrichment = Boolean(
      person &&
      firmWebsiteUrl &&
      (
        !person.profile_image_url?.trim() ||
        !person.avatar_url?.trim() ||
        !person.email?.trim() ||
        !person.linkedin_url?.trim() ||
        !person.x_url?.trim() ||
        !person.bio?.trim() ||
        !person.background_summary?.trim() ||
        !(person.raw_location?.trim() || person.city?.trim() || person.state?.trim() || person.country?.trim())
      ),
    );

    if (!needsWebsiteEnrichment || !firmWebsiteUrl || !fullName) {
      setWebsiteProfile(null);
      return;
    }

    let cancelled = false;
    async function fetchWebsiteProfile() {
      try {
        const res = await fetch("/api/person-website-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firmWebsiteUrl, fullName, title }),
        });
        if (!res.ok) throw new Error(`Profile lookup failed (${res.status})`);
        const data = (await res.json()) as WebsiteDerivedPersonProfile;
        if (!cancelled) setWebsiteProfile(data);
      } catch {
        if (!cancelled) setWebsiteProfile(null);
      }
    }

    fetchWebsiteProfile();
    return () => {
      cancelled = true;
    };
  }, [
    firm?.website_url,
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
  ]);

  const { starRatings: myPersonRatingJson } = useLatestMyVcRating(
    session?.user?.id,
    reviewVcFirmId,
    person?.id ?? null,
    ratingRefresh,
  );
  const myPersonRateDisplay = useMemo(
    () => formatMyReviewRateButton(myPersonRatingJson),
    [myPersonRatingJson],
  );

  const {
    isMapped: investorIsMappedToProfile,
    mappingRecordId,
  } = useInvestorMapping(reviewFirmDisplayName || null);

  const investorTitle = useMemo(() => {
    const byTitle = person?.title?.trim();
    if (byTitle) return byTitle;
    const byRole = person?.role?.trim();
    if (byRole) return byRole;
    return null;
  }, [person?.title, person?.role]);

  const displayLocation = useMemo(() => {
    if (!person) return null;
    const raw = person.raw_location?.trim();
    if (raw) return raw;
    const parts = [person.city, person.state, person.country].filter((p): p is string => Boolean(p?.trim()));
    if (parts.length) return parts.join(", ");
    return websiteProfile?.location?.trim() || null;
  }, [person, websiteProfile?.location]);

  const backgroundText = useMemo(() => {
    if (!person) return null;
    return (
      sanitizeText(person.background_summary) ||
      sanitizeText(person.bio) ||
      sanitizeText(websiteProfile?.bio) ||
      null
    );
  }, [person, websiteProfile?.bio]);

  const resolvedEmail = useMemo(
    () => person?.email?.trim() || websiteProfile?.email?.trim() || null,
    [person?.email, websiteProfile?.email],
  );

  const ledDeals = useMemo(() => (person ? ledOrSponsoredInvestments(person) : []), [person]);

  const stageFocusTags = useMemo(() => person?.stage_focus?.filter((s) => s?.trim()) ?? [], [person?.stage_focus]);
  const sectorFocusTags = useMemo(() => person?.sector_focus?.filter((s) => s?.trim()) ?? [], [person?.sector_focus]);
  const qualityTags = useMemo(() => {
    if (!person) return [];
    const q = person.investment_criteria_qualities?.filter((s) => s?.trim()) ?? [];
    if (q.length) return q;
    return person.personal_qualities?.filter((s) => s?.trim()) ?? [];
  }, [person]);

  const publishedInsights = useMemo(() => {
    const list = person?.published_content?.filter((c) => c.title?.trim()) ?? [];
    return [...list].sort((a, b) => {
      const ta = a.published_at ? Date.parse(a.published_at) : 0;
      const tb = b.published_at ? Date.parse(b.published_at) : 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
  }, [person?.published_content]);

  const hasPersonalFocus =
    stageFocusTags.length > 0 || sectorFocusTags.length > 0 || qualityTags.length > 0;

  const socialLinks = useMemo(() => {
    if (!person) return [];
    const items: { key: string; href: string; icon: LucideIcon; label: string; hoverClass: string }[] = [];
    const linkedin = personSocialHref(person.linkedin_url || websiteProfile?.linkedinUrl);
    if (linkedin) {
      items.push({
        key: "linkedin",
        href: linkedin,
        icon: Linkedin,
        label: "LinkedIn",
        hoverClass: "hover:border-[#0A66C2]/40 hover:text-[#0A66C2]",
      });
    }
    const x = personSocialHref(person.x_url || websiteProfile?.xUrl);
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
      person.website_url?.trim() ||
      (person as VCPerson & { personal_website_url?: string | null }).personal_website_url?.trim() ||
      websiteProfile?.websiteUrl?.trim() ||
      null;
    const website = personSocialHref(websiteRaw);
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
  }, [person, websiteProfile?.linkedinUrl, websiteProfile?.websiteUrl, websiteProfile?.xUrl]);

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
                    imageUrls={investorPersonImageCandidates({
                      profile_image_url: person.profile_image_url || websiteProfile?.headshotUrl,
                      avatar_url: person.avatar_url || websiteProfile?.headshotUrl,
                      firmWebsiteUrl: firm?.website_url ?? null,
                      title: person.title,
                      role: person.role,
                      investorType: person.investor_type,
                      email: person.email || websiteProfile?.email,
                      website_url: person.website_url || websiteProfile?.websiteUrl,
                      linkedin_url: person.linkedin_url || websiteProfile?.linkedinUrl,
                      x_url: person.x_url || websiteProfile?.xUrl,
                      personal_website_url: person.personal_website_url,
                      full_name: person.full_name,
                    })}
                    size="md"
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
                            const roundLabel = inv.stage?.trim() || "—";
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
            onClose={() => {
              setReviewOpen(false);
              setRatingRefresh((n) => n + 1);
            }}
            firmName={reviewFirmDisplayName || firm?.name?.trim() || "this firm"}
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
