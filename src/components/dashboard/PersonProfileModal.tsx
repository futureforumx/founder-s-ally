import { useState, useMemo, useCallback, startTransition } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLatestMyVcRating } from "@/hooks/useLatestMyVcRating";
import { formatMyReviewRateButton } from "@/lib/reviewRateButtonDisplay";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ArrowLeft, MapPin, Mail, Globe2, Linkedin,
  BookOpen, ExternalLink, Sparkles, Target, ChevronRight, Star, BookmarkPlus,
} from "lucide-react";
import { ReviewSubmissionModal } from "@/components/investor-match/ReviewSubmissionModal";
import { useInvestorMapping } from "@/hooks/useInvestorMapping";
import { Badge } from "@/components/ui/badge";
import { InvestorPersonAvatar, investorPersonImageCandidates } from "@/components/ui/investor-person-avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { VCPerson, VCFirm } from "@/hooks/useVCDirectory";

interface PersonProfileModalProps {
  person: VCPerson | null;
  firm: VCFirm | null;
  onClose: () => void;
  onNavigateToFirm: (firmId: string) => void;
}

/* ── Firm favicon component ── */
function FirmFavicon({ websiteUrl, logoUrl, name }: { websiteUrl: string | null; logoUrl: string | null; name: string }) {
  const domain = (() => {
    try {
      if (websiteUrl) return new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).hostname.replace(/^www\./, "");
      return null;
    } catch { return null; }
  })();
  const [src, setSrc] = useState<string | null>(
    logoUrl || (domain ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32` : null)
  );
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return <span className="text-[10px] font-bold text-muted-foreground/60 bg-secondary rounded px-1">{name.charAt(0).toUpperCase()}</span>;
  }

  return (
    <img
      src={src}
      alt=""
      className="h-3.5 w-3.5 rounded-sm object-contain"
      onError={() => {
        if (src.includes("gstatic") && domain) {
          setSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=32`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

/* ── Mock data for personal intelligence ── */
const MOCK_BIO = "Focuses on early-stage B2B SaaS and vertical software companies. Previously built and scaled a fintech startup to $12M ARR before joining the firm. Gravitates toward technical founders solving workflow automation problems in regulated industries.";

const MOCK_DEALS = [
  { company: "Ramp", round: "Series A", domain: "ramp.com", source: "ramp.com", url: "https://ramp.com/blog/series-a" },
  { company: "Vanta", round: "Seed", domain: "vanta.com", source: "techcrunch.com", url: "https://techcrunch.com/2020/02/vanta-seed-round" },
  { company: "Lattice", round: "Series A", domain: "lattice.com", source: "prnewswire.com", url: "https://www.prnewswire.com/news-releases/lattice-series-a.html" },
  { company: "Notion", round: "Seed", domain: "notion.so", source: "notion.so", url: "https://notion.so/blog/seed-announcement" },
];

/* ── Inline logo component for deal rows ── */
function DealLogo({ domain, name }: { domain: string; name: string }) {
  const [src, setSrc] = useState(`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary border border-border text-xs font-bold text-muted-foreground shrink-0">
        {name.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className="h-8 w-8 rounded-lg border border-border object-contain bg-background p-1 shrink-0"
      onError={() => {
        if (src.includes("gstatic")) {
          setSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

const MOCK_STAGES = ["Pre-Seed", "Seed", "Series A"];
const MOCK_SECTORS = ["B2B SaaS", "Fintech", "Developer Tools", "Vertical Software"];
const MOCK_QUALITIES = ["Product-led growth", "Technical founders", "Workflow automation", "Regulated markets"];

const MOCK_ARTICLES = [
  { title: "Why Vertical SaaS Will Win the Next Decade", domain: "substack.com", date: "Mar 2026" },
];
const MOCK_TWEETS = [
  "Seeing an incredible wave of AI-native vertical SaaS companies. The best ones aren't just adding AI — they're rethinking the entire workflow.",
];

const SOCIALS = [
  { icon: Linkedin, label: "LinkedIn" },
  { icon: null, label: "X" },
  { icon: Globe2, label: "Website" },
] as const;

const INVESTOR_SCORE_TITLES = [
  { label: "MATCH", sublabels: ["RAISE", "COMPETITORS"] },
  { label: "Founder Reputation" },
  { label: "Track Record" },
] as const;

export function PersonProfileModal({ person, firm, onClose, onNavigateToFirm }: PersonProfileModalProps) {
  const { session } = useAuth();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ratingRefresh, setRatingRefresh] = useState(0);
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
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary/60 transition-colors"
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
                      profile_image_url: person.profile_image_url,
                      avatar_url: person.avatar_url,
                      firmWebsiteUrl: firm?.website_url ?? null,
                      title: person.title,
                      role: person.role,
                      investorType: person.investor_type,
                      email: person.email,
                      website_url: person.website_url,
                      linkedin_url: person.linkedin_url,
                      x_url: person.x_url,
                      personal_website_url: person.personal_website_url,
                      full_name: person.full_name,
                    })}
                    size="md"
                    className="h-20 w-20 rounded-2xl border-2 border-border shadow-sm shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl font-bold text-foreground">{person.full_name}</h2>
                    </div>
                    {investorTitle && !firm && (
                      <p className="mt-1 text-sm font-medium text-muted-foreground">{investorTitle}</p>
                    )}
                    {firm ? (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {investorTitle ? (
                          <span className="text-xs font-medium text-muted-foreground shrink-0">
                            {investorTitle}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onNavigateToFirm(firm.id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span className="text-muted-foreground/80">at</span>
                          <FirmFavicon websiteUrl={firm.website_url} logoUrl={firm.logo_url} name={firm.name} />
                          <span>{firm.name}</span>
                        </button>
                      </div>
                    ) : null}
                    <p className="mt-1 text-sm font-medium text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> San Francisco, CA
                    </p>
                  </div>
                  <div className="hidden xl:flex items-center gap-2 self-center">
                    {INVESTOR_SCORE_TITLES.map((tile) => (
                      <div key={tile.label} className="rounded-lg border border-border/70 bg-secondary/20 px-3 py-2 text-center">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap">
                          {tile.label}
                        </p>
                        {tile.sublabels ? (
                          <p className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                            {tile.sublabels.join(" · ")}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm font-bold tabular-nums text-foreground">--</p>
                      </div>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 self-start">
                    {myPersonRateDisplay ? (
                      <button
                        type="button"
                        onClick={() => setReviewOpen(true)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-xl px-3 py-[9px] text-[13px] font-semibold leading-none transition-colors",
                          myPersonRateDisplay.className,
                        )}
                        aria-label={`Your rating: ${myPersonRateDisplay.label}. ${myPersonRateDisplay.ariaDetail}. Click to view your review.`}
                      >
                        <span>{myPersonRateDisplay.label}</span>
                        <Star className="h-3.5 w-3.5 shrink-0 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReviewOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-warning/35 bg-warning/10 px-3 py-[9px] text-[13px] font-medium text-foreground hover:bg-warning/15 transition-colors"
                        aria-label="Rate this investor"
                      >
                        <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning animate-pulse [animation-duration:2.6s] [animation-timing-function:ease-in-out]" />
                        Rate
                      </button>
                    )}
                    <button className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-[9px] text-[13px] font-semibold text-background shadow-sm transition-colors hover:bg-foreground/90">
                      <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
                      Track
                    </button>
                  </div>
                </div>

                {/* ── Quick-Contact Bar ── */}
                <div className="flex flex-wrap gap-3 mb-6">
                  {person.email ? (
                    <a
                      href={`mailto:${person.email}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-foreground/90 hover:text-foreground transition-colors"
                    >
                      <Mail className="h-4 w-4" />
                      <span>{person.email}</span>
                    </a>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="inline-flex items-center gap-2 bg-muted text-muted-foreground px-4 py-2 rounded-xl text-sm font-semibold cursor-not-allowed opacity-60">
                            <Mail className="w-4 h-4" /> Email Unavailable
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>No email on file for this investor.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {SOCIALS.map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      title={label}
                      className="inline-flex items-center justify-center text-black transition-colors duration-200 hover:text-black/75"
                    >
                      {label === "X" ? (
                        <span className="text-sm font-light leading-none">X</span>
                      ) : (
                        <Icon className="h-4 w-4 stroke-[1.5]" />
                      )}
                    </button>
                  ))}
                </div>

                {/* ── 2-Column Bento Body ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column (2 cols) */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Background */}
                    <div>
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Background</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{MOCK_BIO}</p>
                    </div>

                    {/* Led or Sponsored Deals */}
                    <div>
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Led or Sponsored Deals</h4>
                      <div className="space-y-0 rounded-xl border border-border overflow-hidden">
                        {MOCK_DEALS.map((deal, i) => (
                          <a
                            key={deal.company}
                            href={deal.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors group cursor-pointer ${
                              i < MOCK_DEALS.length - 1 ? "border-b border-border" : ""
                            }`}
                          >
                            <DealLogo domain={deal.domain} name={deal.company} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-foreground block">{deal.company}</span>
                              <span className="text-[10px] text-muted-foreground">{deal.source}</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{deal.round}</Badge>
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column (1 col) */}
                  <div className="lg:col-span-1 space-y-6">
                    {/* Personal Focus */}
                    <div className="bg-secondary/30 p-5 rounded-2xl border border-border">
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Personal Focus</h4>

                      <div className="mb-3">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Stage</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {MOCK_STAGES.map(s => (
                            <span key={s} className="bg-accent/10 text-accent text-[10px] px-2 py-0.5 rounded-full font-medium">{s}</span>
                          ))}
                        </div>
                      </div>

                      <div className="mb-3">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sector</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {MOCK_SECTORS.map(s => (
                            <span key={s} className="bg-secondary text-secondary-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">{s}</span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Qualities</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {MOCK_QUALITIES.map(q => (
                            <span key={q} className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5" /> {q}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Latest Insights */}
                    <div className="border border-border p-5 rounded-2xl">
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Latest Insights</h4>

                      {MOCK_ARTICLES.length > 0 ? (
                        <div className="space-y-3">
                          {MOCK_ARTICLES.map((article, i) => (
                            <div key={i} className="flex items-start gap-2.5 group cursor-pointer">
                              <BookOpen className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">{article.title}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{article.domain} · {article.date}</p>
                              </div>
                            </div>
                          ))}

                          {MOCK_TWEETS.map((tweet, i) => (
                            <div key={i} className="bg-secondary/40 rounded-xl p-3 border-l-2 border-muted-foreground/20">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-[10px] font-light leading-none text-muted-foreground">X</span>
                                <span className="text-[10px] font-semibold text-muted-foreground">Recent post</span>
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed italic">"{tweet}"</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No recent public publications detected.</p>
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
