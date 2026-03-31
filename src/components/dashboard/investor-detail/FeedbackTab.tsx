import { useState, useMemo, startTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import {
  Star, TrendingUp, MessageCircle, Sparkles,
  Newspaper, MessagesSquare, Share2, ThumbsUp, ThumbsDown, Pencil,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import {
  aggregateVcRatings,
  INTERACTION_DISPLAY,
  type VcRatingRow,
} from "@/lib/vcRatingsAggregate";
import { fetchVcRatingsForFirm } from "@/lib/vcRatingsQueries";

const WHISPER_FEED = [
  {
    sector: "SaaS",
    stage: "Seed",
    nps: 8,
    date: "2025-12-14",
    tags: ["Passed after 2nd Meeting", "Helpful Feedback"],
    tagColors: ["bg-secondary text-muted-foreground", "bg-success/10 text-success"],
    text: "They dug really deep into our GTM motion. Ultimately passed because market size was too small for their fund math, but the partner gave us incredibly actionable advice.",
  },
  {
    sector: "Fintech",
    stage: "Series A",
    nps: 10,
    date: "2026-01-22",
    tags: ["Term Sheet in 3 Weeks", "Board Seat"],
    tagColors: ["bg-success/10 text-success", "bg-primary/10 text-primary"],
    text: "Fastest process we experienced. Very data-driven diligence, asked for cohort data upfront. Partner was deeply engaged and added real value post-close.",
  },
  {
    sector: "Climate",
    stage: "Pre-Seed",
    nps: 3,
    date: "2026-02-08",
    tags: ["Ghosted after IC", "Slow Process"],
    tagColors: ["bg-destructive/10 text-destructive", "bg-warning/10 text-warning"],
    text: "Great initial conversations, felt like strong alignment. After IC presentation there was radio silence for 6 weeks. Eventually got a pass via email with no feedback.",
  },
];

type ReviewSort = "latest" | "earliest" | "highest" | "lowest";

interface FeedbackTabProps {
  investorName: string;
  /** `vc_firms.id` — loads `vc_ratings` for this firm */
  vcFirmId?: string | null;
  /** Current user's id — used to pin their own reviews at the top */
  userId?: string | null;
  onLogInteraction?: () => void;
  /** Called when the user clicks Edit on one of their own reviews */
  onEditReview?: () => void;
}

function formatRatingWhen(row: VcRatingRow): string {
  const raw = row.interaction_date || row.created_at?.slice(0, 10);
  if (!raw) return "—";
  try {
    return format(parseISO(raw.length <= 10 ? `${raw}T12:00:00` : raw), "MMM d, yyyy");
  } catch {
    return raw;
  }
}

export function FeedbackTab({ investorName, vcFirmId, userId, onLogInteraction, onEditReview }: FeedbackTabProps) {
  const [reviewSort, setReviewSort] = useState<ReviewSort>("latest");
  const [votes, setVotes] = useState<Record<number, "up" | "down" | null>>({});

  const ratingsQuery = useQuery({
    queryKey: ["vc-ratings-firm", vcFirmId],
    queryFn: () => fetchVcRatingsForFirm(vcFirmId!),
    enabled: Boolean(vcFirmId && isSupabaseConfigured),
  });

  const rows = ratingsQuery.data ?? [];
  const agg = useMemo(() => aggregateVcRatings(rows), [rows]);
  const useLive = Boolean(vcFirmId && isSupabaseConfigured && !ratingsQuery.isLoading && rows.length > 0);

  const sortedLive = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      if (reviewSort === "latest") return db - da;
      if (reviewSort === "earliest") return da - db;
      if (reviewSort === "highest") return (b.nps ?? -1) - (a.nps ?? -1);
      return (a.nps ?? -1) - (b.nps ?? -1);
    });
    return copy;
  }, [rows, reviewSort]);

  // Separate authenticated query for the current user's own reviews.
  // Uses firm-name fallback so it works even when vcFirmId is a firm_records id
  // that doesn't match the vc_firms id stored on the rating row.
  const myRatingsQuery = useQuery({
    queryKey: ["vc-ratings-mine", userId, vcFirmId, investorName],
    queryFn: async () => {
      const SELECT = "id, author_user_id, interaction_type, interaction_date, nps, comment, anonymous, created_at, star_ratings";
      // 1. Try by firm id
      if (vcFirmId) {
        const { data } = await supabase
          .from("vc_ratings")
          .select(SELECT)
          .eq("author_user_id", userId!)
          .eq("vc_firm_id", vcFirmId)
          .eq("is_draft", false)
          .order("created_at", { ascending: false });
        if (data?.length) return data as typeof rows;
      }
      // 2. Fall back: scan recent ratings and match by firm_name in star_ratings JSONB
      const name = investorName.trim().toLowerCase();
      const { data: recent } = await supabase
        .from("vc_ratings")
        .select(SELECT)
        .eq("author_user_id", userId!)
        .eq("is_draft", false)
        .order("created_at", { ascending: false })
        .limit(50);
      return ((recent ?? []) as typeof rows).filter((row) => {
        const sr = (row as unknown as { star_ratings?: Record<string, unknown> }).star_ratings;
        const fn = (sr?.firm_name as string | undefined)?.trim().toLowerCase();
        return fn === name;
      });
    },
    enabled: Boolean(userId && isSupabaseConfigured),
  });

  const myReviews = myRatingsQuery.data ?? [];

  const overallDisplay = useLive && agg.overallStars != null ? agg.overallStars.toFixed(1) : "4.8";
  const npsDisplay = useLive ? String(agg.nps) : "72";
  const countLabel = useLive
    ? `${agg.count} founder rating${agg.count === 1 ? "" : "s"}`
    : "Based on 23 founder reviews (sample)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-success/20 bg-success/5 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-success/10">
              <Star className="w-3.5 h-3.5 fill-success text-success" />
            </div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-success/70 font-semibold">Community Rating</p>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-4xl font-black text-foreground leading-none">{overallDisplay}</span>
            <span className="text-sm font-semibold text-muted-foreground">/5</span>
            {useLive ? (
              <span className="text-[10px] font-bold text-muted-foreground ml-1">
                NPS <span className="text-foreground tabular-nums">{npsDisplay}</span>
              </span>
            ) : null}
          </div>
          <p className="text-[9px] text-muted-foreground mt-1 mb-2">{countLabel}</p>

          {useLive && agg.breakdown.length > 0 ? (
            <div className="space-y-1 border-t border-success/10 pt-2 text-[9px] text-muted-foreground">
              <p className="font-mono uppercase tracking-wider text-success/70 font-semibold mb-1">By interaction</p>
              {agg.breakdown.map((b) => (
                <div key={b.interactionType} className="flex justify-between gap-2">
                  <span>
                    {INTERACTION_DISPLAY[b.interactionType] ?? b.interactionType} ({b.count})
                  </span>
                  <span className="font-semibold text-foreground tabular-nums shrink-0">
                    {b.avgStars != null ? `${b.avgStars.toFixed(1)}/5` : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1 border-t border-success/10 pt-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-success" />
                <span className="text-[9px] text-muted-foreground">
                  Top trait: <span className="font-semibold text-foreground">Fast Conviction</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-success" />
                <span className="text-[9px] text-muted-foreground">
                  Trending <span className="font-semibold text-success">+0.3</span> over 30 days
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-success/20 bg-success/5 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-success/10">
              <MessageCircle className="w-3.5 h-3.5 text-success" />
            </div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-success/70 font-semibold">Social Sentiment</p>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-xs font-bold text-success uppercase tracking-wide">Highly Positive</span>
          </div>
          <p className="text-[9px] text-muted-foreground mt-1 mb-2">Across founder chatter, PR, and social signals</p>
          <div className="space-y-1 border-t border-success/10 pt-2">
            <div className="flex items-center gap-1.5">
              <Newspaper className="w-3 h-3 text-success" />
              <span className="text-[9px] text-muted-foreground">
                PR mentions <span className="font-semibold text-success">trending up</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MessagesSquare className="w-3 h-3 text-success" />
              <span className="text-[9px] text-muted-foreground">
                Founder chatter <span className="font-semibold text-foreground">active</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Share2 className="w-3 h-3 text-success" />
              <span className="text-[9px] text-muted-foreground">
                Social signals <span className="font-semibold text-success">positive</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── My Reviews ───────────────────────────────────────────────── */}
      {myReviews.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-mono uppercase tracking-wider text-primary/70 font-semibold">Your Review{myReviews.length > 1 ? "s" : ""}</p>
            <button
              type="button"
              onClick={() => onEditReview?.()}
              className="inline-flex items-center gap-1 text-[9px] font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <Pencil className="h-2.5 w-2.5" />
              Edit
            </button>
          </div>
          {myReviews.map((review) => {
            const npsScore = review.nps ?? 0;
            const when = formatRatingWhen(review);
            const label = INTERACTION_DISPLAY[review.interaction_type] ?? review.interaction_type;
            const snippet = review.comment?.trim() || review.interaction_detail?.trim() || null;
            return (
              <div
                key={review.id}
                className="bg-primary/5 border border-primary/20 px-3 py-2 rounded-lg flex items-center gap-3"
              >
                <div
                  className={`flex items-center justify-center h-7 w-7 rounded-lg border text-[11px] font-black shrink-0 ${
                    npsScore >= 8
                      ? "border-success/30 bg-success/10 text-success"
                      : npsScore >= 5
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {npsScore || "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[10px] text-foreground">{when} · {label}</span>
                    {review.anonymous && (
                      <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Anon</span>
                    )}
                  </div>
                  {snippet && (
                    <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{snippet}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Founder Reviews</p>
          <div className="flex items-center gap-1">
            {(["latest", "earliest", "highest", "lowest"] as ReviewSort[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => startTransition(() => setReviewSort(s))}
                className={`text-[9px] uppercase font-bold px-2 py-1 rounded-md transition-colors ${
                  reviewSort === s
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {myReviews.length === 0 && (
          <div className="bg-foreground text-background rounded-xl px-4 py-3 flex items-center justify-between mb-3">
            <div className="min-w-0 mr-3">
              <p className="text-xs font-semibold leading-snug">Pitched {investorName} recently?</p>
              <p className="text-[10px] text-background/60 mt-0.5">Share your experience to help the community.</p>
            </div>
            <button
              type="button"
              onClick={() => onLogInteraction?.()}
              className="shrink-0 bg-background text-foreground font-bold text-[10px] px-3 py-1.5 rounded-lg hover:bg-background/90 transition-colors"
            >
              Log Interaction
            </button>
          </div>
        )}

        {vcFirmId && ratingsQuery.isLoading ? (
          <p className="text-[10px] text-muted-foreground py-4">Loading ratings…</p>
        ) : null}
        {vcFirmId && ratingsQuery.isError ? (
          <p className="text-[10px] text-destructive py-2">Could not load ratings.</p>
        ) : null}

        <div className="space-y-1.5">
          {useLive
            ? sortedLive.map((review, origIdx) => {
                const vote = votes[origIdx] ?? null;
                const label = INTERACTION_DISPLAY[review.interaction_type] ?? review.interaction_type;
                const when = formatRatingWhen(review);
                const npsScore = review.nps ?? 0;
                const snippet =
                  review.comment?.trim() ||
                  review.interaction_detail?.trim() ||
                  "No comment.";
                return (
                  <div
                    key={review.id}
                    className="bg-card border border-border px-3 py-2 rounded-lg flex items-center gap-3"
                  >
                    <div
                      className={`flex items-center justify-center h-7 w-7 rounded-lg border text-[11px] font-black shrink-0 ${
                        npsScore >= 8
                          ? "border-success/30 bg-success/10 text-success"
                          : npsScore >= 5
                            ? "border-warning/30 bg-warning/10 text-warning"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {npsScore}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[10px] text-foreground">
                          {when} · {label}
                        </span>
                        {review.anonymous ? (
                          <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                            Anon
                          </span>
                        ) : null}
                        {review.verified ? (
                          <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-success/10 text-success">
                            Verified
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{snippet}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setVotes((v) => ({ ...v, [origIdx]: vote === "up" ? null : "up" }))}
                        className={`flex items-center justify-center h-6 w-6 rounded-md transition-colors ${
                          vote === "up" ? "bg-success/15 text-success" : "hover:bg-secondary text-muted-foreground"
                        }`}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setVotes((v) => ({ ...v, [origIdx]: vote === "down" ? null : "down" }))}
                        className={`flex items-center justify-center h-6 w-6 rounded-md transition-colors ${
                          vote === "down" ? "bg-destructive/15 text-destructive" : "hover:bg-secondary text-muted-foreground"
                        }`}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            : [...WHISPER_FEED]
                .sort((a, b) => {
                  if (reviewSort === "latest") return new Date(b.date).getTime() - new Date(a.date).getTime();
                  if (reviewSort === "earliest") return new Date(a.date).getTime() - new Date(b.date).getTime();
                  if (reviewSort === "highest") return b.nps - a.nps;
                  return a.nps - b.nps;
                })
                .map((review) => {
                  const origIdx = WHISPER_FEED.indexOf(review);
                  const vote = votes[origIdx] ?? null;
                  return (
                    <div key={origIdx} className="bg-card border border-border px-3 py-2 rounded-lg flex items-center gap-3">
                      <div
                        className={`flex items-center justify-center h-7 w-7 rounded-lg border text-[11px] font-black shrink-0 ${
                          review.nps >= 8
                            ? "border-success/30 bg-success/10 text-success"
                            : review.nps >= 5
                              ? "border-warning/30 bg-warning/10 text-warning"
                              : "border-destructive/30 bg-destructive/10 text-destructive"
                        }`}
                      >
                        {review.nps}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[10px] text-foreground">
                            {review.sector} {review.stage} Founder
                          </span>
                          {review.tags.map((tag, j) => (
                            <span
                              key={tag}
                              className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded ${review.tagColors[j]}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{review.text}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setVotes((v) => ({ ...v, [origIdx]: vote === "up" ? null : "up" }))}
                          className={`flex items-center justify-center h-6 w-6 rounded-md transition-colors ${
                            vote === "up" ? "bg-success/15 text-success" : "hover:bg-secondary text-muted-foreground"
                          }`}
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setVotes((v) => ({ ...v, [origIdx]: vote === "down" ? null : "down" }))}
                          className={`flex items-center justify-center h-6 w-6 rounded-md transition-colors ${
                            vote === "down" ? "bg-destructive/15 text-destructive" : "hover:bg-secondary text-muted-foreground"
                          }`}
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
        </div>

        {vcFirmId && isSupabaseConfigured && !ratingsQuery.isLoading && rows.length === 0 ? (
          <p className="text-[10px] text-muted-foreground mt-3">No ratings yet for this firm. Be the first to log an interaction.</p>
        ) : null}
      </div>
    </motion.div>
  );
}
