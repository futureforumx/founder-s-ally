import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, CheckCircle2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase, supabaseVcDirectory } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { mapReviewStarsToVcRatingScores, type InteractionKey } from "@/lib/mapReviewStarsToVcRatingScores";

export interface ReviewSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  firmName: string;
  /** `vc_firms.id` — used for `vc_ratings.vc_firm_id` (FK). */
  vcFirmId?: string | null;
  /** Partner id (`vc_people.id`) — empty = firm-level rating */
  personId?: string;
  personName?: string;
}

const INTERACTION_OPTIONS: { key: InteractionKey; label: string; emoji: string }[] = [
  { key: "meeting", label: "Took Meeting/Call", emoji: "📞" },
  { key: "email", label: "Sent Email/Warm Intro", emoji: "✉️" },
  { key: "intro", label: "Got Intro", emoji: "🤝" },
  { key: "other", label: "Other", emoji: "✏️" },
];

const STAR_CRITERIA: Record<
  InteractionKey,
  { key: string; label: string }[]
> = {
  meeting: [
    { key: "timeliness", label: "Timeliness" },
    { key: "respect", label: "Respect" },
    { key: "feedback_quality", label: "Feedback Quality" },
    { key: "follow_through", label: "Follow-Through" },
    { key: "value_add", label: "Value-Add" },
  ],
  email: [
    { key: "response_time", label: "Response Time" },
    { key: "helpfulness", label: "Helpfulness" },
    { key: "professionalism", label: "Professionalism" },
  ],
  intro: [
    { key: "intro_quality", label: "Intro Quality" },
    { key: "responsiveness", label: "Responsiveness" },
  ],
  other: [{ key: "overall", label: "Overall experience" }],
};

const NPS_LABELS: Record<number, string> = {
  0: "Terrible",
  1: "Awful",
  2: "Bad",
  3: "Poor",
  4: "Below Average",
  5: "Neutral",
  6: "Okay",
  7: "Good",
  8: "Great",
  9: "Excellent",
  10: "Outstanding",
};

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveVcFirmId(firmName: string, hint: string | null | undefined): Promise<string | null> {
  const trimmed = hint?.trim();
  if (trimmed) return trimmed;
  const { data, error } = await (supabaseVcDirectory as unknown as { from: (t: string) => any })
    .from("vc_firms")
    .select("id")
    .ilike("firm_name", firmName.trim())
    .limit(1);
  if (error || !data?.[0]?.id) return null;
  return data[0].id as string;
}

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-xs font-medium text-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-0.5" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className="p-1 rounded-md hover:bg-secondary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${label}: ${i} star${i > 1 ? "s" : ""}`}
            aria-pressed={value === i}
          >
            <Star
              className={cn(
                "h-4 w-4 transition-colors",
                i <= value ? "fill-warning text-warning" : "text-muted-foreground/35",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewSubmissionModal({
  open,
  onClose,
  firmName,
  vcFirmId,
  personId = "",
  personName,
}: ReviewSubmissionModalProps) {
  const { user } = useAuth();
  const [interactionType, setInteractionType] = useState<InteractionKey | null>(null);
  const [interactionOther, setInteractionOther] = useState("");
  const [interactionDate, setInteractionDate] = useState(todayISODate);
  const [starRatings, setStarRatings] = useState<Record<string, number>>({});
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const criteria = useMemo(
    () => (interactionType ? STAR_CRITERIA[interactionType] : []),
    [interactionType],
  );

  const subjectLine = personName ? `${personName} · ${firmName}` : firmName;

  const reset = useCallback(() => {
    setInteractionType(null);
    setInteractionOther("");
    setInteractionDate(todayISODate());
    setStarRatings({});
    setNps(null);
    setComment("");
    setAnonymous(true);
    setSubmitted(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const setStar = (key: string, n: number) => {
    setStarRatings((prev) => ({ ...prev, [key]: n }));
  };

  const starsComplete = useMemo(() => {
    if (!interactionType) return false;
    return criteria.every((c) => starRatings[c.key] >= 1 && starRatings[c.key] <= 5);
  }, [interactionType, criteria, starRatings]);

  const canSubmit = interactionType !== null && starsComplete && nps !== null;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);

    try {
      const resolvedFirmId = await resolveVcFirmId(firmName, vcFirmId);
      if (!resolvedFirmId) {
        throw new Error(
          "Could not resolve this firm in the VC directory. Open the investor from search so we have a match, or ensure the firm exists in vc_firms.",
        );
      }

      const scores = mapReviewStarsToVcRatingScores(interactionType!, starRatings);
      const pid = personId?.trim() || null;

      const payload = {
        author_user_id: user.id,
        vc_firm_id: resolvedFirmId,
        vc_person_id: pid,
        interaction_type: interactionType!,
        interaction_detail: interactionType === "other" ? interactionOther.trim() || null : null,
        interaction_date: interactionDate.trim() || null,
        ...scores,
        nps: nps!,
        comment: comment.trim() || null,
        anonymous,
        verified: false,
      };

      const { error } = await supabase.from("vc_ratings").insert(payload);

      if (error) throw error;

      setSubmitted(true);
      toast.success(anonymous ? "Thanks — your rating was submitted anonymously." : "Thanks — your rating was submitted.");

      setTimeout(() => handleClose(), 1800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit rating");
    } finally {
      setSubmitting(false);
    }
  };

  const npsBtnClass = (i: number) => {
    if (nps !== i) return "bg-secondary text-muted-foreground hover:bg-secondary/80";
    if (i >= 9) return "bg-success text-success-foreground ring-2 ring-success/30 scale-110";
    if (i >= 7) return "bg-accent text-accent-foreground ring-2 ring-accent/30 scale-110";
    if (i >= 5) return "bg-warning text-warning-foreground ring-2 ring-warning/30 scale-110";
    return "bg-destructive text-destructive-foreground ring-2 ring-destructive/30 scale-110";
  };

  const sectionEmoji = (it: InteractionKey | null) => {
    if (it === "meeting") return "📞";
    if (it === "email") return "✉️";
    if (it === "intro") return "🤝";
    return "⭐";
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-lg max-h-[90vh] flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/20 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 shrink-0">
                    <Star className="h-4 w-4 text-warning" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground truncate">
                      {personName ? `Rate ${personName}` : "Rate your interaction"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground truncate">{subjectLine}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {submitted ? (
                <motion.div
                  className="flex flex-col items-center justify-center py-16 px-6"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-4">
                    <CheckCircle2 className="h-8 w-8 text-success" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-1">Thank you</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Your feedback helps founders choose the right investors.
                  </p>
                </motion.div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                    {/* 1 — Interaction */}
                    <section>
                      <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                        <span className="text-base leading-none">1️⃣</span> Select interaction
                      </p>
                      <div className="space-y-2">
                        {INTERACTION_OPTIONS.map((opt) => (
                          <label
                            key={opt.key}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-colors",
                              interactionType === opt.key
                                ? "border-accent bg-accent/5"
                                : "border-border hover:border-accent/30 hover:bg-secondary/40",
                            )}
                          >
                            <input
                              type="radio"
                              name="interaction"
                              className="sr-only"
                              checked={interactionType === opt.key}
                              onChange={() => {
                                setInteractionType(opt.key);
                                setStarRatings({});
                              }}
                            />
                            <span className="text-lg">{opt.emoji}</span>
                            <span className="text-sm font-medium text-foreground">{opt.label}</span>
                          </label>
                        ))}
                        {interactionType === "other" && (
                          <Input
                            value={interactionOther}
                            onChange={(e) => setInteractionOther(e.target.value)}
                            placeholder="Describe the interaction…"
                            className="text-sm mt-1"
                          />
                        )}
                      </div>
                    </section>

                    {interactionType && (
                      <section>
                        <Label htmlFor="interaction-date" className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                          <span className="text-base leading-none">📅</span> Interaction date
                        </Label>
                        <Input
                          id="interaction-date"
                          type="date"
                          value={interactionDate}
                          onChange={(e) => setInteractionDate(e.target.value)}
                          className="text-sm max-w-[220px]"
                        />
                      </section>
                    )}

                    {/* 2 — Stars */}
                    {interactionType && (
                      <section>
                        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                          <span className="text-base leading-none">2️⃣</span>
                          <span>
                            Rate (1–5 stars){" "}
                            <span className="font-normal text-muted-foreground">
                              {sectionEmoji(interactionType)}
                            </span>
                          </span>
                        </p>
                        <div className="rounded-xl border border-border bg-secondary/20 px-3 py-2">
                          {criteria.map((c) => (
                            <StarRow
                              key={c.key}
                              label={c.label}
                              value={starRatings[c.key] ?? 0}
                              onChange={(n) => setStar(c.key, n)}
                            />
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5">Tap stars for each criterion.</p>
                      </section>
                    )}

                    {/* 3 — NPS */}
                    <section>
                      <p className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                        <span className="text-base leading-none">3️⃣</span> NPS: 0–10 — would you recommend?
                      </p>
                      <p className="text-[10px] text-muted-foreground mb-2">0 = not at all · 10 = absolutely</p>
                      <div className="grid grid-cols-11 gap-1">
                        {Array.from({ length: 11 }, (_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setNps(i)}
                            className={cn(
                              "h-9 rounded-lg text-[10px] font-bold transition-all duration-150",
                              npsBtnClass(i),
                            )}
                          >
                            {i}
                          </button>
                        ))}
                      </div>
                      {nps !== null && (
                        <p className="text-[11px] font-medium text-foreground mt-2">{NPS_LABELS[nps]}</p>
                      )}
                    </section>

                    {/* 4 — Comments + anonymous */}
                    <section>
                      <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                        <span className="text-base leading-none">4️⃣</span> Comments
                      </p>
                      <Label htmlFor="review-comment" className="sr-only">
                        What happened?
                      </Label>
                      <Textarea
                        id="review-comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder='What happened? (e.g. "Partner gave sharp GTM feedback…")'
                        rows={4}
                        maxLength={500}
                        className="resize-none text-sm"
                      />
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground tabular-nums">{comment.length}/500</span>
                      </div>

                      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
                        <div className="space-y-0.5">
                          <Label htmlFor="review-anon" className="text-sm font-semibold text-foreground cursor-pointer">
                            Submit anonymously
                          </Label>
                          <p className="text-[10px] text-muted-foreground">
                            {anonymous
                              ? "Your name won’t appear on the public feed."
                              : "Your name may be visible to verified founders."}
                          </p>
                        </div>
                        <Switch id="review-anon" checked={anonymous} onCheckedChange={setAnonymous} />
                      </div>
                    </section>
                  </div>

                  <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-secondary/10 shrink-0">
                    <Button type="button" variant="ghost" size="sm" onClick={handleClose} className="text-muted-foreground">
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSubmit}
                      disabled={!canSubmit || submitting}
                      className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 px-5"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" /> Submit
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
